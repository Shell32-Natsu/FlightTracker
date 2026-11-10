import type { CSSProperties } from "react";
import type { PaletteId } from "./palettes";

/** 海报正文字体：拉丁字母和数字用 Inter，中文用 Noto Sans SC（导出时用到的字体都内嵌进图片）。 */
export const FONT = "'Inter Variable', 'Noto Sans SC Variable', sans-serif";

/** 大数字、三字码用的展示字体，和界面一致：纸质复古用 Fraunces，其余用窄体的 Instrument Sans。 */
export function display(palette: PaletteId, weight = 650): { fontFamily: string; fontWeight: number; style: CSSProperties } {
  return palette === "paper"
    ? { fontFamily: `'Fraunces Variable', ${FONT}`, fontWeight: Math.max(400, weight - 130), style: {} }
    : { fontFamily: `'Instrument Sans Variable', ${FONT}`, fontWeight: Math.min(700, weight), style: { fontStretch: "84%" } };
}
