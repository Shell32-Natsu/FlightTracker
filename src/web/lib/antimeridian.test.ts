import { describe, expect, it } from "vitest";
import greatCircle from "@turf/great-circle";
import { joinAntimeridian, unwrapLine } from "./antimeridian";

describe("unwrapLine", () => {
  it("向东跨 180°", () => {
    expect(unwrapLine([[170, 0], [179, 1], [-179, 2], [-170, 3]])).toEqual([
      [170, 0],
      [179, 1],
      [181, 2],
      [190, 3],
    ]);
  });
  it("向西跨 180°", () => {
    expect(unwrapLine([[-170, 0], [175, 1]])).toEqual([[-170, 0], [-185, 1]]);
  });
  it("不跨时原样返回", () => {
    expect(unwrapLine([[10, 0], [20, 1]])).toEqual([[10, 0], [20, 1]]);
  });
});

describe("joinAntimeridian", () => {
  it("SFO–NRT 合成一条连续的线", () => {
    const f = joinAntimeridian(greatCircle([-122.375, 37.619], [140.386, 35.765], { npoints: 64 }));
    expect(f.geometry.type).toBe("LineString");
    const lons = f.geometry.coordinates.map((c) => c[0]);
    for (let i = 1; i < lons.length; i++) expect(Math.abs(lons[i] - lons[i - 1])).toBeLessThan(180);
    expect(lons.at(-1)).toBeCloseTo(140.386 - 360, 3);
  });
});
