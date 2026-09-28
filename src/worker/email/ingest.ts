import PostalMime from "postal-mime";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { emails, flights, settings, users } from "../db/schema";
import { findAirport } from "../airports";
import { flightInputSchema, withDerived } from "../routes/flights";
import { settingsFromRows } from "../settings";
import { addDays, localToUtc } from "../../shared/time";
import type { Env } from "../env";
import { checkSender, normalizeAddress } from "./auth";
import { htmlToText } from "./html";
import { segmentsFromJsonLd } from "./jsonld";
import { ExtractionError, extractWithClaude } from "./llm";
import type { ExtractedSegment } from "./segments";

/**
 * 邮件导入：收件地址认出用户 → 校验发件人 → 存邮件 → 提取航段 → 写成“待确认”航班。
 * 任何识别结果都不会直接变成正式记录，最后一步总是用户在网页上确认。
 */

/** 超过这个大小的邮件不处理（确认邮件一般几十 KB；大附件没用）。 */
const MAX_RAW_BYTES = 10 * 1024 * 1024;
/** 存库的正文上限；超过的部分截掉（仅影响重新解析，首次解析用完整正文）。 */
const MAX_STORED_HTML = 1_000_000;
const MAX_STORED_TEXT = 200_000;

export interface Deps {
  /** 测试里替换 LLM 调用 */
  extractWithLlm?: (subject: string, text: string) => Promise<ExtractedSegment[]>;
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newInboxToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `f-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** 模板必须是一个邮件地址且含 {token}。 */
export function inboundTemplate(env: Pick<Env, "INBOUND_EMAIL">): string | null {
  const t = env.INBOUND_EMAIL?.trim().toLowerCase();
  return t && t.includes("{token}") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null;
}

export function inboxAddress(token: string | null, template: string | null): string | null {
  return token && template ? template.replace("{token}", token) : null;
}

/** 从收件地址里取出用户 token：有 +标签取标签，否则取整个本地部分。 */
export function tokenFromRecipient(to: string): string {
  const local = to
    .trim()
    .toLowerCase()
    .replace(/^.*<([^>]+)>.*$/, "$1")
    .split("@")[0];
  const plus = local.indexOf("+");
  return plus >= 0 ? local.slice(plus + 1) : local;
}

/** 用户允许的发件地址：登录邮箱 + 设置里额外添加的。 */
export async function allowedSenders(DB: D1Database, userId: string, loginEmail: string): Promise<string[]> {
  const rows = await drizzle(DB).select().from(settings).where(eq(settings.userId, userId));
  const extra = settingsFromRows(rows).importSenders;
  return [...new Set([loginEmail, ...extra].filter(Boolean).map(normalizeAddress))];
}

export interface IncomingMail {
  /** 信封发件人（MAIL FROM） */
  from: string;
  /** 信封收件人 */
  to: string;
  raw: ArrayBuffer;
}

export type ReceiveResult =
  | { status: "unknown-recipient" }
  | { status: "too-large" }
  | { status: "ignored" | "parsed" | "failed"; emailId: string };

export async function receiveEmail(env: Env, mail: IncomingMail, deps: Deps = {}): Promise<ReceiveResult> {
  const db = drizzle(env.DB);
  const token = tokenFromRecipient(mail.to);
  const [user] = await db.select().from(users).where(eq(users.inboxToken, token)).limit(1);
  // 认不出收件人：直接丢弃，不入库（避免垃圾邮件占空间）
  if (!user) return { status: "unknown-recipient" };
  if (mail.raw.byteLength > MAX_RAW_BYTES) return { status: "too-large" };

  const parsed = await PostalMime.parse(mail.raw);
  const headerFrom = parsed.from?.address ?? null;
  const subject = parsed.subject?.trim() || "(无主题)";
  const id = crypto.randomUUID();
  const base = {
    id,
    userId: user.id,
    receivedAt: new Date().toISOString(),
    fromAddr: headerFrom ?? mail.from,
    toAddr: mail.to,
    subject,
  };

  // 本地开发时没有 Authentication-Results，跳过真实性校验
  if (env.DEV_SKIP_AUTH !== "true") {
    const verdict = checkSender({
      envelopeFrom: mail.from,
      headerFrom,
      authResults: parsed.headers.filter((h) => h.key === "authentication-results").map((h) => h.value),
      allowed: await allowedSenders(env.DB, user.id, user.email),
    });
    if (!verdict.ok) {
      // 不存正文：可能是伪造或陌生人发来的
      await db.insert(emails).values({ ...base, parseStatus: "ignored", error: verdict.reason });
      return { status: "ignored", emailId: id };
    }
  }

  const html = parsed.html ?? null;
  const text = parsed.text ?? (html ? htmlToText(html) : null);
  await db.insert(emails).values({
    ...base,
    bodyHtml: html ? html.slice(0, MAX_STORED_HTML) : null,
    bodyText: text ? text.slice(0, MAX_STORED_TEXT) : null,
    parseStatus: "pending",
  });
  const status = await processEmail(env, user.id, { id, subject, html, text }, deps);
  return { status, emailId: id };
}

/** 提取并写入；结果写回 emails 记录。首次收信和“重新解析”共用。 */
export async function processEmail(
  env: Env,
  userId: string,
  email: { id: string; subject: string; html: string | null; text: string | null },
  deps: Deps = {},
): Promise<"parsed" | "failed" | "ignored"> {
  const db = drizzle(env.DB);
  const finish = (values: Partial<typeof emails.$inferInsert>) =>
    db.update(emails).set(values).where(eq(emails.id, email.id));

  try {
    let method: "jsonld" | "llm" = "jsonld";
    let segments = email.html ? segmentsFromJsonLd(email.html) : [];
    if (!segments.length) {
      const body = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
      if (!body) throw new ExtractionError("邮件没有正文");
      const llm =
        deps.extractWithLlm ??
        (env.ANTHROPIC_API_KEY
          ? (s: string, t: string) => extractWithClaude(env.ANTHROPIC_API_KEY!, s, t)
          : null);
      if (!llm)
        throw new ExtractionError(
          "邮件里没有结构化的航班数据，而且服务端没有配置 ANTHROPIC_API_KEY，无法识别正文",
        );
      method = "llm";
      segments = await llm(email.subject, body);
    }
    if (!segments.length) {
      await finish({
        parseStatus: "ignored",
        parseMethod: method,
        error: "邮件里没有找到航班行程",
        flightCount: 0,
      });
      return "ignored";
    }
    const count = await applySegments(env.DB, userId, email.id, segments);
    await finish({ parseStatus: "parsed", parseMethod: method, error: null, flightCount: count });
    return "parsed";
  } catch (err) {
    const message = err instanceof ExtractionError ? err.message : `处理出错：${String(err)}`;
    if (!(err instanceof ExtractionError)) console.error("email processing failed", err);
    await finish({ parseStatus: "failed", error: message, flightCount: 0 });
    return "failed";
  }
}

/** 航段 → 航班表需要的字段（当地时间按机场时区换成 UTC）。 */
function toFlightFields(seg: ExtractedSegment) {
  const dep = findAirport(seg.depAirport);
  const arr = findAirport(seg.arrAirport);
  if (!dep) throw new ExtractionError(`机场表里没有出发机场 ${seg.depAirport}`);
  if (!arr) throw new ExtractionError(`机场表里没有到达机场 ${seg.arrAirport}`);
  const depUtc = seg.depTime ? localToUtc(seg.depDate, seg.depTime, dep.tz) : null;
  let arrUtc = seg.arrTime ? localToUtc(seg.arrDate ?? seg.depDate, seg.arrTime, arr.tz) : null;
  // 邮件只写了到达时间没写日期、而且早于起飞：视为次日到达
  if (depUtc && arrUtc && !seg.arrDate && arrUtc <= depUtc && seg.arrTime) {
    arrUtc = localToUtc(addDays(seg.depDate, 1), seg.arrTime, arr.tz);
  }
  return {
    flightDate: seg.depDate,
    airline: seg.airline,
    flightNumber: seg.flightNumber,
    depAirport: seg.depAirport,
    arrAirport: seg.arrAirport,
    schedDepUtc: depUtc,
    schedArrUtc: arrUtc,
    seat: seg.seat,
    cabin: seg.cabin,
    confirmationCode: seg.confirmationCode,
  };
}

const appendNote = (notes: string | null, note: string) =>
  notes?.includes(note) ? notes : notes ? `${notes}\n${note}` : note;

const NOTE_CANCELLED = "邮件显示此航班已取消；确认无误后可以删除";
const NOTE_UPDATED = "邮件更新了此航班的信息，请核对";

/**
 * 按去重键（航司 + 航班号 + 日期 + 出发机场）合并：
 * - 新航段：新增为待确认
 * - 已有航段：信息有变化则更新并转为待确认，让用户核对
 * - 取消：已有的转为待确认并加备注；没有的忽略
 * 任何一段不合法时整封邮件失败，不写入任何航段。返回新增或变更的航段数。
 */
export async function applySegments(
  DB: D1Database,
  userId: string,
  emailId: string,
  segments: ExtractedSegment[],
): Promise<number> {
  const db = drizzle(DB);
  // 先全部校验，再写入
  const prepared = segments.map((seg) => {
    const fields = toFlightFields(seg);
    const parsed = flightInputSchema.safeParse({ ...fields, source: "email", status: "pending" });
    if (!parsed.success) {
      const what = `${seg.airline}${seg.flightNumber} ${seg.depAirport}→${seg.arrAirport}`;
      throw new ExtractionError(`${what}：${parsed.error.issues.map((i) => i.message).join("；")}`);
    }
    return { seg, values: parsed.data };
  });

  const now = new Date().toISOString();
  let count = 0;
  for (const { seg, values } of prepared) {
    const [existing] = await db
      .select()
      .from(flights)
      .where(
        and(
          eq(flights.userId, userId),
          eq(flights.airline, values.airline),
          eq(flights.flightNumber, values.flightNumber),
          eq(flights.flightDate, values.flightDate),
          eq(flights.depAirport, values.depAirport),
        ),
      )
      .limit(1);

    if (seg.cancelled) {
      if (!existing) continue;
      await db
        .update(flights)
        .set({
          status: "pending",
          emailId,
          notes: appendNote(existing.notes, NOTE_CANCELLED),
          updatedAt: now,
        })
        .where(eq(flights.id, existing.id));
      count++;
      continue;
    }

    if (existing) {
      // 只用邮件里有的字段覆盖
      const merged = {
        ...existing,
        arrAirport: values.arrAirport,
        schedDepUtc: values.schedDepUtc ?? existing.schedDepUtc,
        schedArrUtc: values.schedArrUtc ?? existing.schedArrUtc,
        seat: values.seat ?? existing.seat,
        cabin: values.cabin ?? existing.cabin,
        confirmationCode: values.confirmationCode ?? existing.confirmationCode,
      };
      const keys = ["arrAirport", "schedDepUtc", "schedArrUtc", "seat", "cabin", "confirmationCode"] as const;
      if (keys.every((k) => merged[k] === existing[k])) continue;
      const { status: _s, ...derived } = withDerived({
        ...merged,
        status: "pending",
        source: existing.source,
      });
      await db
        .update(flights)
        .set({
          ...derived,
          source: existing.source,
          status: "pending",
          emailId,
          notes: appendNote(existing.notes, NOTE_UPDATED),
          updatedAt: now,
        })
        .where(eq(flights.id, existing.id));
      count++;
      continue;
    }

    const { status: _s, ...derived } = withDerived(values);
    await db.insert(flights).values({
      ...derived,
      id: crypto.randomUUID(),
      userId,
      status: "pending",
      source: "email",
      emailId,
      createdAt: now,
      updatedAt: now,
    });
    count++;
  }
  return count;
}
