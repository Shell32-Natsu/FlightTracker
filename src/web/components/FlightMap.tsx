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
  projection: MapProjection;
  /** 设置里指定的“大本营”机场；null 时按起降次数自动选择 */
  homeAirport: string | null;
  selectedRoute: string | null;
  onSelectRoute: (key: string | null) => void;
  onHoverRoute: (hover: RouteHover | null) => void;
}

const C = {
  ocean: "#07101f",
  land: "#111c30",
  visited: "#1c3157",
  border: "#1e2c47",
  visitedBorder: "#2f4a78",
  graticule: "rgba(140,170,220,0.06)",
  gold: "#ffcf7a",
  coral: "#ff7a5c",
  selected: "#ffffff",
};

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sky: {
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.9, 7, 0],
  },
  sources: {},
  layers: [{ id: "ocean", type: "background", paint: { "background-color": C.ocean } }],
};

/** 机场点半径：到访次数开方后线性插值（sqrt(count) 为 1 时 2.4px，为 6 时 5px）。图层和标签共用。 */
const DOT = { from: 1, r0: 2.4, to: 6, r1: 5 };
const DOT_RADIUS_EXPR = ["interpolate", ["linear"], ["sqrt", ["get", "count"]], DOT.from, DOT.r0, DOT.to, DOT.r1] as const;

function dotRadius(count: number): number {
  const t = (Math.sqrt(count) - DOT.from) / (DOT.to - DOT.from);
  return DOT.r0 + (DOT.r1 - DOT.r0) * Math.min(1, Math.max(0, t));
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
  { flights, refData, world, projection, homeAirport, selectedRoute, onSelectRoute, onHoverRoute },
  handle,
) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
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
    const top = mobile ? Math.min(230, h * 0.28) : 0;
    const bottom = mobile ? 90 : 0;
    // 宽屏时给左上角的统计面板让出一点位置
    const left = w >= 1200 ? 220 : 0;
    const diameter = mobile ? Math.min(w * 0.96, h - top - bottom) : Math.min(w, h) * 0.8;
    // 缩放级别 0 时地球周长为 512px
    const zoom = Math.log2((diameter * Math.PI) / 512);
    const home = homeRef.current;
    return {
      center: (home ? [home.lon, Math.max(-35, Math.min(45, home.lat - 6))] : [110, 20]) as LngLatLike,
      zoom: Math.max(0, zoom),
      padding: { top, bottom, left, right: 0 },
    };
  };

  useImperativeHandle(handle, () => ({
    resetView: () => mapRef.current?.flyTo({ ...initialView(), pitch: 0, bearing: 0, duration: 1600 }),
    zoomBy: (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 300 }),
  }));

  // 初始化地图（只做一次）
  useEffect(() => {
    const view = initialView();
    const [lon, lat] = view.center as [number, number];
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      // 入场：从东侧转过来并略微推近
      center: [lon + 70, lat],
      zoom: view.zoom - 0.4,
      attributionControl: false,
      renderWorldCopies: true,
      maxPitch: 0,
      dragRotate: false,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    map.setPadding(view.padding);
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Natural Earth · OurAirports" }),
      "bottom-right",
    );

    map.on("load", () => {
      // 版权信息默认收起成一个小图标
      map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      map.addSource("graticule", { type: "geojson", data: graticule() });
      map.addSource("countries", { type: "geojson", data: EMPTY });
      map.addSource("routes", { type: "geojson", data: EMPTY, lineMetrics: true });
      map.addSource("airports", { type: "geojson", data: EMPTY });

      map.addLayer({
        id: "graticule",
        type: "line",
        source: "graticule",
        paint: { "line-color": C.graticule, "line-width": 1 },
      });
      map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "countries",
        paint: { "fill-color": ["case", ["get", "visited"], C.visited, C.land] },
      });
      map.addLayer({
        id: "countries-line",
        type: "line",
        source: "countries",
        paint: {
          "line-color": ["case", ["get", "visited"], C.visitedBorder, C.border],
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 5, 1],
        },
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
        },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": routeGradient(0, 1),
          "line-width": ["interpolate", ["linear"], ["get", "count"], 1, 1.3, 8, 3.2],
        },
      });
      map.addLayer({
        id: "routes-selected",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "key"], ""],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": C.selected, "line-width": 2.6, "line-opacity": 0.95 },
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
          "circle-color": C.gold,
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
          "circle-color": "#ffffff",
          "circle-stroke-color": C.gold,
          "circle-stroke-width": 1.5,
          "circle-radius": DOT_RADIUS_EXPR as unknown as ExpressionSpecification,
          "circle-pitch-alignment": "map",
        },
      });

      map.on("mousemove", "routes-hit", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f) callbacks.current.onHoverRoute({ key: String(f.properties.key), x: e.point.x, y: e.point.y });
      });
      map.on("mouseleave", "routes-hit", () => {
        map.getCanvas().style.cursor = "";
        callbacks.current.onHoverRoute(null);
      });
      map.on("click", (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["routes-hit"] })[0];
        callbacks.current.onSelectRoute(hit ? String(hit.properties.key) : null);
      });

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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 投影切换
  useEffect(() => {
    if (!ready) return;
    mapRef.current!.setProjection({ type: projection });
  }, [projection, ready]);

  // 国界
  useEffect(() => {
    if (!ready) return;
    (mapRef.current!.getSource("countries") as GeoJSONSource).setData(countries);
  }, [countries, ready]);

  // 航线和机场：更新数据并播放入场动画
  const firstDraw = useRef(true);
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    (map.getSource("routes") as GeoJSONSource).setData(layers.routes);
    (map.getSource("airports") as GeoJSONSource).setData(layers.airports);

    const drawMs = reducedMotion() ? 0 : 2000;
    if (firstDraw.current) {
      firstDraw.current = false;
      map.easeTo({ ...initialView(), duration: drawMs ? drawMs + 400 : 0, easing: easeOutCubic });
    }

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = drawMs ? Math.min(1, (now - start) / drawMs) : 1;
      const p = easeOutCubic(t);
      map.setPaintProperty("routes-line", "line-gradient", routeGradient(p, 1));
      map.setPaintProperty("routes-glow", "line-gradient", routeGradient(p, 0.35));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [layers, ready]);

  // 选中航线：高亮并把镜头移过去（给详情面板留出位置）
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    map.setFilter("routes-selected", ["==", ["get", "key"], selectedRoute ?? ""]);
    const route = selectedRoute && layers.routes.features.find((f) => f.properties?.key === selectedRoute);
    if (!route) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const c of route.geometry.coordinates) bounds.extend(c as [number, number]);
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
    const mobile = w < 900;
    map.fitBounds(bounds, {
      padding: mobile
        ? { top: Math.min(260, h * 0.3), bottom: h * 0.5 + 20, left: 40, right: 40 }
        : { top: 120, bottom: 80, left: w >= 1200 ? 340 : 80, right: 520 },
      maxZoom: 5,
      duration: reducedMotion() ? 0 : 1400,
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
        return { el: label, marker, count: p.count, lngLat: marker.getLngLat() };
      })
      .sort((a, b) => b.count - a.count);

    let raf = 0;
    const layout = () => {
      raf = 0;
      const placed: { x: number; y: number }[] = [];
      const transform = (map as unknown as { transform?: { isLocationOccluded?: (l: unknown) => boolean } })
        .transform;
      for (const it of items) {
        const pt = map.project(it.lngLat);
        const occluded = transform?.isLocationOccluded?.(it.lngLat) ?? false;
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

  return <div ref={container} className="flight-map" />;
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
