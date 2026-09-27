import { describe, expect, it } from "vitest";
import { greatCircleKm, kmToMiles } from "./geo";
import { flightDurationMin } from "./derive";

describe("greatCircleKm", () => {
  it("JFK–LHR 约 5540 km", () => {
    const km = greatCircleKm(40.63945, -73.77932, 51.4706, -0.461941);
    expect(km).toBeGreaterThan(5520);
    expect(km).toBeLessThan(5560);
  });
  it("跨 180° 经线取短弧：SFO–NRT 约 8200 km", () => {
    const km = greatCircleKm(37.619, -122.375, 35.7647, 140.386);
    expect(km).toBeGreaterThan(8150);
    expect(km).toBeLessThan(8260);
  });
  it("同一点为 0", () => {
    expect(greatCircleKm(10, 20, 10, 20)).toBe(0);
  });
  it("英里换算", () => {
    expect(kmToMiles(1609.344)).toBeCloseTo(1000);
  });
});

describe("flightDurationMin", () => {
  const sched = { schedDepUtc: "2024-01-01T10:00:00Z", schedArrUtc: "2024-01-01T12:30:00Z" };
  it("实际时间优先", () => {
    expect(
      flightDurationMin({ ...sched, actualDepUtc: "2024-01-01T10:20:00Z", actualArrUtc: "2024-01-01T12:40:00Z" }),
    ).toBe(140);
  });
  it("缺实际时间时用计划", () => {
    expect(flightDurationMin({ ...sched, actualDepUtc: "2024-01-01T10:20:00Z", actualArrUtc: null })).toBe(150);
  });
  it("都没有返回 null", () => {
    expect(
      flightDurationMin({ schedDepUtc: null, schedArrUtc: null, actualDepUtc: null, actualArrUtc: null }),
    ).toBeNull();
  });
});
