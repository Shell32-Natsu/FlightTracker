/**
 * 海报配色。分类色和年份色阶都用 dataviz 校验脚本对各自底色验证过：
 *  - 航司（无序类别）：只给前 3 家航司上色（地图上航线会交叉，按“任意两两”校验），其余并入“其他”灰色
 *  - 年份（有序）：单一色相的顺序色阶，越新越醒目
 */
export type PaletteId = "night" | "paper" | "light";

export interface PosterPalette {
  id: PaletteId;
  name: string;
  bg: string;
  /** 背景上的柔光，没有则为 null */
  glow: string | null;
  ocean: string;
  land: string;
  visited: string;
  border: string;
  graticule: string;
  /** 单色模式下航线的起点色、终点色 */
  routeFrom: string;
  routeTo: string;
  /** 航线外发光（深色主题） */
  routeGlow: boolean;
  airport: string;
  airportRing: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  /** 航司前三名的颜色 + “其他” */
  airlineColors: [string, string, string];
  other: string;
  /** 年份色阶：从旧到新 */
  yearRamp: string[];
  stars: boolean;
  frame: string | null;
}

export const PALETTES: Record<PaletteId, PosterPalette> = {
  night: {
    id: "night",
    name: "深色夜空",
    bg: "#05080f",
    glow: "rgba(88,120,255,0.16)",
    ocean: "#0a1426",
    land: "#131e33",
    visited: "#1f3458",
    border: "#1b2a45",
    graticule: "rgba(140,170,220,0.08)",
    routeFrom: "#ffd48a",
    routeTo: "#ff7a5c",
    routeGlow: true,
    airport: "#ffffff",
    airportRing: "#ffb84d",
    text: "#eef2f8",
    muted: "#9aa6ba",
    faint: "#5d687c",
    accent: "#ffb84d",
    airlineColors: ["#3987e5", "#d95926", "#199e70"],
    other: "#6b7486",
    yearRamp: ["#8a5a24", "#b8742a", "#e0922f", "#ffb84d", "#ffd48a"],
    stars: true,
    frame: null,
  },
  paper: {
    id: "paper",
    name: "纸质复古",
    bg: "#efe6d6",
    glow: null,
    ocean: "#e4d9c3",
    land: "#d7c8a9",
    visited: "#c3a878",
    border: "#efe6d6",
    graticule: "rgba(90,70,40,0.13)",
    routeFrom: "#a8472c",
    routeTo: "#a8472c",
    routeGlow: false,
    airport: "#2b2419",
    airportRing: "#efe6d6",
    text: "#2b2419",
    muted: "#6f604b",
    faint: "#a08f75",
    accent: "#a8472c",
    airlineColors: ["#256abf", "#d95926", "#199e70"],
    other: "#9a8b73",
    yearRamp: ["#d08a5e", "#c06a42", "#a8472c", "#83301f", "#5a1d13"],
    stars: false,
    frame: "#2b2419",
  },
  light: {
    id: "light",
    name: "浅色简约",
    bg: "#f4f6f9",
    glow: null,
    ocean: "#e7edf5",
    land: "#ffffff",
    visited: "#cfdcf0",
    border: "#dde4ee",
    graticule: "rgba(60,80,120,0.07)",
    routeFrom: "#256abf",
    routeTo: "#256abf",
    routeGlow: false,
    airport: "#101828",
    airportRing: "#ffffff",
    text: "#101828",
    muted: "#5b6577",
    faint: "#98a2b3",
    accent: "#256abf",
    airlineColors: ["#256abf", "#d95926", "#199e70"],
    other: "#a3acba",
    yearRamp: ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
    stars: false,
    frame: null,
  },
};

/** 在色阶上按比例取色（线性插值 sRGB，色阶本身已按亮度单调排好）。 */
export function rampColor(ramp: string[], t: number): string {
  if (ramp.length === 1) return ramp[0];
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(ramp[i]);
  const b = hex(ramp[i + 1]);
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("")}`;
}

function hex(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
