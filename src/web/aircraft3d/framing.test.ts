import { InstancedMesh, Matrix4, Mesh, Object3D, PerspectiveCamera, PlaneGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { spec3DFor } from "./families";
import { cropWindow, fitDistance, outerPoints, viewBounds } from "./framing";
import { finGeometry, fuselageGeometry, liftingGeometry, stabSections, tipBlades, wingSections } from "./geometry";

/** 机身、机翼、尾翼（不含要画布的部分） */
function shell(type: string) {
  const s = spec3DFor(type)!;
  const root = new Object3D();
  root.add(new Mesh(fuselageGeometry(s)), new Mesh(finGeometry(s, 1)));
  for (const side of [1, -1] as const) {
    root.add(new Mesh(liftingGeometry(wingSections(s), side)), new Mesh(liftingGeometry(stabSections(s.stab), side)));
    for (const b of tipBlades(s)) root.add(new Mesh(liftingGeometry(b, side, 0)));
  }
  root.position.x = -s.length / 2;
  return root;
}

// 翼尖端板、最大翼展、斜削翼尖、T 尾、短机身、上单翼
describe.each(["A388", "B748", "B779", "MD82", "A318", "AT76"])("%s 的取景", (type) => {
  it("转到任何角度，所有顶点都在画面里", () => {
    const root = shell(type);
    const points = outerPoints(root);
    const target = new Vector3(0, 2, 0);
    const [mx, my] = [0.37, 0.17];
    const right = new Vector3();
    const up = new Vector3();
    const all: Vector3[] = [];
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const p = o.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i += 5) all.push(new Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
    });
    let worst = 0;
    for (const polar of [0.5, 0.9, 1.28, 1.75])
      for (let k = 0; k < 24; k++) {
        const dir = new Vector3().setFromSphericalCoords(1, polar, (k * Math.PI) / 12);
        const d = fitDistance(points, target, dir, mx, my);
        right.set(0, 1, 0).cross(dir).normalize();
        up.copy(dir).cross(right);
        for (const p of all) {
          const q = p.clone().sub(target);
          const depth = d - q.dot(dir);
          worst = Math.max(worst, Math.abs(q.dot(right)) / depth / mx, Math.abs(q.dot(up)) / depth / my);
        }
      }
    // 恰好贴边：不超出（容许近似凸包的误差），也没有白白离得很远
    expect(worst).toBeLessThan(1.02);
    expect(worst).toBeGreaterThan(0.99);
  });
});

it("实例化的网格（桨叶）每一片都算进去", () => {
  const root = new Object3D();
  const blades = new InstancedMesh(new PlaneGeometry(0.1, 2).translate(0, 1, 0), undefined, 2);
  blades.setMatrixAt(0, new Matrix4());
  blades.setMatrixAt(1, new Matrix4().makeRotationX(Math.PI));
  root.add(blades);
  const ys = outerPoints(root).map((p) => p.y);
  expect(Math.max(...ys)).toBeCloseTo(2);
  expect(Math.min(...ys)).toBeCloseTo(-2);
});

it("静态图的裁切范围刚好包住所有点", () => {
  const points = [new Vector3(-2, 0, 0), new Vector3(3, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 5)];
  const b = viewBounds(points, new Vector3(), new Vector3(0, 0, 1), 10);
  expect(b.x0).toBeCloseTo(-0.2);
  expect(b.x1).toBeCloseTo(0.3);
  expect(b.y0).toBeCloseTo(0);
  expect(b.y1).toBeCloseTo(0.1);
  // 离镜头近的点投影更靠外
  expect(viewBounds([new Vector3(1, 0, 5)], new Vector3(), new Vector3(0, 0, 1), 10).x1).toBeCloseTo(0.2);
});

it.each(["A388", "AT76", "MD82"])("%s 的静态图：整架飞机在裁切窗口里，而且贴着边", (type) => {
  const points = outerPoints(shell(type));
  const target = new Vector3(0, 2, 0);
  const dir = new Vector3(-0.5, 0.2, 0.84).normalize();
  const distance = 200;
  const c = cropWindow(viewBounds(points, target, dir, distance), 1000);
  const camera = new PerspectiveCamera((Math.atan(c.half) * 360) / Math.PI, 1, 1, 600);
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.setViewOffset(c.full, c.full, c.x, c.y, 1000, c.height);
  camera.updateMatrixWorld(true);
  const q = points.map((p) => p.clone().project(camera));
  for (const axis of ["x", "y"] as const) {
    const v = q.map((p) => p[axis]);
    expect(Math.max(...v)).toBeLessThan(1);
    expect(Math.min(...v)).toBeGreaterThan(-1);
    expect(Math.max(...v)).toBeGreaterThan(0.85);
    expect(Math.min(...v)).toBeLessThan(-0.85);
  }
});
