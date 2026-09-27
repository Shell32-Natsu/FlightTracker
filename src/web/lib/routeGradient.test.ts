import { describe, expect, it } from "vitest";
import { routeGradient } from "./routeGradient";

/** 取出 interpolate 表达式的输入节点 */
const stops = (e: unknown[]) => e.slice(3).filter((_, i) => i % 2 === 0) as number[];

describe("routeGradient", () => {
  it.each([0, 0.0001, 0.3, 0.9991, 0.9995, 0.99999, 1])("progress=%s 时节点严格递增", (p) => {
    const s = stops(routeGradient(p, 1) as unknown[]);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    expect(s[0]).toBe(0);
    expect(s.at(-1)).toBe(1);
  });

  it("画完后是完整的两色渐变", () => {
    expect(stops(routeGradient(1, 0.5) as unknown[])).toEqual([0, 1]);
  });
});
