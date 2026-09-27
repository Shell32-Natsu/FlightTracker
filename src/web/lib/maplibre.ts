import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre 6 默认用 new URL("./maplibre-gl-worker.mjs", import.meta.url) 找 Worker，
// 打包后这个文件不会被输出；改由 Vite 单独打包 Worker 并显式指定地址。
maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
