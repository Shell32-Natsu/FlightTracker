import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFlights } from "../lib/api";
import { useRefData, type RefData } from "../lib/refdata";
import { useFilter } from "../lib/useFilter";
import { useUnit } from "../lib/useUnit";
import { computeStats, filterFlights, type Ranked } from "../../shared/stats";
import { kmToMiles } from "../../shared/geo";
import { FilterBar } from "../components/FilterBar";
import { FlightRow } from "../components/FlightRow";
import { Empty, ErrorBox, Loading } from "../components/Status";
import {
  aircraftName,
  airlineName,
  airportLabel,
  countryName,
  formatDistance,
  formatHours,
  type DistanceUnit,
} from "../lib/format";

type Metric = "flights" | "distance" | "hours";
const METRIC_LABEL: Record<Metric, string> = { flights: "航段", distance: "里程", hours: "小时" };

export function StatsPage() {
  const flights = useFlights();
  const ref = useRefData();
  const [filter, setFilter] = useFilter();
  const [unit, setUnit] = useUnit();
  const [metric, setMetric] = useState<Metric>("flights");

  const all = flights.data ?? [];
  const shown = useMemo(() => filterFlights(all, filter), [all, filter]);
  const stats = useMemo(() => (ref.data ? computeStats(shown, ref.data.airports) : null), [shown, ref.data]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!stats || !ref.data) return <Loading />;

  const yearData = stats.years.map((y) => ({
    year: String(y.year),
    value:
      metric === "flights"
        ? y.flights
        : metric === "hours"
          ? Math.round(y.durationMin / 60)
          : Math.round(unit === "km" ? y.distanceKm : kmToMiles(y.distanceKm)),
  }));

  return (
    <div className="page">
      <div className="page-head">
        <h1>统计</h1>
        <div className="segmented">
          {(["km", "mi"] as DistanceUnit[]).map((u) => (
            <button key={u} className={u === unit ? "on" : ""} onClick={() => setUnit(u)}>
              {u === "km" ? "公里" : "英里"}
            </button>
          ))}
        </div>
      </div>
      <FilterBar flights={all} filter={filter} onChange={setFilter} refData={ref.data} />

      {stats.flights === 0 ? (
        <Empty>没有符合条件的航班。</Empty>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="航段" value={stats.flights.toLocaleString()} />
            <Kpi label="里程" value={formatDistance(stats.distanceKm, unit)} />
            <Kpi label="飞行时长" value={formatHours(stats.durationMin)} />
            <Kpi label="机场" value={stats.airports.length} />
            <Kpi label="国家/地区" value={stats.countries.length} />
            <Kpi label="航司" value={stats.airlines.length} />
            <Kpi
              label="绕地球"
              value={`${(stats.distanceKm / 40075).toFixed(1)} 圈`}
            />
          </div>

          {stats.years.length > 1 && (
            <section className="card">
              <div className="card-head">
                <h2>按年</h2>
                <div className="segmented">
                  {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                    <button key={m} className={m === metric ? "on" : ""} onClick={() => setMetric(m)}>
                      {METRIC_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yearData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: "var(--hover)" }}
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                      formatter={(v) => [
                        Number(v).toLocaleString(),
                        metric === "distance" ? unit : METRIC_LABEL[metric],
                      ]}
                    />
                    <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <div className="rank-grid">
            <RankList title="航司" items={stats.airlines} label={(k) => `${k} · ${airlineName(k, ref.data)}`} />
            <RankList title="机型" items={stats.aircraft} label={(k) => `${k} · ${aircraftName(k, ref.data)}`} />
            <RankList title="机场" items={stats.airports} label={(k) => `${k} · ${airportLabel(k, ref.data)}`} />
            <RankList title="航线" items={stats.routes} label={(k) => routeLabel(k, ref.data)} />
            <RankList title="国家/地区" items={stats.countries} label={(k) => countryName(k, ref.data)} />
          </div>

          <section className="card">
            <h2>最长与最短</h2>
            {stats.longest && (
              <>
                <p className="muted small">最长</p>
                <FlightRow flight={stats.longest} refData={ref.data} unit={unit} to={`/flights/${stats.longest.id}`} />
              </>
            )}
            {stats.shortest && stats.shortest !== stats.longest && (
              <>
                <p className="muted small">最短</p>
                <FlightRow flight={stats.shortest} refData={ref.data} unit={unit} to={`/flights/${stats.shortest.id}`} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function routeLabel(key: string, ref: RefData | undefined) {
  const [a, b] = key.split("-");
  return `${a} ⇄ ${b} · ${airportLabel(a, ref)} – ${airportLabel(b, ref)}`;
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function RankList({ title, items, label }: { title: string; items: Ranked[]; label: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 8);
  const max = items[0].count;
  return (
    <section className="card rank">
      <h2>
        {title} <span className="muted small">{items.length}</span>
      </h2>
      <ol>
        {shown.map((r) => (
          <li key={r.key}>
            <span className="rank-bar" style={{ width: `${(r.count / max) * 100}%` }} />
            <span className="rank-label">{label(r.key)}</span>
            <span className="rank-count">{r.count}</span>
          </li>
        ))}
      </ol>
      {items.length > 8 && (
        <button className="link" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : `展开全部 ${items.length} 项`}
        </button>
      )}
    </section>
  );
}
