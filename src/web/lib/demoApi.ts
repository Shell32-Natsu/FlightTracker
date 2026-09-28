import { flightDistanceKm, flightDurationMin } from "../../shared/derive";
import { greatCircleKm } from "../../shared/geo";
import { localToUtc } from "../../shared/time";
import type {
  Airport,
  Cabin,
  EmailRecord,
  Flight,
  FlightInput,
  InboxInfo,
  Purpose,
} from "../../shared/types";
import { DEFAULT_SETTINGS, SETTING_KEYS, type Settings } from "../../shared/settings";
import { assetUrl } from "./env";
import { dedupeKey, flightsToCsv } from "../../shared/flightCsv";
import { DEMO_FLIGHTS, DEMO_PENDING, DEMO_REGISTRATIONS } from "./demoData";

/**
 * 演示模式下的 /api 模拟：数据放在内存里，刷新页面恢复初始状态。
 * 行为与 Worker 一致：服务端算距离和时长、按航司 + 航班号 + 日期 + 出发机场去重。
 */

let airports: Record<string, Airport> | null = null;
let store: Flight[] | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };

/** 演示用的邮件导入记录：两段国泰航段来自第一封，其余展示各种处理结果。 */
const DEMO_EMAIL_ID = "demo-email-1";
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
let inboxAddress = "flights+f-k8m2x9q7ra@in.example.com";
const demoEmails: EmailRecord[] = [
  {
    id: DEMO_EMAIL_ID,
    receivedAt: ago(2),
    fromAddr: "demo@example.com",
    subject: "Fwd: 国泰航空电子机票行程确认 K7Q2ZP",
    parseStatus: "parsed",
    parseMethod: "jsonld",
    error: null,
    flightCount: 2,
    pendingCount: 2,
  },
  {
    id: "demo-email-2",
    receivedAt: ago(30),
    fromAddr: "demo@example.com",
    subject: "Fwd: 值机提醒：您的航班即将起飞",
    parseStatus: "ignored",
    parseMethod: "llm",
    error: "邮件里没有找到航班行程",
    flightCount: 0,
    pendingCount: 0,
  },
  {
    id: "demo-email-3",
    receivedAt: ago(72),
    fromAddr: "someone@unknown.example",
    subject: "Your booking",
    parseStatus: "ignored",
    parseMethod: null,
    error: "发件人 someone@unknown.example 不在你允许的发件地址里",
    flightCount: 0,
    pendingCount: 0,
  },
];

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

const BLANK = {
  status: "confirmed",
  operatingAirline: null,
  schedDepUtc: null,
  schedArrUtc: null,
  actualDepUtc: null,
  actualArrUtc: null,
  aircraftType: null,
  registration: null,
  seat: null,
  cabin: null,
  purpose: null,
  confirmationCode: null,
  notes: null,
} as const;

type DemoInput = Pick<
  FlightInput,
  "flightDate" | "airline" | "flightNumber" | "depAirport" | "arrAirport" | "source"
> &
  Partial<FlightInput>;

