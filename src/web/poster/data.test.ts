import { describe, expect, it } from "vitest";
import { buildPosterData } from "./data";
import { PALETTES, rampColor } from "./palettes";
import type { Flight } from "../../shared/types";
import type { RefData } from "../lib/refdata";

const ap = (country: string, lon: number, lat: number) => ({ name: "", country, lon, lat, tz: "UTC" });
const ref = {
  airports: { PVG: ap("CN", 121.8, 31.1), PEK: ap("CN", 116.6, 40.1), NRT: ap("JP", 140.4, 35.8), SFO: ap("US", -122.4, 37.6), LAX: ap("US", -118.4, 33.9) },
  countries: { CN: { name: "", nameZh: "", numeric: "156", continent: "" }, JP: { name: "", nameZh: "", numeric: "392", continent: "" }, US: { name: "", nameZh: "", numeric: "840", continent: "" } },
  airlines: {},
  aircraft: {},
} as unknown as RefData;

let n = 0;
const f = (date: string, airline: string, dep: string, arr: string): Flight =>
  ({ id: String(n++), status: "confirmed", source: "manual", flightDate: date, airline, flightNumber: "1", depAirport: dep, arrAirport: arr, distanceKm: 1000, durationMin: 60 }) as Flight;

const flights = [
  f("2022-01-01", "MU", "PVG", "PEK"),
  f("2023-01-01", "MU", "PEK", "PVG"),
  f("2024-01-01", "NH", "PVG", "NRT"),
  f("2024-02-01", "UA", "NRT", "SFO"),
  f("2024-03-01", "AA", "SFO", "LAX"),
  f("2024-04-01", "MU", "PVG", "PEK"),
];

describe("buildPosterData", () => {
  it("单色：同一航线合并计数，没有图例", () => {
    const d = buildPosterData(flights, ref, PALETTES.night, "single", null);
    expect(d.routes.find((r) => r.key.startsWith("PEK-PVG"))?.count).toBe(3);
    expect(d.routes.every((r) => r.color === null)).toBe(true);
    expect(d.legend).toEqual([]);
    expect(d.visited).toEqual(new Set(["156", "392", "840"]));
    expect(d.home?.code).toBe("PVG");
  });

  it("按航司：只有前 3 家有颜色，其余并入“其他”", () => {
    const d = buildPosterData(flights, ref, PALETTES.night, "airline", null);
    expect(d.legend.map((l) => l.label)).toEqual(["MU", "AA", "NH", "其他"]);
    expect(d.routes.find((r) => r.key.endsWith("|其他"))?.color).toBe(PALETTES.night.other);
  });

  it("按年份：旧年份取色阶起点，最新年份取终点，新的画在上层", () => {
    const d = buildPosterData(flights, ref, PALETTES.paper, "year", null);
    expect(d.legend.map((l) => l.label)).toEqual(["2022", "2023", "2024"]);
    expect(d.legend[0].color).toBe(PALETTES.paper.yearRamp[0]);
    expect(d.legend[2].color).toBe(PALETTES.paper.yearRamp.at(-1));
    expect(d.routes.at(-1)?.key.endsWith("|2024")).toBe(true);
  });

  it("指定的大本营优先", () => {
    expect(buildPosterData(flights, ref, PALETTES.night, "single", "SFO").home?.code).toBe("SFO");
  });
});

describe("rampColor", () => {
  it("两端和中点", () => {
    expect(rampColor(["#000000", "#ffffff"], 0)).toBe("#000000");
    expect(rampColor(["#000000", "#ffffff"], 1)).toBe("#ffffff");
    expect(rampColor(["#000000", "#ffffff"], 0.5)).toBe("#808080");
  });
});
