import type { ProfileSpec } from "../../shared/aircraft";

/**
 * 飞机侧视图的几何：机头朝左，单位是米，机身中心线 y = 0，向下为正。
 * 只画近侧（远侧的机翼、发动机被机身挡住）。
 */

export interface Nacelle {
  body: string;
  lip: { cx: number; cy: number; rx: number; ry: number };
  exhaust: string;
  pylon: string;
}

export interface ProfileGeometry {
  viewBox: [number, number, number, number];
  length: number;
  radius: number;
  fuselage: string;
  cockpit: string;
  fin: string;
  stabilizer: string;
  wing: string;
  winglet: string | null;
  engines: Nacelle[];
  /** 螺旋桨桨盘 */
  props: { cx: number; cy: number; rx: number; ry: number }[];
  windows: { x: number; y: number; w: number; h: number }[];
  doors: { x: number; y: number; w: number; h: number }[];
  /** 涂装分区的 y 坐标：机腹、腰线 */
  bellyY: number;
  upperY: number;
  titles: { x: number; y: number; size: number; maxWidth: number };
  logo: { cx: number; cy: number; size: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** 把 [x, y] 列表写成 SVG 路径 */
function poly(points: [number, number][]): string {
  return `M${points.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L")} Z`;
}
const p = (x: number, y: number) => `${r2(x)} ${r2(y)}`;

function nacelle(x: number, cy: number, len: number, dia: number, wingY: number | null): Nacelle {
  const r = dia / 2;
  const body =
    `M${p(x, cy - r * 0.94)} L${p(x + len * 0.6, cy - r)}` +
    ` C${p(x + len * 0.86, cy - r)} ${p(x + len, cy - r * 0.6)} ${p(x + len, cy - r * 0.38)}` +
    ` L${p(x + len, cy + r * 0.38)}` +
    ` C${p(x + len, cy + r * 0.6)} ${p(x + len * 0.86, cy + r * 0.96)} ${p(x + len * 0.6, cy + r * 0.96)}` +
    ` L${p(x, cy + r * 0.9)}` +
    ` C${p(x - r * 0.2, cy + r * 0.9)} ${p(x - r * 0.2, cy - r * 0.94)} ${p(x, cy - r * 0.94)} Z`;
  const exhaust = poly([
    [x + len, cy - r * 0.3],
    [x + len + r * 0.75, cy + r * 0.02],
    [x + len, cy + r * 0.3],
  ]);
  const pylon =
    wingY === null
      ? ""
      : poly([
          [x + len * 0.28, cy - r * 0.8],
          [x + len * 0.4, wingY],
          [x + len * 1.12, wingY + r * 0.25],
          [x + len * 0.92, cy - r * 0.45],
        ]);
  return { body, lip: { cx: r2(x), cy: r2(cy - r * 0.02), rx: r2(r * 0.17), ry: r2(r * 0.9) }, exhaust, pylon };
}

export function profileGeometry(s: ProfileSpec): ProfileGeometry {
  const L = s.length;
  const D = s.diameter;
  const R = D / 2;
  const regional = s.nose === "regional";

  // 机头长度和机头尖的高度决定了机头的“脸型”
  const noseLen = { airbus: 1.55, boeing: 1.75, b787: 1.95, a350: 1.9, regional: 1.6 }[s.nose] * D;
  const noseY = { airbus: 0.14, boeing: 0.06, b787: 0.2, a350: 0.16, regional: 0.12 }[s.nose] * R;

  // 顶部：747 驼峰 / A380 双层
  const humpH = s.hump ? D * 0.36 : s.doubleDeck ? D * 0.21 : 0;
  const top = -R - humpH;
  const tailTopEnd = -R * 0.5;
  const tailBottomEnd = -R * 0.28;
  const coneStart = L - D * 2.9;

  let d = `M${p(0, noseY)}`;
  const noseTopX = noseLen * (humpH ? 1.25 : 1);
  d += ` C${p(0, noseY - R * (humpH ? 1.05 : 0.6))} ${p(noseTopX * 0.28, top)} ${p(noseTopX, top)}`;
  if (s.hump) {
    const end = s.hump * L;
    d += ` L${p(end, top)} C${p(end + D * 0.9, top)} ${p(end + D * 0.9, -R)} ${p(end + D * 2.1, -R)}`;
    d += ` L${p(L - D * 2, -R)}`;
  } else if (s.doubleDeck) {
    d += ` L${p(L - D * 3.2, top)} C${p(L - D * 2.2, top)} ${p(L - D * 2, -R)} ${p(L - D * 1.6, -R * 0.96)}`;
  } else {
    d += ` L${p(L - D * 2, -R)}`;
  }
  d += ` Q${p(L - D * 0.45, -R * 0.94)} ${p(L, tailTopEnd)}`;
  d += ` L${p(L, tailBottomEnd)}`;
  d += ` C${p(L - D * 0.9, -R * 0.05)} ${p(coneStart + D * 0.6, R)} ${p(coneStart, R)}`;
  d += ` L${p(noseLen * 0.9, R)}`;
  d += ` C${p(noseLen * 0.32, R)} ${p(0, noseY + R * 0.62)} ${p(0, noseY)} Z`;

  // 驾驶舱风挡：斜着的一小条
  const cy0 = humpH ? top + R * 0.55 : -R * 0.5;
  const cx0 = noseLen * (humpH && s.hump ? 0.72 : 0.5);
  const cockpit = poly([
    [cx0, cy0],
    [cx0 + noseLen * 0.22, cy0 - R * 0.24],
    [cx0 + noseLen * 0.4, cy0 - R * 0.26],
    [cx0 + noseLen * 0.38, cy0 + R * 0.02],
  ]);

  // 垂尾（带背鳍）
  const finH = s.finHeight;
  const finBase = finH * (s.tTail ? 1 : 1.15);
  const x0 = L - D * 0.25 - finBase;
  const topChord = finBase * (s.tTail ? 0.5 : 0.4);
  // 垂尾后缘顶端大约在机尾正上方（T 尾更靠后）
  const sweep = L + D * (s.tTail ? 0.3 : 0.02) - topChord - x0;
  const finTopY = -R - finH;
  const fin =
    `M${p(x0 - D * 0.9, -R)} Q${p(x0 + D * 0.1, -R)} ${p(x0 + sweep * 0.22, -R - finH * 0.22)}` +
    ` L${p(x0 + sweep, finTopY)} L${p(x0 + sweep + topChord, finTopY)}` +
    ` L${p(L - D * 0.2, tailTopEnd - R * 0.05)} L${p(x0, -R * 0.9)} Z`;

  // 平尾
  const stabilizer = s.tTail
    ? poly([
        [x0 + sweep - D * 0.35, finTopY + D * 0.04],
        [x0 + sweep + topChord + D * 0.55, finTopY - D * 0.08],
        [x0 + sweep + topChord + D * 0.45, finTopY + D * 0.1],
        [x0 + sweep + D * 0.2, finTopY + D * 0.14],
      ])
    : poly([
        [L - D * 2.6, -R * 0.08],
        [L - D * 0.85, -R * 0.62],
        [L - D * 0.45, -R * 0.6],
        [L - D * 1.2, -R * 0.12],
      ]);

  // 机翼：侧视里是从机腹斜向后上方的一条
  const xw = s.wingAt * L;
  const high = s.engine.mount === "prop";
  const chord = L * (high ? 0.1 : 0.16);
  const halfSpan = L * (high ? 0.55 : 0.46);
  const aft = high ? chord * 0.15 : halfSpan * 0.45;
  const rise = high ? 0 : halfSpan * 0.055;
  const rootY = high ? -R * 0.98 : R * 0.62;
  const tipX = xw + aft;
  const tipY = rootY - rise;
  const tipChord = chord * 0.32;
  const wing = high
    ? poly([
        [xw, -R * 0.96],
        [xw + chord * 0.25, -R * 1.1],
        [xw + chord, -R * 1.02],
        [xw + chord * 1.02, -R * 0.9],
      ])
    : poly([
        [xw, rootY],
        [tipX, tipY],
        [tipX + tipChord, tipY + R * 0.02],
        [xw + chord, rootY + R * 0.14],
      ]);

  let winglet: string | null = null;
  if (!high && s.winglet !== "none") {
    const h = D * (s.winglet === "fence" ? 0.25 : 0.42);
    const up: [number, number][] = [
      [tipX + tipChord * 0.05, tipY],
      [tipX + tipChord * 0.45 + h * 0.45, tipY - h],
      [tipX + tipChord * 0.8 + h * 0.45, tipY - h],
      [tipX + tipChord, tipY],
    ];
    if (s.winglet === "split") up.push([tipX + tipChord * 0.8, tipY + h * 0.35], [tipX + tipChord * 0.55, tipY + h * 0.35]);
    winglet = poly(up);
  }

  // 发动机
  const E = s.engine;
  const engines: Nacelle[] = [];
  const props: ProfileGeometry["props"] = [];
  if (E.mount === "wing") {
    const along = (t: number) => ({ x: xw + aft * t, y: rootY - rise * t });
    const stations = E.count === 4 ? [0.62, 0.3] : [0.32];
    for (const t of stations) {
      const w = along(t);
      const scale = E.count === 4 && t > 0.5 ? 0.92 : 1;
      const len = E.length * scale;
      const dia = E.diameter * scale;
      engines.push(nacelle(w.x - len * 0.55, w.y + dia * 0.58, len, dia, w.y));
    }
    if (E.count === 3) {
      // MD-11 / DC-10 的尾部第三台发动机
      engines.push(nacelle(x0 - E.length * 0.1, -R - E.diameter * 0.42, E.length * 0.9, E.diameter * 0.85, null));
    }
  } else if (E.mount === "rear") {
    engines.push(nacelle(x0 - E.length * 0.55, -R * 0.42, E.length, E.diameter, null));
  } else {
    const nx = xw - E.length * 0.3;
    const ny = -R * 0.98 + E.diameter * 0.35;
    engines.push(nacelle(nx, ny, E.length, E.diameter, null));
    props.push({ cx: r2(nx - E.diameter * 0.25), cy: r2(ny), rx: r2(D * 0.06), ry: r2(D * 0.72) });
  }

  // 舷窗和舱门
  const wide = D > 5;
  const winY = s.doubleDeck ? R * 0.02 : -R * (regional ? 0.22 : 0.28);
  const winW = wide ? 0.28 : 0.24;
  const winH = s.nose === "b787" ? 0.5 : wide ? 0.4 : 0.34;
  const pitch = regional ? 0.5 : 0.53;
  const doorW = regional ? 0.8 : wide ? 1.05 : 0.86;
  const doorH = Math.min(1.95, D * 0.48);
  const doorY = winY - doorH * 0.42;
  const first = noseLen * (humpH && s.hump ? 1.05 : 1) + D * 0.12;
  const last = L - D * 3.3;
  const doorXs = wide ? [first, L * 0.3, L * 0.56, last] : [first, last];
  const doors = doorXs.map((x) => ({ x: r2(x), y: r2(doorY), w: doorW, h: r2(doorH) }));
  const windows: ProfileGeometry["windows"] = [];
  const addRow = (from: number, to: number, y: number) => {
    for (let x = from; x < to; x += pitch) {
      if (doorXs.some((dx) => x + winW > dx - 0.35 && x < dx + doorW + 0.35)) continue;
      windows.push({ x: r2(x), y: r2(y - winH / 2), w: winW, h: winH });
    }
  };
  addRow(first + doorW + 0.5, last + doorW + 0.8, winY);
  if (s.doubleDeck) addRow(noseLen * 1.35, L - D * 3.4, top + D * 0.24);
  if (s.hump) addRow(noseLen * 1.45, s.hump * L - 0.3, top + D * 0.2);

  // 标题字写在舷窗上方、前段
  const titles = {
    x: r2(first + doorW + D * 0.45),
    y: r2(winY - winH / 2 - D * 0.1),
    size: r2(D * (regional ? 0.22 : 0.2)),
    maxWidth: r2(L * 0.42),
  };
  if (s.doubleDeck) titles.y = r2(top + D * 0.24 - winH / 2 - D * 0.06);

  const logoSize = finH * 0.52;
  const logo = {
    cx: r2(x0 + sweep * 0.55 + topChord * 0.55),
    cy: r2(-R - finH * 0.5),
    size: r2(logoSize),
  };

  const minY = finTopY - D * (s.tTail ? 0.35 : 0.15);
  const maxY = Math.max(R, ...engines.map(() => rootY + E.diameter * 1.1), ...props.map((q) => q.cy + q.ry)) + D * 0.1;
  const minX = -D * 0.15;
  const maxX = L + D * (s.tTail ? 0.5 : 0.25);
  return {
    viewBox: [r2(minX), r2(minY), r2(maxX - minX), r2(maxY - minY)],
    length: L,
    radius: R,
    fuselage: d,
    cockpit,
    fin,
    stabilizer,
    wing,
    winglet,
    engines,
    props,
    windows,
    doors,
    bellyY: r2(R * 0.42),
    upperY: r2(winY + winH / 2 + D * 0.06),
    titles,
    logo,
  };
}
