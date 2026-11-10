import type { Map as MapLibreMap } from "maplibre-gl";
import type { Feature, LineString, Position } from "geojson";
import { GlobeProjector, globeCamera, toVec, type ScreenPoint, type Vec3 } from "./globeProjector";

type RGB = readonly [number, number, number];

export interface ArcStyle {
  from: RGB;
  to: RGB;
  selected: string;
  /** 沿航线飞的光点 */
  comet: RGB;
  /** 外发光强度（深色主题）；0 为不画 */
  glow: number;
}

interface Arc {
  key: string;
  count: number;
  coords: Position[];
  vecs: Vec3[];
  /** 弧顶离地高度（球半径的倍数） */
  peak: number;
}

const STEPS = 48;
/** 光点：同时最多几个、尾迹占航线的比例、取样段数 */
const MAX_COMETS = 6;
const TRAIL = 0.16;
const SEGMENTS = 18;

/** 航线跨越的角度（弧度）→ 弧顶高度。短途几乎贴地，洲际航线明显拱起。 */
export function arcPeak(angle: number): number {
  return Math.min(0.2, 0.38 * (angle / Math.PI) ** 1.15);
}

/** 折线上比例 s（0–1）处的点；航线的点沿大圆等距，按下标插值即可。 */
export function sample(coords: Position[], s: number): [number, number] {
  const f = Math.min(1, Math.max(0, s)) * (coords.length - 1);
  const i = Math.min(coords.length - 2, Math.floor(f));
  const [a, b] = [coords[i], coords[i + 1]];
  const k = f - i;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

const lift = (peak: number, s: number) => peak * Math.sin(Math.PI * s);

function makeArc(f: Feature<LineString>): Arc {
  const coords = f.geometry.coordinates;
  const vecs = Array.from({ length: STEPS + 1 }, (_, i) => toVec(sample(coords, i / STEPS)));
  const [a, b] = [vecs[0], vecs[STEPS]];
  const angle = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  return { key: String(f.properties!.key), count: Number(f.properties!.count) || 1, coords, vecs, peak: arcPeak(angle) };
}

function makeCanvas(map: MapLibreMap, name: string) {
  const canvas = document.createElement("canvas");
  canvas.className = `map-overlay ${name}`;
  // Marker（三字码标签）之后才加进来，自然在它们下面
  map.getCanvasContainer().append(canvas);
  const ctx = canvas.getContext("2d")!;
  const size = () => {
    const el = map.getContainer();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = el.clientWidth * dpr;
    canvas.height = el.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  return { canvas, ctx, size };
}

export interface RouteArcs {
  setRoutes: (routes: Feature<LineString>[]) => void;
  setStyle: (s: ArcStyle) => void;
  /** 入场进度 0–1 */
  setProgress: (p: number) => void;
  setSelected: (key: string | null) => void;
  setHovered: (key: string | null) => void;
  setGlobe: (v: boolean) => void;
  /** 地球模式下离屏幕点最近的航线 */
  hit: (x: number, y: number) => string | null;
  remove: () => void;
}

/**
 * 地球上离地拱起的航线，和沿航线飞过的光点。
 *
 * MapLibre 的线图层只能贴在球面上，所以航线自己按地球相机投影画到上层的 2D 画布里
 * （航线画布只在地图重绘时跟着画；光点单独一层，限到约 30 帧，不触发地图重绘）。
 * 平面地图仍用 MapLibre 的线图层，这里只画光点。
 */
export function attachRouteArcs(map: MapLibreMap, opts: { comets: boolean }): RouteArcs {
  const lines = makeCanvas(map, "route-arcs");
  const sparks = opts.comets ? makeCanvas(map, "route-comets") : null;

  let arcs: Arc[] = [];
  let style: ArcStyle = { from: [255, 255, 255], to: [255, 255, 255], selected: "#fff", comet: [255, 255, 255], glow: 0 };
  let progress = 0;
  let selected: string | null = null;
  let hovered: string | null = null;
  let globe = true;
  /** 最近一次画出来的航线（屏幕坐标），点击和悬停用 */
  let drawn: { key: string; pts: ScreenPoint[] }[] = [];

  const onResize = () => {
    lines.size();
    sparks?.size();
    draw();
  };
  map.on("resize", onResize);
  map.on("render", draw);

  /** 放得很大时弧线压平，免得从镜头前面飞过去 */
  const flatten = (R: number, D: number) => Math.min(1, Math.max(0, (2.8 - R / D) / 1.6));

  function draw() {
    const { ctx, canvas } = lines;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawn = [];
    if (!globe || progress <= 0 || !arcs.length) return;
    const cam = globeCamera(map);
    const proj = new GlobeProjector(cam);
    const flat = flatten(cam.R, cam.D);
    const limit = progress * STEPS;
    ctx.lineCap = ctx.lineJoin = "round";
    // 航线特别多时省掉最宽的那层光
    const passes =
      style.glow <= 0 ? [] : arcs.length > 160 ? [[4, 0.16 * style.glow]] : [[9, 0.07 * style.glow], [4.5, 0.15 * style.glow]];

    const paint = (arc: Arc) => {
      const pts: ScreenPoint[] = [];
      for (let i = 0; i <= STEPS && i <= limit; i++) pts.push(proj.project(arc.vecs[i], lift(arc.peak * flat, i / STEPS)));
      drawn.push({ key: arc.key, pts });
      const path = new Path2D();
      let pen = false;
      let first: ScreenPoint | null = null;
      let last: ScreenPoint | null = null;
      for (const p of pts) {
        if (!p.visible) {
          pen = false;
          continue;
        }
        if (pen) path.lineTo(p.x, p.y);
        else path.moveTo(p.x, p.y);
        pen = true;
        first ??= p;
        last = p;
      }
      if (!first || !last || first === last) return;
      const isSel = arc.key === selected;
      const isHover = arc.key === hovered;
      const dim = selected && !isSel ? 0.16 : 1;
      const width = 1.5 + Math.min(1.7, Math.log2(arc.count) * 0.55);
      const color = (a: number) => {
        if (isSel) return style.selected;
        const g = ctx.createLinearGradient(first!.x, first!.y, last!.x, last!.y);
        g.addColorStop(0, `rgba(${style.from.join(",")},${a})`);
        g.addColorStop(1, `rgba(${style.to.join(",")},${a})`);
        return g;
      };
      if (dim === 1)
        for (const [w, a] of passes) {
          ctx.strokeStyle = color(a);
          ctx.globalAlpha = isSel ? a : 1;
          ctx.lineWidth = width + w;
          ctx.stroke(path);
        }
      ctx.globalAlpha = dim;
      ctx.strokeStyle = color(1);
      ctx.lineWidth = isSel ? 2.8 : isHover ? width + 1.2 : width;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    };
    // 选中 / 悬停的最后画，压在上面
    const top = (a: Arc) => (a.key === selected ? 2 : a.key === hovered ? 1 : 0);
    for (const arc of [...arcs].sort((a, b) => top(a) - top(b))) paint(arc);
  }

  // ---------------------------------------------------------------- 光点
  interface Comet {
    arc: Arc;
    reverse: boolean;
    start: number;
    duration: number;
  }
  let comets: Comet[] = [];
  let nextAt = 0;
  let last = 0;
  let raf = 0;

  const spawn = (now: number) => {
    const list = arcs.filter((a) => (!selected || a.key === selected) && !comets.some((c) => c.arc === a));
    if (!list.length) return;
    // 常飞的航线出现得多一些
    let r = Math.random() * list.reduce((s, a) => s + Math.sqrt(a.count), 0);
    const arc = list.find((a) => (r -= Math.sqrt(a.count)) <= 0) ?? list[0];
    comets.push({ arc, reverse: Math.random() < 0.5, start: now, duration: 2400 + Math.min(3200, arc.peak * 22000) });
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    // 上面浮着带背景模糊的面板，每画一帧它们都要重新模糊一次：限到约 30 帧
    if (now - last < 30 || !sparks) return;
    last = now;
    const { ctx, canvas } = sparks;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (comets.length < (selected ? 1 : MAX_COMETS) && now >= nextAt) {
      spawn(now);
      nextAt = now + (selected ? 500 : 420 + Math.random() * 520);
    }
    comets = comets.filter((c) => now - c.start < c.duration);
    if (!comets.length) return;

    const cam = globe ? globeCamera(map) : null;
    const proj = cam && new GlobeProjector(cam);
    const flat = cam ? flatten(cam.R, cam.D) : 0;
    const center = map.getCenter().lng;
    const rgb = cometColor.join(",");
    ctx.lineCap = "round";
    for (const c of comets) {
      // 头部走完全程后尾迹继续收进终点
      const head = ((now - c.start) / c.duration) * (1 + TRAIL);
      // 航线经度是展开过的，平面地图要挪到视野所在的那一份世界里
      const shift = Math.round((center - c.arc.coords[c.arc.coords.length >> 1][0]) / 360) * 360;
      let prev: ScreenPoint | null = null;
      for (let i = 0; i <= SEGMENTS; i++) {
        const k = i / SEGMENTS;
        const at = head - TRAIL * (1 - k);
        if (at < 0 || at > 1) {
          prev = null;
          continue;
        }
        const s = c.reverse ? 1 - at : at;
        const [lon, lat] = sample(c.arc.coords, s);
        const p: ScreenPoint = proj
          ? proj.project(toVec([lon, lat]), lift(c.arc.peak * flat, s))
          : { ...pick(map.project([lon + shift, lat])), visible: true };
        if (!p.visible) {
          prev = null;
          continue;
        }
        if (prev) {
          ctx.strokeStyle = `rgba(${rgb},${(k * k * 0.9).toFixed(3)})`;
          ctx.lineWidth = 0.6 + k * 2;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        prev = p;
        if (i === SEGMENTS) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
          g.addColorStop(0, `rgba(${rgb},0.75)`);
          g.addColorStop(0.3, `rgba(${rgb},0.28)`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };
  let cometColor: RGB = [255, 255, 255];
  // 页面在后台时浏览器会自动暂停 requestAnimationFrame
  if (sparks) raf = requestAnimationFrame(tick);

  return {
    setRoutes(routes) {
      arcs = routes.map(makeArc);
      comets = [];
      // 等 setProgress 从头画起，免得新航线先完整闪一帧
      progress = 0;
      sparks?.ctx.clearRect(0, 0, sparks.canvas.clientWidth, sparks.canvas.clientHeight);
      // 等航线的入场动画画完
      nextAt = performance.now() + 2200;
      draw();
    },
    setStyle(s) {
      style = s;
      cometColor = s.comet;
      draw();
    },
    setProgress(p) {
      progress = p;
      draw();
    },
    setSelected(key) {
      // 首次挂载时会带着 null 调一次，不能打断上面等入场动画的延时
      if (key === selected) return;
      selected = key;
      comets = key ? comets.filter((c) => c.arc.key === key) : comets;
      nextAt = 0;
      draw();
    },
    setHovered(key) {
      if (key === hovered) return;
      hovered = key;
      draw();
    },
    setGlobe(v) {
      globe = v;
      draw();
    },
    hit(x, y) {
      let best: string | null = null;
      let min = 10;
      for (const { key, pts } of drawn)
        for (let i = 1; i < pts.length; i++) {
          if (!pts[i - 1].visible || !pts[i].visible) continue;
          const d = segmentDistance(x, y, pts[i - 1], pts[i]);
          if (d < min) {
            min = d;
            best = key;
          }
        }
      return best;
    },
    remove() {
      cancelAnimationFrame(raf);
      map.off("resize", onResize);
      map.off("render", draw);
      lines.canvas.remove();
      sparks?.canvas.remove();
    },
  };
}

const pick = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

export function segmentDistance(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}
