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

/**
 * 从 dir 方向看，镜头离 target 多远才能让所有点都在画面里。
 * mx、my 是视锥在单位距离处的半宽、半高（要留边就给小一点）。
 */
export function fitDistance(points: Vector3[], target: Vector3, dir: Vector3, mx: number, my: number): number {
  // right = up × dir，upward = dir × right
  const l = Math.hypot(dir.x, dir.z) || 1;
  const [rx, rz] = [dir.z / l, -dir.x / l];
  const [ux, uy, uz] = [dir.y * rz, dir.z * rx - dir.x * rz, -dir.y * rx];
  let d = 0;
  for (const p of points) {
    const [x, y, z] = [p.x - target.x, p.y - target.y, p.z - target.z];
    const near = x * dir.x + y * dir.y + z * dir.z;
    d = Math.max(d, near + Math.abs(x * rx + z * rz) / mx, near + Math.abs(x * ux + y * uy + z * uz) / my);
  }
  return d;
}
