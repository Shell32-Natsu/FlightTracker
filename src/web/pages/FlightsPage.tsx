import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Inbox, Plus, Search, Upload } from "lucide-react";
import { useFlights } from "../lib/api";
import { useRefData, type RefData } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { distanceParts } from "../lib/format";
import { flightYear } from "../../shared/stats";
import { FlightTicket, ticketFromFlight } from "../ticket/FlightTicket";
import { Empty, ErrorBox, Loading } from "../components/Status";
import type { Flight } from "../../shared/types";

function searchText(f: Flight, ref: RefData | undefined): string {
  const ap = (c: string) => {
    const a = ref?.airports[c];
    return a ? `${c} ${a.name} ${a.city ?? ""}` : c;
  };
  return [
    f.flightDate,
    `${f.airline}${f.flightNumber}`,
    ref?.airlines[f.airline]?.name,
    ap(f.depAirport),
    ap(f.arrAirport),
    f.aircraftType,
    f.aircraftType && ref?.aircraft[f.aircraftType],
    f.registration,
    f.seat,
    f.confirmationCode,
    f.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function FlightsPage() {
  const flights = useFlights();
  const pending = useFlights("pending");
  const ref = useRefData();
  const [unit] = useUnit();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());

  const index = useMemo(
    () => (flights.data ?? []).map((f) => ({ f, text: searchText(f, ref.data) })),
    [flights.data, ref.data],
  );
  const groups = useMemo(() => {
    const terms = query.split(/\s+/).filter(Boolean);
    const shown = index.filter(({ text }) => terms.every((t) => text.includes(t))).map(({ f }) => f);
    const byYear = new Map<number, Flight[]>();
    for (const f of shown) {
      const y = flightYear(f);
      byYear.set(y, [...(byYear.get(y) ?? []), f]);
    }
    return [...byYear].sort((a, b) => b[0] - a[0]);
  }, [index, query]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (flights.isPending) return <Loading />;

  const total = index.length;
  const shownCount = groups.reduce((n, [, fs]) => n + fs.length, 0);
  const years = total ? [flightYear(index[index.length - 1].f), flightYear(index[0].f)] : [];
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">航班</h1>
          <p className="page-sub">
            {total ? (
              <>
                {total} 段航班
                {years[0] !== years[1] ? ` · ${years[0]} – ${years[1]}` : ` · ${years[0]}`}
              </>
            ) : (
              "你的每一段飞行都会记录在这里"
            )}
          </p>
        </div>
        {total > 0 && (
          <div className="flights-tools">
            <label className="search">
              <Search size={18} />
              <input
                className="input"
                type="search"
                placeholder="搜索航班号、城市、机场、机型…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <Link to="/import" className="button icon" aria-label="导入 CSV" title="导入 CSV">
              <Upload size={18} />
            </Link>
          </div>
        )}
      </header>

      {pendingCount > 0 && (
        <Link to="/pending" className="pending-banner">
          <span className="icon-wrap">
            <Inbox size={18} />
          </span>
          <span className="grow">
            <b>{pendingCount} 段航班待确认</b>
            <small>来自转发的确认邮件，确认后才会计入统计</small>
          </span>
          <ChevronRight size={18} className="faint" />
        </Link>
      )}

      {total === 0 ? (
        <Empty
          title="还没有航班记录"
          action={
            <div className="io-actions">
              <Link to="/add" className="button primary">
                <Plus size={18} /> 添加第一段航班
              </Link>
              <Link to="/import" className="button">
                <Upload size={16} /> 从 CSV 导入
              </Link>
            </div>
          }
        >
          填上航班号和日期，航线就会出现在地图上；也可以从 Flighty 导出的 CSV 一次导入。
        </Empty>
      ) : shownCount === 0 ? (
        <Empty title="没有匹配的航班">换个关键词试试，比如城市名、航班号或机型代码。</Empty>
      ) : (
        <>
          {query && <p className="list-count">找到 {shownCount} 段</p>}
          {groups.map(([year, fs]) => {
            const km = fs.reduce((s, f) => s + (f.distanceKm ?? 0), 0);
            const d = distanceParts(km, unit);
            return (
              <section key={year} className="year-group">
                <div className="year-head">
                  <h2>{year}</h2>
                  <span className="year-meta">
                    <b>{fs.length}</b> 段 · <b>{d.value}</b> {d.unit}
                  </span>
                </div>
                <div className="ticket-grid">
                  {fs.map((f) => (
                    <FlightTicket
                      key={f.id}
                      data={ticketFromFlight(f, ref.data)}
                      refData={ref.data}
                      unit={unit}
                      to={`/flights/${f.id}`}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
