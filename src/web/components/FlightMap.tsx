import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatLike,
  Map as MapLibreMap,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import greatCircle from "@turf/great-circle";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import type { Flight } from "../../shared/types";
import { resolveHomeAirport, routeKey } from "../../shared/stats";
import { maplibregl } from "../lib/maplibre";
import type { RefData } from "../lib/refdata";
import { joinAntimeridian, unwrapGeometry } from "../lib/antimeridian";
import { routeGradient } from "../lib/routeGradient";
import { attachGlobeLight, zoomToFit } from "./globeLight";
import { GlobeProjector, globeCamera, toVec } from "./globeProjector";
import { attachRouteArcs, type RouteArcs } from "./routeArcs";
import { THEMES, useThemeColors, type ThemeColors } from "../lib/theme";

export type MapProjection = "globe" | "mercator";

export interface FlightMapHandle {
  resetView: () => void;
  zoomBy: (delta: number) => void;
}

export interface RouteHover {
  key: string;
  x: number;
  y: number;
}

interface Props {
  flights: Flight[];
  refData: RefData;
  world: Topology | undefined;
  /** 国界加载失败：不用等它 */
  worldFailed: boolean;
  projection: MapProjection;
  /** 设置里指定的“大本营”机场；null 时按起降次数自动选择 */
  homeAirport: string | null;
  selectedRoute: string | null;
  onSelectRoute: (key: string | null) => void;
  onHoverRoute: (hover: RouteHover | null) => void;
}

/** 夜航主题的配色：只有它的机场点是纯白的 */
const C = THEMES.night.colors.map;

const dotColor = (c: ThemeColors["map"]) => (c.ocean === C.ocean ? "#ffffff" : c.land);

/** 各图层随主题变化的颜色 */
function themePaint(map: MapLibreMap, c: ThemeColors["map"]) {
  map.setPaintProperty("ocean", "background-color", c.ocean);
  map.setPaintProperty("graticule", "line-color", c.graticule);
  map.setPaintProperty("countries-fill", "fill-color", ["case", ["get", "visited"], c.visited, c.land]);
  map.setPaintProperty("countries-line", "line-color", ["case", ["get", "visited"], c.visitedBorder, c.border]);
  map.setPaintProperty("routes-selected", "line-color", c.selected);
  map.setPaintProperty("routes-shadow", "line-color", c.routeShadow);
  map.setPaintProperty("airports-halo", "circle-color", c.airport);
  map.setPaintProperty("airports-dot", "circle-stroke-color", c.airport);
  map.setPaintProperty("airports-dot", "circle-color", dotColor(c));
}

/** 地球：只留地面投影，航线由 routeArcs 画；平面地图：用线图层，选中时其余退到后面 */
function paintRoutes(map: MapLibreMap, globe: boolean, selected: string | null) {
  map.setPaintProperty("routes-shadow", "line-opacity", globe ? (selected ? 0.25 : 1) : 0);
  map.setPaintProperty("routes-line", "line-opacity", globe ? 0 : selected ? 0.22 : 1);
  map.setPaintProperty("routes-glow", "line-opacity", globe ? 0 : selected ? 0.15 : 1);
  map.setPaintProperty("routes-selected", "line-opacity", globe ? 0 : 0.95);
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** 底图样式：海洋底色随主题，其余图层加载后再加。大气由 globeLight 画，关掉 MapLibre 自带的（只亮一侧、浅色主题下会发白） */
const styleFor = (c: ThemeColors["map"]): StyleSpecification => ({
  version: 8,
  projection: { type: "globe" },
  sky: { "atmosphere-blend": 0 },
  sources: {},
  layers: [{ id: "ocean", type: "background", paint: { "background-color": c.ocean } }],
});

/** 机场点半径：到访次数开方后线性插值（sqrt(count) 为 1 时 2.4px，为 6 时 5px）。图层和标签共用。 */
const DOT = { from: 1, r0: 2.4, to: 6, r1: 5 };
const DOT_RADIUS_EXPR = ["interpolate", ["linear"], ["sqrt", ["get", "count"]], DOT.from, DOT.r0, DOT.to, DOT.r1] as const;

function dotRadius(count: number): number {
  const t = (Math.sqrt(count) - DOT.from) / (DOT.to - DOT.from);
  return DOT.r0 + (DOT.r1 - DOT.r0) * Math.min(1, Math.max(0, t));
}

/** 预热最多等这么久；国界数据最多等这么久 */
const PRIME_TIMEOUT = 3000;
const WORLD_TIMEOUT = 2500;

const SOURCES = ["graticule", "countries", "routes", "airports"] as const;

/** 等到所有数据源的瓦片都加载好、并且画过一帧；signal 中止后不再等，也不会完成 */
function painted(map: MapLibreMap, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (!SOURCES.every((s) => map.isSourceLoaded(s)) || !map.areTilesLoaded()) return;
      map.off("render", check);
      resolve();
    };
    map.on("render", check);
    signal.addEventListener("abort", () => map.off("render", check));
    map.triggerRepaint();
  });
}

