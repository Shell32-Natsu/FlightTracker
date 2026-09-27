import { csvLine, parseCsv } from "./csv";
import { localToUtc, utcToLocal } from "./time";
import type { Cabin, Flight, FlightInput, Purpose } from "./types";

/**
 * 航班 CSV 的导入与导出。
 *
 * 导入支持两种格式（按表头自动识别）：
 *  - Flighty 导出：航司为 ICAO 三字码、机型为名称、时间为各机场当地时间
 *  - 本应用导出：见 NATIVE_HEADER
 *
 * 纯函数，前端预览和测试共用；参考数据由调用方传入。
 */

export type ImportFormat = "flighty" | "native";

export interface ImportContext {
  /** 机场三字码 → 时区 */
  airports: Record<string, { tz: string }>;
  /** 航司 ICAO 三字码 → IATA 二字码 */
  airlineIcaoToIata: Record<string, string>;
  /** 归一化后的机型名称（见 normalizeAircraftName）→ ICAO 机型代码 */
  aircraftByName: Record<string, string>;
  /** 今天（YYYY-MM-DD），用于标记尚未起飞的航班 */
  today: string;
}

export interface ImportRow {
  /** CSV 中的行号（表头为第 1 行） */
  line: number;
  /** 便于展示的摘要，如 "2026-01-07 KE882 PVG→ICN" */
  label: string;
  input: FlightInput | null;
  /** 无法导入的原因 */
  error: string | null;
  /** 主动跳过的原因（如航班已取消） */
  skipped: string | null;
  /** 可以导入但需要留意的地方 */
  warnings: string[];
  /** 起飞日期晚于今天 */
  future: boolean;
}

export interface ParsedImport {
  format: ImportFormat;
  rows: ImportRow[];
}

export const NATIVE_HEADER = [
  "date",
  "airline",
  "flight_number",
  "from",
  "to",
  "scheduled_departure",
  "scheduled_arrival",
  "actual_departure",
  "actual_arrival",
  "aircraft",
  "registration",
  "seat",
  "cabin",
  "purpose",
  "confirmation_code",
  "operating_airline",
  "notes",
] as const;

/** 机型名称归一化："Boeing 777-300 ER" 和 "Boeing 777-300ER" 视为同一个。 */
export function normalizeAircraftName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectFormat(header: string[]): ImportFormat | null {
  const h = header.map((c) => c.trim());
  if (h.includes("Flight Flighty ID") || (h.includes("Airline") && h.includes("Gate Departure (Scheduled)"))) {
    return "flighty";
  }
  if (h[0] === "date" && h.includes("flight_number")) return "native";
  return null;
}

export function parseFlightCsv(text: string, ctx: ImportContext): ParsedImport {
  const [header, ...body] = parseCsv(text);
  const format = header ? detectFormat(header) : null;
  if (!format) {
    throw new Error("无法识别这个 CSV：目前支持 Flighty 导出的文件和本应用导出的文件");
  }
  const index = new Map(header.map((h, i) => [h.trim(), i]));
  const rows = body.map((cells, i) => {
    const get = (col: string) => (cells[index.get(col) ?? -1] ?? "").trim();
    const line = i + 2;
    return format === "flighty" ? flightyRow(get, line, ctx) : nativeRow(get, line, ctx);
  });
  return { format, rows };
}

type Getter = (col: string) => string;

const CABINS: Record<string, Cabin> = {
  economy: "economy",
  premium: "premium",
  premiumeconomy: "premium",
  business: "business",
  first: "first",
};

const PURPOSES: Record<string, Purpose> = {
  leisure: "leisure",
  personal: "leisure",
  vacation: "leisure",
  business: "business",
  work: "business",
};

function mapCabin(raw: string): Cabin | null {
  return raw ? (CABINS[raw.toLowerCase().replace(/[^a-z]/g, "")] ?? null) : null;
}

function mapPurpose(raw: string): Purpose | null {
  return raw ? (PURPOSES[raw.toLowerCase().replace(/[^a-z]/g, "")] ?? "other") : null;
}

/** "2026-01-07T11:20"（机场当地时间）→ UTC ISO；空值返回 null。 */
function localDateTimeToUtc(value: string, tz: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  if (!m || !tz) return null;
  return localToUtc(m[1], m[2], tz);
}

