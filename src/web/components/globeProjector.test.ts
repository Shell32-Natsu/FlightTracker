import { describe, expect, it } from "vitest";
import { GlobeProjector, discRadius, toVec } from "./globeProjector";

const cam = { lng: 120, lat: 30, bearing: 0, x: 500, y: 400, R: 360, D: 1350 };
const at = (p: GlobeProjector, lng: number, lat: number, alt = 0) => p.project(toVec([lng, lat]), alt);

describe("GlobeProjector", () => {
  const p = new GlobeProjector(cam);
  it("视野中心落在中心点上，北在上、东在右", () => {
    const c = at(p, 120, 30);
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(400);
    expect(at(p, 120, 40).y).toBeLessThan(400);
    expect(at(p, 130, 30).x).toBeGreaterThan(500);
  });
  it("背面的点不可见，抬高以后能从地平线上露出来", () => {
    expect(at(p, -60, -30).visible).toBe(false);
    const far = 120 + 84;
    const eq = new GlobeProjector({ ...cam, lat: 0 });
    expect(at(eq, far, 0).visible).toBe(false);
    expect(at(eq, far, 0, 0.2).visible).toBe(true);
  });
  it("地平线上的点正好在轮廓上", () => {
    const eq = new GlobeProjector({ ...cam, lat: 0 });
    const horizon = (Math.acos(cam.R / (cam.R + cam.D)) * 180) / Math.PI;
    expect(at(eq, 120 + horizon, 0).x - cam.x).toBeCloseTo(discRadius(cam.D, cam.R), 3);
  });
  it("展开过的经度（超出 ±180）结果一样", () => {
    expect(at(p, 190, 20).x).toBeCloseTo(at(p, -170, 20).x);
  });
  it("地图顺时针转 90° 后，东在上", () => {
    const r = new GlobeProjector({ ...cam, lat: 0, bearing: 90 });
    const e = at(r, 130, 0);
    expect(e.x).toBeCloseTo(500);
    expect(e.y).toBeLessThan(400);
  });
  it("比相机还高的点当作不可见", () => {
    expect(new GlobeProjector({ ...cam, R: 5000 }).project(toVec([120, 30]), 0.3).visible).toBe(false);
  });
});

describe("discRadius", () => {
  it("相机很远时接近球半径；有透视时比球半径小", () => {
    expect(discRadius(1e7, 300)).toBeCloseTo(300, 0);
    expect(discRadius(1350, 360)).toBeLessThan(360);
  });
});