/** 等 GPU 把已经提交的活做完（着色器编译、上传、绘制都是排队异步执行的） */
function gpuIdle(map: MapLibreMap): Promise<void> {
  const gl = map.getCanvas().getContext("webgl2");
  const sync = gl?.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!gl || !sync) return Promise.resolve();
  gl.flush();
  return new Promise((resolve) => {
    const poll = () => {
      if (!gl.isContextLost() && gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return void setTimeout(poll, 16);
      gl.deleteSync(sync);
      resolve();
    };
    setTimeout(poll, 16);
  });
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function graticule(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const coords = [];
    for (let lat = -80; lat <= 80; lat += 2) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 2) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

/** 交互航线地图：3D 地球 + 发光渐变航线 + 机场光点，不依赖外部瓦片。 */
export const FlightMap = forwardRef<FlightMapHandle, Props>(function FlightMap(
  { flights, refData, world, worldFailed, projection, homeAirport, selectedRoute, onSelectRoute, onHoverRoute },
  handle,
) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lightRef = useRef<ReturnType<typeof attachGlobeLight> | null>(null);
  const arcsRef = useRef<RouteArcs | null>(null);
  const globeRef = useRef(true);
  const selectedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  /** 预热完成：地图可以淡入、开始入场动画 */
  const [primed, setPrimed] = useState(false);
  const [worldLate, setWorldLate] = useState(false);
  const colors = useThemeColors();
  const colorsRef = useRef(colors.map);
  const paintedColors = useRef<ThemeColors | null>(null);
  const callbacks = useRef({ onSelectRoute, onHoverRoute });
  callbacks.current = { onSelectRoute, onHoverRoute };

  const layers = useMemo(() => buildLayers(flights, refData, homeAirport), [flights, refData, homeAirport]);
  const homeRef = useRef(layers.home);
  homeRef.current = layers.home;

  const countries = useMemo<FeatureCollection>(() => {
    if (!world) return EMPTY;
    const fc = feature(world, world.objects.countries as GeometryCollection) as FeatureCollection;
    return {
      type: "FeatureCollection",
      features: fc.features.map((f) => ({
        ...f,
        geometry: unwrapGeometry(f.geometry),
        properties: { ...f.properties, visited: layers.visitedNumeric.has(String(f.id)) },
      })),
    };
  }, [world, layers.visitedNumeric]);

  /** 以“大本营”（设置里指定的，或起降最多的）为中心；地球直径约占视口短边的 80%（手机上占满宽度）。 */
  const initialView = () => {
    const w = container.current?.clientWidth ?? 1000;
    const h = container.current?.clientHeight ?? 800;
    const mobile = w < 600;
    // 手机：上方统计、下方时间轴和 Dock；宽屏：左侧信息、底部时间轴
    const top = mobile ? Math.min(176, h * 0.22) : 0;
    const bottom = mobile ? 176 : 84;
    const left = w >= 1200 ? 280 : w >= 800 ? 250 : 0;
    const diameter = mobile ? Math.min(w * 0.96, h - top - bottom) : Math.min(w - left, h - bottom) * 0.9;
    // 缩放级别 0 时地球周长为 512px
    const zoom = Math.log2((diameter * Math.PI) / 512);
    const home = homeRef.current;
    return {
      center: (home ? [home.lon, Math.max(-35, Math.min(45, home.lat - 6))] : [110, 20]) as LngLatLike,
      zoom: Math.max(0, zoom),
      padding: { top, bottom, left, right: 0 },
    };
  };

  /** 入场的起点：东边 70°、略远。不跨整数缩放级，免得动画中途换一批瓦片。 */
  const entranceView = () => {
    const view = initialView();
    const [lon, lat] = view.center as [number, number];
    const zoom = Math.min(view.zoom, Math.max(view.zoom - 0.4, Math.floor(view.zoom) + 0.01));
    return { center: [lon + 70, lat] as LngLatLike, zoom, padding: view.padding };
  };

  useImperativeHandle(handle, () => ({
    resetView: () => mapRef.current?.flyTo({ ...initialView(), pitch: 0, bearing: 0, duration: 1600 }),
    zoomBy: (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 300 }),
  }));

  // 初始化地图（只做一次）
  useEffect(() => {
    const view = entranceView();
    const map = new maplibregl.Map({
      container: container.current!,
      style: styleFor(colorsRef.current),
      center: view.center,
      zoom: view.zoom,
      attributionControl: false,
      renderWorldCopies: true,
      maxPitch: 0,
      dragRotate: false,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    map.setPadding(view.padding);
    lightRef.current = attachGlobeLight(map);
    // 系统要求减少动态效果时不放光点
    const arcs = attachRouteArcs(map, { comets: !reducedMotion() });
    arcsRef.current = arcs;
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Natural Earth · OurAirports" }),
      "bottom-right",
    );

    map.on("load", () => {
      // 版权信息默认收起成一个小图标
      map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      // 一开始就按当前主题、地球投影的最终样子建图层：先建后改会触发 300ms 的过渡，
      // 白画十几帧，还要多编译着色器
      const c = colorsRef.current;
      for (const id of SOURCES)
        map.addSource(id, {
          type: "geojson",
          data: id === "graticule" ? graticule() : EMPTY,
          lineMetrics: id === "routes",
        });

      map.addLayer({
        id: "graticule",
        type: "line",
        source: "graticule",
        paint: { "line-color": c.graticule, "line-width": 1 },
      });
      map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "countries",
        paint: { "fill-color": ["case", ["get", "visited"], c.visited, c.land] },
      });
      map.addLayer({
        id: "countries-line",
        type: "line",
        source: "countries",
        paint: {
          "line-color": ["case", ["get", "visited"], c.visitedBorder, c.border],
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 5, 1],
        },
      });
      // 地球上拱弧在地面的投影，衬出离地的高度
      map.addLayer({
        id: "routes-shadow",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.routeShadow, "line-width": 2.4, "line-blur": 2.2 },
      });
      map.addLayer({
        id: "routes-glow",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": routeGradient(0, 0.35),
          "line-width": ["interpolate", ["linear"], ["get", "count"], 1, 7, 8, 16],
          "line-blur": 7,
          "line-opacity": 0,
        },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": routeGradient(0, 1),
          "line-width": ["interpolate", ["linear"], ["get", "count"], 1, 1.5, 8, 3.4],
          "line-opacity": 0,
        },
      });
      map.addLayer({
        id: "routes-selected",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "key"], ""],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.selected, "line-width": 2.6, "line-opacity": 0 },
      });
      map.addLayer({
        id: "routes-hit",
        type: "line",
        source: "routes",
        paint: { "line-color": "#000", "line-opacity": 0, "line-width": 16 },
      });
      map.addLayer({
        id: "airports-halo",
        type: "circle",
        source: "airports",
        paint: {
          "circle-color": c.airport,
          "circle-opacity": 0.16,
          "circle-blur": 0.7,
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 8, 6, 20],
          "circle-pitch-alignment": "map",
        },
      });
      map.addLayer({
        id: "airports-dot",
        type: "circle",
        source: "airports",
        paint: {
          "circle-color": dotColor(c),
          "circle-stroke-color": c.airport,
          "circle-stroke-width": 1.5,
          "circle-radius": DOT_RADIUS_EXPR as unknown as ExpressionSpecification,
          "circle-pitch-alignment": "map",
        },
      });

      // 地球上航线是自己画的拱弧，按屏幕距离判断；平面地图用线图层
      const routeAt = (pt: { x: number; y: number }): string | null => {
        if (globeRef.current) return arcs.hit(pt.x, pt.y);
        const f = map.queryRenderedFeatures([pt.x, pt.y], { layers: ["routes-hit"] })[0];
        return f ? String(f.properties.key) : null;
      };
      let over: string | null = null;
      const hover = (key: string | null, pt?: { x: number; y: number }) => {
        if (key !== over) {
          over = key;
          map.getCanvas().style.cursor = key ? "pointer" : "";
          arcs.setHovered(key);
          if (!key) callbacks.current.onHoverRoute(null);
        }
        if (key && pt) callbacks.current.onHoverRoute({ key, x: pt.x, y: pt.y });
      };
      // 触屏点一下也会补发 mousemove，悬停提示只给有指针的设备
      const canHover = window.matchMedia?.("(hover: hover)").matches ?? true;
      if (canHover) map.on("mousemove", (e) => hover(map.isMoving() ? null : routeAt(e.point), e.point));
      map.on("mouseout", () => hover(null));
      map.on("click", (e) => callbacks.current.onSelectRoute(routeAt(e.point)));

      setReady(true);
    });

    // 画布尺寸和容器对不上时，地球会按错误的宽高比画成椭圆、机场标签也会错位。
    // MapLibre 的竞态：地球投影下样式加载完成时只按容器尺寸更新相机、不更新画布；
    // 如果建图到样式加载之间容器变了（手机地址栏伸缩），随后 ResizeObserver 的首次回调
    // 看到容器和相机一致就跳过，画布就一直停在旧尺寸。加载完成、每次静止、回到前台、
    // 视口变化和 WebGL 上下文恢复时都核对一次，对不上就重新 resize。
    const syncSize = () => {
      const el = map.getContainer();
      const canvas = map.getCanvas();
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h || !canvas.width || !canvas.height) return;
      const stretched =
        Math.abs(canvas.clientWidth - w) > 1 ||
        Math.abs(canvas.clientHeight - h) > 1 ||
        Math.abs(canvas.width / canvas.height - w / h) > 0.01;
      if (stretched) map.resize();
    };
    // 视口（尤其是 iOS 地址栏）稳定下来需要一点时间
    const timers = new Set<number>();
    const syncSoon = () => {
      if (document.visibilityState === "hidden") return;
      requestAnimationFrame(syncSize);
      for (const ms of [250, 800]) {
        const t = window.setTimeout(() => {
          timers.delete(t);
          syncSize();
        }, ms);
        timers.add(t);
      }
    };
    const viewport = window.visualViewport;
    document.addEventListener("visibilitychange", syncSoon);
    window.addEventListener("pageshow", syncSoon);
    window.addEventListener("orientationchange", syncSoon);
    window.addEventListener("resize", syncSoon);
    viewport?.addEventListener("resize", syncSoon);
    map.on("webglcontextrestored", syncSoon);
    map.once("load", syncSoon);
    map.on("idle", syncSize);

    return () => {
      document.removeEventListener("visibilitychange", syncSoon);
      window.removeEventListener("pageshow", syncSoon);
      window.removeEventListener("orientationchange", syncSoon);
      window.removeEventListener("resize", syncSoon);
      viewport?.removeEventListener("resize", syncSoon);
      map.off("idle", syncSize);
      for (const t of timers) clearTimeout(t);
      lightRef.current?.remove();
      arcs.remove();
      lightRef.current = arcsRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 投影切换
  useEffect(() => {
    if (!ready) return;
    mapRef.current!.setProjection({ type: projection });
    globeRef.current = projection === "globe";
    lightRef.current?.setVisible(globeRef.current);
    arcsRef.current?.setGlobe(globeRef.current);
    paintRoutes(mapRef.current!, globeRef.current, selectedRef.current);
  }, [projection, ready]);

  // 国界
  useEffect(() => {
    if (!ready) return;
    (mapRef.current!.getSource("countries") as GeoJSONSource).setData(countries);
  }, [countries, ready]);

  // 航线和机场的数据
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    (map.getSource("routes") as GeoJSONSource).setData(layers.routes);
    (map.getSource("airports") as GeoJSONSource).setData(layers.airports);
    arcsRef.current?.setRoutes(layers.routes.features);
  }, [layers, ready]);

  // 国界迟迟不来就不等了
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setWorldLate(true), WORLD_TIMEOUT);
    return () => clearTimeout(t);
  }, [ready]);

  // 预热：着色器编译、瓦片上传都发生在第一次画的时候，会卡住主线程。
  // 先在看不见的时候把终点和起点两个视角各画一遍，入场动画里就只剩画面移动。
  const canPrime = ready && (!!world || worldFailed || worldLate);
  useEffect(() => {
    if (!canPrime) return;
    const map = mapRef.current!;
    // 超时（很慢，或者页面切到了后台）就放弃：入场开始后不能再动镜头
    const stop = new AbortController();
    const { signal } = stop;
    const timer = setTimeout(() => {
      stop.abort();
      if (!reducedMotion()) map.jumpTo(entranceView());
      setPrimed(true);
    }, PRIME_TIMEOUT);
    void (async () => {
      map.jumpTo(initialView());
      await painted(map, signal);
      if (!reducedMotion()) {
        map.jumpTo(entranceView());
        await painted(map, signal);
      }
      await gpuIdle(map);
      if (signal.aborted) return;
      clearTimeout(timer);
      setPrimed(true);
    })();
    return () => {
      stop.abort();
      clearTimeout(timer);
    };
    // 只在能预热的那一刻做一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrime]);

  // 航线的入场动画
  const firstDraw = useRef(true);
  useEffect(() => {
    if (!primed) return;
    const map = mapRef.current!;

    // 首次从容一些；之后换筛选、按年播放时快一点
    const drawMs = reducedMotion() ? 0 : firstDraw.current ? 2000 : 900;
    if (firstDraw.current) {
      firstDraw.current = false;
      map.easeTo({ ...initialView(), duration: drawMs ? drawMs + 400 : 0, easing: easeOutCubic });
    }

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = drawMs ? Math.min(1, (now - start) / drawMs) : 1;
      const p = easeOutCubic(t);
      const c = colorsRef.current;
      arcsRef.current?.setProgress(p);
      // 地球上这两层是透明的，画完再一次改成完整的渐变
      if (!globeRef.current || t === 1) {
        map.setPaintProperty("routes-line", "line-gradient", routeGradient(p, 1, c.routeFrom, c.routeTo));
        map.setPaintProperty("routes-glow", "line-gradient", routeGradient(p, 0.35, c.routeFrom, c.routeTo));
      }
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // 入场视角只用一次，不参与重播
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, primed]);

  // 换主题：改写各图层颜色（航线已画完时直接换成完整的新渐变）
  useEffect(() => {
    colorsRef.current = colors.map;
    if (!ready) return;
    const map = mapRef.current!;
    themePaint(map, colors.map);
    const { routeFrom, routeTo, comet, selected, routeGlow } = colors.map;
    arcsRef.current?.setStyle({ from: routeFrom, to: routeTo, selected, comet, glow: routeGlow });
    // 首次绘制时航线由入场动画负责；之后换主题直接换成完整的新渐变
    if (paintedColors.current && paintedColors.current !== colors) {
      map.setPaintProperty("routes-line", "line-gradient", routeGradient(1, 1, routeFrom, routeTo));
      map.setPaintProperty("routes-glow", "line-gradient", routeGradient(1, 0.35, routeFrom, routeTo));
    }
    paintedColors.current = colors;
  }, [colors, ready]);

  // 镜头是否正为选中的航线让位
  const framed = useRef(false);
  // 选中航线：高亮并把镜头移过去（给详情面板留出位置）
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    map.setFilter("routes-selected", ["==", ["get", "key"], selectedRoute ?? ""]);
    selectedRef.current = selectedRoute;
    paintRoutes(map, globeRef.current, selectedRoute);
    arcsRef.current?.setSelected(selectedRoute);
    const route = selectedRoute && layers.routes.features.find((f) => f.properties?.key === selectedRoute);
    if (!route) {
      // 面板关掉后，地球移回原来的位置
      if (framed.current) map.easeTo({ padding: initialView().padding, duration: reducedMotion() ? 0 : 700 });
      framed.current = false;
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const c of route.geometry.coordinates) bounds.extend(c as [number, number]);
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
    const mobile = w < 900;
    // 要让开的边距：上方统计、下方 / 右侧的详情面板
    const want = mobile
      ? { top: Math.min(210, h * 0.26), bottom: h * 0.52 + 30, left: 40, right: 40 }
      : { top: 100, bottom: 140, left: w >= 1200 ? 380 : 60, right: 520 };
    const duration = reducedMotion() ? 0 : 1400;
    framed.current = true;
    if (globeRef.current) {
      // 地球上 fitBounds 遇到很大的边距会算偏（手机上甚至放不下、直接不动），自己算：
      // 航线中点放到剩余区域正中，缩放到整条弧线刚好放得下
      const coords = route.geometry.coordinates as [number, number][];
      const mid = coords[coords.length >> 1];
      const zoom = zoomToFit(coords, mid, w - want.left - want.right, h - want.top - want.bottom);
      map.easeTo({
        center: mid,
        // 太长的航线也不把地球缩得太小，太短的不放得太大
        zoom: Math.min(5, Math.max(initialView().zoom - 0.7, zoom)),
        padding: want,
        duration,
        easing: easeOutCubic,
        essential: true,
      });
      return;
    }
    // fitBounds 会在地图自带的内边距之外再加一遍，先减掉
    const own = map.getPadding();
    const rest = (side: keyof typeof want) => Math.max(0, want[side] - (own[side] ?? 0));
    map.fitBounds(bounds, {
      padding: { top: rest("top"), bottom: rest("bottom"), left: rest("left"), right: rest("right") },
      maxZoom: 5,
      duration,
      essential: true,
    });
    // 只在选中变化时移动镜头；航线数据变化不重新定位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute, ready]);

  // 机场三字码标签：HTML Marker + 简单的碰撞避让（到访次数多的优先）
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const items = layers.airports.features
      .map((f) => {
        // Marker 自己会改根元素的 opacity（被地球挡住时），碰撞避让改内层元素
        const el = document.createElement("div");
        const label = document.createElement("span");
        const p = f.properties as { code: string; count: number; home: boolean };
        label.className = `airport-label${p.home ? " home" : ""}`;
        // 标签底边贴着机场点上沿（点的半径 + 描边 + 3px），不同大小的点间距一致
        label.style.marginBottom = `${dotRadius(p.count) + 4.5}px`;
        label.textContent = p.code;
        el.appendChild(label);
        if (p.home) {
          const pulse = document.createElement("span");
          pulse.className = "home-pulse";
          el.appendChild(pulse);
        }
        const marker: Marker = new maplibregl.Marker({ element: el, anchor: "bottom", opacityWhenCovered: "0" })
          .setLngLat(f.geometry.coordinates as [number, number])
          .addTo(map);
        return { el: label, marker, count: p.count, lngLat: marker.getLngLat(), vec: toVec(f.geometry.coordinates) };
      })
      .sort((a, b) => b.count - a.count);

    let raf = 0;
    const layout = () => {
      raf = 0;
      const placed: { x: number; y: number }[] = [];
      const proj = globeRef.current ? new GlobeProjector(globeCamera(map)) : null;
      for (const it of items) {
        const pt = map.project(it.lngLat);
        const occluded = proj ? !proj.project(it.vec).visible : false;
        const clash = placed.some((p) => Math.abs(p.x - pt.x) < 40 && Math.abs(p.y - pt.y) < 22);
        const show = !occluded && !clash;
        it.el.classList.toggle("hidden", !show);
        if (show) placed.push(pt);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(layout);
    };
    layout();
    map.on("move", schedule);
    return () => {
      map.off("move", schedule);
      cancelAnimationFrame(raf);
      items.forEach((it) => it.marker.remove());
    };
  }, [layers, ready]);

  // MapLibre 会往容器上加 class，状态用 data 属性，免得被 React 覆盖掉
  return <div ref={container} className="flight-map" data-primed={primed || undefined} />;
});

