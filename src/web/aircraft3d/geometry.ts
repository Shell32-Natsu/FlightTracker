import { BufferAttribute, BufferGeometry } from "three";
import type { Aircraft3DSpec, LiftingSpec, PaneCorner, Profile } from "./specs";

const RAD = Math.PI / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ 机身

/**
 * 单调三次插值。自变量取 √x：机头尖处轮廓是竖直的，按 √x 插值才圆。
 * 单调是为了不在控制点之间鼓包。
 */
const tangents = new WeakMap<Profile, number[]>();
function profile(p: Profile, x: number): number {
  if (x <= p[0][0]) return p[0][1];
  if (x >= p[p.length - 1][0]) return p[p.length - 1][1];
  const u = (i: number) => Math.sqrt(p[i][0]);
  let m = tangents.get(p);
  if (!m) {
    const d = p.slice(1).map((q, i) => (q[1] - p[i][1]) / (u(i + 1) - u(i)));
    m = p.map((_, i) => {
      if (i === 0) return d[0];
      if (i === p.length - 1) return 0;
      return d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
    });
    tangents.set(p, m);
  }
  let i = 0;
  while (x > p[i + 1][0]) i++;
  const h = u(i + 1) - u(i);
  const t = (Math.sqrt(x) - u(i)) / h;
  const [t2, t3] = [t * t, t * t * t];
  return (
    (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1]
  );
}

/** x 处的机身截面：上、下边线的高度和半宽（不含 747 的上层舱） */
export function bodySection(s: Aircraft3DSpec, x: number): { top: number; bottom: number; w: number } {
  let top = profile(s.nose.top, x);
  let bottom = profile(s.nose.bottom, x);
  let w = profile(s.nose.width, x);
  const { tail } = s;
  const start = s.length - tail.length;
  if (x > start) {
    const t = clamp01((x - start) / tail.length);
    top = s.rh + (tail.tipY + tail.tipH - s.rh) * t ** 2.1;
    bottom = -s.rh + (tail.tipY - tail.tipH + s.rh) * (t ** 1.62 * 0.9 + t ** 4 * 0.1);
    w = s.rw + (tail.tipW - s.rw) * t ** 1.85;
  }
  return { top, bottom, w };
}

/** 机背最高点 */
export const bodyTop = (s: Aircraft3DSpec, x: number) =>
  s.hump ? Math.max(profile(s.hump.top, x), bodySection(s, x).top) : bodySection(s, x).top;

/** x 处截面的中心高度，和沿 (sn, cs) 方向（cs 朝上）到蒙皮的距离 */
function bodyRadius(s: Aircraft3DSpec, x: number, sn: number, cs: number): { cy: number; r: number } {
  const { top, bottom, w } = bodySection(s, x);
  const cy = (top + bottom) / 2;
  const h = (top - bottom) / 2;
  if (w < 1e-6 || h < 1e-6) return { cy, r: 0 };
  let r = 1 / Math.sqrt((sn / w) ** 2 + (cs / h) ** 2);
  const hump = s.hump;
  if (hump && cs > -0.5) {
    // 上层舱是另一个圆；两个圆取平滑的并集
    const t = profile(hump.top, x);
    const rise = t - top;
    if (rise > 0.005 && x < hump.top[hump.top.length - 1][0]) {
      const r2 = Math.min(hump.r, w * 0.9);
      const hy = t - cy - r2;
      const disc = r2 * r2 - hy * hy * sn * sn;
      const up = disc > 0 ? hy * cs + Math.sqrt(disc) : 0;
      const k = Math.min(1.5, rise * 1.1);
      const m = clamp01(0.5 + (0.5 * (up - r)) / k);
      r += (up - r) * m + k * m * (1 - m);
    }
  }
  // 驾驶舱一带的肩部比圆鼓一些，两侧玻璃才立得起来
  if (cs > 0) r *= 1 + profile(s.nose.shoulder, x) * (2 * sn * cs) ** 2;
  return { cy, r };
}

