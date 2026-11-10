import { useId, useMemo } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { merge } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Flight } from "../../shared/types";
import { routeKey } from "../../shared/stats";
import type { RefData } from "../lib/refdata";

const W = 720;
const H = 350;
/** 上下裁掉没有航线的极地 */
const VIEW = `0 20 ${W} 268`;

/** 点阵世界地图 + 飞过的航线，作为统计页主卡片的底图（纯装饰，数据在别处都有）。 */
export function RouteBackdrop({
  flights,
  refData,
  world,
  centerLon,
}: {
  flights: Flight[];
  refData: RefData;
  world: Topology | undefined;
  /** 把这条经线放在中间，航线少绕到地图另一头 */
  centerLon: number;
}) {
  const id = useId().replace(/:/g, "");

  const path = useMemo(
    () =>
      geoPath(
        geoEqualEarth()
          .rotate([-centerLon, 0])
          .fitExtent(
            [
              [4, 4],
              [W - 4, H - 4],
            ],
            { type: "Sphere" },
          ),
      ),
    [centerLon],
  );

  const land = useMemo(() => {
    if (!world) return null;
    // 去掉南极洲，画面下方不留一大条
    const geometries = (world.objects.countries as GeometryCollection).geometries.filter((g) => String(g.id) !== "010");
    return path(merge(world, geometries as never));
  }, [world, path]);

  const { routes, dots } = useMemo(() => {
    const seen = new Map<string, string>();
    const airports = new Map<string, [number, number]>();
    for (const f of flights) {
      const a = refData.airports[f.depAirport];
      const b = refData.airports[f.arrAirport];
      if (!a || !b) continue;
      airports.set(f.depAirport, [a.lon, a.lat]);
      airports.set(f.arrAirport, [b.lon, b.lat]);
      const key = routeKey(f.depAirport, f.arrAirport);
      if (seen.has(key)) continue;
      const d = path({
        type: "LineString",
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
      });
      if (d) seen.set(key, d);
    }
    const project = path.projection() as ReturnType<typeof geoEqualEarth>;
    return {
      routes: [...seen],
      dots: [...airports].map(([code, p]) => ({ code, at: project(p) })),
    };
  }, [flights, refData, path]);

  return (
    <svg className="route-backdrop" viewBox={VIEW} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <pattern id={`${id}-dots`} width="6.4" height="6.4" patternUnits="userSpaceOnUse">
          <circle cx="3.2" cy="3.2" r="1.55" style={{ fill: "var(--dot-land)" }} />
        </pattern>
        <linearGradient id={`${id}-route`} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" style={{ stopColor: "var(--coral)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--gold-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--coral)" }} />
        </linearGradient>
      </defs>
      {land && <path d={land} fill={`url(#${id}-dots)`} />}
      <g fill="none" stroke={`url(#${id}-route)`} strokeLinecap="round">
        {routes.map(([key, d], i) => (
          <path
            key={key}
            d={d}
            pathLength={1}
            className="backdrop-route"
            style={{ animationDelay: `${Math.min(i * 35, 900)}ms` }}
          />
        ))}
      </g>
      {dots.map(({ code, at }) => at && <circle key={code} cx={at[0]} cy={at[1]} r="2" className="backdrop-dot" />)}
    </svg>
  );
}