function buildLayers(flights: Flight[], refData: RefData, homeOverride: string | null) {
  const routeCount = new Map<string, { a: string; b: string; count: number }>();
  const airportCount = new Map<string, number>();
  const visitedNumeric = new Set<string>();

  for (const f of flights) {
    const key = routeKey(f.depAirport, f.arrAirport);
    const r = routeCount.get(key) ?? { a: f.depAirport, b: f.arrAirport, count: 0 };
    r.count++;
    routeCount.set(key, r);
    for (const code of [f.depAirport, f.arrAirport]) {
      airportCount.set(code, (airportCount.get(code) ?? 0) + 1);
      const numeric = refData.countries[refData.airports[code]?.country ?? ""]?.numeric;
      if (numeric) visitedNumeric.add(numeric);
    }
  }

  const routes: FeatureCollection<LineString> = { type: "FeatureCollection", features: [] };
  for (const [key, r] of routeCount) {
    const a = refData.airports[r.a];
    const b = refData.airports[r.b];
    if (!a || !b) continue;
    const line = greatCircle([a.lon, a.lat], [b.lon, b.lat], { npoints: 160 }) as Feature<
      LineString | MultiLineString
    >;
    line.properties = { key, count: r.count };
    routes.features.push(joinAntimeridian(line));
  }
  // 常飞航线画在上层
  routes.features.sort((x, y) => x.properties!.count - y.properties!.count);

  const homeCode = resolveHomeAirport(flights, homeOverride, refData.airports);
  const home = homeCode ? refData.airports[homeCode] : undefined;
  // 指定的大本营可能还没飞过，也要画出来
  if (homeCode && home && !airportCount.has(homeCode)) airportCount.set(homeCode, 0);

  const airports: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [...airportCount]
      .filter(([code]) => refData.airports[code])
      .map(([code, count]) => {
        const a = refData.airports[code];
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [a.lon, a.lat] },
          properties: { code, name: a.city ?? a.name, count, home: code === homeCode },
        };
      }),
  };

  return { routes, airports, visitedNumeric, home };
}
