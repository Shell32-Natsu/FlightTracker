import { aircraftFamily, profileFor } from "../../shared/aircraft";
import { A20N, B748, B77W, type Aircraft3DSpec, type EngineSpec, type PaneCorner, type Profile } from "./specs";

/**
 * 各机型系列的 3D 参数：翼展、弦长、后掠角、机身宽高、发动机等取公开数据的近似值（米、度），
 * 再由 build() 补齐其余部位。A320neo、777-300ER、747-8 是逐项手调的，见 specs.ts。
 */

// ------------------------------------------------------------------ 机头

interface Nose {
  rw: number;
  rh: number;
  nose: Aircraft3DSpec["nose"];
  panes: PaneCorner[][];
  radius: number;
  radome: number;
  mask?: boolean;
}

const fromSpec = (s: Aircraft3DSpec): Nose => ({
  rw: s.rw,
  rh: s.rh,
  nose: s.nose,
  panes: s.cockpit.panes,
  radius: s.cockpit.radius,
  radome: s.radome,
});

/** 空客窄体、空客宽体：六块玻璃，后侧窗切角 */
const airbus = fromSpec(A20N);
/** 777、767、757 一类：六块 */
const boeing = fromSpec(B77W);

/** 737、MD-80、涡桨：机头更尖，前风挡下沿是 V 形 */
const pointed: Nose = {
  rw: 1.88,
  rh: 2,
  nose: {
    top: [[0, -0.55], [0.06, -0.34], [0.2, -0.14], [0.5, 0.11], [1, 0.37], [1.5, 0.57], [1.75, 0.68], [2.05, 0.92], [2.45, 1.25], [2.85, 1.46], [3.5, 1.69], [4.6, 1.89], [6.2, 2]],
    bottom: [[0, -0.55], [0.06, -0.78], [0.2, -0.98], [0.6, -1.25], [1.4, -1.54], [2.6, -1.79], [4, -1.93], [5.8, -2]],
    width: [[0, 0], [0.06, 0.27], [0.2, 0.49], [0.5, 0.77], [1, 1.05], [1.6, 1.29], [2.4, 1.52], [3.4, 1.71], [4.6, 1.83], [6.2, 1.88]],
    shoulder: [[0, 0], [1.2, 0], [2.1, 0.05], [3.1, 0.07], [4.4, 0.04], [6.4, 0]],
  },
  panes: [
    [["z", 0.06, 0.72], ["z", 0.86, 0.6], ["z", 0.66, 1.23], ["z", 0.06, 1.28]],
    [["z", 0.97, 0.595], ["x", 2.72, 0.63], ["x", 2.86, 1.18], ["z", 0.76, 1.22]],
    [["x", 2.84, 0.64], ["x", 3.4, 0.74], ["x", 3.38, 0.96], ["x", 3.2, 1.13], ["x", 2.98, 1.17]],
  ],
  radius: 0.07,
  radome: 1.1,
};

/** 787：没有折角的流线机头，四块大玻璃 */
const smooth: Nose = {
  rw: 2.88,
  rh: 2.97,
  nose: {
    top: [[0, -0.7], [0.1, -0.28], [0.35, 0.1], [0.9, 0.56], [1.6, 0.92], [2.05, 1.16], [2.6, 1.55], [3.2, 1.92], [4, 2.25], [5, 2.52], [6.4, 2.77], [8, 2.92], [9.6, 2.97]],
    bottom: [[0, -0.7], [0.1, -1.14], [0.35, -1.54], [0.9, -1.94], [1.9, -2.3], [3.4, -2.6], [5.4, -2.83], [7.6, -2.94], [9.4, -2.97]],
    width: [[0, 0], [0.1, 0.46], [0.35, 0.86], [0.9, 1.32], [1.6, 1.68], [2.5, 2], [3.7, 2.31], [5.2, 2.56], [7.2, 2.77], [9.4, 2.88]],
    shoulder: [[0, 0], [1.4, 0], [2.7, 0.05], [4, 0.07], [6, 0.04], [9, 0]],
  },
  panes: [
    [["z", 0.07, 1.22], ["z", 1.22, 1.06], ["z", 0.96, 1.86], ["z", 0.07, 1.93]],
    [["z", 1.38, 1.05], ["x", 3.62, 1.1], ["x", 3.95, 1.32], ["x", 3.78, 1.68], ["z", 1.12, 1.84]],
  ],
  radius: 0.12,
  radome: 1.6,
};

