import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { emails, users } from "../db/schema";
import { allowedSenders, inboundTemplate, inboxAddress, newInboxToken, processEmail } from "../email/ingest";
import type { AppEnv } from "../env";

/** 列表里返回的列：不带正文。 */
const listColumns = {
  id: emails.id,
  receivedAt: emails.receivedAt,
  fromAddr: emails.fromAddr,
  subject: emails.subject,
  parseStatus: emails.parseStatus,
  parseMethod: emails.parseMethod,
  error: emails.error,
  flightCount: emails.flightCount,
};

/** 取当前用户的收件 token，没有就生成一个。 */
async function ensureInboxToken(DB: D1Database, userId: string): Promise<string> {
  const db = drizzle(DB);
  const [row] = await db.select({ token: users.inboxToken }).from(users).where(eq(users.id, userId));
  if (row?.token) return row.token;
  const token = newInboxToken();
  // 并发请求时只写一次：已有 token 就不覆盖
  await db
    .update(users)
    .set({ inboxToken: token })
    .where(and(eq(users.id, userId), isNull(users.inboxToken)));
  const [again] = await db.select({ token: users.inboxToken }).from(users).where(eq(users.id, userId));
  return again?.token ?? token;
}

export const emailRoutes = new Hono<AppEnv>()
  /** 我的收件地址和允许的发件人。 */
  .get("/inbox", async (c) => {
    const user = c.get("user");
    const template = inboundTemplate(c.env);
    const token = template ? await ensureInboxToken(c.env.DB, user.id) : null;
    return c.json({
      address: inboxAddress(token, template),
      loginEmail: user.email,
      senders: await allowedSenders(c.env.DB, user.id, user.email),
      llm: !!(c.env.ANTHROPIC_API_KEY || c.env.AI),
    });
  })

  /** 重新生成收件地址（旧地址立即失效）。 */
  .post("/inbox/rotate", async (c) => {
    const template = inboundTemplate(c.env);
    if (!template) return c.json({ error: "服务端没有配置收件地址（INBOUND_EMAIL）" }, 400);
    const token = newInboxToken();
    await drizzle(c.env.DB)
      .update(users)
      .set({ inboxToken: token })
      .where(eq(users.id, c.get("user").id));
    return c.json({ address: inboxAddress(token, template) });
  })

  .get("/emails", async (c) => {
    const rows = await drizzle(c.env.DB)
      .select(listColumns)
      .from(emails)
      .where(eq(emails.userId, c.get("user").id))
      .orderBy(desc(emails.receivedAt))
      .limit(50);
    return c.json(rows);
  })

  /** 用存下来的正文重新解析（解析逻辑改进后、或补配了 API key 之后用）。 */
  .post("/emails/:id/reparse", async (c) => {
    const userId = c.get("user").id;
    const db = drizzle(c.env.DB);
    const [email] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, c.req.param("id")), eq(emails.userId, userId)));
    if (!email) return c.json({ error: "邮件不存在" }, 404);
    if (!email.bodyHtml && !email.bodyText) {
      return c.json({ error: "这封邮件没有通过发件人校验，没有保存正文，无法重新解析" }, 409);
    }
    await processEmail(c.env, userId, {
      id: email.id,
      subject: email.subject ?? "",
      html: email.bodyHtml,
      text: email.bodyText,
    });
    const [row] = await db.select(listColumns).from(emails).where(eq(emails.id, email.id));
    return c.json(row);
  });
