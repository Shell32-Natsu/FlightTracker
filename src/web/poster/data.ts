import type { Flight } from "../../shared/types";
import { computeStats, flightYear, resolveHomeAirport, routeKey, type Stats } from "../../shared/stats";
import type { RefData } from "../lib/refdata";
import { rampColor, type PosterPalette } from "./palettes";

export type ColorBy = "single" | "year" | "airline";

export interface PosterRoute {
  key: string;
  a: [number, number];
  b: [number, number];
  count: number;
  /** 单色模式为 null，使用配色里的渐变 */
  color: string | null;
}

export interface PosterAirport {
  code: string;
  lon: number;
  lat: number;
  count: number;
  home: boolean;
}

export interface LegendItem {
  label: string;
  color: string;
}

export interface PosterData {
  flights: Flight[];
  stats: Stats;
  routes: PosterRoute[];
  airports: PosterAirport[];
  /** 去过的国家（ISO 数字码，对应国界 TopoJSON 的 id） */
  visited: Set<string>;
  home: PosterAirport | null;
  legend: LegendItem[];
  years: number[];
}

/** 把航班汇总成海报要画的航线、机场和图例。 */
export function buildPosterData(
  flights: Flight[],
  ref: RefData,
  palette: PosterPalette,
  colorBy: ColorBy,
  homeOverride: string | null,
): PosterData {
  const stats = computeStats(flights, ref.airports);
  const years = stats.years.map((y) => y.year);

  // 航线分组：单色按航线；按年份 / 航司时同一航线的不同组分开画
  const topAirlines = stats.airlines.slice(0, 3).map((r) => r.key);
  const groupOf = (f: Flight) =>
    colorBy === "year" ? String(flightYear(f)) : colorBy === "airline" ? (topAirlines.includes(f.airline) ? f.airline : "其他") : "";
  const colorOf = (group: string): string | null => {
    if (colorBy === "year") {
      const i = years.indexOf(Number(group));
      return rampColor(palette.yearRamp, years.length > 1 ? i / (years.length - 1) : 1);
    }
    if (colorBy === "airline") {
      const i = topAirlines.indexOf(group);
      return i >= 0 ? palette.airlineColors[i] : palette.other;
    }
    return null;
  };

  const groups = new Map<string, { a: string; b: string; count: number; group: string }>();
  for (const f of flights) {
    const k = `${routeKey(f.depAirport, f.arrAirport)}|${groupOf(f)}`;
    const g = groups.get(k) ?? { a: f.depAirport, b: f.arrAirport, count: 0, group: groupOf(f) };
    g.count++;
    groups.set(k, g);
  }
  const routes: PosterRoute[] = [];
  for (const [key, g] of groups) {
    const a = ref.airports[g.a];
    const b = ref.airports[g.b];
    if (!a || !b) continue;
    routes.push({ key, a: [a.lon, a.lat], b: [b.lon, b.lat], count: g.count, color: colorOf(g.group) });
  }
  // 按年份时新的画在上面；否则常飞的画在上面
  const yearOf = (r: PosterRoute) => (colorBy === "year" ? Number(r.key.split("|")[1]) : 0);
  routes.sort((x, y) => yearOf(x) - yearOf(y) || x.count - y.count);

  const homeCode = resolveHomeAirport(flights, homeOverride, ref.airports);
  const airports: PosterAirport[] = stats.airports
    .filter((r) => ref.airports[r.key])
    .map((r) => ({
      code: r.key,
      lon: ref.airports[r.key].lon,
      lat: ref.airports[r.key].lat,
      count: r.count,
      home: r.key === homeCode,
    }));

  const visited = new Set<string>();
  for (const c of stats.countries) {
    const n = ref.countries[c.key]?.numeric;
    if (n) visited.add(n);
  }

  const legend: LegendItem[] =
    colorBy === "year"
      ? years.map((y) => ({ label: String(y), color: colorOf(String(y))! }))
      : colorBy === "airline"
        ? [
            ...topAirlines.map((a) => ({ label: a, color: colorOf(a)! })),
            ...(stats.airlines.length > 3 ? [{ label: "其他", color: palette.other }] : []),
          ]
        : [];

  return {
    flights,
    stats,
    routes,
    airports,
    visited,
    home: airports.find((a) => a.home) ?? null,
    legend,
    years,
  };
}
