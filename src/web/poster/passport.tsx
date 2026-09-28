import { forwardRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoEqualEarth, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { merge } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { kmToMiles } from "../../shared/geo";
import { assetUrl } from "../lib/env";
import type { DistanceUnit } from "../lib/format";
import type { RefData } from "../lib/refdata";
import type { PosterData } from "./data";
import type { PosterPalette } from "./palettes";
import { FONT } from "./text";

/**
 * 飞行护照：护照内页风格的年度 / 生涯卡片。
 * 上半张是线条阴影的世界地图和航线，下半张是航班数、签发信息、四项统计和机读区（MRZ）。
 */

export const PASSPORT_SIZE = { width: 900, height: 1200 };

interface Look {
  bg: string;
  bg2: string;
  wave: string;
  landFrom: string;
  landTo: string;
  visitedOpacity: number;
  landOpacity: number;
  route: string;
  dot: string;
  dotRing: string;
  title: string;
  label: string;
  value: string;
  strong: string;
  texture: string;
  perforation: string;
  strip: [string, string, string];
}

/** 跟随海报配色：纸质 / 浅色是米白护照页，深色是藏青护照页。 */
function lookFor(p: PosterPalette): Look {
  if (p.id === "night") {
    return {
      bg: "#0e1830",
      bg2: "#0a1224",
      wave: "rgba(150,180,230,0.07)",
      landFrom: "#3cc7a6",
      landTo: "#5b8ff0",
      visitedOpacity: 1,
      landOpacity: 0.5,
      route: "#ff9f4a",
      dot: "#ff5a4d",
      dotRing: "#0e1830",
      title: "#e9edff",
      label: "#9fb0ff",
      value: "#c7cde0",
      strong: "#ffffff",
      texture: "rgba(160,180,255,0.045)",
      perforation: "rgba(200,210,240,0.25)",
      strip: ["#8c7cf0", "#f08cb4", "#6fd6c8"],
    };
  }
  const light = p.id === "light";
  return {
    bg: light ? "#fbfcfd" : "#f6f3ea",
    bg2: light ? "#eef3f6" : "#eaf1ee",
    wave: light ? "rgba(70,110,150,0.07)" : "rgba(80,120,120,0.08)",
    landFrom: "#3fbf9f",
    landTo: "#4a8fd8",
    visitedOpacity: 1,
    landOpacity: 0.55,
    route: "#d6752c",
    dot: "#df4a3e",
    dotRing: "#8b1f18",
    title: "#1d2877",
    label: "#3e4aa0",
    value: "#5d6272",
    strong: "#23252b",
    texture: "rgba(30,40,120,0.032)",
    perforation: "rgba(40,50,90,0.2)",
    strip: ["#a99af2", "#f2a2c0", "#8fdad0"],
  };
}

/** 朝上的飞机剪影（与动画共用的造型），长 2。 */
const PLANE =
  "M0,-1 C0.07,-1 0.11,-0.92 0.11,-0.78 L0.11,-0.3 L0.96,0.16 L0.96,0.32 L0.11,0.08 L0.08,0.62 L0.34,0.82 L0.34,0.95 L0,0.87 L-0.34,0.95 L-0.34,0.82 L-0.08,0.62 L-0.11,0.08 L-0.96,0.32 L-0.96,0.16 L-0.11,-0.3 L-0.11,-0.78 C-0.11,-0.92 -0.07,-1 0,-1 Z";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** "2026-09-27" → "27 SEP 26" */
function passportDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MONTHS[+m - 1]} ${y.slice(2)}`;
}

/** 机读区一行：大写 ASCII，其余字符转成 <，补齐 44 位。 */
function mrzLine(parts: string[]): string {
  const clean = parts.map((p) =>
    p
      .toUpperCase()
      .normalize("NFKD")
      .replace(/[^A-Z0-9<@.]/g, "<"),
  );
  const head = clean.slice(0, -1).join("");
  const tail = clean.at(-1) ?? "";
  return (head + "<".repeat(Math.max(2, 44 - head.length - tail.length)) + tail).slice(0, 44);
}

/** “Donny Xia” → XIA<<DONNY；中文名或空名字用 TRAVELER。 */
function mrzName(holder: string | undefined): string {
  const words = (holder ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "TRAVELER";
  if (words.length === 1) return words[0];
  return `${words.at(-1)}<<${words.slice(0, -1).join("<")}`;
}

function flightTime(min: number): { value: string; unit: string }[] {
  if (min >= 24 * 60) {
    const d = Math.floor(min / 1440);
    const h = Math.round((min % 1440) / 60);
    return [
      { value: String(d), unit: "d " },
      { value: String(h), unit: "h" },
    ];
  }
  return [
    { value: String(Math.floor(min / 60)), unit: "h " },
    { value: String(min % 60), unit: "m" },
  ];
}

/** 国旗 SVG → data URL（导出 PNG 时 SVG 图片不能再引用外部文件）。 */
function useFlagImages(codes: string[]) {
  return useQuery({
    queryKey: ["flag-data-urls", codes.join(",")],
    queryFn: async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        codes.map(async (c) => {
          const res = await fetch(assetUrl(`flags/${c}.svg`));
          if (!res.ok) return;
          const svg = await res.text();
          out[c] = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        }),
      );
      return out;
    },
    staleTime: Infinity,
  });
}

/** 经度的圆周平均，用来让地图以常去的地方为中心。 */
function meanLongitude(lons: number[]): number {
  if (!lons.length) return 0;
  const r = Math.PI / 180;
  const x = lons.reduce((s, l) => s + Math.cos(l * r), 0);
  const y = lons.reduce((s, l) => s + Math.sin(l * r), 0);
  return Math.atan2(y, x) / r;
}

export interface PassportProps {
  data: PosterData;
  palette: PosterPalette;
  world: Topology;
  refData: RefData;
  unit: DistanceUnit;
  year?: number;
  holder?: string;
}

export const PassportPoster = forwardRef<SVGSVGElement, PassportProps>(function PassportPoster(
  { data, palette, world, unit, year, holder },
  ref,
) {
  const { width: W, height: H } = PASSPORT_SIZE;
  const L = lookFor(palette);
  const { stats } = data;
  const countries = stats.countries.slice(0, 12).map((c) => c.key);
  const flags = useFlagImages(countries);

  const map = useMemo(() => {
    const obj = world.objects.countries as GeometryCollection;
    // 去掉南极洲（ISO 010），地图能放得更大
    const geoms = obj.geometries.filter((g) => String(g.id) !== "010");
    const landShape = merge(world, geoms as never) as GeoPermissibleObjects;
    const lon0 = data.home ? data.home.lon : meanLongitude(data.airports.map((a) => a.lon));
    const projection = geoEqualEarth()
      .rotate([-lon0 + 10, 0])
      .fitExtent(
        [
          [30, 96],
          [W - 30, 612],
        ],
        landShape,
      );
    const path = geoPath(projection);
    const land = path(landShape) ?? "";
    const visited = path(
      merge(world, geoms.filter((g) => data.visited.has(String(g.id))) as never) as GeoPermissibleObjects,
    );
    const routes = data.routes.map((r) => ({
      key: r.key,
      d: path({ type: "LineString", coordinates: [r.a, r.b] }) ?? "",
    }));
    const dots = data.airports
      .map((a) => ({ ...a, xy: projection([a.lon, a.lat]) }))
      .filter((a): a is typeof a & { xy: [number, number] } => !!a.xy);
    return { land, visited, routes, dots };
  }, [world, data, W]);

  const today = new Date().toISOString().slice(0, 10);
  const first = data.flights.map((f) => f.flightDate).sort()[0] ?? today;
  const title = `${year ?? "ALL-TIME"} FLIGHT PASSPORT`;
  const home = data.home?.code ?? stats.airports[0]?.key ?? "---";
  const distance = Math.round(unit === "km" ? stats.distanceKm : kmToMiles(stats.distanceKm)).toLocaleString("en-US");
  const name = mrzName(holder);
  const mrz1 = mrzLine([`${year ?? "ALL"}<<`, `${name}<<`, `FIRST${passportDate(first).replace(/ /g, "")}`, "<<HANGJI"]);
  const mrz2 = mrzLine([`ISSUED${passportDate(today).replace(/ /g, "")}${home}`, `${stats.flights}FLIGHTS`]);

  // 下半张的机场代码底纹
  const codes = stats.airports.map((a) => a.key);
  const textureRow = (i: number) => {
    if (!codes.length) return "";
    const row: string[] = [];
    for (let k = 0; row.join(" ").length < 110; k++) row.push(codes[(k * 7 + i * 3) % codes.length]);
    return row.join(" ");
  };

  // 顶部飞机条：6 架飞机 + 常驻机场代码，循环
  const strip: { x: number; kind: "plane" | "code"; t: number }[] = [];
  for (let x = 14, i = 0; x < W; i++) {
    const kind = i % 8 === 7 ? "code" : "plane";
    strip.push({ x, kind, t: x / W });
    x += kind === "code" ? 92 : 34;
  }
  const stripColor = (t: number) => (t < 0.33 ? L.strip[0] : t < 0.66 ? L.strip[1] : L.strip[2]);

  const statCols = [
    { label: "距离", parts: [{ value: distance, unit: ` ${unit}` }] },
    { label: "飞行时长", parts: flightTime(stats.durationMin) },
    { label: "机场", parts: [{ value: String(stats.airports.length), unit: "" }] },
    { label: "航司", parts: [{ value: String(stats.airlines.length), unit: "" }] },
  ];
  const statX = [56, 330, 580, 745];

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      fontFamily={FONT}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <linearGradient id="pp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.bg} />
          <stop offset="1" stopColor={L.bg2} />
        </linearGradient>
        <linearGradient id="pp-land" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={L.landFrom} />
          <stop offset="1" stopColor={L.landTo} />
        </linearGradient>
        <linearGradient id="pp-icon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9b8ff" />
          <stop offset="0.5" stopColor="#f6c2dc" />
          <stop offset="1" stopColor="#a8ecf0" />
        </linearGradient>
        {/* 横线阴影：白线在遮罩里 = 显示渐变 */}
        <pattern id="pp-hatch" patternUnits="userSpaceOnUse" width={W} height={5}>
          <rect y={1.6} width={W} height={1.7} fill="#fff" />
        </pattern>
        <mask id="pp-land-mask">
          <path d={map.land} fill="url(#pp-hatch)" opacity={L.landOpacity} />
          {map.visited && <path d={map.visited} fill="url(#pp-hatch)" opacity={L.visitedOpacity} />}
        </mask>
        <clipPath id="pp-flag-clip">
          <circle r={17} />
        </clipPath>
      </defs>

      <rect width={W} height={H} fill="url(#pp-bg)" />
      {/* 护照底纹：细波浪线 */}
      {Array.from({ length: 34 }, (_, i) => {
        const y0 = 20 + i * 36;
        let d = `M0 ${y0}`;
        for (let x = 0; x <= W; x += 30) d += ` L${x} ${(y0 + Math.sin(x / 70 + i * 0.7) * 7).toFixed(1)}`;
        return <path key={i} d={d} fill="none" stroke={L.wave} strokeWidth={1} />;
      })}

      {/* 顶部飞机条 */}
      {strip.map((s, i) =>
        s.kind === "plane" ? (
          <path
            key={i}
            d={PLANE}
            transform={`translate(${s.x + 11} 48) rotate(90) scale(11)`}
            fill={stripColor(s.t)}
            opacity={0.55 + 0.35 * Math.sin((i / strip.length) * Math.PI)}
          />
        ) : (
          <g key={i} opacity={0.75}>
            <circle cx={s.x + 12} cy={48} r={10} fill={stripColor(s.t)} />
            <path d={PLANE} transform={`translate(${s.x + 12} 48) rotate(90) scale(6)`} fill={L.bg} />
            <text x={s.x + 28} y={57} fontSize={26} fontWeight={600} letterSpacing={1} fill={stripColor(s.t)}>
              {home}
            </text>
          </g>
        ),
      )}

      {/* 左侧竖排的描边字 */}
      <text
        transform={`translate(40 ${370}) rotate(-90)`}
        textAnchor="middle"
        fontSize={46}
        fontWeight={700}
        letterSpacing={6}
        fill="none"
        stroke={L.label}
        strokeOpacity={0.35}
        strokeWidth={1.2}
        strokeDasharray="2 3"
      >
        FLIGHT PASSPORT
      </text>

      {/* 地图 */}
      <rect width={W} height={H} fill="url(#pp-land)" mask="url(#pp-land-mask)" />
      {map.routes.map((r) => (
        <path key={r.key} d={r.d} fill="none" stroke={L.route} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
      ))}
      {map.dots.map((a) => (
        <circle
          key={a.code}
          cx={a.xy[0]}
          cy={a.xy[1]}
          r={a.home ? 8 : 6.5}
          fill={L.dot}
          stroke={L.dotRing}
          strokeWidth={1.6}
        />
      ))}

      {/* 国旗 */}
      <g transform={`translate(${W / 2 - ((countries.length - 1) * 26) / 2} 632)`}>
        {countries.map((c, i) => (
          <g key={c} transform={`translate(${i * 26} 0)`}>
            <circle r={18.5} fill={L.bg} />
            {flags.data?.[c] ? (
              <image
                href={flags.data[c]}
                x={-26}
                y={-17}
                width={52}
                height={34}
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#pp-flag-clip)"
              />
            ) : (
              <circle r={17} fill={L.perforation} />
            )}
          </g>
        ))}
      </g>

      {/* 撕线 */}
      <line x1={0} x2={W} y1={684} y2={684} stroke={L.perforation} strokeWidth={1.4} strokeDasharray="6 6" />

      {/* 下半张底纹：去过的机场代码 */}
      {Array.from({ length: 28 }, (_, i) => (
        <text
          key={i}
          x={-20 - (i % 3) * 18}
          y={706 + i * 18}
          fontSize={13}
          fontWeight={600}
          letterSpacing={3}
          fill={L.texture}
        >
          {textureRow(i)}
        </text>
      ))}

      {/* 标题 */}
      <text x={56} y={756} fontSize={year ? 50 : 43} fontWeight={600} letterSpacing={1} fill={L.title}>
        {title}
      </text>
      <rect x={58} y={778} width={30} height={16} rx={2} fill={L.strong} opacity={0.85} />
      <circle cx={73} cy={786} r={4.5} fill={L.bg} />
      <text x={100} y={793} fontSize={20} fontWeight={600} letterSpacing={1.5} fill={L.strong} opacity={0.85}>
        航迹 · 飞行护照 · PASSPORT
      </text>
      <rect x={W - 124} y={712} width={70} height={70} rx={16} fill="url(#pp-icon)" />
      <path d={PLANE} transform={`translate(${W - 89} 747) rotate(45) scale(20)`} fill="#fff" opacity={0.95} />

      {/* 航班数 */}
      <text x={52} y={938} fontSize={132} fontWeight={800} letterSpacing={-4} fill={L.strong}>
        {stats.flights}
      </text>
      <text x={58} y={1004} fontSize={58} fontWeight={400} fill={L.label}>
        次飞行
      </text>

      {/* 签发信息 */}
      {[
        ["签发机构", "航迹"],
        ["签发地", home],
        ["签发日期", passportDate(today)],
        ["首次飞行", passportDate(first)],
      ].map(([k, v], i) => (
        <text key={k} x={470} y={862 + i * 50} fontSize={27}>
          <tspan fill={L.label}>{k}</tspan>
          <tspan fill={L.value} dx={12}>
            {v}
          </tspan>
        </text>
      ))}

      {/* 四项统计 */}
      {statCols.map((s, i) => (
        <g key={s.label}>
          <text x={statX[i]} y={1060} fontSize={25} fill={L.label}>
            {s.label}
          </text>
          <text x={statX[i]} y={1110} fontSize={46} fontWeight={700} fill={L.strong} letterSpacing={-0.5}>
            {s.parts.map((p, k) => (
              <tspan key={k}>
                {p.value}
                <tspan fontWeight={400} fill={L.value}>
                  {p.unit}
                </tspan>
              </tspan>
            ))}
          </text>
        </g>
      ))}

      {/* 机读区 */}
      <line x1={56} x2={W - 56} y1={1130} y2={1130} stroke={L.perforation} strokeWidth={1} />
      {[mrz1, mrz2].map((line, i) => (
        <text
          key={i}
          x={W / 2}
          y={1158 + i * 30}
          textAnchor="middle"
          fontSize={25}
          fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace"
          letterSpacing={1.2}
          fill={L.value}
        >
          {line}
        </text>
      ))}
    </svg>
  );
});
