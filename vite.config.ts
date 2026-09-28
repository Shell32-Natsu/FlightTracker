import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => {
  // npm run build:demo：纯静态演示版，无 Worker；资源用相对路径，可放在任意子路径下
  const demo = mode === "demo";
  return {
    // remoteBindings: false —— 本地开发不连 Cloudflare（Workers AI 等远程绑定只在线上可用）
    plugins: demo ? [react()] : [react(), cloudflare({ remoteBindings: false })],
    base: demo ? "./" : "/",
    build: demo ? { outDir: "dist-demo", emptyOutDir: true } : undefined,
    // MapLibre 的 Web Worker 以 ES 模块打包（见 src/web/lib/maplibre.ts）
    worker: { format: "es" },
  };
});
