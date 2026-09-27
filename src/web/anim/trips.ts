import type { Flight } from "../../shared/types";

/**
 * 一次旅行：同一订座记录；或前一段到达后 72 小时内接着飞；
 * 或还没回到常驻机场、从上一段的到达机场继续出发（21 天内），例如途中停留几天的环线。
 */
export interface Trip {
  id: string;
  flights: Flight[];
  /** 如 "2024年4月 · PVG–SIN–SYD–AKL–SIN–PVG" */
  label: string;
}

const GAP_MS = 72 * 3600_000;
const AWAY_MS = 21 * 24 * 3600_000;

function depMs(f: Flight): number {
  return Date.parse(f.actualDepUtc ?? f.schedDepUtc ?? `${f.flightDate}T12:00:00Z`);
}

function arrMs(f: Flight): number {
  const a = f.actualArrUtc ?? f.schedArrUtc;
  return a ? Date.parse(a) : depMs(f) + (f.durationMin ?? 120) * 60_000;
}

export function sortByDeparture(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) => depMs(a) - depMs(b));
}

export function groupTrips(flights: Flight[], home: string | null = null): Trip[] {
  const trips: Flight[][] = [];
  for (const f of sortByDeparture(flights)) {
    const cur = trips.at(-1);
    const prev = cur?.at(-1);
    const samePnr = !!f.confirmationCode && cur?.some((x) => x.confirmationCode === f.confirmationCode);
    const gap = prev ? depMs(f) - arrMs(prev) : Infinity;
    const continuing =
      !!prev &&
      home !== null &&
      prev.arrAirport !== home &&
      f.depAirport === prev.arrAirport &&
      gap <= AWAY_MS;
    if (cur && prev && (samePnr || gap <= GAP_MS || continuing)) cur.push(f);
    else trips.push([f]);
  }
  return trips.map((fs) => ({ id: fs[0].id, flights: fs, label: tripLabel(fs) }));
}

/** 途经机场（相邻重复的合并），如 PVG–SIN–SYD。 */
export function tripPath(flights: Flight[]): string[] {
  const codes: string[] = [];
  for (const f of flights) {
    if (codes.at(-1) !== f.depAirport) codes.push(f.depAirport);
    codes.push(f.arrAirport);
  }
  return codes;
}

function tripLabel(fs: Flight[]): string {
  const [y, m] = fs[0].flightDate.split("-");
  return `${y}年${Number(m)}月 · ${tripPath(fs).join("–")}`;
}