/** 截面上 θ 处的点：θ = 0 在机腹正下方，π/2 在 +z 侧，π 在机背 */
export function bodyPoint(s: Aircraft3DSpec, x: number, theta: number): [number, number] {
  const { top, bottom, w } = bodySection(s, x);
  // 按椭圆的参数角取方向，很扁的截面（尾锥）上点也分布均匀
  const a = Math.sin(theta) * Math.max(1e-6, w);
  const b = -Math.cos(theta) * Math.max(1e-6, (top - bottom) / 2);
  const l = Math.hypot(a, b);
  const { cy, r } = bodyRadius(s, x, a / l, b / l);
  return [cy + (b / l) * r, (a / l) * r];
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function inside(s: Aircraft3DSpec, [x, y, z]: V3): boolean {
  if (x <= 0) return false;
  const { cy } = bodyRadius(s, x, 0, 1);
  const l = Math.hypot(y - cy, z);
  return l < 1e-9 || l < bodyRadius(s, x, z / l, (y - cy) / l).r;
}

/** 从机身外的 from 朝 dir 走，碰到蒙皮的地方 */
function hitSkin(s: Aircraft3DSpec, from: V3, dir: V3, reach: number): V3 | null {
  const at = (t: number): V3 => [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
  const n = 60;
  for (let i = 1; i <= n; i++)
    if (inside(s, at((reach * i) / n))) {
      let [lo, hi] = [(reach * (i - 1)) / n, (reach * i) / n];
      for (let k = 0; k < 26; k++) {
        const m = (lo + hi) / 2;
        if (inside(s, at(m))) hi = m;
        else lo = m;
      }
      return at(hi);
    }
  return null;
}

/** 玻璃的角：["z", z, y] 从正面看定位，["x", x, y] 从侧面看定位 */
export function paneCorner(s: Aircraft3DSpec, [axis, v, y]: PaneCorner): V3 {
  const p = axis === "z" ? hitSkin(s, [-1, y, v], [1, 0, 0], 12) : hitSkin(s, [v, y, 8], [0, 0, -1], 8);
  if (!p) throw new Error(`玻璃的角不在机身上：${axis} ${v} ${y}`);
  return p;
}

export interface Pane {
  geometry: BufferGeometry;
  /** 在玻璃自己的平面里的轮廓（米），贴图范围是 [0, w] × [0, h] */
  outline: [number, number][];
  w: number;
  h: number;
}

/**
 * 一块玻璃。真机的风挡是平板：先取四角的平面，在平面里按实际尺寸画，再沿法线贴到蒙皮上，
 * 所以圆角、窗框宽度都不会被机头的斜面拉长。只做 +z 侧，另一侧镜像。
 */
export function paneGeometry(spec: Aircraft3DSpec, corners: PaneCorner[]): Pane {
  const margin = spec.rw * 0.065;
  const pts = corners.map((c) => paneCorner(spec, c));
  const center = pts.reduce<V3>((t, p) => [t[0] + p[0] / pts.length, t[1] + p[1] / pts.length, t[2] + p[2] / pts.length], [0, 0, 0]);
  // Newell 法：不共面的四边形也有稳定的法线
  let normal: V3 = [0, 0, 0];
  pts.forEach((p, i) => {
    const c = cross(sub(p, center), sub(pts[(i + 1) % pts.length], center));
    normal = [normal[0] + c[0], normal[1] + c[1], normal[2] + c[2]];
  });
  normal = unit(normal);
  if (normal[1] < 0) normal = [-normal[0], -normal[1], -normal[2]];
  // 平面里的“上”和“右”（从外面看）
  const up = unit(sub([0, 1, 0], [normal[0] * normal[1], normal[1] * normal[1], normal[2] * normal[1]]));
  const right = cross(up, normal);
  const flat = pts.map((p): [number, number] => [dot(sub(p, center), right), dot(sub(p, center), up)]);
  const [u0, u1] = [Math.min(...flat.map((p) => p[0])) - margin, Math.max(...flat.map((p) => p[0])) + margin];
  const [v0, v1] = [Math.min(...flat.map((p) => p[1])) - margin, Math.max(...flat.map((p) => p[1])) + margin];

  const n = 26;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const far = spec.rw;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      const v = v0 + ((v1 - v0) * j) / n;
      const q: V3 = [0, 1, 2].map((k) => center[k] + right[k] * u + up[k] * v) as V3;
      const from: V3 = [0, 1, 2].map((k) => q[k] + normal[k] * far * 0.4) as V3;
      const hit = hitSkin(spec, from, [-normal[0], -normal[1], -normal[2]], far) ?? q;
      pos.push(hit[0] + normal[0] * 0.015, hit[1] + normal[1] * 0.015, hit[2] + normal[2] * 0.015);
      uv.push(i / n, j / n);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      index.push(k, k + 1, k + n + 1, k + 1, k + n + 2, k + n + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // 法线往平板的方向拉：每块玻璃各自反光，棱角分明
  const nn = g.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i < nn.count; i++) {
    const c: V3 = [nn.getX(i), nn.getY(i), nn.getZ(i)];
    const sign = dot(c, normal) < 0 ? -1 : 1;
    const m = unit([0, 1, 2].map((k) => sign * c[k] * 0.3 + normal[k] * 0.7) as V3);
    nn.setXYZ(i, ...m);
  }
  return { geometry: g, outline: flat.map(([u, v]) => [u - u0, v - v0]), w: u1 - u0, h: v1 - v0 };
}

const RINGS = 200;
const AROUND = 96;

export function fuselageGeometry(s: Aircraft3DSpec): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    // 机头、机尾的截面取密一些
    const x = s.length * (t < 0.4 ? (t / 0.4) ** 2 * 0.16 : t > 0.84 ? 0.72 + ((t - 0.84) / 0.16) * 0.28 : 0.16 + ((t - 0.4) / 0.44) * 0.56);
    for (let j = 0; j <= AROUND; j++) {
      const v = j / AROUND;
      const [y, z] = bodyPoint(s, x, v * Math.PI * 2);
      pos.push(x, y, z);
      uv.push(x / s.length, v);
    }
  }
  const row = AROUND + 1;
  for (let i = 0; i < RINGS; i++)
    for (let j = 0; j < AROUND; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  // 机尾收口
  const tip = pos.length / 3;
  const { top, bottom } = bodySection(s, s.length);
  pos.push(s.length + (top - bottom) * 0.2, (top + bottom) / 2, 0);
  uv.push(1, 0.5);
  for (let j = 0; j < AROUND; j++) index.push(RINGS * row + j, tip, RINGS * row + j + 1);

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // 机腹接缝两侧的法线取平均，免得有一条线
  const n = g.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i <= RINGS; i++) {
    const [a, b] = [i * row, i * row + AROUND];
    const nx = n.getX(a) + n.getX(b);
    const ny = n.getY(a) + n.getY(b);
    const nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const k of [a, b]) n.setXYZ(k, nx / l, ny / l, nz / l);
  }
  return g;
}

