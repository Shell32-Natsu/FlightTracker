import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useAircraftInfo, useFlights } from "../lib/api";
import { useRefData } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { aircraftName, airlineName, distanceParts, formatDate, formatHours } from "../lib/format";
import { aircraftFamily, familyTypes } from "../../shared/aircraft";
import { AircraftProfile } from "../aircraft/AircraftProfile";
import { aircraftUsage } from "../aircraft/usage";
import { FlightTicket, ticketFromFlight } from "../ticket/FlightTicket";
import { AirlineLogo } from "../ui/AirlineBadge";
import { ErrorBox, Loading } from "../components/Status";

/** 机型详情：带涂装的侧视图、你的数据、同系列、维基百科简介、坐过的航班。 */
export function AircraftPage() {
  const { type = "" } = useParams();
  const code = type.toUpperCase();
  const flights = useFlights();
  const ref = useRefData();
  const [unit] = useUnit();
  const info = useAircraftInfo(code);
  const [pick, setPick] = useState<string | null>(null);

  const all = flights.data ?? [];
  const usages = useMemo(() => aircraftUsage(all), [all]);
  const usage = usages.find((u) => u.type === code);
  const family = aircraftFamily(code);
  const siblings = useMemo(() => {
    if (!family) return [];
    const flown = new Map(usages.map((u) => [u.type, u.flights.length]));
    return familyTypes(family.id)
      .filter((t) => t !== code && flown.has(t))
      .map((t) => ({ type: t, count: flown.get(t)! }));
  }, [family, usages, code]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || flights.isPending) return <Loading />;

  const name = aircraftName(code, ref.data);
  const airline = pick ?? usage?.airlines[0]?.code ?? null;
  const dist = usage ? distanceParts(usage.km, unit) : null;

  return (
    <div className="page aircraft-page">
      <Link to="/stats" className="back-link">
        <ArrowLeft size={16} /> 统计
      </Link>

      <section className="aircraft-hero">
        <div className="aircraft-hero-text">
          <span className="aircraft-maker">
            {family ? `${family.maker} · ${family.name}` : "机型"} · {code}
          </span>
          <h1>{name.replace(/^(Boeing|Airbus) /, "")}</h1>
          {usage && (
            <p>
              {usage.flights.length} 次飞行
              {usage.minutes > 0 && ` · ${formatHours(usage.minutes)}`}
            </p>
          )}
        </div>
        <AircraftProfile type={code} airline={airline} refData={ref.data} className="aircraft-hero-art" />
        {usage && usage.airlines.length > 1 && (
          <div className="livery-picker" role="group" aria-label="涂装">
            {usage.airlines.map((a) => (
              <button
                key={a.code}
                className={`chip${airline === a.code ? " on" : ""}`}
                onClick={() => setPick(a.code)}
                aria-pressed={airline === a.code}
              >
                <AirlineLogo code={a.code} size="sm" /> {airlineName(a.code, ref.data)}
              </button>
            ))}
          </div>
        )}
      </section>

      {usage ? (
        <section className="aircraft-kpis">
          <div>
            <span>航段</span>
            <b>{usage.flights.length}</b>
          </div>
          <div>
            <span>飞行时长</span>
            <b>{usage.minutes ? formatHours(usage.minutes) : "—"}</b>
          </div>
          <div>
            <span>距离</span>
            <b>
              {dist!.value} <small>{dist!.unit}</small>
            </b>
          </div>
          <div>
            <span>航司</span>
            <b>{usage.airlines.length}</b>
          </div>
          <div>
            <span>首次</span>
            <b className="date">{formatDate(usage.first)}</b>
          </div>
          <div>
            <span>最近</span>
            <b className="date">{formatDate(usage.last)}</b>
          </div>
        </section>
      ) : (
        <p className="faint small-note">你还没有坐过这个机型。</p>
      )}

      <div className="aircraft-columns">
        <section className="card aircraft-about">
          <h2 className="section-title">机型介绍</h2>
          {info.isPending ? (
            <p className="faint">加载中…</p>
          ) : info.data ? (
            <>
              <p className="aircraft-extract">{info.data.extract}</p>
              <p className="aircraft-source">
                <a href={info.data.url} target="_blank" rel="noreferrer" className="link">
                  在维基百科阅读「{info.data.title}」 <ExternalLink size={13} />
                </a>
                <small>文字来自维基百科，CC BY-SA 4.0</small>
              </p>
            </>
          ) : (
            <p className="faint">{info.error?.message ?? "暂无介绍"}</p>
          )}
        </section>

        {(siblings.length > 0 || (usage?.registrations.length ?? 0) > 0) && (
          <div className="aircraft-side">
            {usage && usage.registrations.length > 0 && (
              <section className="card">
                <h2 className="section-title">
                  坐过的飞机 <span className="count">{usage.registrations.length}</span>
                </h2>
                <ul className="reg-list">
                  {usage.registrations.map((r) => (
                    <li key={r.reg}>
                      {r.airline && <AirlineLogo code={r.airline} size="sm" />}
                      <code>{r.reg}</code>
                      <span className="faint">{r.count > 1 ? `${r.count} 次` : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {siblings.length > 0 && (
              <section className="card">
                <h2 className="section-title">同系列</h2>
                <ul className="sibling-list">
                  {siblings.map((s) => (
                    <li key={s.type}>
                      <Link to={`/aircraft/${s.type}`} onClick={() => setPick(null)}>
                        <AircraftProfile type={s.type} refData={ref.data} className="sibling-art" />
                        <span>
                          <b>{aircraftName(s.type, ref.data).replace(/^(Boeing|Airbus) /, "")}</b>
                          <small>{s.count} 次</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {usage && (
        <section className="aircraft-flights">
          <h2 className="section-title">
            航班 <span className="count">{usage.flights.length}</span>
          </h2>
          <div className="ticket-grid">
            {usage.flights.map((f) => (
              <FlightTicket
                key={f.id}
                data={ticketFromFlight(f, ref.data)}
                refData={ref.data}
                unit={unit}
                to={`/flights/${f.id}`}
                compact
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
