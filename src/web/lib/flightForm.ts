import { addDays, dayDiff, localToUtc, utcToLocal } from "../../shared/time";
import type { Airport, Cabin, Flight, FlightInput, LookupCandidate, Purpose } from "../../shared/types";

/**
 * 表单里的时间都是机场当地时间：起飞时间按出发机场、到达时间按到达机场。
 * 日期统一用“相对起飞当地日期的天数偏移”表示，便于录入红眼和跨日期变更线航班。
 */
export interface FlightFormState {
  flightDate: string;
  airline: string;
  flightNumber: string;
  operatingAirline: string;
  depAirport: string;
  arrAirport: string;
  schedDep: string;
  schedArr: string;
  schedArrOffset: number;
  actualDep: string;
  actualDepOffset: number;
  actualArr: string;
  actualArrOffset: number;
  aircraftType: string;
  registration: string;
  seat: string;
  cabin: Cabin | "";
  purpose: Purpose | "";
  confirmationCode: string;
  notes: string;
}

export const emptyForm = (): FlightFormState => ({
  flightDate: new Date().toISOString().slice(0, 10),
  airline: "",
  flightNumber: "",
  operatingAirline: "",
  depAirport: "",
  arrAirport: "",
  schedDep: "",
  schedArr: "",
  schedArrOffset: 0,
  actualDep: "",
  actualDepOffset: 0,
  actualArr: "",
  actualArrOffset: 0,
  aircraftType: "",
  registration: "",
  seat: "",
  cabin: "",
  purpose: "",
  confirmationCode: "",
  notes: "",
});

/** 把航班号输入拆成航司和数字，如 "UA 857" → ["UA", "857"]。 */
export function splitFlightCode(code: string): [string, string] | null {
  const m = /^\s*([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\s*$/i.exec(code);
  return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null;
}

export class FormError extends Error {}

export function formToInput(
  f: FlightFormState,
  airports: Record<string, Airport>,
): Omit<FlightInput, "source"> {
  const dep = airports[f.depAirport.trim().toUpperCase()];
  const arr = airports[f.arrAirport.trim().toUpperCase()];
  if (!dep) throw new FormError(`找不到出发机场 ${f.depAirport}`);
  if (!arr) throw new FormError(`找不到到达机场 ${f.arrAirport}`);

  const at = (time: string, offset: number, ap: Airport) =>
    time ? localToUtc(addDays(f.flightDate, offset), time, ap.tz) : null;

  const nullable = (s: string) => (s.trim() ? s.trim() : null);
  return {
    flightDate: f.flightDate,
    airline: f.airline.trim().toUpperCase(),
    flightNumber: f.flightNumber.trim().toUpperCase(),
    operatingAirline: nullable(f.operatingAirline),
    depAirport: f.depAirport.trim().toUpperCase(),
    arrAirport: f.arrAirport.trim().toUpperCase(),
    schedDepUtc: at(f.schedDep, 0, dep),
    schedArrUtc: at(f.schedArr, f.schedArrOffset, arr),
    actualDepUtc: at(f.actualDep, f.actualDepOffset, dep),
    actualArrUtc: at(f.actualArr, f.actualArrOffset, arr),
    aircraftType: nullable(f.aircraftType),
    registration: nullable(f.registration),
    seat: nullable(f.seat),
    cabin: f.cabin || null,
    purpose: f.purpose || null,
    confirmationCode: nullable(f.confirmationCode),
    notes: nullable(f.notes),
  };
}

export function flightToForm(fl: Flight, airports: Record<string, Airport>): FlightFormState {
  const dep = airports[fl.depAirport];
  const arr = airports[fl.arrAirport];
  const local = (utc: string | null, ap: Airport | undefined): [string, number] => {
    if (!utc || !ap) return ["", 0];
    const l = utcToLocal(utc, ap.tz);
    return [l.time, dayDiff(fl.flightDate, l.date)];
  };
  const [schedDep] = local(fl.schedDepUtc, dep);
  const [schedArr, schedArrOffset] = local(fl.schedArrUtc, arr);
  const [actualDep, actualDepOffset] = local(fl.actualDepUtc, dep);
  const [actualArr, actualArrOffset] = local(fl.actualArrUtc, arr);
  return {
    flightDate: fl.flightDate,
    airline: fl.airline,
    flightNumber: fl.flightNumber,
    operatingAirline: fl.operatingAirline ?? "",
    depAirport: fl.depAirport,
    arrAirport: fl.arrAirport,
    schedDep,
    schedArr,
    schedArrOffset,
    actualDep,
    actualDepOffset,
    actualArr,
    actualArrOffset,
    aircraftType: fl.aircraftType ?? "",
    registration: fl.registration ?? "",
    seat: fl.seat ?? "",
    cabin: fl.cabin ?? "",
    purpose: fl.purpose ?? "",
    confirmationCode: fl.confirmationCode ?? "",
    notes: fl.notes ?? "",
  };
}

/**
 * 把航班数据服务查到的一段填进表单：航线、计划 / 实际时间（换成机场当地时间和日期偏移）、
 * 机型、机尾号、实际承运航司。返回新表单和填了哪些项（给用户看）。
 */
export function applyLookup(
  f: FlightFormState,
  c: LookupCandidate,
  airports: Record<string, Airport>,
): { form: FlightFormState; filled: string[] } {
  const next = { ...f };
  const filled: string[] = [];
  const dep = c.depAirport ? airports[c.depAirport] : undefined;
  const arr = c.arrAirport ? airports[c.arrAirport] : undefined;
  if (dep && arr) {
    next.depAirport = c.depAirport!;
    next.arrAirport = c.arrAirport!;
    filled.push("航线");
  }
  // 当地时间 + 相对起飞日期的天数；超出表单能表示的范围就不填
  const local = (utc: string | null, ap: Airport | undefined): [string, number] | null => {
    if (!utc || !ap) return null;
    const l = utcToLocal(utc, ap.tz);
    const offset = dayDiff(next.flightDate, l.date);
    return offset >= -1 && offset <= 2 ? [l.time, offset] : null;
  };
  const sd = local(c.schedDepUtc, dep);
  const sa = local(c.schedArrUtc, arr);
  if (sd && sd[1] === 0) next.schedDep = sd[0];
  if (sa) [next.schedArr, next.schedArrOffset] = sa;
  if ((sd && sd[1] === 0) || sa) filled.push("计划时间");
  const ad = local(c.actualDepUtc, dep);
  const aa = local(c.actualArrUtc, arr);
  if (ad) [next.actualDep, next.actualDepOffset] = ad;
  if (aa) [next.actualArr, next.actualArrOffset] = aa;
  if (ad || aa) filled.push("实际时间");
  if (c.aircraftType) {
    next.aircraftType = c.aircraftType;
    filled.push(`机型 ${c.aircraftType}`);
  }
  if (c.registration) {
    next.registration = c.registration;
    filled.push(`机尾号 ${c.registration}`);
  }
  if (c.operatingAirline) {
    next.operatingAirline = c.operatingAirline;
    filled.push(`实际承运 ${c.operatingAirline}`);
  }
  return { form: next, filled };
}