// ------------------------------------------------------------------ 机翼 / 尾翼

export interface Section {
  /** 前缘位置 */
  x: number;
  y: number;
  z: number;
  chord: number;
  thick: number;
  /** 扭转角（度，机头上仰为正） */
  twist: number;
  /** 当地的倾角：0 = 水平，90° = 竖直（翼梢小翼） */
  cant: number;
}

/** 翼型（NACA 四位数厚度分布 + 一点弯度），按弦长归一；k 从上表面后缘绕到前缘再到下表面后缘。 */
const LOOP = 26;
function airfoil(thick: number, camber: number): { xc: number; yc: number; v: number }[] {
  const t = (x: number) =>
    5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const c = (x: number) => camber * 4 * x * (1 - x);
  const out: { xc: number; yc: number; v: number }[] = [];
  for (let i = 0; i <= LOOP; i++) {
    const x = 0.5 * (1 + Math.cos((Math.PI * i) / LOOP));
    out.push({ xc: x, yc: c(x) + t(x), v: (1 - x) / 2 });
  }
  for (let i = 1; i <= LOOP; i++) {
    const x = 0.5 * (1 - Math.cos((Math.PI * i) / LOOP));
    out.push({ xc: x, yc: c(x) - t(x), v: 0.5 + x / 2 });
  }
  return out;
}

