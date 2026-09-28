import { forwardRef, type ReactNode } from "react";
import type { Topology } from "topojson-specification";
import type { Flight } from "../../shared/types";
import { monthMatrix } from "../../shared/stats";
import { formatDuration } from "../../shared/time";
import { kmToMiles } from "../../shared/geo";
import type { RefData } from "../lib/refdata";
import { aircraftName, airlineName, cityName, formatDate, localTimes, type DistanceUnit } from "../lib/format";
import { airlineHue } from "../ui/AirlineBadge";
import type { PosterPalette } from "./palettes";
import type { PosterData } from "./data";
import { geoDistance } from "d3-geo";
import { PosterMap, routeCenter } from "./PosterMap";
import { FONT } from "./text";
import { useAirlineLogo } from "../lib/logos";
import { PassportPoster } from "./passport";

export type TemplateId = "year" | "overview" | "card" | "wallpaper" | "passport";

export interface TemplateSpec {
  id: TemplateId;
  name: string;
  ratio: string;
  width: number;
  height: number;
}

/** 逻辑尺寸；导出时 ×3。 */
export const TEMPLATES: Record<TemplateId, TemplateSpec> = {
  year: { id: "year", name: "年度海报", ratio: "4:5", width: 800, height: 1000 },
  overview: { id: "overview", name: "生涯总览", ratio: "16:9", width: 1600, height: 900 },
  card: { id: "card", name: "航班卡片", ratio: "1:1", width: 900, height: 900 },
  wallpaper: { id: "wallpaper", name: "手机壁纸", ratio: "9:19.5", width: 600, height: 1300 },
  passport: { id: "passport", name: "飞行护照", ratio: "3:4", width: 900, height: 1200 },
};

export interface TemplateProps {
  data: PosterData;
  palette: PosterPalette;
  world: Topology;
  refData: RefData;
  unit: DistanceUnit;
  year?: number;
  flight?: Flight;
  /** 壁纸地球的视角中心 */
  rotation?: [number, number];
  /** 护照上的持有人姓名（机读区） */
  holder?: string;
}

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const dist = (km: number, unit: DistanceUnit) => num(unit === "km" ? km : kmToMiles(km));

/** 画布：背景色、柔光、星空（夜空主题）、边框（复古主题）。 */
const Canvas = forwardRef<SVGSVGElement, { spec: TemplateSpec; p: PosterPalette; children: ReactNode }>(
  function Canvas({ spec, p, children }, ref) {
    const { width: W, height: H } = spec;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
          <radialGradient id="poster-glow" cx="30%" cy="0%" r="90%">
            <stop offset="0" stopColor={p.glow ?? p.bg} />
            <stop offset="1" stopColor={p.bg} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill={p.bg} />
        {p.glow && <rect width={W} height={H} fill="url(#poster-glow)" />}
        {p.stars &&
          Array.from({ length: Math.round((W * H) / 5200) }, (_, i) => {
            const x = rand() * W;
            const y = rand() * H;
            const r = rand() > 0.94 ? 1.3 : 0.7;
            return <circle key={i} cx={x} cy={y} r={r} fill="#dfe8ff" opacity={0.15 + rand() * 0.55} />;
          })}
        {children}
        {p.frame && (
          <>
            <rect x={14} y={14} width={W - 28} height={H - 28} fill="none" stroke={p.frame} strokeWidth={1.6} />
            <rect x={20} y={20} width={W - 40} height={H - 40} fill="none" stroke={p.frame} strokeWidth={0.6} />
          </>
        )}
      </svg>
    );
  },
);

