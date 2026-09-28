/**
 * 多用户隔离 + 迁移的集成测试：用 wrangler 的本地 D1（和线上同一套 SQL 限制），
 * 依次执行 migrations/ 里真实的迁移文件，再通过 Worker 的 fetch 入口发请求。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import worker from "./index";
import { resetUserCache } from "./users";
import m0000 from "../../migrations/0000_init.sql?raw";
import m0001 from "../../migrations/0001_settings.sql?raw";
import m0002 from "../../migrations/0002_multi_user.sql?raw";

type Proxy = Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let proxy: Proxy;
let env: { DB: D1Database; DEV_SKIP_AUTH: string };

async function migrate(db: D1Database, sql: string) {
  const stmts = sql
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  await db.batch(stmts.map((s) => db.prepare(s)));
}

function api(user: string, path: string, init: RequestInit = {}) {
  const req = new Request(`http://localhost/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Dev-User": user, ...init.headers },
  });
  return worker.fetch(req as never, env as never, {} as never);
}

const flight = {
  flightDate: "2025-03-01",
  airline: "MU",
  flightNumber: "5101",
  depAirport: "PVG",
  arrAirport: "PEK",
  schedDepUtc: "2025-03-01T00:00:00Z",
  schedArrUtc: "2025-03-01T02:15:00Z",
};

beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc", persist: false });
  env = { DB: proxy.env.DB, DEV_SKIP_AUTH: "true" };
  resetUserCache();
  const db = env.DB;
  // 单用户时代的库，带一条航班和一项设置
  await migrate(db, m0000);
  await migrate(db, m0001);
  await db
    .prepare(
      "INSERT INTO flights (id, status, source, flight_date, airline, flight_number, dep_airport, arr_airport) VALUES ('old1','confirmed','csv','2024-05-01','CA','1501','PEK','SHA')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('homeAirport', '\"PEK\"', '2024-01-01T00:00:00Z')",
    )
    .run();
  await migrate(db, m0002);
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

describe("多用户", () => {
  it("迁移前的数据由第一个登录的用户认领", async () => {
    const res = await api("alice", "/flights");
    const rows = (await res.json()) as { id: string; userId?: string }[];
    expect(rows.map((r) => r.id)).toEqual(["old1"]);
    // 返回给前端的数据不带 user_id
    expect(rows[0]).not.toHaveProperty("userId");
    const settings = (await (await api("alice", "/settings")).json()) as { homeAirport: string | null };
    expect(settings.homeAirport).toBe("PEK");
  });

  it("后来的用户看不到别人的航班和设置", async () => {
    expect(await (await api("bob", "/flights")).json()).toEqual([]);
    const settings = (await (await api("bob", "/settings")).json()) as { homeAirport: string | null };
    expect(settings.homeAirport).toBeNull();
    const left = await env.DB.prepare("SELECT count(*) n FROM flights WHERE user_id = 'legacy'").first<{
      n: number;
    }>();
    expect(left?.n).toBe(0);
  });

  it("去重只在同一用户内：两人可以记同一班飞机", async () => {
    const a = await api("alice", "/flights", { method: "POST", body: JSON.stringify(flight) });
    expect(a.status).toBe(201);
    const again = await api("alice", "/flights", { method: "POST", body: JSON.stringify(flight) });
    expect(again.status).toBe(409);
    const b = await api("bob", "/flights", { method: "POST", body: JSON.stringify(flight) });
    expect(b.status).toBe(201);
  });

  it("不能修改、删除或确认别人的航班", async () => {
    const put = await api("bob", "/flights/old1", {
      method: "PUT",
      body: JSON.stringify({ ...flight, flightNumber: "9999" }),
    });
    expect(put.status).toBe(404);
    expect((await api("bob", "/flights/old1", { method: "DELETE" })).status).toBe(404);
    expect((await api("bob", "/flights/old1/confirm", { method: "POST" })).status).toBe(404);
    const rows = (await (await api("alice", "/flights")).json()) as { id: string; flightNumber: string }[];
    expect(rows.find((r) => r.id === "old1")?.flightNumber).toBe("1501");
  });

  it("导入和导出都按用户隔离", async () => {
    const res = await api("bob", "/import", {
      method: "POST",
      body: JSON.stringify({
        flights: [flight, { ...flight, flightNumber: "5102", flightDate: "2025-03-05" }],
      }),
    });
    expect(await res.json()).toMatchObject({ inserted: 1, duplicates: 1 });
    const csv = await (await api("alice", "/export/csv")).text();
    expect(csv).toContain("1501");
    expect(csv).not.toContain("5102");
  });

  it("设置按用户保存", async () => {
    await api("bob", "/settings", { method: "PUT", body: JSON.stringify({ homeAirport: "SFO" }) });
    const bob = (await (await api("bob", "/settings")).json()) as { homeAirport: string | null };
    const alice = (await (await api("alice", "/settings")).json()) as { homeAirport: string | null };
    expect(bob.homeAirport).toBe("SFO");
    expect(alice.homeAirport).toBe("PEK");
  });

  it("/me 返回当前用户", async () => {
    expect(await (await api("bob", "/me")).json()).toEqual({ email: "bob@localhost" });
  });
});
