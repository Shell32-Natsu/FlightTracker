import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeFlights, toUtcIso } from "./lookup/aerodatabox";
import { cacheFresh, inLookupRange, lookupFlight, pickCandidate } from "./lookup/service";
import { applySegments, enrichSegments } from "./email/ingest";
import type { ExtractedSegment } from "./email/segments";
import { apiAs, migrate, MIGRATIONS, startDb } from "./testing";

/** AeroDataBox /flights/number/UA857/2024-05-01 的返回（节选） */
const UA857 = [
  {
    number: "UA 857",
    status: "Arrived",
    codeshareStatus: "IsOperator",
    airline: { iata: "UA", name: "United" },
    departure: {
      airport: { iata: "SFO", icao: "KSFO" },
      scheduledTime: { utc: "2024-05-01 18:05Z", local: "2024-05-01 11:05-07:00" },
      revisedTime: { utc: "2024-05-01 18:31Z", local: "2024-05-01 11:31-07:00" },
    },
    arrival: {
      airport: { iata: "PVG", icao: "ZSPD" },
      scheduledTime: { utc: "2024-05-02 06:40Z", local: "2024-05-02 14:40+08:00" },
      revisedTime: { utc: "2024-05-02 06:22Z", local: "2024-05-02 14:22+08:00" },
    },
    aircraft: { reg: "N2749U", model: "Boeing 777-300ER" },
  },
];

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () =>
    status === 204 ? new Response(null, { status }) : Response.json(body, { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("AeroDataBox 结果整理", () => {
  it("时间换成 UTC ISO，机型对到 ICAO 代码，飞过的航班带实际时间", () => {
    expect(toUtcIso({ utc: "2024-05-01 18:05Z" })).toBe("2024-05-01T18:05:00Z");
    const [c] = normalizeFlights(UA857, "UA", "857");
    expect(c).toEqual({
      airline: "UA",
      flightNumber: "857",
      operatingAirline: null,
      depAirport: "SFO",
      arrAirport: "PVG",
      schedDepUtc: "2024-05-01T18:05:00Z",
      schedArrUtc: "2024-05-02T06:40:00Z",
      actualDepUtc: "2024-05-01T18:31:00Z",
      actualArrUtc: "2024-05-02T06:22:00Z",
      aircraftModel: "Boeing 777-300ER",
      aircraftType: "B77W",
      registration: "N2749U",
      status: "Arrived",
    });
  });

  it("代码共享：承运航司不同时记下来；缺机场的丢掉", () => {
    const shared = { ...UA857[0], airline: { iata: "NH" }, status: "Expected" };
    const [c] = normalizeFlights([shared, { number: "X" }], "UA", "7951");
    expect(c.operatingAirline).toBe("NH");
    expect(c.actualDepUtc).toBeNull();
    expect(normalizeFlights([shared, { number: "X" }], "UA", "7951")).toHaveLength(1);
  });

  it("多段航班按起降机场挑", () => {
    const legs = normalizeFlights(
      [
        { ...UA857[0], arrival: { ...UA857[0].arrival, airport: { iata: "NRT" } } },
        { ...UA857[0], departure: { ...UA857[0].departure, airport: { iata: "NRT" } } },
      ],
      "UA",
      "857",
    );
    expect(pickCandidate(legs, "NRT", null)?.depAirport).toBe("NRT");
    expect(pickCandidate(legs, "SFO", "NRT")?.arrAirport).toBe("NRT");
    expect(pickCandidate(legs, "LAX", null)).toBeNull();
    expect(pickCandidate(legs, null, null)).toBeNull();
  });

  it("缓存：两天前的航班用到 7 天保留期满，最近的有结果 6 小时、没结果 1 小时", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(cacheFresh("2026-05-01", "2026-09-22T00:00:00Z", false, now)).toBe(true);
    // AeroDataBox 条款：缓存最多保留 7 天
    expect(cacheFresh("2026-05-01", "2026-09-21T11:00:00Z", false, now)).toBe(false);
    expect(cacheFresh("2026-09-28", "2026-09-28T08:00:00Z", false, now)).toBe(true);
    expect(cacheFresh("2026-09-28", "2026-09-28T05:00:00Z", false, now)).toBe(false);
    expect(cacheFresh("2026-10-05", "2026-09-28T11:30:00Z", true, now)).toBe(true);
    expect(cacheFresh("2026-10-05", "2026-09-28T10:30:00Z", true, now)).toBe(false);
  });

  it("只查前后一年内的航班", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(inLookupRange("2025-10-01", now)).toBe(true);
    expect(inLookupRange("2027-09-20", now)).toBe(true);
    expect(inLookupRange("2025-09-01", now)).toBe(false);
    expect(inLookupRange("2027-10-30", now)).toBe(false);
    expect(inLookupRange("bad", now)).toBe(false);
  });
});

