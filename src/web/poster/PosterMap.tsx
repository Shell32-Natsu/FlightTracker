import { Fragment, useId, useMemo } from "react";
import {
  geoDistance,
  geoEqualEarth,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, MultiLineString } from "geojson";
import type { PosterPalette } from "./palettes";
import type { PosterAirport, PosterRoute } from "./data";
import { FONT } from "./text";

export interface MapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  box: MapBox;
  world: Topology;
  palette: PosterPalette;
  routes: PosterRoute[];
  airports: PosterAirport[];
  visited: Set<string>;
  /** equalEarth：平面海报；orthographic：地球（壁纸、单次卡片） */
  kind: "equalEarth" | "orthographic";
  /** 地图中心 [经度, 纬度]；平面图只用经度 */
  center: [number, number];
  /** 平面图：按航线范围放大（上限为整张世界图的 maxZoom 倍） */
  fitRoutes?: boolean;
  maxZoom?: number;
  /** 正射投影的半径（不传则按 box 适配） */
  radius?: number;
  /** 正射投影：把这条航线适配进 fitPadding 内缩后的区域（半径不小于 radius） */
  fitRoute?: [[number, number], [number, number]];
  fitPadding?: { top: number; right: number; bottom: number; left: number };
  /** 线宽、点大小的整体缩放 */
  k?: number;
  labels?: number;
}

const countriesCache = new WeakMap<Topology, FeatureCollection>();
function countries(world: Topology): FeatureCollection {
  let fc = countriesCache.get(world);
  if (!fc) {
    fc = feature(world, world.objects.countries as GeometryCollection) as FeatureCollection;
    countriesCache.set(world, fc);
  }
  return fc;
}

