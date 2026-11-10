import { describe, expect, it } from "vitest";
import { zoomToFit } from "./globeLight";

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