/** 由参数推出机翼的控制剖面（右手侧 z > 0），含翼梢 */
export function wingSections(s: Aircraft3DSpec): Section[] {
  const { wing, tip } = s;
  const span = wing.sections.at(-1)!.at;
  const tanL = Math.tan(wing.sweep * RAD);
  const yAt = (z: number) => wing.y + Math.tan(wing.dihedral * RAD) * z + wing.flex * (z / span) ** 2;
  const slope = (z: number) => Math.atan(Math.tan(wing.dihedral * RAD) + (2 * wing.flex * z) / span ** 2) / RAD;
  const out: Section[] = wing.sections.map((q) => ({
    x: wing.x + tanL * q.at,
    y: yAt(q.at),
    z: q.at,
    chord: q.chord,
    thick: q.thick,
    twist: q.twist ?? 0,
    cant: slope(q.at),
  }));
  const end = out.at(-1)!;
  if (tip.kind === "raked") {
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const dz = tip.length * t;
      const sweep = wing.sweep + (tip.sweep - wing.sweep) * Math.min(1, t * 1.5);
      const prev = out.at(-1)!;
      out.push({
        x: prev.x + Math.tan(sweep * RAD) * (tip.length / 8),
        y: yAt(span + dz) ,
        z: span + dz,
        chord: end.chord + (tip.chord - end.chord) * t ** 0.9,
        thick: end.thick,
        twist: end.twist,
        cant: end.cant,
      });
    }
  } else if (tip.kind === "blended" || tip.kind === "sharklet" || tip.kind === "split") {
    // 先沿圆弧翘起来，再直着向上
    const lean = tip.kind === "sharklet" ? 78 : 70;
    const steps = 16;
    let [x, y, z] = [end.x, end.y, end.z];
    const arc = tip.height * 1.12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cant = end.cant + (lean - end.cant) * smooth(0, 0.34, t);
      const ds = arc / steps;
      y += Math.sin(cant * RAD) * ds;
      z += Math.cos(cant * RAD) * ds;
      x += Math.tan((wing.sweep + 12 * t) * RAD) * ds;
      out.push({ x, y, z, chord: end.chord + (tip.chord - end.chord) * t ** 0.85, thick: 0.1, twist: -1, cant });
    }
  }
  return out;
}

/** 翼尖的下片（双叉小翼的下叶、翼尖端板的上下两片） */
export function tipBlades(s: Aircraft3DSpec): Section[][] {
  const { tip, wing } = s;
  if (tip.kind !== "split" && tip.kind !== "fence") return [];
  const main = wing.sections[wing.sections.length - 1];
  const base = wingSections({ ...s, tip: { kind: "none" } }).at(-1)!;
  const blade = (height: number, dir: 1 | -1, out: number): Section[] =>
    [0, 1].map((t) => ({
      x: base.x + main.chord * 0.12 + t * (height * 1.05),
      y: base.y + dir * height * t,
      z: base.z + (tip.kind === "split" ? 0.05 : 0) + out * t,
      chord: main.chord * (t ? 0.28 : 0.78),
      thick: 0.09,
      twist: 0,
      cant: dir * 80,
    }));
  if (tip.kind === "split") return [blade(tip.lower, -1, tip.lower * 0.35)];
  return [blade(tip.height, 1, 0.05), blade(tip.height * 0.9, -1, 0.05)];
}

export function stabSections(l: LiftingSpec): Section[] {
  return l.sections.map((q) => ({
    x: l.x + Math.tan(l.sweep * RAD) * q.at,
    y: l.y + Math.tan(l.dihedral * RAD) * q.at,
    z: q.at,
    chord: q.chord,
    thick: q.thick,
    twist: 0,
    cant: l.dihedral,
  }));
}

/** 在控制剖面之间插值，曲面更平滑 */
function refine(sections: Section[], per: number): Section[] {
  const out: Section[] = [];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let i = 0; i < sections.length - 1; i++) {
    const [a, b] = [sections[i], sections[i + 1]];
    const n = Math.max(1, Math.min(per, Math.ceil(Math.hypot(b.y - a.y, b.z - a.z) / 0.5)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t),
        chord: lerp(a.chord, b.chord, t),
        thick: lerp(a.thick, b.thick, t),
        twist: lerp(a.twist, b.twist, t),
        cant: lerp(a.cant, b.cant, t),
      });
    }
  }
  out.push(sections.at(-1)!);
  return out;
}