/** 支线机、A220、C919：圆钝机头，四块玻璃 */
const fourPane: Nose = {
  ...airbus,
  panes: [
    [["z", 0.06, 0.79], ["z", 0.98, 0.68], ["z", 0.75, 1.28], ["z", 0.06, 1.33]],
    [["z", 1.11, 0.67], ["x", 2.92, 0.71], ["x", 3.14, 0.9], ["x", 2.98, 1.2], ["z", 0.88, 1.265]],
  ],
  radius: 0.085,
};

/** A380：驾驶舱在两层客舱之间，额头很高 */
const superJumbo: Nose = {
  rw: 3.57,
  rh: 4.2,
  nose: {
    top: [[0, -1.5], [0.12, -0.86], [0.4, -0.3], [1, 0.38], [1.8, 0.92], [2.3, 1.2], [2.7, 1.42], [3.2, 1.9], [3.75, 2.38], [4.4, 2.8], [5.6, 3.35], [7.4, 3.86], [9.5, 4.13], [11.5, 4.2]],
    bottom: [[0, -1.5], [0.12, -2.1], [0.4, -2.6], [1, -3.08], [2, -3.46], [3.6, -3.82], [5.6, -4.07], [8, -4.18], [10, -4.2]],
    width: [[0, 0], [0.12, 0.62], [0.4, 1.14], [1, 1.74], [1.8, 2.2], [2.8, 2.6], [4.2, 2.98], [6, 3.3], [8, 3.49], [10.5, 3.57]],
    shoulder: [[0, 0], [1.6, 0], [3, 0.04], [4.4, 0.05], [7, 0.03], [11, 0]],
  },
  panes: [
    [["z", 0.075, 1.5], ["z", 1.16, 1.36], ["z", 0.9, 2.1], ["z", 0.075, 2.17]],
    [["z", 1.31, 1.35], ["x", 3.75, 1.39], ["x", 4, 2.02], ["z", 1.05, 2.08]],
    [["x", 3.92, 1.4], ["x", 4.7, 1.46], ["x", 4.68, 1.72], ["x", 4.42, 1.97], ["x", 4.17, 2.01]],
  ],
  radius: 0.1,
  radome: 2,
};

/** 把机头按机身宽高缩放；fx 大于 1 会更尖长 */
function scaleNose(n: Nose, rw: number, rh: number, stretch = 1) {
  const [kz, ky] = [rw / n.rw, rh / n.rh];
  const kx = ((kz + ky) / 2) * stretch;
  const p = (q: Profile, k: number): Profile => q.map(([x, v]) => [x * kx, v * k]);
  return {
    nose: {
      top: p(n.nose.top, ky),
      bottom: p(n.nose.bottom, ky),
      width: p(n.nose.width, kz),
      shoulder: p(n.nose.shoulder, 1),
    },
    cockpit: {
      panes: n.panes.map((pane) =>
        pane.map(([axis, v, y]): PaneCorner => [axis, v * (axis === "x" ? kx : kz), y * ky]),
      ),
      radius: n.radius * Math.min(kz, ky),
      mask: n.mask,
    },
    radome: n.radome * kx,
  };
}

// ------------------------------------------------------------------ 构造

interface Wing {
  span: number;
  /** 翼根前缘的位置（占机身长度） */
  at: number;
  sweep: number;
  /** 弦长：对称面、转折处、翼梢（不含小翼） */
  chords: [number, number, number];
  /** 转折处离对称面的距离（占半翼展）；直翼填 0.4 左右即可 */
  kink: number;
  dihedral?: number;
  flex?: number;
  high?: boolean;
}

interface Def {
  /** 机身宽、高的一半 */
  body: [number, number];
  nose: Nose;
  stretch?: number;
  wing: Wing;
  tip: Aircraft3DSpec["tip"];
  /** 垂尾：高、根弦、梢弦、后掠、背鳍 */
  fin: [number, number, number, number, number];
  /** 平尾：展、根弦、梢弦、后掠、上反 */
  stab: [number, number, number, number, number];
  tTail?: boolean;
  engines: Engine[];
  /** 每侧的舱门数（不算应急出口），和翼上应急出口数 */
  doors: number;
  exits?: number;
  /** 客舱窗高度（度）；双层机型给两排 */
  decks?: number[];
  tailLength?: number;
}

