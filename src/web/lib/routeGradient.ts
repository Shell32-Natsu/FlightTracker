import type { ExpressionSpecification } from "maplibre-gl";

const GOLD = [255, 207, 122];
const CORAL = [255, 122, 92];
/** 已画出部分与透明部分之间的过渡宽度（line-progress 单位） */
const EDGE = 0.0004;

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/**
 * 航线的 line-gradient：起点琥珀、终点珊瑚。
 * progress < 1 时只画出前面一段，用于入场动画。插值节点必须严格递增。
 */
export function routeGradient(
  progress: number,
  alpha: number,
  from: number[] = GOLD,
  to: number[] = CORAL,
): ExpressionSpecification {
  const rgba = (c: number[]) => `rgba(${c.join(",")},${alpha})`;
  if (progress >= 1 - EDGE * 2) {
    return ["interpolate", ["linear"], ["line-progress"], 0, rgba(from), 1, rgba(to)];
  }
  const p = Math.max(progress, EDGE);
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    rgba(from),
    p,
    rgba(mix(from, to, p)),
    p + EDGE,
    "rgba(0,0,0,0)",
    1,
    "rgba(0,0,0,0)",
  ];
}
