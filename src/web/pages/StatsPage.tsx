import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon,
  Building2,
  ChartColumn,
  Clock3,
  Clapperboard,
  Flag as FlagIcon,
  MapPin,
  Moon,
  Orbit,
  Plane,
  PlaneTakeoff,
  Repeat,
  Ruler,
  Table2,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useFlights } from "../lib/api";
import { useRefData, type RefData } from "../lib/refdata";
import { useFilter } from "../lib/useFilter";
import { useUnit } from "../lib/useUnit";
import {
  computeStats,
  filterFlights,
  haulBreakdown,
  monthMatrix,
  type Haul,
  type Ranked,
} from "../../shared/stats";
import { kmToMiles } from "../../shared/geo";
import type { Flight } from "../../shared/types";
import { ColumnChart, type Column } from "../charts/ColumnChart";
import { MonthHeatmap } from "../charts/MonthHeatmap";
import { FlightTicket, ticketFromFlight } from "../ticket/FlightTicket";
import { AircraftProfile } from "../aircraft/AircraftProfile";
import { aircraftUsage } from "../aircraft/usage";
import { YearFilter } from "../ui/YearFilter";
import { Segmented } from "../ui/Segmented";
import { AirlineLogo } from "../ui/AirlineBadge";
import { Flag } from "../ui/Flag";
import { Empty, ErrorBox, Loading } from "../components/Status";
import {
  CABIN_LABEL,
  aircraftName,
  formatHours,
  airlineName,
  cityName,
  countryName,
  distanceParts,
  type DistanceUnit,
} from "../lib/format";

const EARTH_KM = 40_075;
const MOON_KM = 384_400;

type Metric = "flights" | "distance" | "hours";

export function StatsPage() {
  const flights = useFlights();
  const ref = useRefData();
  const [filter, setFilter] = useFilter();
  const [unit, setUnit] = useUnit();

  const all = flights.data ?? [];
  const shown = useMemo(() => filterFlights(all, filter), [all, filter]);
  const stats = useMemo(() => (ref.data ? computeStats(shown, ref.data.airports) : null), [shown, ref.data]);
  // 选中某一年时，与上一年同口径（同一航司筛选）比较里程
  const prevKm = useMemo(() => {
    if (filter.year === undefined) return undefined;
    const prev = filterFlights(all, { ...filter, year: filter.year - 1 });
    return prev.length ? prev.reduce((s, f) => s + (f.distanceKm ?? 0), 0) : undefined;
  }, [all, filter]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!stats || !ref.data) return <Loading />;

  const years = stats.years.map((y) => y.year);
  const span = years.length
    ? years[0] === years.at(-1)
      ? `${years[0]}`
      : `${years[0]} – ${years.at(-1)}`
    : "";

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">统计</h1>
          <p className="page-sub">
            {stats.flights ? `${span} · ${stats.flights} 段航班` : "添加航班后，这里会出现你的飞行数据"}
          </p>
        </div>
        <div className="head-actions">
          <Segmented
            value={unit}
            onChange={setUnit}
            size="sm"
            ariaLabel="距离单位"
            options={[
              { value: "km", label: "公里" },
              { value: "mi", label: "英里" },
            ]}
          />
          {all.length > 0 && (
            <Link
              to={filter.year ? `/poster?template=year&year=${filter.year}` : "/poster?template=overview"}
              className="button"
            >
              <ImageIcon size={16} /> 生成海报
            </Link>
          )}
          {all.length > 0 && (
            <Link to={filter.year ? `/animation?year=${filter.year}` : "/animation"} className="button">
              <Clapperboard size={16} /> 航线动画
            </Link>
          )}
        </div>
      </header>

      {all.length > 0 && (
        <div className="filter-row">
          <YearFilter flights={all} filter={filter} onChange={setFilter} refData={ref.data} />
        </div>
      )}

      {stats.flights === 0 ? (
        all.length === 0 ? (
          <Empty
            title="还没有数据"
            action={
              <Link to="/add" className="button primary">
                添加航班
              </Link>
            }
          >
            记录几段航班后，这里会出现里程、时长、常去的机场和航线。
          </Empty>
        ) : (
          <Empty title="没有符合条件的航班">换个年份或航司看看。</Empty>
        )
      ) : (
        <StatsBody
          flights={shown}
          stats={stats}
          refData={ref.data}
          unit={unit}
          year={filter.year}
          prevKm={prevKm}
        />
      )}
    </div>
  );
}

