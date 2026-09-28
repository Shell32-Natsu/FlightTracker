import type { RefData } from "../lib/refdata";
import { airlineHue } from "../ui/AirlineBadge";

/** 简化的涂装：白色机身 + 垂尾颜色 + 尾翼徽标，再加几个常见的色块。 */
export interface Livery {
  tail: string;
  /** 尾翼上的徽标：原色，或压成白色剪影（深色垂尾） */
  logo: "color" | "white";
  titles: string;
  titleColor: string;
  /** 机腹色 */
  belly?: string;
  /** 腰线以上整片的颜色（如大韩的浅蓝） */
  upper?: string;
  /** 腰线 */
  stripe?: string;
  engine?: string;
}

type Curated = Omit<Livery, "titles"> & { titles?: string };

/** 常见航司的主色，其余从徽标里取色。 */
const CURATED: Record<string, Curated> = {
  JL: { tail: "#ffffff", logo: "color", titles: "JAPAN AIRLINES", titleColor: "#4a4d55" },
  NH: { tail: "#13448f", logo: "white", titles: "ANA", titleColor: "#13448f", stripe: "#13448f" },
  CX: { tail: "#005d63", logo: "white", titles: "CATHAY PACIFIC", titleColor: "#005d63" },
  UA: { tail: "#0c2340", logo: "white", titles: "UNITED", titleColor: "#0c2340", belly: "#1f5fb4" },
  AA: { tail: "#c9ced6", logo: "color", titles: "AMERICAN", titleColor: "#36495a", engine: "#c9ced6" },
  DL: { tail: "#00205b", logo: "color", titles: "DELTA", titleColor: "#00205b", belly: "#00205b" },
  B6: { tail: "#0033a0", logo: "white", titles: "jetBlue", titleColor: "#0033a0" },
  WN: { tail: "#304cb2", logo: "white", titles: "SOUTHWEST", titleColor: "#304cb2", belly: "#304cb2", stripe: "#f9b612" },
  AS: { tail: "#01426a", logo: "color", titles: "Alaska", titleColor: "#01426a" },
  HA: { tail: "#4b2c86", logo: "color", titles: "HAWAIIAN", titleColor: "#4b2c86" },
  AC: { tail: "#1a1a1a", logo: "color", titles: "AIR CANADA", titleColor: "#1a1a1a", belly: "#1a1a1a" },
  LH: { tail: "#05164d", logo: "white", titles: "Lufthansa", titleColor: "#05164d", engine: "#05164d" },
  AF: { tail: "#ffffff", logo: "color", titles: "AIRFRANCE", titleColor: "#002157" },
  KL: { tail: "#00a1de", logo: "white", titles: "KLM", titleColor: "#ffffff", upper: "#00a1de" },
  BA: { tail: "#0a2a66", logo: "white", titles: "BRITISH AIRWAYS", titleColor: "#0a2a66", belly: "#0a2a66" },
  VS: { tail: "#da0530", logo: "white", titles: "virgin atlantic", titleColor: "#da0530" },
  IB: { tail: "#d7192d", logo: "white", titles: "IBERIA", titleColor: "#d7192d" },
  EK: { tail: "#ffffff", logo: "color", titles: "Emirates", titleColor: "#b0924f" },
  QR: { tail: "#5c0632", logo: "white", titles: "QATAR", titleColor: "#5c0632" },
  SQ: { tail: "#1d2c5e", logo: "color", titles: "SINGAPORE AIRLINES", titleColor: "#1d2c5e" },
  QF: { tail: "#e40000", logo: "white", titles: "QANTAS", titleColor: "#e40000" },
  NZ: { tail: "#111111", logo: "white", titles: "AIR NEW ZEALAND", titleColor: "#111111" },
  KE: { tail: "#ffffff", logo: "color", titles: "KOREAN AIR", titleColor: "#154284", upper: "#8fc3e8" },
  MU: { tail: "#ffffff", logo: "color", titles: "CHINA EASTERN", titleColor: "#003e7e" },
  CA: { tail: "#ffffff", logo: "color", titles: "AIR CHINA", titleColor: "#1a1a1a" },
  CZ: { tail: "#5fb3e4", logo: "color", titles: "CHINA SOUTHERN", titleColor: "#0a3b7d" },
  HU: { tail: "#c8102e", logo: "white", titles: "HAINAN AIRLINES", titleColor: "#c8102e" },
  BR: { tail: "#00664e", logo: "color", titles: "EVA AIR", titleColor: "#00664e", stripe: "#f29b00" },
};

const hex = (n: number) => n.toString(16).padStart(2, "0");
function toHex(r: number, g: number, b: number) {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hsl(r: number, g: number, b: number) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}

/** 从一组颜色里挑出“品牌色”：出现最多、且不是黑白灰的那个。 */
export function pickBrandColor(colors: [number, number, number][]): string | null {
  const counts = new Map<string, { n: number; rgb: [number, number, number] }>();
  for (const rgb of colors) {
    const { s, l } = hsl(...rgb);
    if (s < 0.22 || l > 0.9 || l < 0.1) continue;
    // 相近的颜色归到一起
    const key = rgb.map((v) => Math.round(v / 24)).join(",");
    const c = counts.get(key) ?? { n: 0, rgb };
    c.n += 0.6 + s;
    counts.set(key, c);
  }
  let best: { n: number; rgb: [number, number, number] } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best ? toHex(...best.rgb) : null;
}

/** SVG 源码里写到的颜色（#rgb、#rrggbb、rgb()）。 */
export function svgColors(svg: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const m of svg.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    out.push([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
  }
  for (const m of svg.matchAll(/rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) out.push([+m[1], +m[2], +m[3]]);
  return out;
}

/** 明亮的颜色上用深色字 */
export function isLight(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

function darken(color: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const [r, g, b] = [0, 2, 4].map((i) => Math.round(parseInt(m[1].slice(i, i + 2), 16) * k));
  return toHex(r, g, b);
}

export function liveryFor(code: string, brandColor: string | null | undefined, refData?: RefData): Livery {
  const name = (refData?.airlines[code]?.name ?? code).replace(/\s+(Airlines?|Airways)$/i, "").toUpperCase();
  const curated = CURATED[code];
  if (curated) return { ...curated, titles: curated.titles ?? name };
  if (brandColor) {
    // 太亮的品牌色做垂尾时压暗一点，白色徽标才看得清
    const tail = isLight(brandColor) ? darken(brandColor, 0.75) : brandColor;
    return { tail, logo: "white", titles: name, titleColor: tail };
  }
  const h = airlineHue(code);
  return { tail: `hsl(${h} 55% 32%)`, logo: "white", titles: name, titleColor: `hsl(${h} 55% 32%)` };
}
