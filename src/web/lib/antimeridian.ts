import type { Feature, Geometry, LineString, MultiLineString, Position } from "geojson";

/**
 * 让经度连续：相邻两点经度差超过 180° 时，把后一个点平移 ±360°。
 * world-atlas 的国界没有在 180° 经线处切开（d3-geo 渲染时才切），
 * MapLibre 会把 179° → −179° 画成横跨全图的直线，展开后就能正常渲染。
 */
export function unwrapLine(coords: Position[]): Position[] {
  const out: Position[] = [];
  let shift = 0;
  let prev: number | undefined;
  for (const [lon, lat, ...rest] of coords) {
    if (prev !== undefined) {
      const d = lon + shift - prev;
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    prev = lon + shift;
    out.push([prev, lat, ...rest]);
  }
  return out;
}

export function unwrapGeometry<G extends Geometry>(g: G): G {
  switch (g.type) {
    case "LineString":
      return { ...g, coordinates: unwrapLine(g.coordinates) };
    case "MultiLineString":
    case "Polygon":
      return { ...g, coordinates: g.coordinates.map(unwrapLine) };
    case "MultiPolygon":
      return { ...g, coordinates: g.coordinates.map((p) => p.map(unwrapLine)) };
    default:
      return g;
  }
}

/**
 * turf.greatCircle 在 180° 经线处把航线拆成多段；交互地图上合成一条连续的线更好看
 * （MapLibre 支持经度超出 ±180）。
 */
export function joinAntimeridian(
  f: Feature<LineString | MultiLineString>,
): Feature<LineString> {
  const coords =
    f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates.flat();
  return { ...f, geometry: { type: "LineString", coordinates: unwrapLine(coords) } };
}
