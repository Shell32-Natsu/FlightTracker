/**
 * 集成测试用：wrangler 本地 D1（与线上同一套 SQL 限制）+ 真实迁移文件 + Worker 的 fetch 入口。
 * 只在测试里导入。
 */
import { getPlatformProxy } from "wrangler";
import worker from "./index";
import { resetUserCache } from "./users";
import m0000 from "../../migrations/0000_init.sql?raw";
import m0001 from "../../migrations/0001_settings.sql?raw";
import m0002 from "../../migrations/0002_multi_user.sql?raw";
import m0003 from "../../migrations/0003_email_import.sql?raw";
import type { Env } from "./env";

export const MIGRATIONS = [m0000, m0001, m0002, m0003];

export async function migrate(db: D1Database, sql: string) {
  const stmts = sql
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  await db.batch(stmts.map((s) => db.prepare(s)));
}

export async function startDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc", persist: false });
  resetUserCache();
  return proxy;
}

/** 以某个开发用户的身份调用 API（DEV_SKIP_AUTH 下用 X-Dev-User 区分用户）。 */
export function apiAs(env: Partial<Env> & { DB: D1Database }) {
  return (user: string, path: string, init: RequestInit = {}) => {
    const req = new Request(`http://localhost/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Dev-User": user, ...init.headers },
    });
    return worker.fetch(req as never, { ...env, DEV_SKIP_AUTH: "true" } as never, {} as never);
  };
}
