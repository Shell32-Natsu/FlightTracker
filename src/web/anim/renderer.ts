import {
  geoCentroid,
  geoCircle,
  geoDistance,
  geoEqualEarth,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import { merge, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Flight } from "../../shared/types";
import { kmToMiles } from "../../shared/geo";
import type { RefData } from "../lib/refdata";
import { airlineName, cityName, formatHours, type DistanceUnit } from "../lib/format";
import type { PosterPalette } from "../poster/palettes";
import { FONT } from "../poster/text";
import { tripPath } from "./trips";
import {
  buildTimeline,
  easeInOut,
  frameAt,
  segmentAt,
  smoothstep,
  type Leg,
  type LonLat,
  type Scales,
  type Timeline,
} from "./timeline";

export type ProjectionKind = "globe" | "flat";

export interface SceneOptions {
  flights: Flight[];
  ref: RefData;
  world: Topology;
  palette: PosterPalette;
  projection: ProjectionKind;
  width: number;
  height: number;
  speed: number;
  endCard: boolean;
  unit: DistanceUnit;
  /** 片头标题，如 "2024 年度飞行"；缺省为旅行的日期 */
  title?: string;
}

export interface Scene {
  width: number;
  height: number;
  duration: number;
  timeline: Timeline;
  /** 画面里出现的全部文字，用来预先加载字体分片 */
  text: string;
  /** 在 ctx 上画 t 秒时的一帧（ctx 的变换需把逻辑尺寸映射到画布像素） */
  draw(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number): void;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Box = [[number, number], [number, number]];

const landCache = new WeakMap<Topology, { borders: GeoPermissibleObjects }>();
function bordersOf(world: Topology) {
  let c = landCache.get(world);
  if (!c) {
    const obj = world.objects.countries as GeometryCollection;
    c = { borders: mesh(world, obj, (a, b) => a !== b) };
    landCache.set(world, c);
  }
  return c.borders;
}

/** 朝上的飞机剪影，机身长 2（-1..1）。 */
const PLANE = new Path2D(
  "M0,-1 C0.07,-1 0.11,-0.92 0.11,-0.78 L0.11,-0.3 L0.96,0.16 L0.96,0.32 L0.11,0.08 L0.08,0.62 L0.34,0.82 L0.34,0.95 L0,0.87 L-0.34,0.95 L-0.34,0.82 L-0.08,0.62 L-0.11,0.08 L-0.96,0.32 L-0.96,0.16 L-0.11,-0.3 L-0.11,-0.78 C-0.11,-0.92 -0.07,-1 0,-1 Z",
);

function baseProjection(kind: ProjectionKind): GeoProjection {
  return kind === "globe" ? geoOrthographic().clipAngle(90).precision(0.3) : geoEqualEarth().precision(0.3);
}

const rotationFor = (kind: ProjectionKind, c: LonLat): [number, number] =>
  kind === "globe" ? [-c[0], -c[1]] : [-c[0], 0];

/** 按画面中心点和缩放摆好投影：center 落在 box 的中心。 */
function aim(p: GeoProjection, kind: ProjectionKind, center: LonLat, scale: number, box: Box) {
  p.rotate(rotationFor(kind, center)).scale(scale).translate([0, 0]);
  const [x, y] = p(center) ?? [0, 0];
  const cx = (box[0][0] + box[1][0]) / 2;
  const cy = (box[0][1] + box[1][1]) / 2;
  p.translate([cx - x, cy - y]);
  return p;
}

/** 把 geo 适配进 box，返回合适的中心和缩放（中心取适配后画面中心的反投影，迭代两次使之稳定）。 */
function fitView(kind: ProjectionKind, geo: GeoPermissibleObjects, box: Box, start?: LonLat) {
  let center = start ?? (geoCentroid(geo) as LonLat);
  let scale = 1;
  const cx = (box[0][0] + box[1][0]) / 2;
  const cy = (box[0][1] + box[1][1]) / 2;
  for (let i = 0; i < 2; i++) {
    const p = baseProjection(kind).rotate(rotationFor(kind, center)).fitExtent(box, geo);
    scale = p.scale();
    const mid = p.invert?.([cx, cy]);
    if (mid && Number.isFinite(mid[0])) center = mid as LonLat;
  }
  return { center, scale };
}

export function createScene(o: SceneOptions): Scene {
  const { flights, ref, world, palette: pal, projection: kind, width: W, height: H } = o;
  const u = Math.min(W, H) / 1080;
  const portrait = H > W * 1.2;
  const pad = (portrait ? 72 : 64) * u;
  const top = (portrait ? 300 : 190) * u;
  const bottom = (portrait ? 440 : 250) * u;
  const box: Box = [
    [pad, top],
    [W - pad, H - bottom],
  ];
  const boxW = box[1][0] - box[0][0];
  const boxH = box[1][1] - box[0][1];
  const boxCx = (box[0][0] + box[1][0]) / 2;
  const boxCy = (box[0][1] + box[1][1]) / 2;

  // —— 航段 ——
  const usable = flights.filter((f) => ref.airports[f.depAirport] && ref.airports[f.arrAirport]);
  const legs: Leg[] = usable.map((f) => {
    const a = ref.airports[f.depAirport];
    const b = ref.airports[f.arrAirport];
    return {
      dep: [a.lon, a.lat],
      arr: [b.lon, b.lat],
      depCode: f.depAirport,
      arrCode: f.arrAirport,
      km: f.distanceKm ?? geoDistance([a.lon, a.lat], [b.lon, b.lat]) * 6371,
    };
  });
  const timeline = buildTimeline(legs, { speed: o.speed, endCard: o.endCard });
  const interps = legs.map((l) => geoInterpolate(l.dep, l.arr));

  // —— 镜头缩放 ——
  const tripGeo: GeoPermissibleObjects = {
    type: "MultiLineString",
    coordinates: legs.map((l) => [l.dep, l.arr]),
  };
  const allPoints = legs.flatMap((l) => [l.dep, l.arr]);
  const fullGlobe = (Math.min(boxW, boxH) / 2) * 0.94;
  const wholeWorld = baseProjection("flat").fitExtent(box, { type: "Sphere" }).scale();
  const minScale = kind === "globe" ? fullGlobe : wholeWorld;

  // 适配时再内缩一圈，给机场标签留位置
  const inset = 44 * u;
  const fitBox: Box = [
    [box[0][0] + inset, box[0][1] + inset],
    [box[1][0] - inset, box[1][1] - inset],
  ];
  const clampedFit = (geo: GeoPermissibleObjects, pts: LonLat[], start?: LonLat) => {
    const v = fitView(kind, geo, fitBox, start);
    // 地球上跨度太大（超出可见半球）时，fitExtent 只量到可见部分，直接用整个地球
    const spread = Math.max(0, ...pts.map((p) => (geoDistance(p, v.center) * 180) / Math.PI));
    return {
      center: v.center,
      scale: kind === "globe" && spread > 78 ? minScale : Math.max(minScale, v.scale),
    };
  };
  const fitted = legs.length
    ? clampedFit(tripGeo, allPoints)
    : { center: [110, 20] as LonLat, scale: minScale };
  // 短途旅行的全景也要带上周边，别贴得太近
  const widest = fitView(kind, geoCircle().center(fitted.center).radius(14)(), box, fitted.center).scale;
  const overview = { center: fitted.center, scale: Math.min(fitted.scale, Math.max(minScale, widest)) };
  const nearFit = legs.length
    ? fitView(kind, geoCircle().center(legs[0].dep).radius(4.5)(), box, legs[0].dep).scale
    : minScale * 8;
  const near = Math.max(nearFit, overview.scale * 1.3);
  const legScales = legs.map((l, i) => {
    const mid = interps[i](0.5) as LonLat;
    const s = clampedFit({ type: "LineString", coordinates: [l.dep, l.arr] }, [l.dep, l.arr], mid).scale;
    return Math.min(near, Math.max(overview.scale, s * 0.92));
  });
  const scales: Scales = { near, leg: legScales, overview: overview.scale, overviewCenter: overview.center };

  // —— 底图 ——
  const obj = world.objects.countries as GeometryCollection;
  const visitedIds = new Set<string>();
  for (const f of usable) {
    for (const code of [f.depAirport, f.arrAirport]) {
      const n = ref.countries[ref.airports[code].country]?.numeric;
      if (n) visitedIds.add(n);
    }
  }
  const visitedLand = merge(world, obj.geometries.filter((g) => visitedIds.has(String(g.id))) as never);
  const otherLand = merge(world, obj.geometries.filter((g) => !visitedIds.has(String(g.id))) as never);
  const borders = bordersOf(world);
  const graticule = geoGraticule10();
  const sphere: GeoPermissibleObjects = { type: "Sphere" };

  // 星空：固定的伪随机分布
  const stars: [number, number, number, number][] = [];
  if (pal.stars) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < Math.round((W * H) / 6000); i++)
      stars.push([rnd() * W, rnd() * H, rnd() * 1.4 + 0.3, rnd()]);
  }

  // —— 文字 ——
  const fmtDist = (km: number) => Math.round(o.unit === "km" ? km : kmToMiles(km)).toLocaleString();
  const unitLabel = o.unit === "km" ? "km" : "mi";
  const path = tripPath(usable);
  const first = usable[0];
  const last = usable.at(-1);
  const ymd = (d: string) => d.split("-").map(Number);
  const dateRange = (() => {
    if (!first || !last) return "";
    const [y1, m1, d1] = ymd(first.flightDate);
    const [y2, m2, d2] = ymd(last.flightDate);
    const start = `${y1}年${m1}月${d1}日`;
    if (first.flightDate === last.flightDate) return start;
    if (y1 !== y2) return `${start} – ${y2}年${m2}月${d2}日`;
    return m1 !== m2 ? `${start} – ${m2}月${d2}日` : `${start} – ${d2}日`;
  })();
  const title = o.title ?? dateRange;
  const subtitle = o.title ? dateRange : `${legs.length} 段航程`;
  const totalKm = legs.reduce((s, l) => s + l.km, 0);
  const totalMin = usable.reduce((s, f) => s + (f.durationMin ?? 0), 0);
  const airportSet = new Set(path);
  const countrySet = new Set(path.map((c) => ref.airports[c]?.country).filter(Boolean));
  const legInfo = usable.map((f) => ({
    code: `${f.airline} ${f.flightNumber}`,
    airline: airlineName(f.airline, ref),
    route: `${f.depAirport}  →  ${f.arrAirport}`,
    detail: [
      `${cityName(f.depAirport, ref)} → ${cityName(f.arrAirport, ref)}`,
      `${ymd(f.flightDate)[1]}月${ymd(f.flightDate)[2]}日`,
      f.aircraftType ? (ref.aircraft[f.aircraftType] ?? f.aircraftType) : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  const endTitle = o.title ?? "旅程回顾";
  const cardStats = [
    { v: String(legs.length), l: "航段" },
    { v: totalMin ? formatHours(totalMin) : "—", l: "飞行时长" },
    { v: String(airportSet.size), l: "机场" },
    { v: String(countrySet.size), l: "国家/地区" },
  ];
  const cityLabel = (code: string) => cityName(code, ref);
  const text = [
    title,
    subtitle,
    endTitle,
    path.join(" → "),
    ...legInfo.flatMap((l) => [l.code, l.airline, l.route, l.detail]),
    ...path.map(cityLabel),
    ...cardStats.flatMap((s) => [s.v, s.l]),
    "0123456789,.·→–kmi段累计飞行距离航迹第共",
  ].join("");

  // —— 画图工具 ——
  const font = (weight: number, size: number) => `${weight} ${Math.round(size * u * 10) / 10}px ${FONT}`;
  const spacing = (ctx: Ctx, px: number) => {
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${px * u}px`;
  };
  const fitText = (ctx: Ctx, s: string, weight: number, size: number, maxW: number) => {
    ctx.font = font(weight, size);
    const w = ctx.measureText(s).width;
    if (w > maxW) ctx.font = font(weight, (size * maxW) / w);
  };

  const proj = baseProjection(kind);

  function drawBackground(ctx: Ctx) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    if (pal.glow) {
      const g = ctx.createRadialGradient(boxCx, boxCy, 0, boxCx, boxCy, Math.max(W, H) * 0.7);
      g.addColorStop(0, pal.glow);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    for (const [x, y, r, a] of stars) {
      ctx.globalAlpha = 0.25 + a * 0.55;
      ctx.fillStyle = "#dfe7ff";
      ctx.beginPath();
      ctx.arc(x, y, r * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMap(ctx: Ctx, scale: number) {
    const gp = geoPath(proj, ctx as CanvasRenderingContext2D);
    const [tx, ty] = proj.translate();
    const [cx, cy] = kind === "globe" ? [tx, ty] : [0, 0];

    if (kind === "globe" && pal.routeGlow) {
      // 大气层光晕
      const g = ctx.createRadialGradient(cx, cy, scale * 0.96, cx, cy, scale * 1.12);
      g.addColorStop(0, "rgba(110,150,255,0.28)");
      g.addColorStop(1, "rgba(110,150,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 1.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    gp(sphere);
    ctx.fillStyle = pal.ocean;
    ctx.fill();

    ctx.beginPath();
    gp(graticule);
    ctx.strokeStyle = pal.graticule;
    ctx.lineWidth = 1 * u;
    ctx.stroke();

    ctx.beginPath();
    gp(otherLand);
    ctx.fillStyle = pal.land;
    ctx.fill();
    ctx.beginPath();
    gp(visitedLand);
    ctx.fillStyle = pal.visited;
    ctx.fill();
    ctx.beginPath();
    gp(borders);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 0.9 * u;
    ctx.stroke();

    if (kind === "globe") {
      // 球体明暗：左上高光、右下暗部
      const g = ctx.createRadialGradient(cx - scale * 0.35, cy - scale * 0.4, scale * 0.1, cx, cy, scale);
      const dark = pal.id === "night";
      g.addColorStop(0, dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.25)");
      g.addColorStop(0.7, "rgba(0,0,0,0)");
      g.addColorStop(1, dark ? "rgba(0,0,0,0.35)" : "rgba(40,50,70,0.10)");
      ctx.beginPath();
      gp(sphere);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = dark ? "rgba(150,180,255,0.25)" : pal.border;
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
    } else {
      ctx.beginPath();
      gp(sphere);
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
    }
  }

  function strokeRoute(
    ctx: Ctx,
    coords: LonLat[],
    a: [number, number] | null,
    b: [number, number] | null,
    alpha = 1,
  ) {
    const gp = geoPath(proj, ctx as CanvasRenderingContext2D);
    const line: GeoPermissibleObjects = { type: "LineString", coordinates: coords };
    let stroke: string | CanvasGradient = pal.routeTo;
    if (a && b && pal.routeFrom !== pal.routeTo && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1) {
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, pal.routeFrom);
      g.addColorStop(1, pal.routeTo);
      stroke = g;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pal.routeGlow) {
      ctx.globalAlpha = 0.22 * alpha;
      ctx.beginPath();
      gp(line);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 11 * u;
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    gp(line);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 4 * u;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const sample = (i: number, to: number, n = 96): LonLat[] => {
    const pts: LonLat[] = [];
    const steps = Math.max(2, Math.ceil(n * to));
    for (let k = 0; k <= steps; k++) pts.push(interps[i]((k / steps) * to) as LonLat);
    return pts;
  };

  function visible(p: LonLat) {
    if (kind !== "globe") return true;
    const r = proj.rotate();
    return geoDistance(p, [-r[0], -r[1]]) < Math.PI / 2 - 0.02;
  }

  function drawDot(ctx: Ctx, p: LonLat, r: number, alpha = 1) {
    if (!visible(p)) return;
    const xy = proj(p);
    if (!xy) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(xy[0], xy[1], (r + 2.6) * u, 0, Math.PI * 2);
    ctx.fillStyle = pal.airportRing;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xy[0], xy[1], r * u, 0, Math.PI * 2);
    ctx.fillStyle = pal.airport;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawLabel(ctx: Ctx, p: LonLat, code: string, alpha: number, other?: LonLat, small = false) {
    if (alpha <= 0.01 || !visible(p)) return;
    const xy = proj(p);
    if (!xy) return;
    // 标签放在远离另一端的一侧，避免压住航线
    let below = false;
    if (other) {
      const o2 = proj(other);
      if (o2 && o2[1] < xy[1] - 20 * u) below = true;
    }
    const lift = easeInOut(alpha);
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    const shadow = pal.id === "night" ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.9)";
    const main = small ? 26 : 46;
    const dy = (below ? 1 : -1) * ((small ? 22 : 34) + (1 - lift) * 10) * u;
    ctx.textBaseline = below ? "top" : "alphabetic";
    ctx.font = font(700, main);
    spacing(ctx, small ? 1 : 2);
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = shadow;
    ctx.lineJoin = "round";
    const y1 = xy[1] + dy - (below ? 0 : small ? 0 : 40 * u);
    ctx.strokeText(code, xy[0], y1);
    ctx.fillStyle = pal.text;
    ctx.fillText(code, xy[0], y1);
    if (!small) {
      ctx.font = font(500, 24);
      spacing(ctx, 0.5);
      const city = cityLabel(code);
      const y2 = below ? y1 + 58 * u : xy[1] + dy;
      ctx.strokeText(city, xy[0], y2);
      ctx.fillStyle = pal.muted;
      ctx.fillText(city, xy[0], y2);
    }
    spacing(ctx, 0);
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  function drawPlane(ctx: Ctx, leg: number, progress: number) {
    const p = interps[leg](progress) as LonLat;
    const q = interps[leg](Math.min(1, progress + 0.003)) as LonLat;
    const r = interps[leg](Math.max(0, progress - 0.003)) as LonLat;
    const a = proj(r);
    const b = proj(q);
    const xy = proj(p);
    if (!a || !b || !xy) return;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    const size = 34 * u;
    ctx.save();
    ctx.translate(xy[0], xy[1]);
    if (pal.routeGlow) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
      g.addColorStop(0, "rgba(255,212,138,0.45)");
      g.addColorStop(1, "rgba(255,212,138,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(angle);
    // 投影阴影
    ctx.save();
    ctx.translate(5 * u, 9 * u);
    ctx.scale(size, size);
    ctx.fillStyle = pal.id === "night" ? "rgba(0,0,0,0.45)" : "rgba(30,40,60,0.18)";
    ctx.fill(PLANE);
    ctx.restore();
    ctx.scale(size, size);
    ctx.fillStyle = pal.airport;
    ctx.fill(PLANE);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = pal.airportRing;
    ctx.stroke(PLANE);
    ctx.restore();
  }

  function drawScrims(ctx: Ctx) {
    const solid = pal.bg;
    const clear = hexAlpha(pal.bg, 0);
    const g1 = ctx.createLinearGradient(0, 0, 0, top * 1.05);
    g1.addColorStop(0, hexAlpha(pal.bg, 0.92));
    g1.addColorStop(0.55, hexAlpha(pal.bg, 0.6));
    g1.addColorStop(1, clear);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, top * 1.05);
    const y0 = H - bottom * 1.15;
    const g2 = ctx.createLinearGradient(0, y0, 0, H);
    g2.addColorStop(0, clear);
    g2.addColorStop(0.4, hexAlpha(pal.bg, 0.75));
    g2.addColorStop(1, solid);
    ctx.fillStyle = g2;
    ctx.fillRect(0, y0, W, H - y0);
  }

  function drawHeader(ctx: Ctx, alpha: number) {
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const x = pad;
    const y = (portrait ? 128 : 86) * u;
    ctx.font = font(700, 22);
    spacing(ctx, 5);
    ctx.fillStyle = pal.accent;
    ctx.fillText("航迹 · FLIGHT LOG", x, y - 50 * u);
    spacing(ctx, 0);
    ctx.fillStyle = pal.text;
    fitText(ctx, title, 700, portrait ? 58 : 48, W - pad * 2);
    ctx.fillText(title, x, y + 14 * u);
    ctx.fillStyle = pal.muted;
    fitText(ctx, subtitle, 500, 26, W - pad * 2);
    ctx.fillText(subtitle, x, y + 56 * u);
    ctx.globalAlpha = 1;
  }

  function drawInfo(ctx: Ctx, i: number, alpha: number, hud: number, flownKm: number, t: number) {
    const y = H - (portrait ? 118 : 74) * u;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const info = legInfo[i];
    const rightW = 300 * u;
    if (info && alpha > 0) {
      ctx.globalAlpha = alpha;
      const slide = (1 - alpha) * 14 * u;
      ctx.font = font(700, 26);
      spacing(ctx, 1.5);
      ctx.fillStyle = pal.accent;
      const codeW = ctx.measureText(info.code).width;
      ctx.fillText(info.code, pad, y - 170 * u + slide);
      spacing(ctx, 0);
      ctx.font = font(500, 24);
      ctx.fillStyle = pal.muted;
      ctx.fillText(info.airline, pad + codeW + 14 * u, y - 170 * u + slide);
      ctx.fillStyle = pal.text;
      spacing(ctx, 2);
      fitText(ctx, info.route, 700, portrait ? 84 : 70, W - pad * 2 - rightW);
      ctx.fillText(info.route, pad, y - 80 * u + slide);
      spacing(ctx, 0);
      ctx.fillStyle = pal.muted;
      fitText(ctx, info.detail, 500, 25, W - pad * 2 - rightW);
      ctx.fillText(info.detail, pad, y - 30 * u + slide);
    }
    ctx.globalAlpha = hud;
    // 右侧：累计距离和航段序号
    ctx.textAlign = "right";
    ctx.font = font(500, 22);
    ctx.fillStyle = pal.muted;
    ctx.fillText("累计飞行", W - pad, y - 170 * u);
    ctx.font = font(700, 54);
    ctx.fillStyle = pal.text;
    ctx.fillText(fmtDist(flownKm), W - pad, y - 90 * u);
    ctx.font = font(600, 22);
    ctx.fillStyle = pal.muted;
    ctx.fillText(unitLabel, W - pad, y - 58 * u);
    if (legs.length > 1) {
      ctx.fillStyle = pal.faint;
      ctx.fillText(`第 ${Math.max(1, i + 1)} / ${legs.length} 段`, W - pad, y - 26 * u);
    }
    // 进度条：每段一格
    const barY = y + 32 * u;
    const barW = W - pad * 2;
    ctx.fillStyle = hexAlpha(pal.muted, 0.25);
    roundRect(ctx, pad, barY, barW, 5 * u, 2.5 * u);
    ctx.fill();
    const grad = ctx.createLinearGradient(pad, 0, pad + barW, 0);
    grad.addColorStop(0, pal.routeFrom);
    grad.addColorStop(1, pal.routeTo);
    ctx.fillStyle = grad;
    roundRect(ctx, pad, barY, Math.max(5 * u, barW * Math.min(1, t / timeline.duration)), 5 * u, 2.5 * u);
    ctx.fill();
    ctx.fillStyle = pal.bg;
    for (const s of timeline.segments) {
      if (s.kind !== "leg" || s.leg === 0) continue;
      ctx.fillRect(pad + (barW * s.start) / timeline.duration - 1.5 * u, barY, 3 * u, 5 * u);
    }
    ctx.globalAlpha = 1;
  }

  function drawEndCard(ctx: Ctx, e: number) {
    if (e <= 0) return;
    ctx.globalAlpha = e * 0.82;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = e;
    const rise = (1 - easeInOut(e)) * 40 * u;
    const cy = H / 2 + rise;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = font(700, 24);
    spacing(ctx, 6);
    ctx.fillStyle = pal.accent;
    ctx.fillText(endTitle, W / 2, cy - 250 * u);
    spacing(ctx, 0);
    ctx.fillStyle = pal.text;
    ctx.font = font(800, 150);
    spacing(ctx, -2);
    const dist = fmtDist(totalKm);
    ctx.fillText(dist, W / 2, cy - 70 * u);
    spacing(ctx, 0);
    ctx.font = font(600, 30);
    ctx.fillStyle = pal.muted;
    ctx.fillText(o.unit === "km" ? "公里 · 飞行距离" : "英里 · 飞行距离", W / 2, cy - 18 * u);

    const colW = Math.min(230 * u, (W - pad * 2) / 4);
    cardStats.forEach((s, i) => {
      const x = W / 2 + (i - 1.5) * colW;
      ctx.fillStyle = pal.text;
      fitText(ctx, s.v, 700, 50, colW - 16 * u);
      ctx.fillText(s.v, x, cy + 100 * u);
      ctx.font = font(500, 22);
      ctx.fillStyle = pal.muted;
      ctx.fillText(s.l, x, cy + 138 * u);
    });
    const p = path.join(" → ");
    ctx.fillStyle = pal.muted;
    fitText(ctx, p, 600, 28, W - pad * 2);
    ctx.fillText(p, W / 2, cy + 230 * u);
    ctx.font = font(700, 20);
    spacing(ctx, 6);
    ctx.fillStyle = pal.faint;
    ctx.fillText("航迹 · FLIGHT LOG", W / 2, H - 90 * u);
    spacing(ctx, 0);
    ctx.globalAlpha = 1;
  }

  function draw(ctx: Ctx, t: number) {
    const f = frameAt(timeline, legs, scales, t);
    const seg = segmentAt(timeline, t);
    const segU = Math.min(1, Math.max(0, (t - seg.start) / (seg.end - seg.start || 1)));
    aim(proj, kind, f.center, f.scale, box);
    if (kind === "flat")
      proj.clipExtent([
        [-20, -20],
        [W + 20, H + 20],
      ]);

    drawBackground(ctx);
    drawMap(ctx, f.scale);

    // 还没飞的航段：虚线提示
    const dashA = seg.kind === "intro" ? 0.5 * (1 - smoothstep(0.7, 1, segU)) + 0.25 : 0.25;
    ctx.setLineDash([2 * u, 12 * u]);
    ctx.lineCap = "round";
    for (let i = Math.max(0, f.leg + (f.progress >= 1 ? 1 : 0)); i < legs.length; i++) {
      if (i === f.leg && f.progress > 0) continue;
      const gp = geoPath(proj, ctx as CanvasRenderingContext2D);
      ctx.beginPath();
      gp({ type: "LineString", coordinates: [legs[i].dep, legs[i].arr] });
      ctx.globalAlpha = dashA;
      ctx.strokeStyle = pal.muted;
      ctx.lineWidth = 3.5 * u;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 已飞完的航段和当前航段
    for (let i = 0; i <= f.leg && i < legs.length; i++) {
      const to = i < f.leg ? 1 : f.progress;
      if (to <= 0) continue;
      const coords = sample(i, to);
      const a = proj(legs[i].dep);
      const b = proj(coords[coords.length - 1]);
      strokeRoute(ctx, coords, a, b);
    }

    // 机场
    const seen = new Set<string>();
    legs.forEach((l, i) => {
      if (!seen.has(l.depCode)) drawDot(ctx, l.dep, 6.5, i <= Math.max(0, f.leg) ? 1 : 0.55);
      seen.add(l.depCode);
      if (!seen.has(l.arrCode))
        drawDot(ctx, l.arr, 6.5, i < f.leg || (i === f.leg && f.progress >= 1) ? 1 : 0.55);
      seen.add(l.arrCode);
    });

    if (f.flying && f.leg >= 0) drawPlane(ctx, f.leg, f.progress);

    // 标签：片头 / 片尾显示所有机场的小标签，飞行中显示当前起降机场
    const overviewA =
      seg.kind === "intro"
        ? 1 - smoothstep(0.35, 0.6, segU)
        : seg.kind === "outro"
          ? smoothstep(0.2, 0.45, segU) * (1 - f.endCard)
          : 0;
    if (overviewA > 0) {
      const done = new Set<string>();
      for (const l of legs) {
        for (const [code, p] of [
          [l.depCode, l.dep],
          [l.arrCode, l.arr],
        ] as const) {
          if (done.has(code)) continue;
          done.add(code);
          drawLabel(ctx, p as LonLat, code, overviewA, undefined, true);
        }
      }
    }
    const cur = f.leg >= 0 ? f.leg : 0;
    const next = seg.kind === "transfer" || seg.kind === "reposition" ? seg.leg : cur;
    if (legs[next]) drawLabel(ctx, legs[next].dep, legs[next].depCode, f.depLabel, legs[next].arr);
    if (legs[cur] && f.arrLabel > 0)
      drawLabel(ctx, legs[cur].arr, legs[cur].arrCode, f.arrLabel, legs[cur].dep);

    // 叠加信息
    drawScrims(ctx);
    const hud = 1 - f.endCard;
    drawHeader(ctx, hud);
    let infoIdx = cur;
    let infoA = 1;
    if (seg.kind === "transfer" || seg.kind === "reposition") {
      infoIdx = segU < 0.5 ? seg.leg - 1 : seg.leg;
      infoA = Math.abs(segU - 0.5) * 2;
    }
    const flown =
      legs.slice(0, Math.max(0, f.leg)).reduce((s, l) => s + l.km, 0) +
      (f.leg >= 0 ? legs[f.leg].km * f.progress : 0);
    if (hud > 0) drawInfo(ctx, infoIdx, infoA * hud, hud, flown, t);
    drawEndCard(ctx, f.endCard);
  }

  return { width: W, height: H, duration: timeline.duration, timeline, text, draw };
}

function hexAlpha(hex: string, a: number): string {
  if (!hex.startsWith("#")) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 画布文字要等网页字体加载好（中文字体按需加载用到的分片）。 */
export async function loadSceneFonts(text: string) {
  await Promise.all([
    document.fonts.load(`700 40px 'Inter Variable'`, "ABC0123"),
    document.fonts.load(`500 40px 'Noto Sans SC Variable'`, text),
  ]);
}