type Engine =
  | { mount: "wing"; z: number; length: number; diameter: number; drop?: number; ahead?: number }
  | { mount: "prop"; z: number; length: number; diameter: number; blades: number; prop: number }
  /** 尾吊：at 是进气口的位置（占机身长度） */
  | { mount: "rear"; at: number; length: number; diameter: number }
  /** MD-11 的中置尾发 */
  | { mount: "fin"; at: number; length: number; diameter: number };

const RAD = Math.PI / 180;

function build(d: Def, length: number): Aircraft3DSpec {
  const [rw, rh] = d.body;
  const { nose, cockpit, radome } = scaleNose(d.nose, rw, rh, d.stretch);
  const w = d.wing;
  const tipOut = d.tip.kind === "raked" ? d.tip.length : d.tip.kind === "blended" || d.tip.kind === "sharklet" ? d.tip.height * 0.45 : 0;
  const semi = w.span / 2 - tipOut;
  const [cr, ck, ct] = w.chords;
  const kink = semi * w.kink;
  const wing = {
    x: length * w.at,
    y: w.high ? rh * 0.9 : -rh * 0.58,
    sweep: w.sweep,
    dihedral: w.dihedral ?? 5.5,
    flex: w.flex ?? 0.5,
    sections: [
      { at: 0, chord: cr, thick: 0.15, twist: 3 },
      { at: rw, chord: cr + (ck - cr) * Math.min(1, rw / kink), thick: 0.145, twist: 2.5 },
      { at: Math.max(kink, rw + 0.5), chord: ck, thick: 0.12, twist: 1 },
      { at: semi, chord: ct, thick: 0.105, twist: -1 },
    ],
  };

  const [fh, fr, ft, fs, fillet] = d.fin;
  const finX = length * 0.93 - fr + (d.tTail ? length * 0.012 : 0);
  const fin = {
    x: finX,
    y: rh * 0.65,
    sweep: fs,
    dihedral: 0,
    fillet,
    sections: [
      { at: 0, chord: fr, thick: 0.1 },
      { at: fh, chord: ft, thick: 0.1 },
    ],
  };
  const [ss, sr, st, sw, sd] = d.stab;
  const stab = {
    x: d.tTail ? finX + Math.tan(fs * RAD) * fh - sr * 0.12 : length * 0.94 - sr,
    y: d.tTail ? rh * 0.65 + fh - 0.12 : rh * 0.48,
    sweep: sw,
    dihedral: sd,
    sections: [
      { at: 0, chord: sr, thick: 0.11 },
      { at: ss / 2, chord: st, thick: 0.1 },
    ],
  };

  const engines = d.engines.map((e): EngineSpec => {
    if (e.mount === "wing")
      return { mount: "wing", z: e.z, length: e.length, diameter: e.diameter, drop: e.drop ?? e.diameter * 0.57, ahead: e.ahead ?? e.length * 0.62 };
    if (e.mount === "prop") return { ...e, drop: 0, ahead: e.length * 0.42 };
    if (e.mount === "rear")
      return { mount: "rear", z: rw + e.diameter * 0.62, x: length * e.at, y: rh * 0.34, length: e.length, diameter: e.diameter, drop: 0, ahead: 0 };
    return { mount: "fin", z: 0, x: length * e.at, y: rh * 0.62 + e.diameter * 0.62, length: e.length, diameter: e.diameter, drop: 0, ahead: 0 };
  });

  // 客舱：首尾舱门之间排舷窗，中间的门大致均分，避开翼根
  const small = rw < 2.2;
  const first = (small ? 2.7 : 2.35) * rh;
  const rear = d.engines.some((e) => e.mount === "rear");
  const lastX = length - rh * (rear ? 5.6 : small ? 3.7 : 3.75);
  const doorH = small ? Math.min(1.8, rh * 0.92) : 1.95;
  const doorW = small ? 0.8 : 1.07;
  const main = d.decks?.[0] ?? (small ? 13 : 11);
  const doorPhi = main - (small ? 5 : 4);
  const xs = Array.from({ length: d.doors }, (_, i) => first + ((lastX - first) * i) / (d.doors - 1 || 1));
  const doors = (rear ? xs.slice(0, 1) : xs).map((x) => ({ x, phi: doorPhi, h: doorH, w: doorW }));
  const over = wing.x + cr * 0.5;
  for (let i = 0; i < (d.exits ?? 0); i++) doors.push({ x: over + i * 0.92, phi: main - 1, h: Math.min(1, rh * 0.52), w: 0.5 });
  const gaps = doors.map((q) => q.x);
  const windowEnd = rear ? lastX - rh * 0.6 : lastX - doorW * 1.2;
  const windows = [{ phi: main, from: first + doorW * 1.5, to: windowEnd, gaps }];
  for (const phi of d.decks?.slice(1) ?? []) {
    const gap = [first + length * 0.16, first + length * 0.46];
    windows.push({ phi, from: first + length * 0.02, to: lastX - length * 0.04, gaps: gap });
    for (const x of gap) doors.push({ x, phi: phi - 2, h: 1.7, w: 0.95 });
  }

  return {
    length,
    rw,
    rh,
    nose,
    cockpit,
    radome,
    tail: { length: Math.min(d.tailLength ?? rh * 7, length * 0.38), tipY: rh * 0.46, tipH: rh * 0.13, tipW: rw * 0.09 },
    wing,
    tip: d.tip,
    fin,
    stab,
    engines,
    windows,
    doors,
    titles: { x: first + length * 0.13, phi: d.decks ? (d.decks[0] + d.decks[1]) / 2 : small ? 37 : 34, size: Math.min(1.9, rh * 0.5) },
    windowSize: small ? [0.23, 0.33] : [0.26, 0.38],
    bellyPhi: -26,
    highWing: w.high,
    bullet: d.tTail,
  };
}