function StatsBody({
  flights,
  stats,
  refData,
  unit,
  year,
  prevKm,
}: {
  flights: Flight[];
  stats: NonNullable<ReturnType<typeof computeStats>>;
  refData: RefData;
  unit: DistanceUnit;
  year: number | undefined;
  prevKm: number | undefined;
}) {
  const delta = prevKm ? (stats.distanceKm - prevKm) / prevKm : undefined;
  const dist = distanceParts(stats.distanceKm, unit);
  const hours = stats.durationMin / 60;
  const avg = distanceParts(stats.distanceKm / stats.flights, unit);
  const matrix = useMemo(() => monthMatrix(flights), [flights]);
  const hauls = useMemo(() => haulBreakdown(flights), [flights]);
  const cabins = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flights) if (f.cabin) m.set(f.cabin, (m.get(f.cabin) ?? 0) + 1);
    return m;
  }, [flights]);

  return (
    <>
      <div className="stats-hero">
        <section className="card hero-card">
          <HeroArc />
          <div className="eyebrow">{year ? `${year} 年飞行里程` : "累计飞行里程"}</div>
          <div className="hero-figure">
            <span className="value">{dist.value}</span>
            <span className="unit">{dist.unit}</span>
          </div>
          {delta !== undefined && year !== undefined && (
            <div className="hero-delta">
              {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}较 {year - 1} 年{" "}
              {delta >= 0 ? "+" : "−"}
              {Math.abs(Math.round(delta * 100))}%
            </div>
          )}
          <div className="hero-facts">
            <span className="fact">
              <Orbit size={15} /> 绕地球 <b>{(stats.distanceKm / EARTH_KM).toFixed(1)}</b> 圈
            </span>
            <span className="fact">
              <Moon size={15} /> 地月距离的 <b>{Math.round((stats.distanceKm / MOON_KM) * 100)}%</b>
            </span>
            <span className="fact">
              <Timer size={15} /> 空中 <b>{(hours / 24).toFixed(1)}</b> 天
            </span>
          </div>
        </section>

        <div className="tiles">
          <Tile
            icon={<PlaneTakeoff size={14} />}
            label="航段"
            value={stats.flights}
            sub={`平均 ${avg.value} ${avg.unit}`}
          />
          <Tile
            icon={<Clock3 size={14} />}
            label="飞行时长"
            value={Math.round(hours).toLocaleString()}
            unit="小时"
            sub={`平均 ${Math.round(stats.durationMin / stats.flights / 6) / 10} 小时/段`}
          />
          <Tile
            icon={<MapPin size={14} />}
            label="机场"
            value={stats.airports.length}
            sub={topName(stats.airports, (k) => `${k} 最常去`)}
          />
          <Tile
            icon={<FlagIcon size={14} />}
            label="国家/地区"
            value={stats.countries.length}
            sub={topName(stats.countries, (k) => countryName(k, refData))}
          />
          <Tile
            icon={<Building2 size={14} />}
            label="航司"
            value={stats.airlines.length}
            sub={topName(stats.airlines, (k) => airlineName(k, refData))}
          />
          <Tile
            icon={<Plane size={14} />}
            label="机型"
            value={stats.aircraft.length}
            sub={topName(stats.aircraft, (k) => aircraftName(k, refData))}
          />
        </div>
      </div>

      <div className="stats-grid">
        <TimeChart flights={flights} stats={stats} unit={unit} year={year} />

        <section className="card wide">
          <div className="card-head">
            <h2 className="section-title">
              出行月份 <span className="count">每格为当月航段数</span>
            </h2>
          </div>
          <MonthHeatmap years={matrix.years} counts={matrix.counts} max={matrix.max} />
        </section>

        <Hangar flights={flights} refData={refData} />

        <RankCard
          title="常飞航线"
          items={stats.routes}
          leadWidth={80}
          lead={(k) => <span className="iata-chip">{k.replace("-", "⇄")}</span>}
          label={(k) => {
            const [a, b] = k.split("-");
            return `${cityName(a, refData)} – ${cityName(b, refData)}`;
          }}
        />
        <RankCard
          title="机场"
          items={stats.airports}
          leadWidth={40}
          lead={(k) => <span className="iata-chip">{k}</span>}
          label={(k) => refData.airports[k]?.name ?? k}
        />
        <RankCard
          title="航司"
          items={stats.airlines}
          leadWidth={26}
          lead={(k) => <AirlineLogo code={k} size="sm" />}
          label={(k) => airlineName(k, refData)}
        />
        <RankCard
          title="机型"
          items={stats.aircraft}
          leadWidth={44}
          lead={(k) => <span className="iata-chip">{k}</span>}
          label={(k) => aircraftName(k, refData)}
          to={(k) => `/aircraft/${k}`}
        />

        <section className="card">
          <div className="card-head">
            <h2 className="section-title">航程分布</h2>
          </div>
          <div className="haul-list">
            {(
              [
                ["short", "短程", "< 1,500 km"],
                ["medium", "中程", "1,500 – 4,000 km"],
                ["long", "远程", "≥ 4,000 km"],
              ] as [Haul, string, string][]
            ).map(([k, name, range]) => (
              <ShareRow key={k} name={name} note={range} count={hauls[k].count} total={stats.flights} />
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="section-title">
              舱位 <span className="count">{[...cabins.values()].reduce((a, b) => a + b, 0)} 段有记录</span>
            </h2>
          </div>
          <div className="haul-list">
            {["economy", "premium", "business", "first"].map((c) => (
              <ShareRow
                key={c}
                name={CABIN_LABEL[c]}
                count={cabins.get(c) ?? 0}
                total={[...cabins.values()].reduce((a, b) => a + b, 0) || 1}
              />
            ))}
          </div>
        </section>

        <section className="card wide">
          <div className="card-head">
            <h2 className="section-title">
              去过的国家和地区 <span className="count">{stats.countries.length}</span>
            </h2>
          </div>
          <div className="country-grid">
            {stats.countries.map((c) => (
              <div className="country" key={c.key}>
                <Flag code={c.key} size={16} />
                <span className="name">{countryName(c.key, refData)}</span>
                <span className="n">{c.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card wide">
          <div className="card-head">
            <h2 className="section-title">飞行纪录</h2>
          </div>
          <div className="records">
            {stats.longest && (
              <div>
                <div className="record-label">
                  <Ruler size={13} /> 最长航段
                </div>
                <FlightTicket
                  data={ticketFromFlight(stats.longest, refData)}
                  refData={refData}
                  unit={unit}
                  to={`/flights/${stats.longest.id}`}
                  compact
                />
              </div>
            )}
            {stats.shortest && stats.shortest !== stats.longest && (
              <div>
                <div className="record-label">
                  <Ruler size={13} /> 最短航段
                </div>
                <FlightTicket
                  data={ticketFromFlight(stats.shortest, refData)}
                  refData={refData}
                  unit={unit}
                  to={`/flights/${stats.shortest.id}`}
                  compact
                />
              </div>
            )}
            {stats.routes[0] && stats.routes[0].count > 1 && (
              <div>
                <div className="record-label">
                  <Repeat size={13} /> 飞得最多的航线
                </div>
                <div className="record-card">
                  <b>{stats.routes[0].key.replace("-", " ⇄ ")}</b>
                  <span>
                    {stats.routes[0].count} 次 ·{" "}
                    {stats.routes[0].key
                      .split("-")
                      .map((c) => cityName(c, refData))
                      .join(" – ")}
                  </span>
                </div>
              </div>
            )}
            {stats.aircraft[0] && (
              <div>
                <div className="record-label">
                  <Plane size={13} /> 坐得最多的机型
                </div>
                <Link to={`/aircraft/${stats.aircraft[0].key}`} className="record-card">
                  <b>{aircraftName(stats.aircraft[0].key, refData)}</b>
                  <span>
                    {stats.aircraft[0].count} 次 · {stats.aircraft[0].key}
                  </span>
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/** 机库：坐得最多的三个机型，带各自最常坐的航司涂装。 */
function Hangar({ flights, refData }: { flights: Flight[]; refData: RefData }) {
  const top = useMemo(() => aircraftUsage(flights).slice(0, 3), [flights]);
  if (top.length === 0) return null;
  const typeCount = new Set(flights.map((f) => f.aircraftType).filter(Boolean)).size;
  const short = (t: string) => aircraftName(t, refData).replace(/^(Boeing|Airbus) /, "");
  return (
    <section className="card wide hangar">
      <div className="card-head">
        <h2 className="section-title">
          机库 <span className="count">{typeCount} 种机型</span>
        </h2>
      </div>
      <ol className="hangar-list">
        {top.map((u, i) => (
          <li key={u.type} className={i === 0 ? "lead" : ""}>
            <Link to={`/aircraft/${u.type}`}>
              <span className="hangar-text">
                {i === 0 && <small>坐得最多</small>}
                <b>{short(u.type)}</b>
                <span>
                  {u.flights.length} 次{u.minutes > 0 && ` · ${formatHours(u.minutes)}`}
                </span>
              </span>
              <AircraftProfile type={u.type} airline={u.airlines[0]?.code} refData={refData} className="hangar-art" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function topName(items: Ranked[], name: (k: string) => string): string {
  return items[0] ? name(items[0].key) : "—";
}

/** 按年（全部年份时）或按月（选定某一年时）的柱状图，带表格视图。 */
function TimeChart({
  flights,
  stats,
  unit,
  year,
}: {
  flights: Flight[];
  stats: NonNullable<ReturnType<typeof computeStats>>;
  unit: DistanceUnit;
  year: number | undefined;
}) {
  const [metric, setMetric] = useState<Metric>("flights");
  const [view, setView] = useState<"chart" | "table">("chart");
  const byMonth = year !== undefined || stats.years.length === 1;

  const rows = useMemo(() => {
    if (!byMonth) {
      return stats.years.map((y) => ({
        key: String(y.year),
        label: String(y.year),
        flights: y.flights,
        km: y.distanceKm,
        min: y.durationMin,
      }));
    }
    const months = Array.from({ length: 12 }, (_, m) => ({
      key: String(m + 1),
      label: `${m + 1}月`,
      flights: 0,
      km: 0,
      min: 0,
    }));
    for (const f of flights) {
      const r = months[Number(f.flightDate.slice(5, 7)) - 1];
      r.flights++;
      r.km += f.distanceKm ?? 0;
      r.min += f.durationMin ?? 0;
    }
    return months;
  }, [byMonth, flights, stats.years]);

  const toDist = (km: number) => Math.round(unit === "km" ? km : kmToMiles(km));
  const value = (r: (typeof rows)[number]) =>
    metric === "flights" ? r.flights : metric === "hours" ? Math.round(r.min / 60) : toDist(r.km);
  const fmt = (v: number) =>
    metric === "flights"
      ? `${v} 段`
      : metric === "hours"
        ? `${v.toLocaleString()} 小时`
        : `${v.toLocaleString()} ${unit}`;

  const data: Column[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    shortLabel: byMonth ? r.key : `’${r.key.slice(2)}`,
    value: value(r),
    details: [
      ["航段", `${r.flights}`],
      ["里程", `${toDist(r.km).toLocaleString()} ${unit}`],
      ["时长", `${Math.round(r.min / 60)} 小时`],
    ].filter(([k]) => !(k === "航段" && metric === "flights")) as [string, string][],
  }));

  return (
    <section className="card wide">
      <div className="card-head">
        <h2 className="section-title">
          {byMonth ? `${year ?? stats.years[0].year} 年每月` : "每年"}
          <span className="count">
            {metric === "flights" ? "航段数" : metric === "hours" ? "飞行小时" : `里程（${unit}）`}
          </span>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Segmented
            size="sm"
            value={metric}
            onChange={setMetric}
            ariaLabel="指标"
            options={[
              { value: "flights", label: "航段" },
              { value: "distance", label: "里程" },
              { value: "hours", label: "时长" },
            ]}
          />
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            ariaLabel="视图"
            options={[
              { value: "chart", label: <ChartColumn size={14} aria-label="图表" /> },
              { value: "table", label: <Table2 size={14} aria-label="表格" /> },
            ]}
          />
        </div>
      </div>
      {view === "chart" ? (
        <ColumnChart data={data} format={fmt} highlightKey={data.at(-1)?.key} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{byMonth ? "月份" : "年份"}</th>
              <th>航段</th>
              <th>里程（{unit}）</th>
              <th>小时</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{r.flights}</td>
                <td>{toDist(r.km).toLocaleString()}</td>
                <td>{Math.round(r.min / 60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
  unit,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="tile">
      <div className="tile-label">
        {icon}
        {label}
      </div>
      <div className="tile-value">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

function RankCard({
  title,
  items,
  lead,
  leadWidth,
  label,
  to,
}: {
  title: string;
  items: Ranked[];
  /** 行可点击时的目标地址 */
  to?: (key: string) => string;
  lead: (key: string) => React.ReactNode;
  /** 前导标记列的固定宽度，保证各行名称对齐 */
  leadWidth: number;
  label: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 6);
  const max = items[0].count;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="section-title">
          {title} <span className="count">{items.length}</span>
        </h2>
      </div>
      <ol className="rank-list" style={{ "--lead-w": `${leadWidth}px` } as React.CSSProperties}>
        {shown.map((r, i) => (
          <li key={r.key} className="rank-item">
            <span className="rank-no">{i + 1}</span>
            <span className="rank-lead">{lead(r.key)}</span>
            <span className="rank-main">
              {to ? (
                <Link to={to(r.key)} className="rank-name rank-link">
                  {label(r.key)}
                </Link>
              ) : (
                <span className="rank-name">{label(r.key)}</span>
              )}
              <span className="rank-track">
                <span
                  className="rank-fill"
                  style={{ width: `${(r.count / max) * 100}%`, animationDelay: `${i * 40}ms` }}
                />
              </span>
            </span>
            <span className="rank-count">{r.count}</span>
          </li>
        ))}
      </ol>
      {items.length > 6 && (
        <button className="button ghost rank-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : `查看全部 ${items.length} 项`}
        </button>
      )}
    </section>
  );
}

function ShareRow({
  name,
  note,
  count,
  total,
}: {
  name: string;
  note?: string;
  count: number;
  total: number;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="haul-row">
      <span className="haul-name">
        {name}
        {note && <small>{note}</small>}
      </span>
      <span className="haul-val">
        {count}
        <small>{pct}%</small>
      </span>
      <span className="rank-track">
        <span className="rank-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** 英雄卡片右上角的装饰航线。 */
function HeroArc() {
  return (
    <svg className="hero-arc" viewBox="0 0 360 200" aria-hidden>
      <defs>
        <linearGradient id="hero-arc-g" x1="0" x2="1">
          <stop offset="0" stopColor="#ffd48a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffd48a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff7a5c" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M20 190 Q170 -30 340 120" fill="none" stroke="url(#hero-arc-g)" strokeWidth="1.6" />
      <path d="M80 200 Q210 40 350 170" fill="none" stroke="url(#hero-arc-g)" strokeWidth="1" opacity="0.5" />
      <path
        d="M20 190 Q170 -30 340 120"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
        strokeDasharray="2 6"
        transform="translate(0 14)"
      />
      <circle cx="340" cy="120" r="3.5" fill="#ff7a5c" />
      <circle cx="340" cy="120" r="10" fill="#ff7a5c" opacity="0.18" />
    </svg>
  );
}