describe("查询接口和邮件补全", () => {
  let proxy: Awaited<ReturnType<typeof startDb>>;
  let DB: D1Database;

  beforeAll(async () => {
    proxy = await startDb();
    DB = proxy.env.DB;
    for (const m of MIGRATIONS) await migrate(DB, m);
    // 固定“今天”，让 2024 年的样例数据落在可查询的一年内（只改 Date，不影响定时器）
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
    return proxy.dispose();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("没配置 key：接口 503、/me 标明不可用", async () => {
    const api = apiAs({ DB });
    expect((await api("a", "/lookup?flight=UA857&date=2024-05-01")).status).toBe(503);
    expect(await (await api("a", "/me")).json()).toMatchObject({ lookup: false });
  });

  it("参数校验", async () => {
    const api = apiAs({ DB, AERODATABOX_API_KEY: "k" });
    expect((await api("a", "/lookup?flight=857&date=2024-05-01")).status).toBe(400);
    expect((await api("a", "/lookup?flight=UA857&date=5/1")).status).toBe(400);
  });

  it("查到后写缓存，第二次不再请求", async () => {
    const f = fakeFetch(UA857);
    vi.stubGlobal("fetch", f);
    const api = apiAs({ DB, AERODATABOX_API_KEY: "k" });
    const first = await (await api("a", "/lookup?flight=ua%20857&date=2024-05-01")).json();
    expect(first).toMatchObject({ cached: false, candidates: [{ aircraftType: "B77W", registration: "N2749U" }] });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/flights/number/UA857/2024-05-01");
    expect((init.headers as Record<string, string>)["X-RapidAPI-Key"]).toBe("k");

    // 另一个用户查同一班：共用缓存
    const second = await (await apiAs({ DB, AERODATABOX_API_KEY: "k" })("b", "/lookup?flight=UA857&date=2024-05-01")).json();
    expect(second).toMatchObject({ cached: true });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("额度用完、key 无效时给出能看懂的错误", async () => {
    const api = apiAs({ DB, AERODATABOX_API_KEY: "k" });
    vi.stubGlobal("fetch", fakeFetch({}, 429));
    const r = await api("a", "/lookup?flight=CA981&date=2024-07-01");
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toContain("额度");
    vi.stubGlobal("fetch", fakeFetch({}, 403));
    expect((await api("a", "/lookup?flight=CA982&date=2024-07-01")).status).toBe(503);
  });

  it("超出一年范围：直接提示，不调接口", async () => {
    const f = fakeFetch(UA857);
    vi.stubGlobal("fetch", f);
    const r = await apiAs({ DB, AERODATABOX_API_KEY: "k" })("a", "/lookup?flight=UA857&date=2019-05-01");
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toContain("一年");
    expect(f).not.toHaveBeenCalled();
  });

  it("写新缓存时清掉超过 7 天的旧缓存", async () => {
    await DB.prepare(
      "INSERT INTO lookup_cache (key, response_json, fetched_at) VALUES ('OLD1:2024-05-10', '{\"flights\":[]}', '2024-05-20T00:00:00Z')",
    ).run();
    await lookupFlight({ DB, AERODATABOX_API_KEY: "k" }, "MU", "5101", "2024-06-03", fakeFetch([]));
    const old = await DB.prepare("SELECT key FROM lookup_cache WHERE key = 'OLD1:2024-05-10'").first();
    expect(old).toBeNull();
  });

  it("查不到（204）返回空列表", async () => {
    const f = fakeFetch(null, 204);
    const r = await lookupFlight({ DB, AERODATABOX_API_KEY: "k" }, "ZZ", "1", "2024-07-02", f);
    expect(r).toEqual({ candidates: [], cached: false });
  });

  const seg = (over: Partial<ExtractedSegment> = {}): ExtractedSegment => ({
    airline: "UA",
    flightNumber: "857",
    depAirport: "SFO",
    arrAirport: "PVG",
    depDate: "2024-05-01",
    depTime: "11:05",
    arrDate: null,
    arrTime: null,
    confirmationCode: null,
    seat: null,
    cabin: null,
    cancelled: false,
    ...over,
  });

  const rows = (user: string) =>
    DB.prepare("SELECT aircraft_type, registration, sched_arr_utc, status, notes FROM flights WHERE user_id = ?")
      .bind(user)
      .all<{ aircraft_type: string; registration: string; sched_arr_utc: string; status: string; notes: string }>();

  it("邮件导入：补上机型、机尾号和邮件里缺的到达时间", async () => {
    const segs = [seg()];
    await enrichSegments({ DB, AERODATABOX_API_KEY: "k" }, segs, fakeFetch([]));
    // 缓存里已有 UA857 2024-05-01，不会再请求
    await DB.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1','u1@x','2026-01-01T00:00:00Z')").run();
    await DB.prepare(
      "INSERT INTO emails (id, user_id, received_at, parse_status, flight_count) VALUES ('e1','u1','2026-01-01T00:00:00Z','pending',0)",
    ).run();
    await applySegments(DB, "u1", "e1", segs);
    const { results } = await rows("u1");
    expect(results).toEqual([
      expect.objectContaining({
        aircraft_type: "B77W",
        registration: "N2749U",
        sched_arr_utc: "2024-05-02T06:40:00Z",
        status: "pending",
      }),
    ]);
  });

  it("没配置 key 或查询失败：照常导入，不补", async () => {
    const segs = [seg({ airline: "CA", flightNumber: "981", depAirport: "PEK", arrAirport: "JFK" })];
    await enrichSegments({ DB }, segs);
    expect(segs[0].lookup).toBeUndefined();
    const boom = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await enrichSegments({ DB, AERODATABOX_API_KEY: "k" }, segs, boom);
    expect(segs[0].lookup).toBeUndefined();
  });

  it("同一封邮件再来一次、只多了机型：静默补上，不变成待确认", async () => {
    await DB.prepare("UPDATE flights SET status = 'confirmed', aircraft_type = NULL, registration = NULL WHERE user_id = 'u1'").run();
    const segs = [seg()];
    await enrichSegments({ DB, AERODATABOX_API_KEY: "k" }, segs, fakeFetch([]));
    expect(await applySegments(DB, "u1", "e1", segs)).toBe(0);
    const { results } = await rows("u1");
    expect(results[0]).toMatchObject({ aircraft_type: "B77W", registration: "N2749U", status: "confirmed" });
  });
});