interface Draft {
  flightDate: string;
  airline: string;
  flightNumber: string;
  depAirport: string;
  arrAirport: string;
  schedDep: string;
  schedArr: string;
  actualDep: string;
  actualArr: string;
  aircraftType: string | null;
  registration: string;
  seat: string;
  cabin: Cabin | null;
  purpose: Purpose | null;
  confirmationCode: string;
  operatingAirline: string;
  notes: string[];
}

/** 两种格式共用的校验和换算。 */
function finish(d: Draft, line: number, warnings: string[], ctx: ImportContext): ImportRow {
  const label = `${d.flightDate || "????-??-??"} ${d.airline}${d.flightNumber} ${d.depAirport}→${d.arrAirport}`;
  const row: ImportRow = { line, label, input: null, error: null, skipped: null, warnings, future: false };
  const fail = (error: string) => ({ ...row, error });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.flightDate)) return fail("日期格式不对");
  if (!/^[A-Z0-9]{2}$/.test(d.airline)) return fail(`无法识别的航司代码 ${d.airline || "（空）"}`);
  if (!/^\d{1,4}[A-Z]?$/.test(d.flightNumber)) return fail(`航班号格式不对：${d.flightNumber || "（空）"}`);
  const dep = ctx.airports[d.depAirport];
  const arr = ctx.airports[d.arrAirport];
  if (!dep) return fail(`机场表里没有 ${d.depAirport || "（空）"}`);
  if (!arr) return fail(`机场表里没有 ${d.arrAirport || "（空）"}`);
  if (d.depAirport === d.arrAirport) return fail("起降机场相同");

  const schedDepUtc = localDateTimeToUtc(d.schedDep, dep.tz);
  const schedArrUtc = localDateTimeToUtc(d.schedArr, arr.tz);
  const actualDepUtc = localDateTimeToUtc(d.actualDep, dep.tz);
  const actualArrUtc = localDateTimeToUtc(d.actualArr, arr.tz);
  if (schedDepUtc && schedArrUtc && schedArrUtc <= schedDepUtc) return fail("计划到达早于计划起飞");
  if (actualDepUtc && actualArrUtc && actualArrUtc <= actualDepUtc) return fail("实际到达早于实际起飞");
  if (!schedDepUtc && !actualDepUtc) warnings.push("没有起降时间，时长无法计算");

  return {
    ...row,
    future: d.flightDate > ctx.today,
    input: {
      source: "csv",
      flightDate: d.flightDate,
      airline: d.airline,
      flightNumber: d.flightNumber,
      operatingAirline: d.operatingAirline || null,
      depAirport: d.depAirport,
      arrAirport: d.arrAirport,
      schedDepUtc,
      schedArrUtc,
      actualDepUtc,
      actualArrUtc,
      aircraftType: d.aircraftType,
      registration: d.registration || null,
      seat: d.seat || null,
      cabin: d.cabin,
      purpose: d.purpose,
      confirmationCode: d.confirmationCode || null,
      notes: d.notes.length ? d.notes.join("\n") : null,
    },
  };
}

function flightyRow(get: Getter, line: number, ctx: ImportContext): ImportRow {
  const warnings: string[] = [];
  const notes: string[] = [];

  // Flighty 用 ICAO 三字码（KAL），转成 IATA 二字码（KE）；本身就是二字码的原样保留
  const rawAirline = get("Airline").toUpperCase();
  const airline = ctx.airlineIcaoToIata[rawAirline] ?? rawAirline;

  const plannedArr = get("To").toUpperCase();
  const diverted = get("Diverted To").toUpperCase();
  const arrAirport = diverted || plannedArr;
  if (diverted) {
    warnings.push(`备降 ${diverted}（原计划 ${plannedArr}），按实际降落机场记录`);
    notes.push(`备降 ${diverted}，原计划到达 ${plannedArr}`);
  }

  const aircraftName = get("Aircraft Type Name");
  let aircraftType: string | null = null;
  if (aircraftName) {
    aircraftType = ctx.aircraftByName[normalizeAircraftName(aircraftName)] ?? null;
    if (!aircraftType) {
      warnings.push(`未识别的机型“${aircraftName}”，已写进备注`);
      notes.push(`机型：${aircraftName}`);
    }
  }
  if (get("Notes")) notes.push(get("Notes"));

  const draft: Draft = {
    flightDate: get("Date"),
    airline,
    flightNumber: get("Flight").toUpperCase(),
    depAirport: get("From").toUpperCase(),
    arrAirport,
    // Flighty 的“登机口出发/到达”就是轮挡时间；没有时退回起飞/落地时间
    schedDep: get("Gate Departure (Scheduled)") || get("Take off (Scheduled)"),
    schedArr: get("Gate Arrival (Scheduled)") || get("Landing (Scheduled)"),
    actualDep: get("Gate Departure (Actual)") || get("Take off (Actual)"),
    actualArr: get("Gate Arrival (Actual)") || get("Landing (Actual)"),
    aircraftType,
    registration: get("Tail Number").toUpperCase(),
    seat: get("Seat").toUpperCase(),
    cabin: mapCabin(get("Cabin Class")),
    purpose: mapPurpose(get("Flight Reason")),
    confirmationCode: get("PNR").toUpperCase(),
    operatingAirline: "",
    notes,
  };

  const row = finish(draft, line, warnings, ctx);
  if (get("Canceled").toLowerCase() === "true") return { ...row, input: null, error: null, skipped: "航班已取消" };
  return row;
}