/** 海报上的地图：国界、经纬网、大圆航线（d3 自动按大圆绘制并处理 180° 经线）、机场。 */
export function PosterMap({
  box,
  world,
  palette: p,
  routes,
  airports,
  visited,
  kind,
  center,
  fitRoutes = false,
  maxZoom = 6,
  radius,
  fitRoute,
  fitPadding = { top: 60, right: 60, bottom: 60, left: 60 },
  k = 1,
  labels = 0,
}: Props) {
  const id = useId().replace(/:/g, "");
  const fc = countries(world);

  const projection = useMemo<GeoProjection>(() => {
    const extent: [[number, number], [number, number]] = [
      [box.x, box.y],
      [box.x + box.width, box.y + box.height],
    ];
    if (kind === "orthographic") {
      const proj = geoOrthographic().rotate([-center[0], -center[1]]).clipAngle(90);
      if (fitRoute) {
        proj.fitExtent(
          [
            [box.x + fitPadding.left, box.y + fitPadding.top],
            [box.x + box.width - fitPadding.right, box.y + box.height - fitPadding.bottom],
          ],
          { type: "LineString", coordinates: fitRoute },
        );
        // 远程航线不缩到比 radius 更小；放大后把航线的外框平移回留白区域的中心
        if (radius && proj.scale() < radius) {
          proj.scale(radius);
          const [[x0, y0], [x1, y1]] = geoPath(proj).bounds({ type: "LineString", coordinates: fitRoute });
          const cxTarget = box.x + (fitPadding.left + box.width - fitPadding.right) / 2;
          const cyTarget = box.y + (fitPadding.top + box.height - fitPadding.bottom) / 2;
          const [tx, ty] = proj.translate();
          proj.translate([tx + cxTarget - (x0 + x1) / 2, ty + cyTarget - (y0 + y1) / 2]);
        }
        return proj;
      }
      if (radius) return proj.scale(radius).translate([box.x + box.width / 2, box.y + box.height / 2]);
      return proj.fitExtent(extent, { type: "Sphere" });
    }
    const proj = geoEqualEarth().rotate([-center[0], 0]).fitExtent(extent, { type: "Sphere" });
    if (!fitRoutes || routes.length === 0) return proj;
    const whole = proj.scale();
    const lines: MultiLineString = { type: "MultiLineString", coordinates: routes.map((r) => [r.a, r.b]) };
    const pad = Math.min(box.width, box.height) * 0.14;
    const fitted = geoEqualEarth()
      .rotate([-center[0], 0])
      .fitExtent(
        [
          [box.x + pad, box.y + pad],
          [box.x + box.width - pad, box.y + box.height - pad],
        ],
        lines,
      );
    if (fitted.scale() <= whole) return proj;
    if (fitted.scale() <= whole * maxZoom) return fitted;
    // 放大有上限：限制缩放后，把航线范围的中心重新对齐到地图框中心
    const mid: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];
    const focus = fitted.invert!(mid)!;
    const capped = fitted.scale(whole * maxZoom);
    const at = capped(focus)!;
    const [tx, ty] = capped.translate();
    return capped.translate([tx + mid[0] - at[0], ty + mid[1] - at[1]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.x, box.y, box.width, box.height, kind, center[0], center[1], fitRoutes, maxZoom, radius, routes, fitRoute?.flat().join()]);

  const path = geoPath(projection);
  const zoomed = kind === "equalEarth" && fitRoutes && projection.scale() > 0 && routes.length > 0;
  const [cx, cy] = projection.translate();
  const visible = (lon: number, lat: number) =>
    kind !== "orthographic" || geoDistance([lon, lat], [center[0], center[1]]) < Math.PI / 2 - 0.02;

  // 航线：单色模式用沿航线方向的渐变（起点 → 终点）
  const routeEls = routes.map((r, i) => {
    const d = path({ type: "LineString", coordinates: [r.a, r.b] });
    if (!d) return null;
    const w = (1.1 + Math.log2(r.count) * 0.9) * k;
    let stroke = r.color ?? p.routeFrom;
    let gradient: React.ReactNode = null;
    if (!r.color && p.routeFrom !== p.routeTo) {
      const pa = projection(r.a);
      const pb = projection(r.b);
      if (pa && pb) {
        const gid = `${id}-g${i}`;
        gradient = (
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}>
            <stop offset="0" stopColor={p.routeFrom} />
            <stop offset="1" stopColor={p.routeTo} />
          </linearGradient>
        );
        stroke = `url(#${gid})`;
      }
    }
    return { d, w, stroke, gradient, key: r.key };
  });

  const maxCount = Math.max(1, ...airports.map((a) => a.count));
  const dots = airports
    .filter((a) => visible(a.lon, a.lat))
    .map((a) => {
      const pt = projection([a.lon, a.lat]);
      return pt ? { ...a, x: pt[0], y: pt[1], r: (1.6 + Math.sqrt(a.count / maxCount) * 3.2) * k } : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .filter((a) => a.x >= box.x && a.x <= box.x + box.width && a.y >= box.y && a.y <= box.y + box.height);

  // 标签：到访多的优先，简单避让
  const placed: { x: number; y: number }[] = [];
  const labelled = [...dots]
    .sort((a, b) => Number(b.home) - Number(a.home) || b.count - a.count)
    .filter((a) => {
      if (placed.length >= labels) return false;
      if (placed.some((q) => Math.abs(q.x - a.x) < 44 * k && Math.abs(q.y - a.y) < 20 * k)) return false;
      placed.push(a);
      return true;
    });

  return (
    <g clipPath={`url(#${id}-box)`}>
      <defs>
        <clipPath id={`${id}-clip`}>
          {kind === "orthographic" ? (
            <circle cx={cx} cy={cy} r={projection.scale()} />
          ) : (
            <rect x={box.x} y={box.y} width={box.width} height={box.height} />
          )}
        </clipPath>
        <clipPath id={`${id}-box`}>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} />
        </clipPath>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={3 * k} />
        </filter>
        {kind === "orthographic" && (
          <radialGradient id={`${id}-shade`} cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#ffffff" stopOpacity={p.id === "night" ? 0.06 : 0.25} />
            <stop offset="1" stopColor="#000000" stopOpacity={p.id === "night" ? 0.35 : 0.08} />
          </radialGradient>
        )}
        {routeEls.map((r) => r && <Fragment key={r.key}>{r.gradient}</Fragment>)}
      </defs>

      <g clipPath={`url(#${id}-clip)`}>
        <path d={path({ type: "Sphere" }) ?? ""} fill={p.ocean} />
        <path d={path(geoGraticule10()) ?? ""} fill="none" stroke={p.graticule} strokeWidth={0.8 * k} />
        {fc.features.map((f, i) => (
          <path
            key={i}
            d={path(f) ?? ""}
            fill={visited.has(String(f.id)) ? p.visited : p.land}
            stroke={p.border}
            strokeWidth={0.6 * k}
            strokeLinejoin="round"
          />
        ))}
        {kind === "orthographic" && <circle cx={cx} cy={cy} r={projection.scale()} fill={`url(#${id}-shade)`} />}
        {p.routeGlow &&
          routeEls.map(
            (r) =>
              r && (
                <path
                  key={`glow-${r.key}`}
                  d={r.d}
                  fill="none"
                  stroke={r.stroke}
                  strokeWidth={r.w * 3.2}
                  strokeLinecap="round"
                  opacity={0.35}
                  filter={`url(#${id}-glow)`}
                />
              ),
          )}
        {routeEls.map(
          (r) =>
            r && (
              <path key={r.key} d={r.d} fill="none" stroke={r.stroke} strokeWidth={r.w} strokeLinecap="round" opacity={0.95} />
            ),
        )}
        {dots.map((a) => (
          <circle key={a.code} cx={a.x} cy={a.y} r={a.r} fill={a.home ? p.accent : p.airport} stroke={p.airportRing} strokeWidth={1.2 * k} />
        ))}
        {labelled.map((a) => (
          <text
            key={`l-${a.code}`}
            x={a.x}
            y={a.y - a.r - 5 * k}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={11 * k}
            fontWeight={700}
            letterSpacing={0.5 * k}
            fill={p.text}
            stroke={p.id === "night" ? "rgba(5,8,15,0.8)" : p.bg}
            strokeWidth={3 * k}
            paintOrder="stroke"
          >
            {a.code}
          </text>
        ))}
      </g>
      {kind === "orthographic" ? (
        <circle cx={cx} cy={cy} r={projection.scale()} fill="none" stroke={p.id === "night" ? "rgba(140,180,255,0.35)" : p.faint} strokeWidth={1.2 * k} />
      ) : !zoomed ? (
        <path d={path({ type: "Sphere" }) ?? ""} fill="none" stroke={p.id === "paper" ? p.faint : "none"} strokeWidth={k} />
      ) : null}
    </g>
  );
}

/** 两点大圆的中点，给单次航班卡片定中心用。 */
export function routeCenter(a: [number, number], b: [number, number]): [number, number] {
  return geoInterpolate(a, b)(0.5) as [number, number];
}
