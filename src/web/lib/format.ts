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

/** 数值 + 单位分开返回，便于排版（大号数字、小号单位）。 */
export function distanceParts(km: number, unit: DistanceUnit): { value: string; unit: string } {
  const v = unit === "km" ? km : kmToMiles(km);
  return { value: Math.round(v).toLocaleString(), unit };
}

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const weekdayFmt = new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", weekday: "short" });
const shortDateFmt = new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", month: "numeric", day: "numeric" });

/** "2024年7月10日"，按起飞当地日期（日期字符串本身不带时区）。 */
export function formatDate(date: string): string {
  return dateFmt.format(new Date(`${date}T00:00:00Z`));
}

export function formatWeekday(date: string): string {
  return weekdayFmt.format(new Date(`${date}T00:00:00Z`));
}

export function formatShortDate(date: string): string {
  return shortDateFmt.format(new Date(`${date}T00:00:00Z`));
}

export function cityName(code: string, ref: RefData | undefined): string {
  const a = ref?.airports[code];
  return a?.city ?? a?.name ?? code;
}

export const CABIN_LABEL: Record<string, string> = {
  economy: "经济舱",
  premium: "超级经济舱",
  business: "商务舱",
  first: "头等舱",
};

export const PURPOSE_LABEL: Record<string, string> = { leisure: "休闲", business: "商务", other: "其他" };
