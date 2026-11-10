import { PerspectiveCamera, Vector3, type WebGLRenderer } from "three";
import { spec3DFor } from "./families";
import { cropWindow, outerPoints, viewBounds } from "./framing";
import { buildAircraft } from "./model";
import { createRenderer, createStage, releaseRenderer, type Stage } from "./stage";
import type { Paint } from "./usePaint";

/** 静态图的视角：偏侧面的四分之三视角，机头朝左 */
const DIR = new Vector3(-0.5, 0.2, 0.84).normalize();
/** 图宽（像素）和机身贴图尺寸 */
const SIZES = { card: [1280, 2048], thumb: [400, 1024] } as const;
export type SnapshotSize = keyof typeof SIZES;

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let shared: WebGLRenderer | null = null;

/**
 * 把一架飞机渲染成裁到边缘的透明图，返回 blob URL（这次会话里一直留着）。
 * 一张一张排队画，共用一个 WebGL 上下文，画完就还回去。
 */
export function aircraftSnapshot(key: string, type: string, paint: Paint, size: SnapshotSize): Promise<string> {
  let job = cache.get(key);
  if (!job) {
    pending++;
    job = queue.then(() => render(type, paint, size));
    cache.set(key, job);
    // 失败了不记住，下次再试
    queue = job
      .catch(() => cache.delete(key))
      .finally(() => {
        if (--pending === 0 && shared) {
          releaseRenderer(shared);
          shared = null;
        }
      });
  }
  return job;
}

async function render(type: string, paint: Paint, size: SnapshotSize): Promise<string> {
  const [width, textureSize] = SIZES[size];
  const spec = spec3DFor(type);
  if (!spec) throw new Error(`没有 ${type} 的 3D 参数`);
  // 机身标题的字体要先就位；也给页面留一口气
  await document.fonts?.load(`800 100px "Inter Variable"`).catch(() => {});
  await new Promise((r) => setTimeout(r));
  const renderer = (shared ??= createRenderer());
  const m = buildAircraft(spec, paint, textureSize);
  let stage: Stage | null = null;
  try {
    stage = createStage(renderer, m, 1024);
    const target = new Vector3(0, (stage.box.max.y + stage.box.min.y) / 2, 0);
    const distance = stage.R * 5;
    const b = viewBounds(outerPoints(m.root), target, DIR, distance);
    // 视锥罩住整架飞机，再用 view offset 只取飞机所在的那一块
    const { half, full, x, y, height } = cropWindow(b, width);
    const camera = new PerspectiveCamera((Math.atan(half) * 360) / Math.PI, 1, 1, distance * 3);
    camera.position.copy(target).addScaledVector(DIR, distance);
    camera.lookAt(target);
    camera.setViewOffset(full, full, x, y, width, height);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.render(stage.scene, camera);
    const blob = await new Promise<Blob | null>((r) => renderer.domElement.toBlob(r, "image/png"));
    if (!blob || renderer.getContext().isContextLost()) throw new Error("渲染失败");
    return URL.createObjectURL(blob);
  } finally {
    stage?.dispose();
    m.dispose();
  }
}
