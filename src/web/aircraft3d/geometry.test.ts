import { describe, expect, it } from "vitest";
import { bodySection, bodyTop, fuselageGeometry, liftingGeometry, paneGeometry, finGeometry, wingSections } from "./geometry";
import { FAMILIES, familyTypes } from "../../shared/aircraft";
import { spec3DFor } from "./families";

const types = Object.values(FAMILIES).flatMap((f) => familyTypes(f.id));

describe.each(types)("%s 的几何", (type) => {
  const spec = spec3DFor(type)!;

  it("没有 NaN，机身的面朝外", () => {
    const g = fuselageGeometry(spec);
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    expect([...p.array].every(Number.isFinite)).toBe(true);
    // 等直段上、+z 侧的法线指向 +z
    let seen = 0;
    for (let i = 0; i < p.count; i++)
      if (Math.abs(p.getX(i) - spec.length / 2) < 2 && p.getZ(i) > spec.rw * 0.95) {
        expect(n.getZ(i)).toBeGreaterThan(0.8);
        seen++;
      }
    expect(seen).toBeGreaterThan(0);
  });

  it("机翼、垂尾左右对称且没有 NaN", () => {
    const w = wingSections(spec);
    const [l, r] = [liftingGeometry(w, 1), liftingGeometry(w, -1)].map((g) => g.getAttribute("position"));
    for (let i = 0; i < l.count; i += 37) expect(r.getZ(i)).toBeCloseTo(-l.getZ(i));
    expect([...finGeometry(spec, 1).getAttribute("position").array].every(Number.isFinite)).toBe(true);
  });

  it("机头轮廓单调，连到等直段", () => {
    for (let x = 0.2; x < spec.length * 0.14; x += 0.2) {
      expect(bodyTop(spec, x)).toBeGreaterThanOrEqual(bodyTop(spec, x - 0.2));
      expect(bodySection(spec, x).bottom).toBeLessThanOrEqual(bodySection(spec, x - 0.2).bottom);
    }
    const mid = bodySection(spec, spec.length / 2);
    expect(mid.top).toBeCloseTo(spec.rh);
    expect(mid.w).toBeCloseTo(spec.rw);
  });

  it("风挡玻璃贴着机头，没有被拉长", () => {
    for (const corners of spec.cockpit.panes) {
      const pane = paneGeometry(spec, corners);
      const p = pane.geometry.getAttribute("position");
      expect([...p.array].every(Number.isFinite)).toBe(true);
      for (let i = 0; i < p.count; i++) expect(p.getX(i)).toBeLessThan(spec.length * 0.14);
      // 真机的每块玻璃宽高相近
      expect(pane.w / pane.h).toBeGreaterThan(0.75);
      expect(pane.w / pane.h).toBeLessThan(1.75);
      // 贴到蒙皮后的边长和平面里的一致（差别只来自曲面本身）
      const n = 27;
      const [a, b] = [0, n - 1];
      const d = Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b));
      expect(d / pane.w).toBeLessThan(1.25);
    }
  });
});

it("不认识的机型返回 null", () => {
  expect(spec3DFor("ZZZZ")).toBeNull();
});
