import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // MapLibre 的 Web Worker 以 ES 模块打包（见 src/web/lib/maplibre.ts）
  worker: { format: "es" },
});
