import { useId, useMemo } from "react";
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Airport } from "../../shared/types";

interface Props {
  world: Topology | undefined;
  dep?: Airport & { code: string };
  arr?: Airport & { code: string };
  /** 没有航线时的默认视角中心 [lon, lat] */
  fallbackCenter?: [number, number];
  width?: number;
  height?: number;
}

/** 正射投影的小地球：自动转到航线中点并按航线长度缩放。 */
export function RouteGlobe({ world, dep, arr, fallbackCenter = [110, 25], width = 380, height = 280 }: Props) {
  const id = useId().replace(/:/g, "");
  const land = useMemo(
    () => (world ? merge(world, (world.objects.countries as GeometryCollection).geometries as never) : null),
    [world],
  );
  const borders = useMemo(
    () => (world ? feature(world, world.objects.countries as GeometryCollection) : null),
    [world],
  );

  const a = dep ? ([dep.lon, dep.lat] as [number, number]) : undefined;
  const b = arr ? ([arr.lon, arr.lat] as [number, number]) : undefined;
  const mid = a && b ? geoInterpolate(a, b)(0.5) : (a ?? b ?? fallbackCenter);
  const angle = a && b ? geoDistance(a, b) : 0;
  // 经过投影中心的大圆会被画成直线；把视角中心往南挪一点，航线就会呈现向上拱起的弧
  const tilt = a && b ? Math.min(28, Math.max(4, ((angle * 180) / Math.PI) * 0.4)) : 0;
  const center: [number, number] = [mid[0], Math.max(-80, mid[1] - tilt)];

  const size = Math.min(width, height);
  const whole = size * 0.44;
  const projection = geoOrthographic()
    .rotate([-center[0], -center[1]])
    .clipAngle(90)
    .scale(whole)
    .translate([width / 2, height / 2]);
  if (a && b) {
    const pad = 56;
    projection.fitExtent(
      [
        [pad, pad],
        [width - pad, height - pad],
      ],
      { type: "LineString", coordinates: [a, b] },
    );
    // 远程航线显示完整地球，短途航线放大；地球完整时保持居中
    const k = Math.min(size * 6, Math.max(whole, projection.scale()));
    if (k === whole) projection.scale(whole).translate([width / 2, height / 2]);
    else projection.scale(k);
  }
  const radius = projection.scale();
  const [cx, cy] = projection.translate();
  const path = geoPath(projection);
  const route = a && b ? path({ type: "LineString", coordinates: [a, b] }) : null;

  const point = (p: [number, number] | undefined) => {
    if (!p || geoDistance(p, center) > Math.PI / 2) return null;
    return projection(p);
  };
  const pa = point(a);
  const pb = point(b);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="航线预览">
      <defs>
        <radialGradient id={`${id}-sphere`} cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#12213d" />
          <stop offset="1" stopColor="#070e1c" />
        </radialGradient>
        <radialGradient id={`${id}-halo`} r="50%">
          <stop offset="0.86" stopColor="rgba(120,170,255,0)" />
          <stop offset="0.93" stopColor="rgba(120,170,255,0.16)" />
          <stop offset="1" stopColor="rgba(120,170,255,0)" />
        </radialGradient>
        <linearGradient id={`${id}-route`} gradientUnits="userSpaceOnUse" x1={pa?.[0] ?? 0} y1={pa?.[1] ?? 0} x2={pb?.[0] ?? 1} y2={pb?.[1] ?? 1}>
          <stop offset="0" stopColor="#ffd48a" />
          <stop offset="1" stopColor="#ff7a5c" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {radius < size * 0.6 && (
        <circle cx={cx} cy={cy} r={radius * 1.16} fill={`url(#${id}-halo)`} />
      )}
      <path d={path({ type: "Sphere" }) ?? ""} fill={`url(#${id}-sphere)`} stroke="rgba(140,180,255,0.18)" />
      <path d={path(geoGraticule10()) ?? ""} fill="none" stroke="rgba(140,170,220,0.07)" strokeWidth={0.6} />
      {land && <path d={path(land) ?? ""} fill="#1a2944" />}
      {borders && <path d={path(borders) ?? ""} fill="none" stroke="#0c1628" strokeWidth={0.6} />}
      {route && (
        <g key={`${dep?.code}-${arr?.code}`} className="globe-route">
          <path d={route} fill="none" stroke="#ffb84d" strokeWidth={6} opacity={0.35} filter={`url(#${id}-glow)`} pathLength={1} />
          <path d={route} fill="none" stroke={`url(#${id}-route)`} strokeWidth={2.2} strokeLinecap="round" pathLength={1} />
        </g>
      )}
      {[
        [pa, dep?.code, "#ffffff"],
        [pb, arr?.code, "#ff7a5c"],
      ].map(([p, code, color]) =>
        p ? (
          <g key={code as string} transform={`translate(${(p as number[])[0]},${(p as number[])[1]})`}>
            <circle r={9} fill={color as string} opacity={0.18} />
            <circle r={3.6} fill={color as string} stroke="#0b111d" strokeWidth={1.5} />
            <text y={-12} textAnchor="middle" className="globe-label">
              {code as string}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}
