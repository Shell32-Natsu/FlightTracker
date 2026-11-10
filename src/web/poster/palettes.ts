import type { ThemeId } from "../../shared/settings";
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
  /** 背景渐变的另一端 */
  bg2: string;
  /** 登机牌卡片的底色 */
  card: string;
  /** 背景上的柔光（左上、右上），没有则为 null */
  glow: string | null;
  glow2: string | null;
  ocean: string;
  land: string;
  visited: string;
  /** 点阵地图：普通陆地、去过的国家 */
  dot: string;
  dotVisited: string;
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
  /** 主数字的渐变 */
  hero: [string, string];
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
    bg: "#060a14",
    bg2: "#0c1733",
    card: "#0e182e",
    glow: "rgba(76,112,255,0.22)",
    glow2: "rgba(255,184,77,0.14)",
    ocean: "#0a1832",
    land: "#1b2b4a",
    visited: "#2c4e93",
    dot: "#33497a",
    dotVisited: "#5f8ae0",
    border: "#2a3d63",
    graticule: "rgba(140,170,220,0.08)",
    routeFrom: "#ffd48a",
    routeTo: "#ff7a5c",
    routeGlow: true,
    airport: "#ffffff",
    airportRing: "#ffb84d",
    text: "#f2f5fb",
    hero: ["#ffffff", "#ffd896"],
    muted: "#a3aec2",
    faint: "#66728a",
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
    bg: "#f0e6d0",
    bg2: "#e6d7b6",
    card: "#faf4e3",
    glow: null,
    glow2: null,
    ocean: "#bccabf",
    land: "#f3e7c9",
    visited: "#e0b675",
    dot: "#c3ab7e",
    dotVisited: "#b5733a",
    border: "#b8975f",
    graticule: "rgba(70,70,50,0.16)",
    routeFrom: "#b8521f",
    routeTo: "#93231b",
    routeGlow: false,
    airport: "#2d2217",
    airportRing: "#faf4e3",
    text: "#2d2217",
    hero: ["#2d2217", "#6a3b20"],
    muted: "#6a5640",
    faint: "#927b5a",
    accent: "#b24a22",
    airlineColors: ["#1f4f9a", "#b8401a", "#0f6b4c"],
    other: "#7d6f58",
    yearRamp: ["#b5703f", "#a5552f", "#8c3a22", "#6b2718", "#4a160f"],
    stars: false,
    frame: "#2d2217",
  },
  light: {
    id: "light",
    name: "浅色简约",
    bg: "#f3f7fd",
    bg2: "#dce8f7",
    card: "#ffffff",
    glow: "rgba(84,134,255,0.16)",
    glow2: "rgba(255,178,92,0.24)",
    ocean: "#c8ddf4",
    land: "#fafcfe",
    visited: "#ffdca6",
    dot: "#b3c6e2",
    dotVisited: "#e8973a",
    border: "#c3d1e4",
    graticule: "rgba(255,255,255,0.5)",
    routeFrom: "#e68600",
    routeTo: "#d9432b",
    routeGlow: false,
    airport: "#101828",
    airportRing: "#ffffff",
    text: "#101828",
    hero: ["#101828", "#334155"],
    muted: "#55617a",
    faint: "#8490a6",
    accent: "#d06a00",
    airlineColors: ["#1d5fb4", "#c94a1c", "#0f7f58"],
    other: "#7f8aa0",
    yearRamp: ["#e0953a", "#d67a1e", "#bf5a10", "#97400f", "#6a2a0c"],
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

/** 海报 / 视频默认配色跟随界面主题 */
export const PALETTE_FOR_THEME: Record<ThemeId, PaletteId> = { night: "night", light: "light", retro: "paper" };
