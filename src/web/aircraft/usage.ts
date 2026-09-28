import type { Flight } from "../../shared/types";

export interface AircraftUsage {
  type: string;
  flights: Flight[];
  minutes: number;
  km: number;
  /** 按次数排序的航司 */
  airlines: { code: string; count: number }[];
  /** 坐过的具体飞机（注册号） */
  registrations: { reg: string; count: number; airline: string }[];
  first: string;
  last: string;
}

function ranked<T extends string>(items: T[]): { key: T; count: number }[] {
  const m = new Map<T, number>();
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** 按机型汇总：次数多的在前。 */
export function aircraftUsage(flights: Flight[]): AircraftUsage[] {
  const byType = new Map<string, Flight[]>();
  for (const f of flights) {
    if (!f.aircraftType) continue;
    const list = byType.get(f.aircraftType) ?? [];
    list.push(f);
    byType.set(f.aircraftType, list);
  }
  return [...byType]
    .map(([type, fs]) => {
      const dates = fs.map((f) => f.flightDate).sort();
      const regAirline = new Map<string, string>();
      for (const f of fs) if (f.registration) regAirline.set(f.registration.toUpperCase(), f.airline);
      return {
        type,
        flights: [...fs].sort((a, b) => b.flightDate.localeCompare(a.flightDate)),
        minutes: fs.reduce((s, f) => s + (f.durationMin ?? 0), 0),
        km: fs.reduce((s, f) => s + (f.distanceKm ?? 0), 0),
        airlines: ranked(fs.map((f) => f.airline)).map((r) => ({ code: r.key, count: r.count })),
        registrations: ranked(fs.flatMap((f) => (f.registration ? [f.registration.toUpperCase()] : []))).map((r) => ({
          reg: r.key,
          count: r.count,
          airline: regAirline.get(r.key) ?? "",
        })),
        first: dates[0],
        last: dates.at(-1)!,
      };
    })
    .sort((a, b) => b.flights.length - a.flights.length || b.minutes - a.minutes);
}
