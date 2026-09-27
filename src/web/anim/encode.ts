import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from "mediabunny";
import type { Scene } from "./renderer";

export interface EncodeResult {
  blob: Blob;
  ext: "mp4" | "webm";
  codec: VideoCodec;
}

/**
 * 逐帧渲染并用 WebCodecs 编码（Mediabunny 负责封装）。
 * 优先 H.264 / HEVC 的 MP4（手机相册、社交软件都认）；浏览器没有这类编码器时退回 VP9 / VP8 的 WebM。
 */
export async function encodeScene(
  scene: Scene,
  opts: { fps: number; onProgress?: (p: number) => void; signal?: AbortSignal },
): Promise<EncodeResult> {
  if (typeof VideoEncoder === "undefined")
    throw new Error("这个浏览器不支持视频编码（WebCodecs），请换用新版 Chrome、Edge 或 Safari");
  const size = { width: scene.width, height: scene.height };
  let ext: EncodeResult["ext"] = "mp4";
  let codec = await getFirstEncodableVideoCodec(["avc", "hevc"], size);
  if (!codec) {
    ext = "webm";
    codec = await getFirstEncodableVideoCodec(["vp9", "vp8", "av1"], size);
  }
  if (!codec) throw new Error("这个浏览器没有可用的视频编码器");

  const canvas = document.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const output = new Output({
    format: ext === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: opts.fps });
  await output.start();

  const frames = Math.ceil(scene.duration * opts.fps);
  try {
    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) throw new DOMException("已取消", "AbortError");
      scene.draw(ctx, Math.min(scene.duration, i / opts.fps));
      await source.add(i / opts.fps, 1 / opts.fps);
      opts.onProgress?.((i + 1) / frames);
      // 让出主线程，进度条才能刷新
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }
  const buffer = output.target.buffer!;
  return { blob: new Blob([buffer], { type: ext === "mp4" ? "video/mp4" : "video/webm" }), ext, codec };
}
