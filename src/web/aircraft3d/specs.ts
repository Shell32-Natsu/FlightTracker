/**
 * 3D 模型的外形参数，单位是米（公开尺寸，曲线按真机特征估的近似值）。这里是类型和三架逐项手调的机型，
 * 其余机型见 families.ts。
 * 坐标：机头在 x = 0，向后为 +x；y 向上；z 向左翼（机头朝左看过去时靠近观察者的一侧）。
 */

export type Profile = [number, number][];

/** 玻璃的一个角：["z", z, y] 按正面图定位，["x", x, y] 按侧面图定位 */
export type PaneCorner = ["x" | "z", number, number];

export interface LiftingSpec {
  /** 翼根（z = 0）前缘的位置 */
  x: number;
  y: number;
  /** 各控制剖面：离对称面的距离、弦长；前缘由后掠角推出来 */
  sections: { at: number; chord: number; thick: number; twist?: number }[];
  /** 前缘后掠角（度） */
  sweep: number;
  /** 上反角（度） */
  dihedral: number;
}

export interface EngineSpec {
  /** 翼吊 / 尾吊 / 螺旋桨 / 垂尾根部（MD-11），不写是翼吊 */
  mount?: "wing" | "rear" | "prop" | "fin";
  z: number;
  length: number;
  diameter: number;
  /** 翼吊：轴线在机翼下方多少、进气口在前缘之前多少 */
  drop: number;
  ahead: number;
  /** 尾吊、垂尾根部：进气口位置 */
  x?: number;
  y?: number;
  blades?: number;
  prop?: number;
}

export interface Aircraft3DSpec {
  length: number;
  /** 机身宽、高的一半 */
  rw: number;
  rh: number;
  /** 机头的上缘、下缘、半宽，逐点给 [x, 值]；第一点在机头尖，之后平滑连到等直段 */
  nose: { top: Profile; bottom: Profile; width: Profile; shoulder: Profile };
  tail: { length: number; tipY: number; tipH: number; tipW: number };
  /** 747 的上层舱：另一段圆弧的上缘轮廓和最大半径 */
  hump?: { top: Profile; r: number };
  wing: LiftingSpec & { flex: number };
  tip:
    | { kind: "raked"; length: number; sweep: number; chord: number }
    | { kind: "blended" | "sharklet"; height: number; chord: number }
    /** 上下双叉 */
    | { kind: "split"; height: number; chord: number; lower: number }
    /** 翼尖端板 */
    | { kind: "fence"; height: number }
    | { kind: "none" };
  fin: LiftingSpec & { fillet: number };
  stab: LiftingSpec;
  engines: EngineSpec[];
  /** 舷窗：高度（度，从机身水平面量起）、每排的起止 x */
  windows: { phi: number; from: number; to: number; gaps: number[] }[];
  doors: { x: number; phi: number; h: number; w: number }[];
  titles: { x: number; phi: number; size: number };
  /** 驾驶舱玻璃：一侧的两三块（另一侧镜像），从外面看逆时针给角；radius 是玻璃的圆角，mask 是 A350 那样的黑色窗罩 */
  cockpit: { panes: PaneCorner[][]; radius: number; mask?: boolean };
  /** 雷达罩接缝的 x */
  radome: number;
  windowSize: [number, number];
  bellyPhi: number;
  /** 上单翼（涡桨） */
  highWing?: boolean;
  /** T 形尾翼顶上的整流锥 */
  bullet?: boolean;
}

