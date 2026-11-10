import { describe, expect, it } from "vitest";
import { sample } from "./routeComets";

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
