import { and, asc, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { emails, flights, LEGACY_USER_ID, settings, users } from "./db/schema";

/** 本 isolate 里已经确认存在的用户，避免每个请求都查库。 */
const known = new Set<string>();

/**
 * 确保用户存在（第一次访问时创建），并在读写数据前完成旧数据认领。
 *
 * 多用户迁移之前的数据归在占位用户 'legacy' 名下，由最早创建的用户认领
 * （迁移上线时 Access 策略里只有站长本人，所以就是站长）。
 *
 * 认领检查在每个 isolate 第一次见到该用户时都做一次，而且是幂等的：
 * - 页面加载时会并发发出好几个请求，每个请求都在读数据之前确认认领已完成，不会读到空数据；
 * - 某次认领失败了，下一次请求会再补上。
 */
export async function ensureUser(DB: D1Database, id: string, email: string): Promise<void> {
  if (known.has(id)) return;
  const db = drizzle(DB);
  const created = await db
    .insert(users)
    .values({ id, email })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!created.length) {
    // 同一个 Access 身份换了邮箱：更新记录（没变化时不写）
    await db
      .update(users)
      .set({ email })
      .where(and(eq(users.id, id), ne(users.email, email)));
  }
  if (await hasLegacyData(DB)) {
    const [first] = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1);
    if (first?.id === id) await claimLegacyData(DB, id);
  }
  known.add(id);
}

async function hasLegacyData(DB: D1Database): Promise<boolean> {
  const row = await DB.prepare(
    "SELECT EXISTS (SELECT 1 FROM flights WHERE user_id = ?1) OR EXISTS (SELECT 1 FROM settings WHERE user_id = ?1) AS has",
  )
    .bind(LEGACY_USER_ID)
    .first<{ has: number }>();
  return !!row?.has;
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
