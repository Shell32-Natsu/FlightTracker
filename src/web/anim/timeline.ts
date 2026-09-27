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
  intro: 2.8,
  /** 每段航程按距离缩放，限制在 2–6 秒 */
  kmPerSecond: 1800,
  cruiseMin: 2,
  cruiseMax: 6,
  /** 起飞前、降落后的推拉镜头 */
  approach: 1,
  /** 同一机场转机 */
  transfer: 0.5,
  /** 下一段不从上一段的到达机场出发（例如中间坐了火车）：镜头飞过去 */
  reposition: 1.6,
  outroZoom: 1.6,
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
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeOutQuad = (x: number) => 1 - (1 - clamp01(x)) ** 2;
/** 慢起、快中段、慢收的缩放曲线；比三次方更“有冲劲”，但最大速度仍可控 */
const easeInOutSine = (x: number) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;
/** 0 → 峰值 → 0 的平滑鼓包（sin²），两端导数为 0，衔接处不跳。 */
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);
const logLerp = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

/**
 * 镜头参数。每段航程只有一次拉远和一次推近，机场处不做额外推拉，保持稳定。
 */
export const CAMERA = {
  /** 片头先比全景再远一点，缓缓推进 */
  introWide: 0.86,
  /** 起飞后拉远、降落前推近的时长（秒），以及中间最少停留 */
  pullOut: 1.5,
  pushIn: 1.5,
  minHold: 0.6,
  /** 镜头略微领先飞机（航程比例） */
  lead: 0.06,
  /** 片尾卡片期间继续缓缓拉远 */
  outroDrift: 0.9,
};

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

/**
 * 航段内的镜头：起飞后平滑拉远到整段入画，停留，降落前平滑推近。
 * 只缩放这一次；镜头略微领先飞机。飞机在推拉段的中点起飞、中点落地。
 */
function legCamera(u: number, total: number) {
  const a = TIMING.approach / total;
  const progress = easeInOut(clamp01((u - a * 0.5) / (1 - a)));
  // 拉远 / 推近按秒计；短航段压缩两者，保证中间至少停一会儿看全程
  let outDur = CAMERA.pullOut / total;
  let inDur = CAMERA.pushIn / total;
  const k = Math.min(1, (1 - a - CAMERA.minHold / total) / (outDur + inDur));
  outDur *= k;
  inDur *= k;
  const out = easeInOutSine((u - a * 0.5) / outDur);
  const back = easeInOutSine((u - (1 - a * 0.5 - inDur)) / inDur);
  return { progress, zoomOut: Math.max(0, Math.min(out, 1 - back)) };
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
      // 先在全景上停留、慢慢推进；随后镜头先平移、后俯冲（缩放比平移晚半拍）
      const s0 = scales.overview * CAMERA.introWide;
      const hold = logLerp(s0, scales.overview, easeOut(u / 0.4));
      const pan = easeInOutSine((u - 0.3) / 0.6);
      const dive = easeInOutSine((u - 0.38) / 0.62);
      return {
        ...base,
        center: geoInterpolate(scales.overviewCenter, legs[0].dep)(pan) as LonLat,
        scale: logLerp(hold, scales.near, dive),
        depLabel: smoothstep(0.7, 1, u),
      };
    }
    case "leg": {
      const leg = legs[seg.leg];
      const cam = legCamera(u, legDuration(leg.km));
      const route = geoInterpolate(leg.dep, leg.arr);
      const progress = cam.progress;
      // 镜头看向飞机前方一点，拉远时逐渐移到航线中点
      const lookAt = route(Math.min(1, progress + CAMERA.lead * cam.zoomOut)) as LonLat;
      const mid = route(0.5) as LonLat;
      return {
        ...base,
        // 平方：镜头拉得够远之后才移向中点，刚起飞时飞机不会被甩到画面边缘
        center: geoInterpolate(lookAt, mid)(cam.zoomOut ** 2) as LonLat,
        scale: logLerp(scales.near, scales.leg[seg.leg], cam.zoomOut),
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
      // 平移时先拉远再推近（弧形缩放），距离越远拉得越开
      const e = easeInOut(u);
      const from = legs[seg.leg - 1].arr;
      const to = legs[seg.leg].dep;
      const far = Math.max(scales.overview, scales.near / (2 + geoDistanceDeg(from, to) / 8));
      return {
        ...base,
        center: geoInterpolate(from, to)(e) as LonLat,
        scale: logLerp(scales.near, far, bump(u)),
        leg: seg.leg - 1,
        progress: 1,
        depLabel: smoothstep(0.6, 1, u),
      };
    }
    case "outro": {
      // 快速拉回全景（ease-out），卡片出现后继续缓慢拉远
      const zoomPart = TIMING.outroZoom / (seg.end - seg.start || 1) || 0.4;
      const e = easeOutQuad(u / zoomPart);
      const pan = easeInOut(smoothstep(0, zoomPart, u));
      const drift = logLerp(1, CAMERA.outroDrift, smoothstep(zoomPart * 0.6, 1, u));
      const last = legs[legs.length - 1];
      return {
        ...base,
        center: geoInterpolate(last.arr, scales.overviewCenter)(pan) as LonLat,
        scale: logLerp(scales.near, scales.overview, e) * drift,
        leg: legs.length - 1,
        progress: 1,
        endCard: smoothstep(zoomPart * 0.7, zoomPart * 0.7 + 0.18, u),
      };
    }
  }
}

function geoDistanceDeg(a: LonLat, b: LonLat): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
}
