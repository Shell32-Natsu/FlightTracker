import { addDays, dayDiff, localToUtc, utcToLocal } from "../../shared/time";
import type { Airport, Cabin, Flight, FlightInput, Purpose } from "../../shared/types";

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
