import { greatCircleKm } from "./geo";
import { minutesBetween } from "./time";

interface Times {
  schedDepUtc: string | null;
  schedArrUtc: string | null;
  actualDepUtc: string | null;
  actualArrUtc: string | null;
}

/** 飞行时长（分钟）：实际轮挡时间优先，没有实际数据时用计划时间。 */
export function flightDurationMin(t: Times): number | null {
  if (t.actualDepUtc && t.actualArrUtc) return minutesBetween(t.actualDepUtc, t.actualArrUtc);
  if (t.schedDepUtc && t.schedArrUtc) return minutesBetween(t.schedDepUtc, t.schedArrUtc);
  return null;
}

/** 起降机场之间的大圆距离，取整公里。 */
export function flightDistanceKm(
  dep: { lat: number; lon: number } | undefined,
  arr: { lat: number; lon: number } | undefined,
): number | null {
  if (!dep || !arr) return null;
  return Math.round(greatCircleKm(dep.lat, dep.lon, arr.lat, arr.lon));
}
