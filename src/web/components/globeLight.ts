import type { Map as MapLibreMap } from "maplibre-gl";
import { discRadius, globeCamera } from "./globeProjector";

const RAD = Math.PI / 180;

/** 以 center 为视野中心时，让这些点放进 width × height 的缩放级别（按正射投影近似，留一点余量）。 */
export function zoomToFit(points: [number, number][], center: [number, number], width: number, height: number): number {
  const [lng0, lat0] = center;
  const [s0, c0] = [Math.sin(lat0 * RAD), Math.cos(lat0 * RAD)];
  let x = 1e-4;
  let y = 1e-4;
  for (const [lng, lat] of points) {
    const [s, c] = [Math.sin(lat * RAD), Math.cos(lat * RAD)];
    const d = (lng - lng0) * RAD;
    x = Math.max(x, Math.abs(c * Math.sin(d)));
    y = Math.max(y, Math.abs(c0 * s - s0 * c * Math.cos(d)));
  }
  const R = 0.92 * Math.min(Math.max(40, width) / 2 / x, Math.max(40, height) / 2 / y);
  return Math.log2((R * 2 * Math.PI * c0) / 512);
}

/** 光照层的基准直径，实际大小用 transform 缩放（只走合成，不重绘渐变） */
const BASE = 800;
/** 光晕层相对球面的倍数，与 styles.css 的 --globe-halo 里的比例对应（1 / 1.44 ≈ 69.5%） */
const HALO = 1.44;

/**
 * 给 MapLibre 的平光地球加上体积感：画布后面一圈大气光晕，画布上面一层球面明暗。
 * 颜色是 CSS 变量（--globe-halo / --globe-shade），跟着主题走。放大到地球占满屏幕后淡出。
 */
export function attachGlobeLight(map: MapLibreMap): { setVisible: (v: boolean) => void; remove: () => void } {
  const host = map.getCanvasContainer();
  const canvas = map.getCanvas();
  const make = (name: string) => {
    const el = document.createElement("div");
    el.className = `globe-light ${name}`;
    el.style.width = el.style.height = `${BASE}px`;
    return el;
  };
  const halo = make("globe-halo");
  const shade = make("globe-shade");
  host.insertBefore(halo, canvas);
  canvas.after(shade);

  let visible = true;
  const show = (opacity: number) => {
    for (const el of [halo, shade]) {
      // 完全淡出后不留合成层（放大时它会被缩放到几万像素）
      el.style.display = opacity > 0 ? "" : "none";
      el.style.opacity = String(opacity);
    }
  };
  const update = () => {
    if (!visible) return show(0);
    const c = globeCamera(map);
    const r = discRadius(c.D, c.R);
    const half = Math.hypot(canvas.clientWidth, canvas.clientHeight) / 2;
    // 球的边缘快出画面时开始淡出
    const fade = Math.min(1, Math.max(0, (half * 1.7 - r) / (half * 0.9)));
    show(fade);
    if (fade === 0) return;
    const at = `translate(${c.x - BASE / 2}px, ${c.y - BASE / 2}px)`;
    halo.style.transform = `${at} scale(${(r * 2 * HALO) / BASE})`;
    shade.style.transform = `${at} scale(${(r * 2) / BASE})`;
  };
  update();
  map.on("move", update);
  map.on("resize", update);

  return {
    setVisible(v) {
      visible = v;
      update();
    },
    remove() {
      map.off("move", update);
      map.off("resize", update);
      halo.remove();
      shade.remove();
    },
  };
}