// ------------------------------------------------------------------ 数据

type Family = (length: number, type: string) => Def | Aircraft3DSpec;

const none = { kind: "none" } as const;
const sharklet = (height: number) => ({ kind: "sharklet", height, chord: height * 0.26 }) as const;
const blended = (height: number) => ({ kind: "blended", height, chord: height * 0.28 }) as const;
const raked = (length: number, sweep: number) => ({ kind: "raked", length, sweep, chord: 0.6 }) as const;
const fence = (height: number) => ({ kind: "fence", height }) as const;

const a320Wing: Wing = { span: 35.8, at: 0.303, sweep: 27.5, chords: [7.4, 3.9, 1.62], kink: 0.385 };
/** 手调的机型改长度：前后各加一半，尾翼、后舱门跟着走 */
function stretchSpec(s: Aircraft3DSpec, length: number, change: Partial<Aircraft3DSpec> = {}): Aircraft3DSpec {
  const dl = length - s.length;
  const pivot = s.wing.x + s.wing.sections[0].chord / 2;
  const move = (x: number) => (x > pivot + 3 ? x + dl : x > s.length * 0.2 ? x + (dl / 2) * Math.min(1, (x - s.length * 0.2) / (pivot - s.length * 0.2)) : x);
  return {
    ...s,
    length,
    wing: { ...s.wing, x: s.wing.x + dl / 2 },
    fin: { ...s.fin, x: s.fin.x + dl },
    stab: { ...s.stab, x: s.stab.x + dl },
    doors: s.doors.map((q) => ({ ...q, x: move(q.x) })),
    windows: s.windows.map((q) => ({ ...q, from: q.from, to: move(q.to), gaps: q.gaps.map(move) })),
    ...change,
  };
}

const rear = (body: [number, number], wing: Wing, engine: [number, number, number], fin: Def["fin"], stab: Def["stab"], tip: Def["tip"], nose: Nose, stretch = 1, exits = 1): Def => ({
  body,
  nose,
  stretch,
  wing,
  tip,
  fin,
  stab,
  tTail: true,
  engines: [{ mount: "rear", at: engine[0], length: engine[1], diameter: engine[2] }],
  doors: 2,
  exits,
  tailLength: body[1] * 6.2,
});