export const A20N: Aircraft3DSpec = {
  length: 37.6,
  rw: 1.98,
  rh: 2.07,
  nose: {
    top: [[0, -0.46], [0.06, -0.2], [0.2, 0.02], [0.5, 0.28], [1, 0.5], [1.5, 0.66], [1.72, 0.76], [2.0, 0.97], [2.38, 1.3], [2.7, 1.49], [3.2, 1.67], [4.1, 1.86], [5.2, 2.0], [6.6, 2.07]],
    bottom: [[0, -0.46], [0.06, -0.74], [0.2, -0.98], [0.6, -1.28], [1.3, -1.56], [2.3, -1.81], [3.6, -1.97], [5, -2.05], [6.4, -2.07]],
    width: [[0, 0], [0.06, 0.31], [0.2, 0.56], [0.5, 0.86], [1, 1.14], [1.6, 1.37], [2.4, 1.59], [3.4, 1.77], [4.6, 1.91], [6.2, 1.98]],
    shoulder: [[0, 0], [1.2, 0], [2.1, 0.06], [3, 0.085], [4.2, 0.05], [6.4, 0]],
  },
  tail: { length: 13.6, tipY: 1.02, tipH: 0.26, tipW: 0.2 },
  wing: {
    x: 11.4,
    y: -1.18,
    sweep: 27.5,
    dihedral: 5.2,
    flex: 0.5,
    sections: [
      { at: 0, chord: 7.4, thick: 0.15, twist: 3 },
      { at: 2, chord: 6.2, thick: 0.145, twist: 2.6 },
      { at: 6.4, chord: 3.9, thick: 0.12, twist: 1 },
      { at: 16.6, chord: 1.62, thick: 0.105, twist: -1 },
    ],
  },
  tip: { kind: "sharklet", height: 2.4, chord: 0.62 },
  fin: {
    x: 28.9,
    y: 1.35,
    sweep: 40,
    dihedral: 0,
    fillet: 2.1,
    sections: [
      { at: 0, chord: 6, thick: 0.1 },
      { at: 6.35, chord: 1.95, thick: 0.1 },
    ],
  },
  stab: {
    x: 30.9,
    y: 1.0,
    sweep: 32.5,
    dihedral: 6,
    sections: [
      { at: 0, chord: 4.4, thick: 0.11 },
      { at: 6.22, chord: 1.35, thick: 0.1 },
    ],
  },
  engines: [{ z: 5.75, length: 4.7, diameter: 2.42, drop: 1.42, ahead: 2.75 }],
  windows: [{ phi: 13, from: 6.9, to: 29.2, gaps: [15.75, 16.65] }],
  doors: [
    { x: 5.6, phi: 8, h: 1.86, w: 0.84 },
    { x: 15.75, phi: 12, h: 1.02, w: 0.52 },
    { x: 16.65, phi: 12, h: 1.02, w: 0.52 },
    { x: 30.1, phi: 8, h: 1.86, w: 0.84 },
  ],
  titles: { x: 10.4, phi: 36, size: 1.05 },
  cockpit: {
    radius: 0.075,
    panes: [
      [["z", 0.06, 0.78], ["z", 0.95, 0.68], ["z", 0.72, 1.3], ["z", 0.06, 1.34]],
      [["z", 1.07, 0.67], ["x", 2.78, 0.68], ["x", 2.86, 1.26], ["z", 0.84, 1.29]],
      [["x", 2.91, 0.69], ["x", 3.5, 0.72], ["x", 3.5, 0.98], ["x", 3.22, 1.23], ["x", 2.99, 1.255]],
    ],
  },
  radome: 1.15,
  windowSize: [0.23, 0.34],
  bellyPhi: -28,
};

export const B77W: Aircraft3DSpec = {
  length: 73.2,
  rw: 3.1,
  rh: 3.1,
  nose: {
    top: [[0, -0.85], [0.1, -0.42], [0.35, 0], [0.9, 0.5], [1.6, 0.88], [2.15, 1.08], [2.4, 1.2], [2.8, 1.56], [3.25, 1.94], [3.7, 2.17], [4.4, 2.41], [5.2, 2.62], [6.2, 2.81], [8, 3.02], [10, 3.1]],
    bottom: [[0, -0.85], [0.1, -1.28], [0.35, -1.68], [0.9, -2.08], [1.9, -2.42], [3.4, -2.75], [5.4, -2.96], [7.6, -3.07], [9.6, -3.1]],
    width: [[0, 0], [0.1, 0.5], [0.35, 0.93], [0.9, 1.42], [1.6, 1.78], [2.5, 2.11], [3.7, 2.45], [5.2, 2.72], [7.2, 2.96], [9.6, 3.1]],
    shoulder: [[0, 0], [1.6, 0], [2.9, 0.06], [4.2, 0.08], [6, 0.045], [9.4, 0]],
  },
  tail: { length: 22.5, tipY: 1.35, tipH: 0.7, tipW: 0.14 },
  wing: {
    x: 23.4,
    y: -1.85,
    sweep: 34.6,
    dihedral: 6,
    flex: 1.5,
    sections: [
      { at: 0, chord: 15, thick: 0.15, twist: 3 },
      { at: 3.1, chord: 12.7, thick: 0.14, twist: 2.4 },
      { at: 10.2, chord: 8, thick: 0.115, twist: 1 },
      { at: 29, chord: 2.9, thick: 0.1, twist: -1.5 },
    ],
  },
  tip: { kind: "raked", length: 3.4, sweep: 51, chord: 0.6 },
  fin: {
    x: 57.6,
    y: 2.1,
    sweep: 44,
    dihedral: 0,
    fillet: 3.2,
    sections: [
      { at: 0, chord: 10.6, thick: 0.1 },
      { at: 10.1, chord: 3.2, thick: 0.1 },
    ],
  },
  stab: {
    x: 60.4,
    y: 1.45,
    sweep: 38.5,
    dihedral: 7,
    sections: [
      { at: 0, chord: 8.2, thick: 0.11 },
      { at: 10.75, chord: 2.5, thick: 0.1 },
    ],
  },
  engines: [{ z: 9.7, length: 7.6, diameter: 3.96, drop: 2.2, ahead: 4.9 }],
  windows: [{ phi: 12, from: 9, to: 60.4, gaps: [17.4, 30.6, 46.6] }],
  doors: [
    { x: 7.2, phi: 7, h: 1.95, w: 1.07 },
    { x: 17.4, phi: 7, h: 1.95, w: 1.07 },
    { x: 30.6, phi: 7, h: 1.95, w: 1.07 },
    { x: 46.6, phi: 7, h: 1.95, w: 1.07 },
    { x: 61.6, phi: 7, h: 1.95, w: 1.07 },
  ],
  titles: { x: 15, phi: 38, size: 1.75 },
  cockpit: {
    radius: 0.1,
    panes: [
      [["z", 0.075, 1.2], ["z", 1.28, 1.04], ["z", 0.98, 1.9], ["z", 0.075, 1.96]],
      [["z", 1.42, 1.03], ["x", 3.56, 1.05], ["x", 3.74, 1.82], ["z", 1.12, 1.87]],
      [["x", 3.74, 1.06], ["x", 4.56, 1.13], ["x", 4.55, 1.43], ["x", 4.24, 1.75], ["x", 3.93, 1.81]],
    ],
  },
  radome: 1.7,
  windowSize: [0.27, 0.39],
  bellyPhi: -24,
};

