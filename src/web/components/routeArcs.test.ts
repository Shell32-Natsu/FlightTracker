import { describe, expect, it } from "vitest";
import { arcPeak, arcSteps, sample, segmentDistance } from "./routeArcs";

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

describe("arcSteps", () => {
  it("线头正好落在进度上，不按整段跳", () => {
    expect(arcSteps(0.985).at(-1)).toBe(0.985);
    expect(arcSteps(0.99).at(-1)).toBe(0.99);
  });
  it("依次递增，没有重复的点", () => {
    for (const p of [0.001, 0.25, 0.5, 47.5 / 48, 1]) {
      const s = arcSteps(p);
      expect(s[0]).toBe(0);
      expect(s.every((v, i) => i === 0 || v > s[i - 1])).toBe(true);
    }
    expect(arcSteps(1)).toHaveLength(49);
  });
  it("超出范围时夹住", () => {
    expect(arcSteps(0)).toEqual([0]);
    expect(arcSteps(1.2).at(-1)).toBe(1);
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
