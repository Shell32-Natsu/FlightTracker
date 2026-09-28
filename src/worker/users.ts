import { and, asc, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { emails, flights, LEGACY_USER_ID, settings, users } from "./db/schema";

/** 本 isolate 里已经确认存在的用户，避免每个请求都查库。 */
const known = new Set<string>();

/**
 * 确保用户存在（第一次访问时创建）。
 *
 * 多用户迁移之前的数据归在占位用户 'legacy' 名下：最早创建的那个用户在创建时认领它们。
 * 迁移上线时 Access 策略里只有站长本人，所以就是站长。
 */
export async function ensureUser(DB: D1Database, id: string, email: string): Promise<void> {
  if (known.has(id)) return;
  const db = drizzle(DB);
  const created = await db
    .insert(users)
    .values({ id, email })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created.length) {
    const [first] = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1);
    if (first?.id === id) await claimLegacyData(DB, id);
  } else {
    // 同一个 Access 身份换了邮箱：更新记录（没变化时不写）
    await db
      .update(users)
      .set({ email })
      .where(and(eq(users.id, id), ne(users.email, email)));
  }
  known.add(id);
}

export async function claimLegacyData(DB: D1Database, id: string): Promise<void> {
  const db = drizzle(DB);
  await db.batch([
    db.update(flights).set({ userId: id }).where(eq(flights.userId, LEGACY_USER_ID)),
    db.update(settings).set({ userId: id }).where(eq(settings.userId, LEGACY_USER_ID)),
    db.update(emails).set({ userId: id }).where(eq(emails.userId, LEGACY_USER_ID)),
  ]);
}

/** 仅测试用：清空 isolate 缓存。 */
export function resetUserCache() {
  known.clear();
}