function Legend({ data, p, x, y, k = 1 }: { data: PosterData; p: PosterPalette; x: number; y: number; k?: number }) {
  if (data.legend.length < 2) return null;
  let cx = x;
  return (
    <g>
      {data.legend.map((item) => {
        const w = 26 * k + item.label.length * 7.5 * k + 14 * k;
        const g = (
          <g key={item.label} transform={`translate(${cx},${y})`}>
            <line x1={0} x2={18 * k} y1={0} y2={0} stroke={item.color} strokeWidth={3 * k} strokeLinecap="round" />
            <text x={24 * k} y={4 * k} fontSize={12 * k} fill={p.muted}>
              {item.label}
            </text>
          </g>
        );
        cx += w;
        return g;
      })}
    </g>
  );
}

function Stat({ x, y, value, label, p, size = 34, align = "start" }: { x: number; y: number; value: string; label: string; p: PosterPalette; size?: number; align?: "start" | "middle" | "end" }) {
  return (
    <g>
      <text x={x} y={y} fontSize={size} fontWeight={750} fill={p.text} textAnchor={align} letterSpacing={-0.5}>
        {value}
      </text>
      <text x={x} y={y + size * 0.62} fontSize={Math.max(12, size * 0.38)} fill={p.muted} textAnchor={align}>
        {label}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ 年度海报 4:5 */

export const YearPoster = forwardRef<SVGSVGElement, TemplateProps>(function YearPoster(
  { data, palette: p, world, unit, year },
  ref,
) {
  const spec = TEMPLATES.year;
  const { stats } = data;
  const months = monthMatrix(data.flights).counts.get(year ?? 0) ?? new Array(12).fill(0);
  const maxMonth = Math.max(1, ...months);
  const center: [number, number] = [data.home?.lon ?? 110, 0];
  const longest = stats.longest;
  const topAirport = stats.airports[0]?.key;
  const topAircraft = stats.aircraft[0]?.key;

  return (
    <Canvas ref={ref} spec={spec} p={p}>
      <text x={56} y={78} fontSize={13} fontWeight={700} letterSpacing={3} fill={p.muted}>
        FLIGHT LOG
      </text>
      <text x={744} y={78} fontSize={13} fontWeight={600} fill={p.muted} textAnchor="end">
        航迹
      </text>
      <text x={52} y={180} fontSize={104} fontWeight={800} letterSpacing={-4} fill={p.text}>
        {year}
      </text>
      <text x={60} y={222} fontSize={26} fontWeight={600} fill={p.muted}>
        年度飞行
      </text>

      <PosterMap
        box={{ x: 0, y: 258, width: 800, height: 400 }}
        world={world}
        palette={p}
        routes={data.routes}
        airports={data.airports}
        visited={data.visited}
        kind="equalEarth"
        center={center}
        fitRoutes
        maxZoom={4}
        labels={8}
      />
      <defs>
        <linearGradient id="yp-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.bg} />
          <stop offset="0.12" stopColor={p.bg} stopOpacity={0} />
          <stop offset="0.86" stopColor={p.bg} stopOpacity={0} />
          <stop offset="1" stopColor={p.bg} />
        </linearGradient>
      </defs>
      <rect x={0} y={258} width={800} height={400} fill="url(#yp-fade)" />
      <Legend data={data} p={p} x={56} y={640} />

      <text x={56} y={712} fontSize={14} fill={p.muted}>
        飞行里程
      </text>
      <text x={52} y={778} fontSize={68} fontWeight={800} letterSpacing={-2} fill={p.text}>
        {dist(stats.distanceKm, unit)}
        <tspan fontSize={24} fontWeight={600} fill={p.muted} dx={10}>
          {unit}
        </tspan>
      </text>

      <Stat x={56} y={852} value={num(stats.flights)} label="航段" p={p} />
      <Stat x={216} y={852} value={num(stats.durationMin / 60)} label="小时" p={p} />
      <Stat x={376} y={852} value={num(stats.airports.length)} label="机场" p={p} />
      <Stat x={536} y={852} value={num(stats.countries.length)} label="国家/地区" p={p} />

      {/* 每月航段：单系列柱状，柱宽 ≤24、顶部圆角 */}
      <g transform="translate(536,690)">
        <text x={0} y={0} fontSize={12} fill={p.muted}>
          每月航段
        </text>
        {months.map((m, i) => {
          const h = (m / maxMonth) * 70;
          const x = i * 17;
          return (
            <g key={i}>
              <rect x={x} y={14} width={12} height={70} rx={3} fill={p.faint} opacity={0.18} />
              {m > 0 && <rect x={x} y={84 - h} width={12} height={h} rx={3} fill={p.accent} />}
            </g>
          );
        })}
        <text x={0} y={102} fontSize={10} fill={p.faint}>
          1月
        </text>
        <text x={11 * 17 + 12} y={102} fontSize={10} fill={p.faint} textAnchor="end">
          12月
        </text>
      </g>

      <line x1={56} x2={744} y1={918} y2={918} stroke={p.faint} strokeOpacity={0.35} />
      <text x={56} y={948} fontSize={14} fill={p.muted}>
        {[
          topAirport && `最常去 ${topAirport}`,
          longest && `最长 ${longest.depAirport}–${longest.arrAirport} ${dist(longest.distanceKm ?? 0, unit)} ${unit}`,
          topAircraft && `最常坐 ${topAircraft}`,
        ]
          .filter(Boolean)
          .join("   ·   ")}
      </text>
    </Canvas>
  );
});

/* ------------------------------------------------------------------ 生涯总览 16:9 */

export const OverviewPoster = forwardRef<SVGSVGElement, TemplateProps>(function OverviewPoster(
  { data, palette: p, world, unit },
  ref,
) {
  const spec = TEMPLATES.overview;
  const { stats, years } = data;
  const span = years.length ? (years[0] === years.at(-1) ? `${years[0]}` : `${years[0]} – ${years.at(-1)}`) : "";
  const center: [number, number] = [data.home?.lon ?? 110, 0];
  return (
    <Canvas ref={ref} spec={spec} p={p}>
      <PosterMap
        box={{ x: 0, y: 40, width: 1600, height: 820 }}
        world={world}
        palette={p}
        routes={data.routes}
        airports={data.airports}
        visited={data.visited}
        kind="equalEarth"
        center={center}
        k={1.25}
        labels={14}
      />
      <defs>
        <linearGradient id="ov-scrim" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.bg} stopOpacity={0} />
          <stop offset="1" stopColor={p.bg} stopOpacity={0.92} />
        </linearGradient>
      </defs>
      <rect x={0} y={560} width={1600} height={340} fill="url(#ov-scrim)" />

      <text x={72} y={96} fontSize={16} fontWeight={700} letterSpacing={4} fill={p.muted}>
        FLIGHT LOG · {span}
      </text>
      <Legend data={data} p={p} x={72} y={128} k={1.2} />

      <text x={68} y={782} fontSize={96} fontWeight={800} letterSpacing={-3} fill={p.text}>
        {dist(stats.distanceKm, unit)}
        <tspan fontSize={32} fontWeight={600} fill={p.muted} dx={14}>
          {unit}
        </tspan>
      </text>
      <text x={72} y={832} fontSize={20} fill={p.muted}>
        绕地球 {(stats.distanceKm / 40075).toFixed(1)} 圈 · 空中 {(stats.durationMin / 60 / 24).toFixed(1)} 天
      </text>
      <Stat x={900} y={780} value={num(stats.flights)} label="航段" p={p} size={48} />
      <Stat x={1070} y={780} value={num(stats.airports.length)} label="机场" p={p} size={48} />
      <Stat x={1240} y={780} value={num(stats.countries.length)} label="国家/地区" p={p} size={48} />
      <Stat x={1420} y={780} value={num(stats.airlines.length)} label="航司" p={p} size={48} />
    </Canvas>
  );
});

/* ------------------------------------------------------------------ 单次航班卡片 1:1 */

export const FlightCard = forwardRef<SVGSVGElement, TemplateProps>(function FlightCard(
  { data, palette: p, world, refData, unit, flight },
  ref,
) {
  const spec = TEMPLATES.card;
  // 徽标用 data URL 嵌入，导出 PNG 时才画得出来
  const logo = useAirlineLogo(flight?.airline);
  if (!flight) {
    return (
      <Canvas ref={ref} spec={spec} p={p}>
        <text x={450} y={450} textAnchor="middle" fontSize={24} fill={p.muted}>
          请选择一段航班
        </text>
      </Canvas>
    );
  }
  const a = refData.airports[flight.depAirport];
  const b = refData.airports[flight.arrAirport];
  const t = localTimes(flight, refData);
  const mid = a && b ? routeCenter([a.lon, a.lat], [b.lon, b.lat]) : ([0, 0] as [number, number]);
  // 视角中心略向南偏，让航线呈上拱的弧线；偏移量随航线长度增加
  const angle = a && b ? geoDistance([a.lon, a.lat], [b.lon, b.lat]) : 0;
  const tilt = Math.min(14, ((angle * 180) / Math.PI) * 0.25);
  const hue = airlineHue(flight.airline);
  const route = data.routes.slice(0, 1);
  const cells: [string, string][] = [
    ["机型", flight.aircraftType ? aircraftName(flight.aircraftType, refData).replace(/^(Boeing|Airbus) /, "") : "—"],
    ["时长", flight.durationMin ? formatDuration(flight.durationMin) : "—"],
    ["距离", flight.distanceKm ? `${dist(flight.distanceKm, unit)} ${unit}` : "—"],
    ["座位", flight.seat ?? "—"],
  ];
  return (
    <Canvas ref={ref} spec={spec} p={p}>
      {/* 地球：以航线中点为中心、略向南偏，让航线呈弧形 */}
      <PosterMap
        box={{ x: 0, y: 0, width: 900, height: 560 }}
        world={world}
        palette={p}
        routes={route}
        airports={data.airports}
        visited={data.visited}
        kind="orthographic"
        center={[mid[0], mid[1] - tilt]}
        radius={420}
        fitRoute={a && b ? [[a.lon, a.lat], [b.lon, b.lat]] : undefined}
        fitPadding={{ top: 150, right: 150, bottom: 90, left: 150 }}
        k={1.6}
        labels={2}
      />
      <defs>
        <linearGradient id="card-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.bg} stopOpacity={0} />
          <stop offset="1" stopColor={p.bg} />
        </linearGradient>
      </defs>
      <rect x={0} y={400} width={900} height={170} fill="url(#card-fade)" />

      <g transform="translate(56,56)">
        {logo.data ? (
          <>
            <rect width={52} height={52} rx={14} fill="#f5f7fb" stroke={p.faint} strokeOpacity={0.3} />
            <image href={logo.data.src} x={6} y={6} width={40} height={40} preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <>
            <rect width={52} height={52} rx={14} fill={`hsl(${hue} 42% ${p.id === "night" ? 17 : 88}%)`} stroke={`hsl(${hue} 45% ${p.id === "night" ? 30 : 72}%)`} />
            <text x={26} y={33} textAnchor="middle" fontSize={17} fontWeight={800} fill={`hsl(${hue} ${p.id === "night" ? "90% 80%" : "60% 30%"})`}>
              {flight.airline}
            </text>
          </>
        )}
        <text x={68} y={24} fontSize={24} fontWeight={800} fill={p.text}>
          {flight.airline}
          {flight.flightNumber}
        </text>
        <text x={68} y={46} fontSize={15} fill={p.muted}>
          {airlineName(flight.airline, refData)}
        </text>
      </g>
      <text x={844} y={80} textAnchor="end" fontSize={18} fontWeight={600} fill={p.text}>
        {formatDate(flight.flightDate)}
      </text>

      <text x={56} y={660} fontSize={96} fontWeight={800} letterSpacing={-2} fill={p.text}>
        {flight.depAirport}
      </text>
      <text x={844} y={660} fontSize={96} fontWeight={800} letterSpacing={-2} fill={p.text} textAnchor="end">
        {flight.arrAirport}
      </text>
      <text x={60} y={694} fontSize={18} fill={p.muted}>
        {cityName(flight.depAirport, refData)}
        {t.dep ? `  ${t.dep}` : ""}
      </text>
      <text x={840} y={694} fontSize={18} fill={p.muted} textAnchor="end">
        {t.arr ? `${t.arr}${t.arrOffset ? ` ${t.arrOffset}` : ""}  ` : ""}
        {cityName(flight.arrAirport, refData)}
      </text>
      <path d="M330 618 Q450 560 570 618" fill="none" stroke={p.faint} strokeWidth={2} strokeDasharray="3 7" strokeLinecap="round" />
      <circle cx={450} cy={589} r={5} fill={p.accent} />

      <line x1={56} x2={844} y1={744} y2={744} stroke={p.faint} strokeOpacity={0.4} strokeDasharray="2 6" />
      {cells.map(([label, value], i) => (
        <g key={label} transform={`translate(${56 + i * 200},790)`}>
          <text fontSize={13} fontWeight={600} letterSpacing={1.5} fill={p.faint}>
            {label}
          </text>
          <text y={36} fontSize={26} fontWeight={700} fill={p.text}>
            {value}
          </text>
        </g>
      ))}
      <text x={844} y={866} textAnchor="end" fontSize={13} fill={p.faint}>
        航迹
      </text>
    </Canvas>
  );
});

/* ------------------------------------------------------------------ 手机壁纸 9:19.5 */

export const Wallpaper = forwardRef<SVGSVGElement, TemplateProps>(function Wallpaper(
  { data, palette: p, world, unit, year, rotation },
  ref,
) {
  const spec = TEMPLATES.wallpaper;
  const { stats, years } = data;
  const center: [number, number] = rotation ?? [data.home?.lon ?? 110, (data.home?.lat ?? 20) - 8];
  const label = year ? `${year}` : years.length > 1 ? `${years[0]} – ${years.at(-1)}` : `${years[0] ?? ""}`;
  return (
    <Canvas ref={ref} spec={spec} p={p}>
      {/* 上方约 35% 留给锁屏时钟 */}
      <defs>
        <radialGradient id="wp-halo">
          <stop offset="0.82" stopColor={p.id === "night" ? "#78aaff" : p.accent} stopOpacity={0} />
          <stop offset="0.9" stopColor={p.id === "night" ? "#78aaff" : p.accent} stopOpacity={p.id === "night" ? 0.22 : 0.1} />
          <stop offset="1" stopColor={p.id === "night" ? "#78aaff" : p.accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={300} cy={740} r={300} fill="url(#wp-halo)" />
      <PosterMap
        box={{ x: 30, y: 470, width: 540, height: 540 }}
        world={world}
        palette={p}
        routes={data.routes}
        airports={data.airports}
        visited={data.visited}
        kind="orthographic"
        center={center}
        radius={260}
        k={1.1}
        labels={0}
      />
      <text x={300} y={1098} textAnchor="middle" fontSize={50} fontWeight={800} letterSpacing={-1.5} fill={p.text}>
        {dist(stats.distanceKm, unit)}
        <tspan fontSize={20} fontWeight={600} fill={p.muted} dx={8}>
          {unit}
        </tspan>
      </text>
      <text x={300} y={1138} textAnchor="middle" fontSize={17} fill={p.muted}>
        {stats.flights} 航段 · {stats.airports.length} 机场 · {stats.countries.length} 国家/地区
      </text>
      <text x={300} y={1172} textAnchor="middle" fontSize={13} fontWeight={700} letterSpacing={3} fill={p.faint}>
        {label}
      </text>
    </Canvas>
  );
});

export const TEMPLATE_COMPONENTS = {
  year: YearPoster,
  overview: OverviewPoster,
  card: FlightCard,
  wallpaper: Wallpaper,
  passport: PassportPoster,
} as const;