/** 放样出一片机翼 / 平尾；side = -1 时镜像到另一侧。uv：u 沿展向，v 沿翼型一圈（0.5 是前缘）。 */
export function liftingGeometry(control: Section[], side: 1 | -1, camber = 0.016): BufferGeometry {
  const sections = refine(control, 14);
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const span = sections.map((s, i) =>
    i === 0 ? 0 : Math.hypot(s.y - sections[i - 1].y, s.z - sections[i - 1].z),
  );
  const total = span.reduce((a, b) => a + b, 0);
  let acc = 0;
  let row = 0;
  sections.forEach((s, i) => {
    acc += span[i];
    const loop = airfoil(s.thick, camber);
    row = loop.length;
    const [ct, st] = [Math.cos(s.twist * RAD), Math.sin(s.twist * RAD)];
    const [cc, sc] = [Math.cos(s.cant * RAD), Math.sin(s.cant * RAD)];
    for (const p of loop) {
      // 绕 1/4 弦点扭转
      const dx = p.xc - 0.25;
      const rx = 0.25 + dx * ct + p.yc * st;
      const ry = -dx * st + p.yc * ct;
      pos.push(s.x + rx * s.chord, s.y + ry * s.chord * cc, side * (s.z - ry * s.chord * sc));
      uv.push(acc / total, p.v);
    }
  });
  const push = (a: number, b: number, c: number) => (side === 1 ? index.push(a, b, c) : index.push(a, c, b));
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j;
      push(a, a + 1, a + row);
      push(a + 1, a + row + 1, a + row);
    }
  // 翼尖封口
  const base = (sections.length - 1) * row;
  for (let j = 1; j < row - 2; j++) push(base, base + j, base + j + 1);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** 垂尾的贴图范围：x、y 的最小 / 最大值 */
export function finBounds(s: Aircraft3DSpec) {
  const f = s.fin;
  const tip = f.sections.at(-1)!;
  return {
    x0: f.x - f.fillet,
    x1: Math.max(f.x + f.sections[0].chord, f.x + Math.tan(f.sweep * RAD) * tip.at + tip.chord),
    y0: f.y,
    y1: f.y + tip.at,
  };
}

/** 垂尾的半边（side = 1 是 +z 侧）。uv 是侧面投影，两侧各占贴图的一半。 */
export function finGeometry(s: Aircraft3DSpec, side: 1 | -1): BufferGeometry {
  const f = s.fin;
  const b = finBounds(s);
  const [root, tip] = f.sections;
  const rows = 28;
  const cols = 24;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const thick = (x: number, t: number) =>
    5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const h = tip.at * t;
    // 背鳍：根部前缘向前延伸，很快收回到直的前缘
    const dorsal = f.fillet * Math.max(0, 1 - t / 0.2) ** 1.8;
    // 翼尖倒圆角
    const round = t > 0.95 ? ((t - 0.95) / 0.05) ** 2 * 0.16 : 0;
    const chord0 = root.chord + (tip.chord - root.chord) * t;
    const le = f.x + Math.tan(f.sweep * RAD) * h - dorsal + chord0 * round;
    const chord = chord0 + dorsal - chord0 * round * 1.25;
    for (let j = 0; j <= cols; j++) {
      const xc = 0.5 * (1 - Math.cos((Math.PI * j) / cols));
      const x = le + xc * chord;
      const z = thick(xc, root.thick + (tip.thick - root.thick) * t) * chord0 * (t > 0.985 ? 0.35 : 1);
      pos.push(x, f.y + h, side * Math.max(0.004, z));
      const u = (x - b.x0) / (b.x1 - b.x0);
      uv.push(side === 1 ? u / 2 : 1 - u / 2, t);
    }
  }
  const row = cols + 1;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * row + j;
      if (side === 1) index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      else index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** 展向位置 z 处机翼的前缘、弦长、高度（装发动机和襟翼滑轨整流罩用） */
export function wingAt(sections: Section[], z: number): { x: number; y: number; chord: number } {
  for (let i = 0; i < sections.length - 1; i++) {
    const [a, b] = [sections[i], sections[i + 1]];
    if (z <= b.z) {
      const t = clamp01((z - a.z) / (b.z - a.z || 1));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, chord: a.chord + (b.chord - a.chord) * t };
    }
  }
  const e = sections.at(-1)!;
  return { x: e.x, y: e.y, chord: e.chord };
}