function makeFlight(partial: DemoInput): Flight {
  const now = new Date().toISOString();
  const input = { ...BLANK, ...partial };
  return {
    ...input,
    id: crypto.randomUUID?.() ?? String(Math.random()).slice(2),
    distanceKm: flightDistanceKm(airports![input.depAirport], airports![input.arrAirport]),
    durationMin: flightDurationMin(input),
    trackKey: null,
    emailId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 按距离估一个合理的航程时间（巡航约 820 km/h + 地面约 30 分钟）。 */
function seed(date: string, code: string, dep: string, arr: string, time: string) {
  const a = airports![dep];
  const b = airports![arr];
  const min = Math.round((greatCircleKm(a.lat, a.lon, b.lat, b.lon) / 820) * 60 + 32);
  const depUtc = localToUtc(date, time, a.tz);
  return {
    flightDate: date,
    airline: code.slice(0, 2),
    flightNumber: code.slice(2),
    depAirport: dep,
    arrAirport: arr,
    schedDepUtc: depUtc,
    schedArrUtc: iso(Date.parse(depUtc) + min * 60000),
  };
}

async function ready(): Promise<Flight[]> {
  if (store) return store;
  airports ??= await (await fetch(assetUrl("refdata/airports.json"))).json();
  store = [
    ...DEMO_FLIGHTS.map(([date, code, dep, arr, time, aircraft, cabin, seat, purpose]) =>
      makeFlight({
        ...seed(date, code, dep, arr, time),
        source: "manual",
        aircraftType: aircraft,
        registration: DEMO_REGISTRATIONS[`${date} ${code}`] ?? null,
        cabin: cabin as Cabin,
        seat,
        purpose: purpose as Purpose,
      }),
    ),
    ...DEMO_PENDING.map(([date, code, dep, arr, time, aircraft, pnr]) =>
      makeFlight({
        ...seed(date, code, dep, arr, time),
        status: "pending",
        source: "email",
        aircraftType: aircraft,
        confirmationCode: pnr,
      }),
    ).map((f) => ({ ...f, emailId: DEMO_EMAIL_ID })),
  ];
  return store;
}

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function validate(input: FlightInput, id?: string): string | null {
  if (!/^[A-Z0-9]{2}$/.test(input.airline)) return "航司需为 IATA 二字码";
  if (!/^\d{1,4}[A-Z]?$/.test(input.flightNumber)) return "航班号为 1–4 位数字";
  if (!airports![input.depAirport] || !airports![input.arrAirport]) return "机场表里没有这个三字码";
  if (input.depAirport === input.arrAirport) return "起降机场不能相同";
  if (input.schedDepUtc && input.schedArrUtc && input.schedArrUtc <= input.schedDepUtc)
    return "计划到达需晚于计划起飞";
  const dup = store!.find(
    (f) =>
      f.id !== id &&
      f.airline === input.airline &&
      f.flightNumber === input.flightNumber &&
      f.flightDate === input.flightDate &&
      f.depAirport === input.depAirport,
  );
  return dup ? "已存在相同航班（航司 + 航班号 + 日期 + 出发机场）" : null;
}

const byDateDesc = (a: Flight, b: Flight) =>
  b.flightDate.localeCompare(a.flightDate) || (b.schedDepUtc ?? "").localeCompare(a.schedDepUtc ?? "");

export async function demoFetch(path: string, init: RequestInit): Promise<Response> {
  const flights = await ready();
  const method = (init.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://demo");
  const parts = url.pathname.split("/").filter(Boolean); // ["flights", id?, "confirm"?]
  const body = init.body ? (JSON.parse(String(init.body)) as FlightInput) : null;

  if (parts[0] === "me") return json({ email: "demo@example.com", lookup: true });
  if (parts[0] === "lookup") {
    // 演示版没有航班数据服务：用演示数据里同航班号的一段，平移到查询的日期
    const code = (url.searchParams.get("flight") ?? "").toUpperCase().replace(/\s+/g, "");
    const date = url.searchParams.get("date") ?? "";
    const same = flights.find((f) => `${f.airline}${f.flightNumber}` === code);
    if (!same || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ candidates: [], cached: false });
    const shift = (utc: string | null) =>
      utc ? new Date(Date.parse(utc) + (Date.parse(date) - Date.parse(same.flightDate))).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
    const past = date < new Date().toISOString().slice(0, 10);
    return json({
      cached: false,
      candidates: [
        {
          airline: same.airline,
          flightNumber: same.flightNumber,
          operatingAirline: null,
          depAirport: same.depAirport,
          arrAirport: same.arrAirport,
          schedDepUtc: shift(same.schedDepUtc),
          schedArrUtc: shift(same.schedArrUtc),
          actualDepUtc: past ? shift(same.schedDepUtc) : null,
          actualArrUtc: past ? shift(same.schedArrUtc) : null,
          aircraftModel: same.aircraftType,
          aircraftType: same.aircraftType,
          registration: same.registration ?? null,
          status: past ? "Arrived" : "Expected",
        },
      ],
    });
  }
  if (parts[0] === "aircraft-info" && parts[1]) {
    // 演示版没有后端：浏览器直接请求维基百科（它允许跨域）
    const { aircraftFamily } = await import("../../shared/aircraft");
    const family = aircraftFamily(parts[1]);
    if (!family) return json({ error: "暂无这个机型的介绍" }, 404);
    for (const lang of ["zh", "en"] as const) {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(family.wiki[lang])}`,
        { headers: { "Accept-Language": lang === "zh" ? "zh-cn" : "en" } },
      ).catch(() => null);
      if (!res?.ok) continue;
      const j = await res.json();
      if (j.type === "disambiguation" || !j.extract) continue;
      return json({
        lang,
        title: j.title,
        extract: j.extract,
        url: j.content_urls?.desktop?.page,
        thumbnail: j.thumbnail?.source ?? null,
      });
    }
    return json({ error: "暂时取不到机型介绍" }, 502);
  }
  if (parts[0] === "settings") {
    if (method === "PUT" && init.body) {
      const patch = JSON.parse(String(init.body)) as Partial<Settings>;
      if (Object.keys(patch).some((k) => !(SETTING_KEYS as string[]).includes(k))) {
        return json({ error: "未知的设置项" }, 400);
      }
      if (patch.homeAirport) {
        patch.homeAirport = patch.homeAirport.toUpperCase();
        if (!airports![patch.homeAirport]) return json({ error: "机场表里没有这个三字码" }, 400);
      }
      settings = { ...settings, ...patch };
    }
    return json(settings);
  }
  if (parts[0] === "inbox") {
    if (parts[1] === "rotate" && method === "POST") {
      inboxAddress = `flights+f-${Math.random().toString(36).slice(2, 12).padEnd(10, "x")}@in.example.com`;
      return json({ address: inboxAddress });
    }
    const info: InboxInfo = {
      address: inboxAddress,
      loginEmail: "demo@example.com",
      senders: ["demo@example.com", ...settings.importSenders],
      llm: true,
    };
    return json(info);
  }
  if (parts[0] === "emails") {
    const withPending = (e: EmailRecord) => ({
      ...e,
      pendingCount: flights.filter((f) => f.emailId === e.id && f.status === "pending").length,
    });
    if (parts[2] === "reparse" && method === "POST") {
      const e = demoEmails.find((x) => x.id === parts[1]);
      return e ? json(withPending(e)) : json({ error: "邮件不存在" }, 404);
    }
    return json(demoEmails.map(withPending));
  }
  if (parts[0] === "import" && method === "POST" && init.body) {
    const items = (JSON.parse(String(init.body)) as { flights: FlightInput[] }).flights;
    const existing = new Set(flights.map(dedupeKey));
    const invalid: { index: number; message: string }[] = [];
    let inserted = 0;
    items.forEach((item, index) => {
      const input = { ...item, source: "csv" as const };
      const err = validate(input);
      if (err && !err.startsWith("已存在")) return invalid.push({ index, message: err });
      if (existing.has(dedupeKey(input))) return;
      flights.push(makeFlight(input));
      existing.add(dedupeKey(input));
      inserted++;
    });
    return json({ inserted, duplicates: items.length - invalid.length - inserted, invalid });
  }
  if (parts[0] === "export" && parts[1] === "csv") {
    return new Response(
      flightsToCsv(
        flights.filter((f) => f.status === "confirmed"),
        airports!,
      ),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="flighttracker-demo.csv"`,
        },
      },
    );
  }
  if (parts[0] !== "flights") return json({ error: "Not found" }, 404);

  if (parts.length === 1 && method === "GET") {
    const status = url.searchParams.get("status");
    return json(flights.filter((f) => !status || f.status === status).sort(byDateDesc));
  }
  if (parts.length === 1 && method === "POST" && body) {
    const err = validate(body);
    if (err) return json({ error: err }, err.startsWith("已存在") ? 409 : 400);
    const created = makeFlight({ ...body, status: body.status ?? "confirmed" });
    flights.push(created);
    return json(created, 201);
  }

  const idx = flights.findIndex((f) => f.id === parts[1]);
  if (idx < 0) return json({ error: "航班不存在" }, 404);

  if (parts[2] === "confirm" && method === "POST") {
    flights[idx] = { ...flights[idx], status: "confirmed", updatedAt: new Date().toISOString() };
    return json(flights[idx]);
  }
  if (method === "PUT" && body) {
    const err = validate(body, parts[1]);
    if (err) return json({ error: err }, err.startsWith("已存在") ? 409 : 400);
    const next = makeFlight({ ...body, status: body.status ?? flights[idx].status });
    flights[idx] = { ...next, id: flights[idx].id, createdAt: flights[idx].createdAt };
    return json(flights[idx]);
  }
  if (method === "DELETE") {
    flights.splice(idx, 1);
    return json(null, 204);
  }
  return json({ error: "Not found" }, 404);
}
