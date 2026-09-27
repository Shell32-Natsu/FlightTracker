import { dayDiff, formatDuration, utcToLocal } from "../../shared/time";
import { kmToMiles } from "../../shared/geo";
import type { Flight } from "../../shared/types";
import type { RefData } from "./refdata";

export type DistanceUnit = "km" | "mi";

export function formatDistance(km: number, unit: DistanceUnit): string {
  const v = unit === "km" ? km : kmToMiles(km);
  return `${Math.round(v).toLocaleString()} ${unit}`;
}

export function formatHours(min: number): string {
  return min >= 60 * 48 ? `${Math.round(min / 60).toLocaleString()} 小时` : formatDuration(min);
}

export const flightCode = (f: Pick<Flight, "airline" | "flightNumber">) => `${f.airline}${f.flightNumber}`;

export function airportLabel(code: string, ref: RefData | undefined): string {
  const a = ref?.airports[code];
  return a ? `${a.city ?? a.name}` : code;
}

export function airlineName(code: string, ref: RefData | undefined): string {
  return ref?.airlines[code]?.name ?? code;
}

export function aircraftName(code: string, ref: RefData | undefined): string {
  return ref?.aircraft[code] ?? code;
}

export function countryName(code: string, ref: RefData | undefined): string {
  return ref?.countries[code]?.nameZh ?? code;
}

/** 起降时间按各自机场当地时间显示，到达跨日时附带 +1 / −1。 */
export function localTimes(f: Flight, ref: RefData | undefined) {
  const dep = ref?.airports[f.depAirport];
  const arr = ref?.airports[f.arrAirport];
  const depUtc = f.actualDepUtc ?? f.schedDepUtc;
  const arrUtc = f.actualArrUtc ?? f.schedArrUtc;
  const depLocal = depUtc && dep ? utcToLocal(depUtc, dep.tz) : null;
  const arrLocal = arrUtc && arr ? utcToLocal(arrUtc, arr.tz) : null;
  const offset = arrLocal ? dayDiff(f.flightDate, arrLocal.date) : 0;
  return {
    dep: depLocal?.time ?? null,
    arr: arrLocal?.time ?? null,
    arrOffset: offset === 0 ? "" : offset > 0 ? `+${offset}` : `−${-offset}`,
  };
}
