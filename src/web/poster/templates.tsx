import { forwardRef, type ReactNode } from "react";
import type { Topology } from "topojson-specification";
import type { Flight } from "../../shared/types";
import { monthMatrix } from "../../shared/stats";
import { formatDuration } from "../../shared/time";
import { kmToMiles } from "../../shared/geo";
import type { RefData } from "../lib/refdata";
import { aircraftName, airlineName, CABIN_LABEL, cityName, formatDate, localTimes, type DistanceUnit } from "../lib/format";
import { airlineAccent } from "../aircraft/livery";
import type { PosterPalette } from "./palettes";
import type { PosterData } from "./data";
import { geoDistance } from "d3-geo";
import { PosterMap, routeCenter } from "./PosterMap";
import { display, FONT } from "./text";
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
  /** 隐藏航班号、具体日期、时刻、座位和姓名 */
  hidePrivate?: boolean;
}

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const dist = (km: number, unit: DistanceUnit) => num(unit === "km" ? km : kmToMiles(km));

/** 画布：渐变底、柔光、星空（夜空主题）、边框（复古主题）。 */
const Canvas = forwardRef<SVGSVGElement, { spec: TemplateSpec; p: PosterPalette; children: ReactNode }>(
  function Canvas({ spec, p, children }, ref) {
    const { width: W, height: H } = spec;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // 纸张从中间向四角变深，其余从左上角向下变深 / 变淡
    const [from, to] = p.id === "paper" ? [p.bg, p.bg2] : [p.bg2, p.bg];
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
          {p.id === "paper" ? (
            <radialGradient id="poster-bg" cx="50%" cy="42%" r="80%">
              <stop offset="0.35" stopColor={from} />
              <stop offset="1" stopColor={to} />
            </radialGradient>
          ) : (
            <linearGradient id="poster-bg" x1="0" y1="0" x2="0.5" y2="1">
              <stop offset="0" stopColor={from} />
              <stop offset="0.6" stopColor={to} />
            </linearGradient>
          )}
          <radialGradient id="poster-glow" cx="10%" cy="0%" r="85%">
            <stop offset="0" stopColor={p.glow ?? p.bg} />
            <stop offset="1" stopColor={p.glow ?? p.bg} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="poster-glow2" cx="100%" cy="4%" r="70%">
            <stop offset="0" stopColor={p.glow2 ?? p.bg} />
            <stop offset="1" stopColor={p.glow2 ?? p.bg} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="poster-hero" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0.25" stopColor={p.hero[0]} />
            <stop offset="1" stopColor={p.hero[1]} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#poster-bg)" />
        {p.glow && <rect width={W} height={H} fill="url(#poster-glow)" />}
        {p.glow2 && <rect width={W} height={H} fill="url(#poster-glow2)" />}
        {p.stars &&
          Array.from({ length: Math.round((W * H) / 5200) }, (_, i) => {
            const x = rand() * W;
            const y = rand() * H;
            const r = rand() > 0.94 ? 1.3 : 0.7;
            return <circle key={i} cx={x} cy={y} r={r} fill="#dfe8ff" opacity={0.1 + rand() * 0.5} />;
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

/** 落款：品牌标志 + “航迹” */
function Brand({ x, y, p, k = 1 }: { x: number; y: number; p: PosterPalette; k?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${k})`}>
      <path d="M-68 4Q-55 -20 -42 4" fill="none" stroke={p.accent} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={-68} cy={4} r={3} fill={p.text} />
      <circle cx={-42} cy={4} r={3} fill={p.accent} />
      <text x={0} y={5} textAnchor="end" fontSize={15} fontWeight={650} letterSpacing={1} fill={p.text}>
        航迹
      </text>
    </g>
  );
}

/** 宽字距的小标题 */
function Kicker({ x, y, size = 13, p, children }: { x: number; y: number; size?: number; p: PosterPalette; children: ReactNode }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={650} letterSpacing={size * 0.22} fill={p.muted}>
      {children}
    </text>
  );
}

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
      <text x={x} y={y} fontSize={size} {...display(p.id)} fill={p.text} textAnchor={align}>
        {value}
      </text>
      <text x={x} y={y + size * 0.3 + 14} fontSize={Math.max(13, size * 0.32)} fill={p.muted} textAnchor={align}>
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
      <Kicker x={56} y={82} p={p}>
        FLIGHT LOG
      </Kicker>
      <Brand x={744} y={77} p={p} />

      {/* 地图四边淡出，融进背景 */}
      <defs>
        <linearGradient id="yp-v" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.14" stopColor="#fff" />
          <stop offset="0.88" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <linearGradient id="yp-h" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.1" stopColor="#000" stopOpacity={0} />
          <stop offset="0.9" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="yp-mask">
          <rect x={0} y={300} width={800} height={420} fill="url(#yp-v)" />
          <rect x={0} y={300} width={800} height={420} fill="url(#yp-h)" />
        </mask>
      </defs>
      <g mask="url(#yp-mask)">
        <PosterMap
          box={{ x: 0, y: 300, width: 800, height: 420 }}
          world={world}
          palette={p}
          routes={data.routes}
          airports={data.airports}
          visited={data.visited}
          kind="equalEarth"
          center={center}
          fitRoutes
          maxZoom={3.4}
          labels={9}
          k={1.1}
          dots
        />
      </g>
      <text x={44} y={322} fontSize={300} {...display(p.id, 700)} letterSpacing={-8} fill="url(#poster-hero)">
        {year}
      </text>
      <Legend data={data} p={p} x={56} y={712} />

      <text x={52} y={806} fontSize={96} {...display(p.id)} letterSpacing={-1.5} fill={p.text}>
        {dist(stats.distanceKm, unit)}
        <tspan fontSize={26} fontFamily={FONT} fontWeight={600} letterSpacing={0} fill={p.muted} dx={12}>
          {unit}
        </tspan>
      </text>

      {/* 每月航段 */}
      <g transform="translate(476,716)">
        {months.map((m, i) => {
          const h = (m / maxMonth) * 66;
          const x = i * 22.8;
          return (
            <g key={i}>
              <rect x={x} y={0} width={15} height={66} rx={4} fill={p.faint} opacity={0.16} />
              {m > 0 && <rect x={x} y={66 - h} width={15} height={h} rx={4} fill={p.accent} />}
              <text x={x + 7.5} y={88} fontSize={12} {...display(p.id, 600)} fill={m > 0 ? p.text : p.faint} textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
      </g>

      <line x1={56} x2={744} y1={838} y2={838} stroke={p.faint} strokeOpacity={0.35} />
      <Stat x={56} y={890} value={num(stats.flights)} label="航段" p={p} size={44} />
      <Stat x={240} y={890} value={num(stats.durationMin / 60)} label="小时" p={p} size={44} />
      <Stat x={424} y={890} value={num(stats.airports.length)} label="机场" p={p} size={44} />
      <Stat x={608} y={890} value={num(stats.countries.length)} label="国家/地区" p={p} size={44} />

      <text x={56} y={960} fontSize={14} fill={p.muted}>
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
        box={{ x: 60, y: 60, width: 1480, height: 760 }}
        world={world}
        palette={p}
        routes={data.routes}
        airports={data.airports}
        visited={data.visited}
        kind="equalEarth"
        center={center}
        k={1.35}
        labels={14}
        dots
      />
      <defs>
        <linearGradient id="ov-scrim" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.id === "paper" ? p.bg2 : p.bg} stopOpacity={0} />
          <stop offset="1" stopColor={p.id === "paper" ? p.bg2 : p.bg} stopOpacity={0.94} />
        </linearGradient>
      </defs>
      <rect x={0} y={520} width={1600} height={380} fill="url(#ov-scrim)" />

      <Kicker x={76} y={92} size={17} p={p}>
        FLIGHT LOG{span && ` · ${span}`}
      </Kicker>
      <Brand x={1524} y={86} p={p} k={1.3} />
      <Legend data={data} p={p} x={76} y={128} k={1.2} />

      <text x={70} y={776} fontSize={176} {...display(p.id, 680)} letterSpacing={-3} fill="url(#poster-hero)">
        {dist(stats.distanceKm, unit)}
        <tspan fontSize={40} fontFamily={FONT} fontWeight={600} letterSpacing={0} fill={p.muted} dx={18}>
          {unit}
        </tspan>
      </text>
      <text x={78} y={844} fontSize={21} fill={p.muted}>
        绕地球 {(stats.distanceKm / 40075).toFixed(1)} 圈 · 空中 {(stats.durationMin / 60 / 24).toFixed(1)} 天
      </text>
      <Stat x={1000} y={790} value={num(stats.flights)} label="航段" p={p} size={66} />
      <Stat x={1148} y={790} value={num(stats.airports.length)} label="机场" p={p} size={66} />
      <Stat x={1282} y={790} value={num(stats.countries.length)} label="国家/地区" p={p} size={66} />
      <Stat x={1440} y={790} value={num(stats.airlines.length)} label="航司" p={p} size={66} />
    </Canvas>
  );
});

/* ------------------------------------------------------------------ 单次航班卡片 1:1 */

export const FlightCard = forwardRef<SVGSVGElement, TemplateProps>(function FlightCard(
  { data, palette: p, world, refData, unit, flight, hidePrivate },
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
  // 隐私模式：不画起降时刻，航班号换成航司名，日期只留年份，座位换成舱位
  const t = hidePrivate ? { dep: null, arr: null, arrOffset: "" } : localTimes(flight, refData);
  const mid = a && b ? routeCenter([a.lon, a.lat], [b.lon, b.lat]) : ([0, 0] as [number, number]);
  // 视角中心略向南偏，让航线呈上拱的弧线；偏移量随航线长度增加
  const angle = a && b ? geoDistance([a.lon, a.lat], [b.lon, b.lat]) : 0;
  const tilt = Math.min(14, ((angle * 180) / Math.PI) * 0.25);
  const accent = airlineAccent(flight.airline);
  const route = data.routes.slice(0, 1);
  const cells: [string, string][] = [
    ["机型", flight.aircraftType ? aircraftName(flight.aircraftType, refData).replace(/^(Boeing|Airbus) /, "") : "—"],
    ["时长", flight.durationMin ? formatDuration(flight.durationMin) : "—"],
    ["距离", flight.distanceKm ? `${dist(flight.distanceKm, unit)} ${unit}` : "—"],
    hidePrivate
      ? ["舱位", flight.cabin ? CABIN_LABEL[flight.cabin] : "—"]
      : ["座位", flight.seat ?? "—"],
  ];
  // 登机牌外形：圆角 + 撕线两端的半圆缺口
  const [x0, y0, x1, y1, r, notch, tearY] = [44, 44, 856, 856, 40, 20, 664];
  const outline =
    `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${tearY - notch}A${notch} ${notch} 0 0 0 ${x1} ${tearY + notch}` +
    `V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${tearY + notch}` +
    `A${notch} ${notch} 0 0 0 ${x0} ${tearY - notch}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
  return (
    <Canvas ref={ref} spec={spec} p={p}>
      <defs>
        <clipPath id="card-clip">
          <path d={outline} />
        </clipPath>
        <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx={0} dy={18} stdDeviation={24} floodColor={p.id === "paper" ? "#4a2f12" : "#020814"} floodOpacity={p.id === "night" ? 0.6 : 0.18} />
        </filter>
        <linearGradient id="card-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.card} stopOpacity={0} />
          <stop offset="1" stopColor={p.card} />
        </linearGradient>
        <linearGradient id="card-top" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.card} stopOpacity={0.92} />
          <stop offset="0.45" stopColor={p.card} stopOpacity={0.7} />
          <stop offset="1" stopColor={p.card} stopOpacity={0} />
        </linearGradient>
        <radialGradient id="card-air" gradientUnits="userSpaceOnUse" cx={x0} cy={y0} r={560}>
          <stop offset="0" stopColor={accent} stopOpacity={p.id === "night" ? 0.5 : 0.22} />
          <stop offset="1" stopColor={accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      <path d={outline} fill={p.card} filter="url(#card-shadow)" />
      <g clipPath="url(#card-clip)">
        <PosterMap
          box={{ x: x0, y: y0, width: x1 - x0, height: 500 }}
          world={world}
          palette={p}
          routes={route}
          airports={data.airports}
          visited={data.visited}
          kind="orthographic"
          center={[mid[0], mid[1] - tilt]}
          radius={420}
          fitRoute={a && b ? [[a.lon, a.lat], [b.lon, b.lat]] : undefined}
          fitPadding={{ top: 190, right: 190, bottom: 120, left: 190 }}
          k={1.7}
          labels={2}
          lifted="screen"
        />
        <rect x={x0} y={y0} width={x1 - x0} height={170} fill="url(#card-top)" />
        <rect x={x0} y={374} width={x1 - x0} height={172} fill="url(#card-fade)" />
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="url(#card-air)" />
      </g>
      <path d={outline} fill="none" stroke={p.text} strokeOpacity={0.1} strokeWidth={1.5} />

      <g transform="translate(84,82)">
        {logo.data ? (
          <>
            <rect width={56} height={56} rx={15} fill="#f5f7fb" stroke={p.faint} strokeOpacity={0.3} />
            <image href={logo.data.src} x={7} y={7} width={42} height={42} preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <>
            <rect width={56} height={56} rx={15} fill={accent} />
            <text x={28} y={37} textAnchor="middle" fontSize={24} {...display(p.id, 700)} fill="#ffffff">
              {flight.airline}
            </text>
          </>
        )}
        <text x={74} y={26} fontSize={30} {...display(p.id)} fill={p.text}>
          {hidePrivate ? airlineName(flight.airline, refData) : `${flight.airline}${flight.flightNumber}`}
        </text>
        <text x={74} y={50} fontSize={16} fill={p.muted}>
          {hidePrivate ? `${flight.flightDate.slice(0, 4)} 年` : airlineName(flight.airline, refData)}
        </text>
      </g>
      {!hidePrivate && (
        <text x={816} y={108} textAnchor="end" fontSize={19} fontWeight={600} fill={p.text}>
          {formatDate(flight.flightDate)}
        </text>
      )}

      <text x={80} y={592} fontSize={118} {...display(p.id, 700)} fill={p.text}>
        {flight.depAirport}
      </text>
      <text x={820} y={592} fontSize={118} {...display(p.id, 700)} fill={p.text} textAnchor="end">
        {flight.arrAirport}
      </text>
      <text x={84} y={626} fontSize={19} fill={p.muted}>
        {cityName(flight.depAirport, refData)}
        {t.dep && (
          <tspan {...display(p.id)} fontSize={22} fill={p.text} dx={10}>
            {t.dep}
          </tspan>
        )}
      </text>
      <text x={816} y={626} fontSize={19} fill={p.muted} textAnchor="end">
        {t.arr && (
          <tspan {...display(p.id)} fontSize={22} fill={p.text}>
            {t.arr}
            {t.arrOffset ? ` ${t.arrOffset}` : ""}
          </tspan>
        )}
        <tspan dx={t.arr ? 10 : 0}>{cityName(flight.arrAirport, refData)}</tspan>
      </text>
      <path d="M350 566Q450 506 550 566" fill="none" stroke="url(#card-route)" strokeWidth={3} strokeLinecap="round" />
      <linearGradient id="card-route" gradientUnits="userSpaceOnUse" x1={350} x2={550} y1={0} y2={0}>
        <stop offset="0" stopColor={p.routeFrom} />
        <stop offset="1" stopColor={p.routeTo} />
      </linearGradient>
      <circle cx={350} cy={566} r={5.5} fill={p.routeFrom} />
      <circle cx={550} cy={566} r={5.5} fill={p.routeTo} />

      <line x1={x0 + 40} x2={x1 - 40} y1={tearY} y2={tearY} stroke={p.faint} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="1 9" strokeLinecap="round" />
      {cells.map(([label, value], i) => (
        <g key={label} transform={`translate(${84 + i * 190},716)`}>
          <text fontSize={14} fontWeight={600} letterSpacing={1.5} fill={p.faint}>
            {label}
          </text>
          <text y={36} fontSize={32} {...display(p.id)} fill={p.text}>
            {value}
          </text>
        </g>
      ))}
      <Barcode x={84} y={784} width={520} height={38} seed={`${flight.depAirport}${flight.arrAirport}${flight.airline}`} color={p.text} />
      <Brand x={816} y={804} p={p} k={1.1} />
    </Canvas>
  );
});

/** 登机牌上的条码：纯装饰，由航线生成，同一条航线总是一样。 */
function Barcode({ x, y, width, height, seed, color }: { x: number; y: number; width: number; height: number; seed: string; color: string }) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const bars: ReactNode[] = [];
  for (let at = 0; at < width - 8; ) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const w = 2 + (h % 3) * 2;
    bars.push(<rect key={at} x={x + at} y={y} width={w} height={height} />);
    at += w + 3 + ((h >>> 5) % 3) * 2;
  }
  return (
    <g fill={color} opacity={0.72}>
      {bars}
    </g>
  );
}

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
      {/* 上方约三分之一留给锁屏时钟 */}
      <defs>
        {p.id === "night" ? (
          <radialGradient id="wp-halo" cx="47%" cy="47%" r="46%">
            <stop offset="0.62" stopColor="#7ab2ff" stopOpacity={0.62} />
            <stop offset="0.71" stopColor="#68a0ff" stopOpacity={0.38} />
            <stop offset="0.82" stopColor="#5488ff" stopOpacity={0.14} />
            <stop offset="1" stopColor="#466eff" stopOpacity={0} />
          </radialGradient>
        ) : (
          <radialGradient id="wp-halo" cx="50%" cy="56%" r="43%">
            <stop offset="0.56" stopColor={p.id === "paper" ? "#50320f" : "#284a82"} stopOpacity={0.36} />
            <stop offset="0.96" stopColor={p.id === "paper" ? "#50320f" : "#284a82"} stopOpacity={0} />
          </radialGradient>
        )}
      </defs>
      <circle cx={300} cy={730} r={p.id === "night" ? 430 : 460} fill="url(#wp-halo)" />
      <PosterMap
        box={{ x: 0, y: 380, width: 600, height: 700 }}
        world={world}
        palette={p}
        routes={data.routes}
        airports={data.airports}
        visited={data.visited}
        kind="orthographic"
        center={center}
        radius={284}
        k={1.2}
        labels={0}
        lifted="globe"
      />
      <text x={300} y={1132} textAnchor="middle" fontSize={84} {...display(p.id, 680)} letterSpacing={-1} fill="url(#poster-hero)">
        {dist(stats.distanceKm, unit)}
        <tspan fontSize={22} fontFamily={FONT} fontWeight={600} letterSpacing={0} fill={p.muted} dx={10}>
          {unit}
        </tspan>
      </text>
      <text x={300} y={1172} textAnchor="middle" fontSize={18} fill={p.muted}>
        {stats.flights} 航段 · {stats.airports.length} 机场 · {stats.countries.length} 国家/地区
      </text>
      <text x={300} y={1206} textAnchor="middle" fontSize={15} {...display(p.id, 600)} letterSpacing={3} fill={p.faint}>
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