function nativeRow(get: Getter, line: number, ctx: ImportContext): ImportRow {
  const warnings: string[] = [];
  const cabinRaw = get("cabin");
  const purposeRaw = get("purpose");
  const draft: Draft = {
    flightDate: get("date"),
    airline: get("airline").toUpperCase(),
    flightNumber: get("flight_number").toUpperCase(),
    depAirport: get("from").toUpperCase(),
    arrAirport: get("to").toUpperCase(),
    schedDep: get("scheduled_departure"),
    schedArr: get("scheduled_arrival"),
    actualDep: get("actual_departure"),
    actualArr: get("actual_arrival"),
    aircraftType: get("aircraft").toUpperCase() || null,
    registration: get("registration").toUpperCase(),
    seat: get("seat").toUpperCase(),
    cabin: mapCabin(cabinRaw),
    purpose: (["leisure", "business", "other"] as const).find((p) => p === purposeRaw.toLowerCase()) ?? null,
    confirmationCode: get("confirmation_code").toUpperCase(),
    operatingAirline: get("operating_airline").toUpperCase(),
    notes: get("notes") ? [get("notes")] : [],
  };
  if (cabinRaw && !draft.cabin) warnings.push(`未识别的舱位“${cabinRaw}”，已忽略`);
  if (purposeRaw && !draft.purpose) warnings.push(`未识别的出行目的“${purposeRaw}”，已忽略`);
  return finish(draft, line, warnings, ctx);
}

/** 导出为本应用的 CSV：时间按各自机场的当地时间写出，便于阅读，也能原样导入。 */
export function flightsToCsv(flights: Flight[], airports: Record<string, { tz: string } | undefined>): string {
  const local = (utc: string | null, code: string) => {
    const tz = airports[code]?.tz;
    if (!utc || !tz) return "";
    const l = utcToLocal(utc, tz);
    return `${l.date}T${l.time}`;
  };
  const lines = [csvLine([...NATIVE_HEADER])];
  const sorted = [...flights].sort(
    (a, b) => a.flightDate.localeCompare(b.flightDate) || (a.schedDepUtc ?? "").localeCompare(b.schedDepUtc ?? ""),
  );
  for (const f of sorted) {
    lines.push(
      csvLine([
        f.flightDate,
        f.airline,
        f.flightNumber,
        f.depAirport,
        f.arrAirport,
        local(f.schedDepUtc, f.depAirport),
        local(f.schedArrUtc, f.arrAirport),
        local(f.actualDepUtc, f.depAirport),
        local(f.actualArrUtc, f.arrAirport),
        f.aircraftType,
        f.registration,
        f.seat,
        f.cabin,
        f.purpose,
        f.confirmationCode,
        f.operatingAirline,
        f.notes,
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** 去重键，与数据库唯一索引一致：航司 + 航班号 + 起飞日期 + 出发机场。 */
export function dedupeKey(f: Pick<FlightInput, "airline" | "flightNumber" | "flightDate" | "depAirport">): string {
  return `${f.airline}|${f.flightNumber}|${f.flightDate}|${f.depAirport}`;
}