export const B748: Aircraft3DSpec = {
  length: 75.4,
  rw: 3.25,
  rh: 3.3,
  nose: {
    top: [[0, -0.95], [0.1, -0.5], [0.4, 0.05], [1, 0.68], [1.8, 1.26], [2.8, 1.8], [4.2, 2.36], [6, 2.82], [8, 3.16], [10.2, 3.3]],
    bottom: [[0, -0.95], [0.1, -1.4], [0.4, -1.86], [1, -2.28], [2.1, -2.7], [3.8, -3.02], [5.8, -3.2], [8, -3.28], [10, -3.3]],
    width: [[0, 0], [0.1, 0.5], [0.4, 1.0], [1, 1.5], [1.8, 1.9], [2.8, 2.26], [4.2, 2.62], [6, 2.92], [8, 3.15], [10.2, 3.25]],
    shoulder: [[0, 0], [2.6, 0], [4, 0.04], [5.4, 0.05], [7.4, 0.03], [10, 0]],
  },
  tail: { length: 23.5, tipY: 1.35, tipH: 0.42, tipW: 0.34 },
  hump: {
    r: 2.8,
    top: [[0, -0.95], [0.1, -0.45], [0.4, 0.2], [1, 1], [1.8, 1.72], [2.6, 2.28], [3.2, 2.6], [3.62, 2.8], [4, 3.14], [4.4, 3.5], [4.9, 3.84], [5.8, 4.28], [7.4, 4.68], [9.2, 4.88], [11, 4.92], [25, 4.92], [27.5, 4.72], [30, 4.28], [32.5, 3.74], [35, 3.38], [37, 3.28]],
  },
  wing: {
    x: 17.2,
    y: -1.9,
    sweep: 41,
    dihedral: 7,
    flex: 1.3,
    sections: [
      { at: 0, chord: 18, thick: 0.14, twist: 3 },
      { at: 3.3, chord: 15, thick: 0.135, twist: 2.4 },
      { at: 12.2, chord: 9, thick: 0.11, twist: 1 },
      { at: 30.4, chord: 3.5, thick: 0.095, twist: -1.5 },
    ],
  },
  tip: { kind: "raked", length: 3.7, sweep: 55, chord: 0.7 },
  fin: {
    x: 56.6,
    y: 2.1,
    sweep: 45.5,
    dihedral: 0,
    fillet: 4,
    sections: [
      { at: 0, chord: 13, thick: 0.1 },
      { at: 11.3, chord: 4.1, thick: 0.1 },
    ],
  },
  stab: {
    x: 60.4,
    y: 1.4,
    sweep: 41.5,
    dihedral: 7,
    sections: [
      { at: 0, chord: 10, thick: 0.1 },
      { at: 11.1, chord: 2.7, thick: 0.09 },
    ],
  },
  engines: [
    { z: 11.9, length: 6.9, diameter: 3.4, drop: 2.5, ahead: 4.6 },
    { z: 21.1, length: 6.9, diameter: 3.4, drop: 2.2, ahead: 4.6 },
  ],
  windows: [
    { phi: 7, from: 6.6, to: 61, gaps: [9.6, 19.8, 31.2, 44.6] },
    { phi: 55, from: 8.4, to: 25.5, gaps: [17.5] },
  ],
  doors: [
    { x: 9.6, phi: 3, h: 1.95, w: 1.07 },
    { x: 19.8, phi: 3, h: 1.95, w: 1.07 },
    { x: 31.2, phi: 3, h: 1.95, w: 1.07 },
    { x: 44.6, phi: 3, h: 1.95, w: 1.07 },
    { x: 62.2, phi: 3, h: 1.95, w: 1.07 },
    { x: 17.5, phi: 52, h: 1.5, w: 0.85 },
  ],
  titles: { x: 24.5, phi: 28, size: 1.75 },
  cockpit: {
    radius: 0.09,
    panes: [
      [["z", 0.065, 2.84], ["z", 1.08, 2.72], ["z", 0.82, 3.42], ["z", 0.065, 3.48]],
      [["z", 1.2, 2.71], ["x", 4.56, 2.73], ["x", 4.82, 3.37], ["z", 0.94, 3.41]],
      [["x", 4.72, 2.735], ["x", 5.46, 2.79], ["x", 5.46, 3.02], ["x", 5.26, 3.31], ["x", 4.98, 3.365]],
    ],
  },
  radome: 2,
  windowSize: [0.25, 0.36],
  bellyPhi: -26,
};
