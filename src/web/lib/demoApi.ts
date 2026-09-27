import { flightDistanceKm, flightDurationMin } from "../../shared/derive";
import { greatCircleKm } from "../../shared/geo";
import { localToUtc } from "../../shared/time";
import type { Airport, Cabin, Flight, FlightInput, Purpose } from "../../shared/types";
import { assetUrl } from "./env";
import { DEMO_FLIGHTS, DEMO_PENDING } from "./demoData";

/**
 * 演示模式下的 /api 模拟：数据放在内存里，刷新页面恢复初始状态。
 * 行为与 Worker 一致：服务端算距离和时长、按航司 + 航班号 + 日期 + 出发机场去重。
 */

let airports: Record<string, Airport> | null = null;
let store: Flight[] | null = null;

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

type DemoInput = Pick<FlightInput, "flightDate" | "airline" | "flightNumber" | "depAirport" | "arrAirport" | "source"> &
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
    ),
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
  if (input.schedDepUtc && input.schedArrUtc && input.schedArrUtc <= input.schedDepUtc) return "计划到达需晚于计划起飞";
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
