import { describe, expect, it } from "vitest";
import { discRadius, isBehind, zoomToFit } from "./globeLight";

describe("discRadius", () => {
  it("相机很远时接近球半径", () => {
    expect(discRadius(1e7, 300)).toBeCloseTo(300, 0);
  });

  it("有透视时轮廓比球半径小，且随半径单调增大", () => {
    const r = discRadius(1350, 360);
    expect(r).toBeLessThan(360);
    expect(r).toBeGreaterThan(250);
    expect(discRadius(1350, 400)).toBeGreaterThan(r);
  });
});

describe("isBehind", () => {
  const view = { x: 0, y: 0, r: 0, lng: 120, lat: 30, horizonCos: 0.2 };
  it("视野中心可见、对跖点不可见", () => {
    expect(isBehind(view, 120, 30)).toBe(false);
    expect(isBehind(view, -60, -30)).toBe(true);
  });
  it("展开过的经度（超出 ±180）结果一样", () => {
    expect(isBehind(view, 190, 20)).toBe(isBehind(view, -170, 20));
  });
  it("刚过 90° 之前就已经在地平线下（相机离得近）", () => {
    expect(isBehind({ ...view, lat: 0 }, 120 + 77, 0)).toBe(false);
    expect(isBehind({ ...view, lat: 0 }, 120 + 80, 0)).toBe(true);
  });
});

describe("zoomToFit", () => {
  const line: [number, number][] = [
    [100, 0],
    [110, 0],
    [120, 0],
  ];
  it("区域大一倍，缩放级别大一级", () => {
    expect(zoomToFit(line, [110, 0], 800, 800) - zoomToFit(line, [110, 0], 400, 800)).toBeCloseTo(1);
  });
  it("航线越长缩得越小，重合的点也不会溢出", () => {
    const long: [number, number][] = [
      [80, 0],
      [140, 0],
    ];
    expect(zoomToFit(long, [110, 0], 400, 400)).toBeLessThan(zoomToFit(line, [110, 0], 400, 400));
    expect(Number.isFinite(zoomToFit([[110, 0]], [110, 0], 400, 400))).toBe(true);
  });
});