const FAMILY: Record<string, Family> = {
  a220: (L) => ({
    body: [1.75, 1.85],
    nose: fourPane,
    wing: { span: 35.1, at: L > 36 ? 0.335 : 0.315, sweep: 26, chords: [6.4, 3.7, 1.5], kink: 0.36, flex: 0.7 },
    tip: raked(1.5, 48),
    fin: [5.9, 5.5, 2, 39, 1.6],
    stab: [11.9, 3.7, 1.3, 31, 5],
    engines: [{ mount: "wing", z: 5.4, length: 4.2, diameter: 2.3 }],
    doors: 2,
    exits: 1,
  }),
  a320: (L, t) =>
    stretchSpec(A20N, L, {
      engines: [{ mount: "wing", z: 5.75, length: 4.4, diameter: 2.12, drop: 1.36, ahead: 2.5 }],
      tip: t === "A318" || t === "A319" ? fence(1.1) : A20N.tip,
    }),
  a320neo: (L) => stretchSpec(A20N, L),
  a300: (L) => ({
    body: [2.82, 2.82],
    nose: airbus,
    stretch: 0.9,
    wing: { span: L < 50 ? 43.9 : 44.8, at: 0.31, sweep: 28, chords: [10.8, 7.2, 3], kink: 0.36 },
    tip: fence(1.5),
    fin: [8.4, 8.4, 3.2, 42, 2.4],
    stab: [16.3, 6, 2.2, 36, 6],
    engines: [{ mount: "wing", z: 7.9, length: 6, diameter: 2.8 }],
    doors: 3,
  }),
  a330: (L) => ({
    body: [2.82, 2.82],
    nose: airbus,
    stretch: 0.9,
    wing: { span: 60.3, at: L > 60 ? 0.308 : 0.295, sweep: 31, chords: [12.2, 7.4, 2.4], kink: 0.35, flex: 1.1 },
    tip: blended(2.2),
    fin: [8.9, 8.6, 3.1, 43, 2.6],
    stab: [19.4, 6.6, 2.2, 33, 6],
    engines: [{ mount: "wing", z: 9.4, length: 6.8, diameter: 3.05 }],
    doors: 4,
  }),
  a330neo: (L) => ({
    ...(FAMILY.a330(L, "") as Def),
    wing: { span: 64, at: L > 60 ? 0.308 : 0.295, sweep: 31, chords: [12.2, 7.4, 2.3], kink: 0.34, flex: 1.5 },
    tip: raked(3.2, 50),
    engines: [{ mount: "wing", z: 9.5, length: 7, diameter: 3.6 }],
  }),
  a340: (L) => {
    const big = L > 65;
    return {
      ...(FAMILY.a330(L, "") as Def),
      wing: { span: big ? 63.4 : 60.3, at: L > 70 ? 0.33 : 0.308, sweep: 31, chords: [big ? 13.6 : 12.2, 7.8, 2.5], kink: 0.35, flex: 1.1 },
      engines: [
        { mount: "wing", z: 9.4, length: big ? 5.8 : 5, diameter: big ? 2.95 : 2.4 },
        { mount: "wing", z: 19.2, length: big ? 5.8 : 5, diameter: big ? 2.95 : 2.4 },
      ],
    };
  },
  a350: (L) => ({
    body: [2.98, 3.05],
    nose: { ...smooth, panes: boeing.panes.map((p) => p.map(([a, v, y]): PaneCorner => [a, v * (a === "x" ? 0.945 : 0.95), y * 0.99])), mask: true },
    wing: { span: 64.75, at: L > 70 ? 0.32 : 0.305, sweep: 32.5, chords: [13.4, 7.8, 2.6], kink: 0.34, flex: 1.9 },
    tip: sharklet(3),
    fin: [9.4, 9, 3.2, 43, 2.6],
    stab: [19.1, 6.8, 2.2, 35, 6],
    engines: [{ mount: "wing", z: 10.5, length: 7.2, diameter: 3.75 }],
    doors: 4,
  }),
  a380: () => ({
    body: [3.57, 4.2],
    nose: superJumbo,
    wing: { span: 79.75, at: 0.272, sweep: 35, chords: [19, 11.4, 4], kink: 0.36, dihedral: 5.6, flex: 1.8 },
    tip: fence(2.2),
    fin: [13.2, 13, 4.8, 43, 3.6],
    stab: [30.4, 10.8, 4, 36, 7],
    engines: [
      { mount: "wing", z: 14.9, length: 6.9, diameter: 3.4, drop: 2.3 },
      { mount: "wing", z: 25.7, length: 6.9, diameter: 3.4, drop: 2.1 },
    ],
    doors: 5,
    decks: [-13, 33],
    tailLength: 24,
  }),
  b717: () => rear([1.67, 1.8], { span: 28.4, at: 0.385, sweep: 26, chords: [6.6, 4, 1.4], kink: 0.35 }, [0.665, 5, 1.9], [4.6, 5.4, 3.9, 44, 1], [11.2, 3.6, 1.3, 31, -2], none, pointed, 1.08),
  b737: (L, t) => {
    const ng = ["B736", "B737", "B738", "B739"].includes(t);
    const jt8 = t === "B732";
    return {
      body: [1.88, 2],
      nose: pointed,
      wing: { span: ng ? 35.8 : 28.9, at: L > 38 ? 0.345 : 0.325, sweep: ng ? 27.5 : 28, chords: [ng ? 7.8 : 7.3, 4.1, 1.5], kink: ng ? 0.33 : 0.36 },
      tip: ng && t !== "B736" ? blended(2.5) : none,
      fin: [6.6, 6.4, 1.9, 39, 5],
      stab: [ng ? 14.35 : 12.7, 4.4, 1.5, 34, 7],
      engines: [jt8 ? { mount: "wing", z: 4.8, length: 6.6, diameter: 1.3, drop: 0.85, ahead: 2.4 } : { mount: "wing", z: 4.85, length: 4.6, diameter: ng ? 2.06 : 2, drop: 0.95, ahead: 3.2 }],
      doors: 2,
      exits: L > 38 ? 2 : 1,
    };
  },
  b737max: (L, t) => ({
    ...(FAMILY.b737(L, "B738") as Def),
    tip: { kind: "split", height: 2.5, chord: 0.6, lower: 1.4 },
    engines: [{ mount: "wing", z: 4.95, length: 5, diameter: 2.28, drop: 0.98, ahead: 3.8 }],
    exits: t === "B37M" ? 1 : 2,
  }),
  b747: (L, t) => {
    const classic = ["B741", "B742", "B743"].includes(t);
    const short = t === "B741" || t === "B742";
    const end = short ? 14 : 20.5;
    const hump = B748.hump!;
    const top: Profile = [...hump.top.filter(([x]) => x < 11), [11, 4.92], [end, 4.92], [end + 2.5, 4.72], [end + 5, 4.28], [end + 7.5, 3.74], [end + 10, 3.38], [end + 12, 3.28]];
    const s = stretchSpec(B748, L, {
      hump: { r: hump.r, top },
      // 日本国内型 747-400D 没有小翼
      tip: classic || t === "B74D" ? none : blended(2.6),
      engines: [
        { mount: "wing", z: 11.9, length: 6.3, diameter: 2.85, drop: 2.2, ahead: 4.4 },
        { mount: "wing", z: 20.9, length: 6.3, diameter: 2.85, drop: 1.9, ahead: 4.4 },
      ],
    });
    s.windows = [s.windows[0], { ...s.windows[1], to: end + 0.5, gaps: s.windows[1].gaps.filter((x) => x < end - 1) }];
    s.doors = s.doors.filter((q) => q.phi < 40 || q.x < end - 1);
    return s;
  },
  b748: () => B748,
  b757: (L) => ({
    body: [1.88, 2],
    nose: boeing,
    wing: { span: 41.1, at: L > 50 ? 0.36 : 0.335, sweep: 27, chords: [8.4, 5.6, 1.8], kink: 0.34 },
    tip: blended(2.4),
    fin: [7.4, 7, 2.6, 41, 2.4],
    stab: [15.2, 5, 1.6, 33, 6],
    engines: [{ mount: "wing", z: 6.5, length: 5.6, diameter: 2.5 }],
    doors: 3,
    exits: 0,
  }),
  b767: (L, t) => ({
    body: [2.51, 2.7],
    nose: boeing,
    wing: { span: t === "B764" ? 51.9 : 47.6, at: L > 56 ? 0.335 : 0.315, sweep: 34, chords: [11.4, 7.2, 2.4], kink: 0.34, flex: 0.9 },
    tip: t === "B764" ? raked(3, 52) : t === "B763" ? blended(3.2) : none,
    fin: [8.8, 8.8, 3, 43, 2.6],
    stab: [18.6, 6.4, 2, 36, 7],
    engines: [{ mount: "wing", z: 7.9, length: 6.2, diameter: 2.9 }],
    doors: 3,
  }),
  b777: (L, t) => {
    const er = t === "B77W" || t === "B77L";
    const base = L > 70 ? B77W : stretchSpec(B77W, L);
    const s = er ? base : { ...base, tip: none, engines: base.engines.map((e) => ({ ...e, diameter: 3.65 })) };
    if (L > 70) return s;
    // 短机身少一对门
    const gone = s.doors[3].x;
    const drop = (x: number) => Math.abs(x - gone) > 0.01;
    return { ...s, doors: s.doors.filter((q) => drop(q.x)), windows: s.windows.map((q) => ({ ...q, gaps: q.gaps.filter(drop) })) };
  },
  b777x: (L) => ({
    ...stretchSpec(B77W, L, {
      tip: raked(6, 48),
      engines: [{ mount: "wing", z: 10, length: 7.8, diameter: 4.4, drop: 2.45, ahead: 5 }],
    }),
    wing: { ...B77W.wing, x: B77W.wing.x + (L - B77W.length) / 2, flex: 2.2, sections: B77W.wing.sections.map((q, i) => (i === 3 ? { ...q, at: 30, chord: 3 } : q)) },
  }),
  b787: (L) => ({
    body: [2.88, 2.97],
    nose: smooth,
    wing: { span: 60.1, at: L > 65 ? 0.325 : L > 60 ? 0.31 : 0.295, sweep: 32, chords: [12.4, 7, 2.6], kink: 0.34, flex: 2.4, dihedral: 6 },
    tip: raked(4.6, 50),
    fin: [9.2, 8.8, 3.1, 42, 2.4],
    stab: [19.8, 6.4, 2, 36, 6],
    engines: [{ mount: "wing", z: 9.8, length: 7, diameter: 3.5 }],
    doors: 4,
  }),
  ejet: (L) => ({
    body: [1.5, 1.67],
    nose: fourPane,
    wing: { span: L > 34 ? 28.7 : 26, at: 0.335, sweep: 26, chords: [6, 3.4, 1.3], kink: 0.36 },
    tip: blended(1.6),
    fin: [5.2, 4.9, 1.9, 38, 1.8],
    stab: [L > 34 ? 12.1 : 10, 3.3, 1.2, 30, 6],
    engines: [{ mount: "wing", z: 4.4, length: 3.7, diameter: 1.75 }],
    doors: 2,
    exits: L > 34 ? 1 : 0,
  }),
  ejet2: (L) => ({
    ...(FAMILY.ejet(L, "") as Def),
    wing: { span: L > 40 ? 35.1 : 33.7, at: 0.335, sweep: 27, chords: [6.2, 3.5, 1.3], kink: 0.34, flex: 0.8 },
    tip: raked(1.8, 50),
    engines: [{ mount: "wing", z: 4.8, length: 4.1, diameter: 2.15 }],
  }),
  erj: () => rear([1.14, 1.14], { span: 20, at: 0.4, sweep: 24, chords: [4.4, 2.8, 1.1], kink: 0.35, dihedral: 5 }, [0.705, 4, 1.35], [3, 3.7, 2.6, 36, 0.8], [7.6, 2.4, 1.3, 22, -1], none, fourPane, 1.2),
  crj: (L) => rear([1.35, 1.35], { span: L < 30 ? 21.2 : L < 35 ? 23.2 : L < 38 ? 24.9 : 26.2, at: L < 30 ? 0.39 : 0.415, sweep: 26, chords: [5, 3.3, 1.25], kink: 0.36, dihedral: 3 }, [L < 30 ? 0.68 : 0.715, 3.9, 1.4], [3.2, 4.2, 2.9, 40, 0.9], [L < 30 ? 6.2 : 8.5, 2.6, 1.3, 30, -2], blended(1.2), fourPane, 1.25),
  atr: (L) => ({
    body: [1.43, 1.4],
    nose: pointed,
    stretch: 1.02,
    wing: { span: L > 25 ? 27 : 24.6, at: L > 25 ? 0.4 : 0.39, sweep: 2.5, chords: [2.6, 2.55, 1.6], kink: 0.4, dihedral: 1, flex: 0.1, high: true },
    tip: none,
    fin: [4.3, 4, 2.2, 28, 3],
    stab: [7.3, 2.1, 1.2, 8, 0],
    tTail: true,
    engines: [{ mount: "prop", z: 4.05, length: 4.6, diameter: 1.15, blades: 6, prop: 3.93 }],
    doors: 2,
    exits: 0,
    tailLength: 8.6,
  }),
  dash8: (L) => ({
    body: [1.35, 1.35],
    nose: pointed,
    stretch: 1.1,
    wing: { span: L > 30 ? 28.4 : L > 24 ? 27.4 : 25.9, at: L > 30 ? 0.43 : 0.4, sweep: 3, chords: [2.9, 2.85, 1.45], kink: 0.4, dihedral: 2, flex: 0.1, high: true },
    tip: none,
    fin: [4.2, 4.6, 3, 30, 2.6],
    stab: [9.3, 2.1, 1.5, 6, 0],
    tTail: true,
    engines: [{ mount: "prop", z: L > 30 ? 4.4 : 3.95, length: L > 30 ? 6.2 : 5.2, diameter: 1.3, blades: L > 30 ? 6 : 4, prop: 4.1 }],
    doors: 2,
    exits: 0,
    tailLength: 8.4,
  }),
  c919: () => ({
    body: [1.98, 2.08],
    nose: fourPane,
    wing: { ...a320Wing, at: 0.31 },
    tip: sharklet(2.2),
    fin: [6.4, 6, 2, 40, 2],
    stab: [12.6, 4.3, 1.4, 33, 6],
    engines: [{ mount: "wing", z: 5.8, length: 4.8, diameter: 2.4 }],
    doors: 2,
    exits: 1,
  }),
  arj21: () => rear([1.57, 1.67], { span: 27.3, at: 0.37, sweep: 27, chords: [6.2, 3.8, 1.4], kink: 0.35 }, [0.665, 4.3, 1.8], [4.5, 5, 3.5, 42, 1], [10.6, 3.2, 1.3, 30, -2], blended(1.6), pointed, 1.05),
  md80: (L) => rear([1.67, 1.8], { span: 32.8, at: L > 42 ? 0.44 : 0.42, sweep: 27, chords: [7.4, 4.4, 1.3], kink: 0.34 }, [L > 42 ? 0.705 : 0.69, 6, 1.75], [4.8, 5.8, 4.2, 44, 1], [12.2, 3.8, 1.4, 33, -2], none, pointed, 1.1, 2),
  md11: () => ({
    body: [3.01, 3.01],
    nose: boeing,
    wing: { span: 51.7, at: 0.3, sweep: 37, chords: [12.6, 8, 2.8], kink: 0.36, flex: 1 },
    tip: { kind: "split", height: 2.5, chord: 0.9, lower: 1.2 },
    fin: [10, 8.6, 3.6, 40, 0.2],
    stab: [18, 6.4, 2.4, 37, 8],
    engines: [
      { mount: "wing", z: 8.2, length: 6.6, diameter: 2.9 },
      { mount: "fin", at: 0.835, length: 9.2, diameter: 2.9 },
    ],
    doors: 4,
  }),
  ssj: () => ({
    body: [1.73, 1.73],
    nose: fourPane,
    wing: { span: 27.8, at: 0.335, sweep: 27, chords: [6.2, 3.6, 1.3], kink: 0.36 },
    tip: none,
    fin: [5.4, 5.2, 1.9, 38, 1.6],
    stab: [10.4, 3.5, 1.2, 31, 6],
    engines: [{ mount: "wing", z: 4.6, length: 3.9, diameter: 1.85 }],
    doors: 2,
    exits: 0,
  }),
};

const cache = new Map<string, Aircraft3DSpec | null>();

/** 机型的 3D 参数；不认识的机型返回 null（页面上退回侧视图）。 */
export function spec3DFor(type: string): Aircraft3DSpec | null {
  const code = type.toUpperCase();
  let s = cache.get(code);
  if (s === undefined) {
    const family = aircraftFamily(code);
    const make = family && FAMILY[family.id];
    if (!make) s = null;
    else if (code === "A20N") s = A20N;
    else if (code === "B77W") s = B77W;
    else {
      const def = make(profileFor(code).length, code);
      s = "body" in def ? build(def, profileFor(code).length) : def;
    }
    cache.set(code, s);
  }
  return s;
}
