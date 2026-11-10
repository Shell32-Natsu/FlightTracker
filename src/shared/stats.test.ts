import { describe, expect, it } from "vitest";
import {
  computeStats,
  featuredFlight,
  filterFlights,
  haulBreakdown,
  haulOf,
  monthMatrix,
  mostVisitedAirport,
  resolveHomeAirport,
  routeKey,
} from "./stats";
import type { Airport, Flight } from "./types";

const ap = (country: string): Airport => ({ name: "", country, lat: 0, lon: 0, tz: "UTC" });
const airports: Record<string, Airport> = {
  PEK: ap("CN"),
  PVG: ap("CN"),
  NRT: ap("JP"),
  SFO: ap("US"),
};

let n = 0;
function flight(p: Partial<Flight>): Flight {
  return {
    id: String(n++),
    status: "confirmed",
    source: "manual",
    flightDate: "2024-01-01",
    airline: "CA",
    flightNumber: "1",
    operatingAirline: null,
    depAirport: "PEK",
    arrAirport: "PVG",
    schedDepUtc: null,
    schedArrUtc: null,
    actualDepUtc: null,
    actualArrUtc: null,
    aircraftType: null,
    registration: null,
    seat: null,
    cabin: null,
    purpose: null,
    confirmationCode: null,
    distanceKm: 1000,
    durationMin: 120,
    trackKey: null,
    emailId: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}

const data = [
  flight({ flightDate: "2023-12-31", depAirport: "PEK", arrAirport: "PVG", distanceKm: 1100, aircraftType: "A333" }),
  flight({ flightDate: "2024-01-02", depAirport: "PVG", arrAirport: "NRT", distanceKm: 1800, airline: "NH" }),
  flight({ flightDate: "2024-01-03", depAirport: "NRT", arrAirport: "SFO", distanceKm: 8200, airline: "NH", durationMin: 600 }),
  flight({ flightDate: "2024-02-01", depAirport: "PVG", arrAirport: "PEK", distanceKm: 1100 }),
];

describe("computeStats", () => {
  const s = computeStats(data, airports);

  it("总数、里程、时长", () => {
    expect(s.flights).toBe(4);
    expect(s.distanceKm).toBe(12200);
    expect(s.durationMin).toBe(120 * 3 + 600);
  });

  it("国家按起降机场计数，同国航段只算一次", () => {
    expect(s.countries.map((c) => [c.key, c.count])).toEqual([
      ["CN", 3],
      ["JP", 2],
      ["US", 1],
    ]);
  });

  it("航线不分方向", () => {
    expect(s.routes[0]).toMatchObject({ key: routeKey("PVG", "PEK"), count: 2 });
  });

  it("年份按起飞当地日期归属", () => {
    expect(s.years.map((y) => [y.year, y.flights])).toEqual([
      [2023, 1],
      [2024, 3],
    ]);
  });

  it("最长和最短", () => {
    expect(s.longest?.arrAirport).toBe("SFO");
    expect(s.shortest?.distanceKm).toBe(1100);
  });

  it("机场按到访次数排序", () => {
    expect(s.airports.map((a) => a.key)).toEqual(["PVG", "NRT", "PEK", "SFO"]);
  });
});

describe("filterFlights", () => {
  it("按年份和航司", () => {
    expect(filterFlights(data, { year: 2024 })).toHaveLength(3);
    expect(filterFlights(data, { year: 2024, airline: "NH" })).toHaveLength(2);
    expect(filterFlights(data, {})).toHaveLength(4);
  });
});

describe("monthMatrix", () => {
  it("按年、按月计数，年份倒序", () => {
    const m = monthMatrix(data);
    expect(m.years).toEqual([2024, 2023]);
    expect(m.counts.get(2024)!.slice(0, 3)).toEqual([2, 1, 0]);
    expect(m.counts.get(2023)![11]).toBe(1);
    expect(m.max).toBe(2);
  });
});

describe("haul", () => {
  it("分类边界", () => {
    expect(haulOf(1499)).toBe("short");
    expect(haulOf(1500)).toBe("medium");
    expect(haulOf(3999)).toBe("medium");
    expect(haulOf(4000)).toBe("long");
  });
  it("汇总", () => {
    const h = haulBreakdown(data);
    expect(h.short.count).toBe(2);
    expect(h.medium.count).toBe(1);
    expect(h.long).toEqual({ count: 1, distanceKm: 8200 });
  });
});

describe("大本营", () => {
  it("取起降次数最多的机场", () => {
    // PVG 出现 3 次，PEK 2 次
    expect(mostVisitedAirport(data)).toBe("PVG");
  });
  it("次数相同时按字母序，和机场排行第一名一致", () => {
    const tie = [flight({ depAirport: "SFO", arrAirport: "NRT" })];
    expect(mostVisitedAirport(tie)).toBe("NRT");
    expect(computeStats(tie, airports).airports[0].key).toBe("NRT");
  });
  it("没有航班时为 null", () => {
    expect(mostVisitedAirport([])).toBeNull();
  });
  it("指定的机场优先，但必须在机场表里", () => {
    expect(resolveHomeAirport(data, "SFO", airports)).toBe("SFO");
    expect(resolveHomeAirport(data, "ZZZ", airports)).toBe("PVG");
    expect(resolveHomeAirport(data, null, airports)).toBe("PVG");
  });
});

describe("featuredFlight", () => {
  const past = flight({ flightDate: "2024-03-01" });
  const morning = flight({
    flightDate: "2024-05-01",
    schedDepUtc: "2024-05-01T01:00:00Z",
    schedArrUtc: "2024-05-01T03:00:00Z",
  });
  const evening = flight({
    flightDate: "2024-05-01",
    schedDepUtc: "2024-05-01T09:00:00Z",
    schedArrUtc: "2024-05-01T12:00:00Z",
  });
  const all = [evening, past, morning];
  it("取还没落地的最近一段", () => {
    expect(featuredFlight(all, "2024-05-01T00:00:00Z", "2024-05-01")).toEqual({ flight: morning, upcoming: true });
  });
  it("当天已经落地的不算下一段", () => {
    expect(featuredFlight(all, "2024-05-01T08:00:00Z", "2024-05-01")).toEqual({ flight: evening, upcoming: true });
  });
  it("没有时刻的航班按日期判断", () => {
    const noTimes = flight({ flightDate: "2024-05-02" });
    expect(featuredFlight([noTimes], "2024-05-02T10:00:00Z", "2024-05-02")?.upcoming).toBe(true);
    expect(featuredFlight([noTimes], "2024-05-03T10:00:00Z", "2024-05-03")?.upcoming).toBe(false);
  });
  it("没有未来航班时取最近飞过的一段", () => {
    expect(featuredFlight(all, "2024-06-01T00:00:00Z", "2024-06-01")).toEqual({ flight: evening, upcoming: false });
  });
  it("没有航班", () => {
    expect(featuredFlight([], "2024-06-01T00:00:00Z", "2024-06-01")).toBeNull();
  });
});
