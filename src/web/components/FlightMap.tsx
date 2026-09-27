import { useEffect, useMemo, useRef } from "react";
import { maplibregl } from "../lib/maplibre";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import greatCircle from "@turf/great-circle";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import type { Flight } from "../../shared/types";
import { routeKey } from "../../shared/stats";
import type { RefData } from "../lib/refdata";
import { joinAntimeridian, unwrapGeometry } from "../lib/antimeridian";

interface Props {
  flights: Flight[];
  refData: RefData;
  world: Topology | undefined;
  selectedRoute: string | null;
  onSelectRoute: (key: string | null) => void;
}

const COLORS = {
  background: "#0b1426",
  land: "#16233d",
  visited: "#27406b",
  border: "#34496e",
  route: "#f6c453",
  routeSelected: "#ff7a59",
  airport: "#ffffff",
};

const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": COLORS.background } }],
};

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** 交互航线地图：国家底图 + 大圆航线 + 机场点，不依赖外部瓦片。 */
export function FlightMap({ flights, refData, world, selectedRoute, onSelectRoute }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const applyData = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelectRoute);
  onSelectRef.current = onSelectRoute;

  const { routes, airports, visitedNumeric } = useMemo(
    () => buildLayers(flights, refData),
    [flights, refData],
  );

  const countries = useMemo<FeatureCollection>(() => {
    if (!world) return EMPTY;
    const fc = feature(world, world.objects.countries as GeometryCollection) as FeatureCollection;
    return {
      type: "FeatureCollection",
      features: fc.features.map((f) => ({
        ...f,
        geometry: unwrapGeometry(f.geometry),
        properties: { ...f.properties, visited: visitedNumeric.has(String(f.id)) },
      })),
    };
  }, [world, visitedNumeric]);

  // 初始化地图
  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      center: [110, 25],
      zoom: container.current!.clientWidth < 600 ? 0.4 : 1.2,
      attributionControl: false,
      renderWorldCopies: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Natural Earth · OurAirports" }),
    );

    map.on("load", () => {
      map.addSource("countries", { type: "geojson", data: EMPTY });
      map.addSource("routes", { type: "geojson", data: EMPTY });
      map.addSource("airports", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": ["case", ["get", "visited"], COLORS.visited, COLORS.land],
        },
      });
      map.addLayer({
        id: "countries-line",
        type: "line",
        source: "countries",
        paint: { "line-color": COLORS.border, "line-width": 0.5 },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["boolean", ["get", "selected"], false], COLORS.routeSelected, COLORS.route],
          "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["get", "count"], 1, 1.2, 10, 4],
        },
      });
      // 透明的粗线，方便点中细航线
      map.addLayer({
        id: "routes-hit",
        type: "line",
        source: "routes",
        paint: { "line-color": "#000", "line-opacity": 0, "line-width": 12 },
      });
      map.addLayer({
        id: "airports-circle",
        type: "circle",
        source: "airports",
        paint: {
          "circle-color": COLORS.airport,
          "circle-stroke-color": COLORS.background,
          "circle-stroke-width": 1,
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 2.5, 10, 9],
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on("mouseenter", "airports-circle", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as { code: string; name: string; count: number };
        popup
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .setText(`${p.code} · ${p.name} · ${p.count} 次`)
          .addTo(map);
      });
      map.on("mouseleave", "airports-circle", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("mouseenter", "routes-hit", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "routes-hit", () => (map.getCanvas().style.cursor = ""));
      map.on("click", (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["routes-hit"] })[0];
        onSelectRef.current(hit ? String(hit.properties.key) : null);
      });

      loaded.current = true;
      applyData.current();
    });

    return () => {
      loaded.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 数据变化时更新图层
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("countries") as GeoJSONSource | undefined)?.setData(countries);
      (map.getSource("airports") as GeoJSONSource | undefined)?.setData(airports);
      (map.getSource("routes") as GeoJSONSource | undefined)?.setData({
        ...routes,
        features: routes.features.map((f) => ({
          ...f,
          properties: { ...f.properties, selected: f.properties?.key === selectedRoute },
        })),
      });
    };
    applyData.current = apply;
    if (loaded.current) apply();
  }, [countries, routes, airports, selectedRoute]);

  return <div ref={container} className="flight-map" />;
}

function buildLayers(flights: Flight[], refData: RefData) {
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
    const line = greatCircle([a.lon, a.lat], [b.lon, b.lat], { npoints: 128 }) as Feature<
      LineString | MultiLineString
    >;
    line.properties = { key, count: r.count };
    routes.features.push(joinAntimeridian(line));
  }
  // 常飞航线画在上层
  routes.features.sort((x, y) => x.properties!.count - y.properties!.count);

  const airports: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [...airportCount]
      .filter(([code]) => refData.airports[code])
      .map(([code, count]) => {
        const a = refData.airports[code];
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [a.lon, a.lat] },
          properties: { code, name: a.city ?? a.name, count },
        };
      }),
  };

  return { routes, airports, visitedNumeric };
}
