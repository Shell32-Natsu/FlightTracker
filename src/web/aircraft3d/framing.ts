import { InstancedMesh, Matrix4, Mesh, type Object3D, Vector3 } from "three";

/**
 * 决定取景的点：沿许多方向各取最远的顶点（近似凸包）。
 * 能不能放进画面只取决于这些点，一百来个就够，每帧算一遍也不费事。
 */
export function outerPoints(root: Object3D, directions = 160): Vector3[] {
  const dirs = Array.from({ length: directions }, (_, i) => {
    // 球面上均匀分布
    const y = 1 - (2 * (i + 0.5)) / directions;
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt(1 - y * y);
    return new Vector3(r * Math.cos(a), y, r * Math.sin(a));
  });
  root.updateMatrixWorld(true);
  const far = dirs.map(() => -Infinity);
  const best = dirs.map(() => new Vector3());
  const visit = (points: Vector3[]) => {
    for (const p of points)
      for (let i = 0; i < directions; i++) {
        const d = p.dot(dirs[i]);
        if (d > far[i]) {
          far[i] = d;
          best[i].copy(p);
        }
      }
  };
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const pos = o.geometry.getAttribute("position");
    const local = Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i));
    if (o instanceof InstancedMesh) {
      const m = new Matrix4();
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        m.premultiply(o.matrixWorld);
        visit(local.map((p) => p.clone().applyMatrix4(m)));
      }
    } else visit(local.map((p) => p.applyMatrix4(o.matrixWorld)));
  });
  // 去重
  return [...new Map(best.map((p) => [`${p.x},${p.y},${p.z}`, p])).values()];
}

/** 画面的右方（水平，没有 y）和上方：right = up × dir，upward = dir × right */
function basis(dir: Vector3) {
  const l = Math.hypot(dir.x, dir.z) || 1;
  const [rx, rz] = [dir.z / l, -dir.x / l];
  return { rx, rz, ux: dir.y * rz, uy: dir.z * rx - dir.x * rz, uz: -dir.y * rx };
}

/**
 * 从 dir 方向看，镜头离 target 多远才能让所有点都在画面里。
 * mx、my 是视锥在单位距离处的半宽、半高（要留边就给小一点）。
 */
export function fitDistance(points: Vector3[], target: Vector3, dir: Vector3, mx: number, my: number): number {
  const { rx, rz, ux, uy, uz } = basis(dir);
  let d = 0;
  for (const p of points) {
    const [x, y, z] = [p.x - target.x, p.y - target.y, p.z - target.z];
    const near = x * dir.x + y * dir.y + z * dir.z;
    d = Math.max(d, near + Math.abs(x * rx + z * rz) / mx, near + Math.abs(x * ux + y * uy + z * uz) / my);
  }
  return d;
}

/** 从 dir 方向、距 target 这么远看过去，所有点在单位距离处投影的范围 */
export function viewBounds(points: Vector3[], target: Vector3, dir: Vector3, distance: number) {
  const { rx, rz, ux, uy, uz } = basis(dir);
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const p of points) {
    const [x, y, z] = [p.x - target.x, p.y - target.y, p.z - target.z];
    const depth = distance - (x * dir.x + y * dir.y + z * dir.z);
    const u = (x * rx + z * rz) / depth;
    const v = (x * ux + y * uy + z * uz) / depth;
    b.x0 = Math.min(b.x0, u);
    b.x1 = Math.max(b.x1, u);
    b.y0 = Math.min(b.y0, v);
    b.y1 = Math.max(b.y1, v);
  }
  return b;
}

/**
 * 把投影范围裁成 width 像素宽的一张图（四周留一点边）：
 * half 是罩住整架飞机的视锥半宽，full 是整个视锥的像素边长，x、y 是裁切窗口的左上角。
 */
export function cropWindow(b: ReturnType<typeof viewBounds>, width: number) {
  const half = Math.max(-b.x0, b.x1, -b.y0, b.y1) * 1.02;
  const pad = (b.x1 - b.x0) * 0.012;
  const k = width / (b.x1 - b.x0 + pad * 2);
  return {
    half,
    full: half * 2 * k,
    x: (b.x0 - pad + half) * k,
    y: (half - b.y1 - pad) * k,
    height: Math.ceil((b.y1 - b.y0 + pad * 2) * k),
  };
}
