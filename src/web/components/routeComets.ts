import type { Map as MapLibreMap } from "maplibre-gl";
import type { Feature, LineString, Position } from "geojson";
import { globeView, isBehind } from "./globeLight";

interface Comet {
  coords: Position[];
  key: string;
  reverse: boolean;
  start: number;
  duration: number;
}

const MAX_COMETS = 6;
/** 尾迹占整条航线的比例，和取样段数 */
const TRAIL = 0.16;
const SEGMENTS = 18;

type RGB = readonly [number, number, number];

/**
 * 沿航线飞过的光点，带渐隐的尾迹。
 * 画在地图画布上面的 2D 画布里：每帧只投影几十个点，不触发 MapLibre 重绘，比改图层数据省得多。
 */
export function attachRouteComets(map: MapLibreMap): {
  setRoutes: (routes: Feature<LineString>[]) => void;
  setFocus: (key: string | null) => void;
  setColor: (c: RGB) => void;
  setGlobe: (v: boolean) => void;
  remove: () => void;
} {
  const canvas = document.createElement("canvas");
  canvas.className = "route-comets";
  // 放在标签（Marker）下面
  map.getCanvasContainer().append(canvas);
  const ctx = canvas.getContext("2d")!;

  let pool: Feature<LineString>[] = [];
  let focus: string | null = null;
  let color: RGB = [255, 255, 255];
  let globe = true;
  let comets: Comet[] = [];
  let nextAt = 0;
  let last = 0;
  let raf = 0;

  const size = () => {
    const el = map.getContainer();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = el.clientWidth * dpr;
    canvas.height = el.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  map.on("resize", size);

  const candidates = () => (focus ? pool.filter((f) => f.properties?.key === focus) : pool);

  const spawn = (now: number) => {
    const list = candidates().filter((f) => !comets.some((c) => c.key === f.properties!.key));
    if (!list.length) return;
    // 常飞的航线出现得多一些
    const weight = (f: Feature) => Math.sqrt(Number(f.properties!.count) || 1);
    let r = Math.random() * list.reduce((s, f) => s + weight(f), 0);
    const pick = list.find((f) => (r -= weight(f)) <= 0) ?? list[0];
    const coords = pick.geometry.coordinates;
    comets.push({
      coords,
      key: String(pick.properties!.key),
      reverse: Math.random() < 0.5,
      start: now,
      duration: 2400 + Math.min(3200, spanDegrees(coords) * 32),
    });
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // 上面浮着带背景模糊的面板，每画一帧它们都要重新模糊一次：限到约 30 帧
    if (now - last < 30) return;
    last = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (comets.length < (focus ? 1 : MAX_COMETS) && now >= nextAt) {
      spawn(now);
      nextAt = now + (focus ? 500 : 420 + Math.random() * 520);
    }
    comets = comets.filter((c) => now - c.start < c.duration);
    if (!comets.length) return;

    const view = globe ? globeView(map) : null;
    const center = map.getCenter().lng;
    const rgb = color.join(",");
    ctx.lineCap = "round";
    for (const c of comets) {
      const t = (now - c.start) / c.duration;
      // 头部走完全程后尾迹继续收进终点
      const head = t * (1 + TRAIL);
      // 航线经度是展开过的，平面地图要挪到视野所在的那一份世界里
      const mid = c.coords[c.coords.length >> 1][0];
      const shift = Math.round((center - mid) / 360) * 360;
      let prev: { x: number; y: number } | null = null;
      for (let i = 0; i <= SEGMENTS; i++) {
        const k = i / SEGMENTS;
        const s = head - TRAIL * (1 - k);
        if (s < 0 || s > 1) {
          prev = null;
          continue;
        }
        const [lon, lat] = sample(c.coords, c.reverse ? 1 - s : s);
        if (view && isBehind(view, lon, lat)) {
          prev = null;
          continue;
        }
        const p = map.project([lon + shift, lat]);
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
  // 页面在后台时浏览器会自动暂停 requestAnimationFrame
  raf = requestAnimationFrame(frame);

  return {
    setRoutes(routes) {
      pool = routes;
      comets = [];
      // 等航线的入场动画画完
      nextAt = performance.now() + 2200;
    },
    setFocus(key) {
      // 首次挂载时会带着 null 调一次，不能打断上面等入场动画的延时
      if (key === focus) return;
      focus = key;
      comets = key ? comets.filter((c) => c.key === key) : comets;
      nextAt = 0;
    },
    setColor(c) {
      color = c;
    },
    setGlobe(v) {
      globe = v;
    },
    remove() {
      cancelAnimationFrame(raf);
      map.off("resize", size);
      canvas.remove();
    },
  };
}

/** 折线上比例 s（0–1）处的点；航线的点沿大圆等距，按下标插值即可。 */
export function sample(coords: Position[], s: number): [number, number] {
  const f = Math.min(1, Math.max(0, s)) * (coords.length - 1);
  const i = Math.min(coords.length - 2, Math.floor(f));
  const [a, b] = [coords[i], coords[i + 1]];
  const k = f - i;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** 航线大致跨多少度，决定飞多久 */
function spanDegrees(coords: Position[]): number {
  let d = 0;
  for (let i = 8; i < coords.length; i += 8) {
    const [a, b] = [coords[i - 8], coords[i]];
    d += Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]);
  }
  return d;
}
