import { describe, expect, it } from "vitest";
import { arcPeak, sample, segmentDistance } from "./routeArcs";

describe("sample", () => {
  const line = [
    [0, 0],
    [10, 20],
    [20, 0],
  ];
  it("端点和中间点", () => {
    expect(sample(line, 0)).toEqual([0, 0]);
    expect(sample(line, 1)).toEqual([20, 0]);
    expect(sample(line, 0.5)).toEqual([10, 20]);
    expect(sample(line, 0.25)).toEqual([5, 10]);
  });
  it("超出范围时夹到端点", () => {
    expect(sample(line, -1)).toEqual([0, 0]);
    expect(sample(line, 2)).toEqual([20, 0]);
  });
});

describe("arcPeak", () => {
  it("越长越高，有上限", () => {
    expect(arcPeak(0.1)).toBeLessThan(0.02);
    expect(arcPeak(1.4)).toBeGreaterThan(arcPeak(0.6));
    expect(arcPeak(Math.PI)).toBe(0.2);
  });
});

describe("segmentDistance", () => {
  it("线段上、线段外和退化成点的情况", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(segmentDistance(5, 3, a, b)).toBe(3);
    expect(segmentDistance(13, 4, a, b)).toBe(5);
    expect(segmentDistance(3, 4, a, a)).toBe(5);
  });
});
