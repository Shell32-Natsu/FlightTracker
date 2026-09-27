import type { Airport, Flight } from "./types";

/**
 * 统计口径（见设计文档“关键实现细节”）：
 * - 航班数：每个航段算一次
 * - 距离：保存时算好的大圆距离
 * - 时长：保存时算好的时长（实际优先、计划兜底）
 * - 国家/地区：按起降机场所在国家计数，转机也算
 * - 年份：按起飞当地日期归属
 */

export interface FlightFilter {
  year?: number;
  airline?: string;
}

export function filterFlights(flights: Flight[], f: FlightFilter): Flight[] {
  return flights.filter(
    (x) =>
      (f.year === undefined || flightYear(x) === f.year) &&
      (f.airline === undefined || x.airline === f.airline),
  );
}

export function flightYear(f: Pick<Flight, "flightDate">): number {
  return Number(f.flightDate.slice(0, 4));
}

/** 无方向航线键，如 "NRT-SFO"（按字母序）。 */
export function routeKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export interface Ranked {
  key: string;
  count: number;
  distanceKm: number;
}

export interface YearStat {
  year: number;
  flights: number;
  distanceKm: number;
  durationMin: number;
}

export interface Stats {
  flights: number;
  distanceKm: number;
  durationMin: number;
  airports: Ranked[];
  countries: Ranked[];
  airlines: Ranked[];
  aircraft: Ranked[];
  routes: Ranked[];
  years: YearStat[];
  longest: Flight | null;
  shortest: Flight | null;
}

export function computeStats(flights: Flight[], airports: Record<string, Airport>): Stats {
  const airportCount = new Counter();
  const countryCount = new Counter();
  const airlineCount = new Counter();
  const aircraftCount = new Counter();
  const routeCount = new Counter();
  const years = new Map<number, YearStat>();
  let distanceKm = 0;
  let durationMin = 0;
  let longest: Flight | null = null;
  let shortest: Flight | null = null;

  for (const f of flights) {
    const km = f.distanceKm ?? 0;
    const min = f.durationMin ?? 0;
    distanceKm += km;
    durationMin += min;

    airportCount.add(f.depAirport, km);
    airportCount.add(f.arrAirport, km);
    // 同一航段起降在同一国家时只算一次
    const countries = new Set(
      [airports[f.depAirport]?.country, airports[f.arrAirport]?.country].filter(Boolean) as string[],
    );
    for (const c of countries) countryCount.add(c, km);
    airlineCount.add(f.airline, km);
    if (f.aircraftType) aircraftCount.add(f.aircraftType, km);
    routeCount.add(routeKey(f.depAirport, f.arrAirport), km);

    const y = flightYear(f);
    const ys = years.get(y) ?? { year: y, flights: 0, distanceKm: 0, durationMin: 0 };
    ys.flights++;
    ys.distanceKm += km;
    ys.durationMin += min;
    years.set(y, ys);

    if (f.distanceKm != null) {
      if (!longest || f.distanceKm > longest.distanceKm!) longest = f;
      if (!shortest || f.distanceKm < shortest.distanceKm!) shortest = f;
    }
  }

  return {
    flights: flights.length,
    distanceKm,
    durationMin,
    airports: airportCount.ranked(),
    countries: countryCount.ranked(),
    airlines: airlineCount.ranked(),
    aircraft: aircraftCount.ranked(),
    routes: routeCount.ranked(),
    years: [...years.values()].sort((a, b) => a.year - b.year),
    longest,
    shortest,
  };
}

class Counter {
  private m = new Map<string, Ranked>();
  add(key: string, km: number) {
    const r = this.m.get(key) ?? { key, count: 0, distanceKm: 0 };
    r.count++;
    r.distanceKm += km;
    this.m.set(key, r);
  }
  ranked(): Ranked[] {
    return [...this.m.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }
}
