import { geoInterpolate } from "d3-geo";

/**
 * 航线动画的时间轴和镜头：纯函数，给定时间 t 就能算出那一帧的镜头和飞机位置，
 * 不依赖真实时钟。预览用 requestAnimationFrame 播放，导出时逐帧调用。
 */

export type LonLat = [number, number];

export interface Leg {
  dep: LonLat;
  arr: LonLat;
  depCode: string;
  arrCode: string;
  km: number;
}

export interface Segment {
  kind: "intro" | "leg" | "transfer" | "reposition" | "outro";
  start: number;
  end: number;
  /** leg / transfer / reposition：对应（或刚结束的）航段下标 */
  leg: number;
}

export interface Timeline {
  segments: Segment[];
  duration: number;
}

export const TIMING = {
  intro: 2.4,
  /** 每段航程按距离缩放，限制在 2–6 秒 */
  kmPerSecond: 1800,
  cruiseMin: 2,
  cruiseMax: 6,
  /** 起飞前、降落后的推拉镜头 */
  approach: 1,
  /** 同一机场转机 */
  transfer: 0.5,
  /** 下一段不从上一段的到达机场出发（例如中间坐了火车）：镜头飞过去 */
  reposition: 1.2,
  outroZoom: 1.2,
  endCard: 2.2,
};

export function legDuration(km: number): number {
  const cruise = Math.min(TIMING.cruiseMax, Math.max(TIMING.cruiseMin, km / TIMING.kmPerSecond));
  return TIMING.approach + cruise + TIMING.approach;
}

export function buildTimeline(legs: Leg[], opts: { speed?: number; endCard?: boolean } = {}): Timeline {
  const k = 1 / (opts.speed ?? 1);
  const segments: Segment[] = [];
  let t = 0;
  const push = (kind: Segment["kind"], d: number, leg: number) => {
    segments.push({ kind, start: t, end: t + d * k, leg });
    t += d * k;
  };
  push("intro", TIMING.intro, 0);
  legs.forEach((leg, i) => {
    if (i > 0) {
      const connected = legs[i - 1].arrCode === leg.depCode;
      push(connected ? "transfer" : "reposition", connected ? TIMING.transfer : TIMING.reposition, i);
    }
    push("leg", legDuration(leg.km), i);
  });
  push(
    "outro",
    TIMING.outroZoom + (opts.endCard === false ? 0.6 : TIMING.endCard),
    Math.max(0, legs.length - 1),
  );
  return { segments, duration: t };
}

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const logLerp = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

/** 镜头的缩放（由渲染器按投影和画面算好后传进来）。 */
export interface Scales {
  /** 贴近机场的近景 */
  near: number;
  /** 每段航程完整入画 */
  leg: number[];
  /** 整个行程入画 */
  overview: number;
  overviewCenter: LonLat;
}

export interface FrameState {
  center: LonLat;
  scale: number;
  /** 当前航段下标；-1 表示还没开始 */
  leg: number;
  /** 当前航段的飞行进度 0–1（飞机位置） */
  progress: number;
  /** 飞机是否可见 */
  flying: boolean;
  /** 片尾统计卡片的不透明度 */
  endCard: number;
  /** 当前航段起降机场标签的不透明度 */
  depLabel: number;
  arrLabel: number;
}

export function segmentAt(tl: Timeline, t: number): Segment {
  return tl.segments.find((s) => t < s.end) ?? tl.segments[tl.segments.length - 1];
}

/** 航段内：飞机在推拉镜头的中点起飞、中点落地；镜头先近后远再近。 */
function legPhase(u: number, total: number) {
  const a = TIMING.approach / total;
  const progress = easeInOut(clamp01((u - a * 0.5) / (1 - a)));
  const zoomOut = smoothstep(0, a * 1.8, u) * (1 - smoothstep(1 - a * 1.8, 1, u));
  return { progress, zoomOut };
}

export function frameAt(tl: Timeline, legs: Leg[], scales: Scales, t: number): FrameState {
  const seg = segmentAt(tl, t);
  const u = clamp01((t - seg.start) / (seg.end - seg.start || 1));
  const base: FrameState = {
    center: scales.overviewCenter,
    scale: scales.overview,
    leg: -1,
    progress: 0,
    flying: false,
    endCard: 0,
    depLabel: 0,
    arrLabel: 0,
  };
  if (legs.length === 0) return base;

  switch (seg.kind) {
    case "intro": {
      const e = easeInOut(smoothstep(0.4, 1, u));
      return {
        ...base,
        center: geoInterpolate(scales.overviewCenter, legs[0].dep)(e) as LonLat,
        scale: logLerp(scales.overview, scales.near, e),
        depLabel: smoothstep(0.7, 1, u),
      };
    }
    case "leg": {
      const leg = legs[seg.leg];
      const { progress, zoomOut } = legPhase(u, legDuration(leg.km));
      const plane = geoInterpolate(leg.dep, leg.arr)(progress) as LonLat;
      const mid = geoInterpolate(leg.dep, leg.arr)(0.5) as LonLat;
      return {
        ...base,
        center: geoInterpolate(plane, mid)(zoomOut) as LonLat,
        scale: logLerp(scales.near, scales.leg[seg.leg], zoomOut),
        leg: seg.leg,
        progress,
        flying: progress > 0 && progress < 1,
        depLabel: 1 - smoothstep(0.35, 0.55, u),
        arrLabel: smoothstep(0.6, 0.85, u),
      };
    }
    case "transfer":
      return {
        ...base,
        center: legs[seg.leg].dep,
        scale: scales.near,
        leg: seg.leg - 1,
        progress: 1,
        depLabel: 1,
      };
    case "reposition": {
      const e = easeInOut(u);
      const from = legs[seg.leg - 1].arr;
      const to = legs[seg.leg].dep;
      return {
        ...base,
        center: geoInterpolate(from, to)(e) as LonLat,
        scale: logLerp(scales.near, Math.max(scales.overview, scales.near / 3), Math.sin(Math.PI * e)),
        leg: seg.leg - 1,
        progress: 1,
        depLabel: smoothstep(0.6, 1, u),
      };
    }
    case "outro": {
      const zoomPart = TIMING.outroZoom / (seg.end - seg.start || 1) || 0.4;
      const e = easeInOut(smoothstep(0, zoomPart, u));
      const last = legs[legs.length - 1];
      return {
        ...base,
        center: geoInterpolate(last.arr, scales.overviewCenter)(e) as LonLat,
        scale: logLerp(scales.near, scales.overview, e),
        leg: legs.length - 1,
        progress: 1,
        endCard: smoothstep(zoomPart * 0.7, zoomPart * 0.7 + 0.18, u),
      };
    }
  }
}
