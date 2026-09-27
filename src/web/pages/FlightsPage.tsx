import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFlights } from "../lib/api";
import { useRefData, type RefData } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { FlightRow } from "../components/FlightRow";
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
    f.confirmationCode,
    f.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function FlightsPage() {
  const flights = useFlights();
  const ref = useRefData();
  const [unit] = useUnit();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());

  const index = useMemo(
    () => (flights.data ?? []).map((f) => ({ f, text: searchText(f, ref.data) })),
    [flights.data, ref.data],
  );
  const shown = useMemo(() => {
    const terms = query.split(/\s+/).filter(Boolean);
    return index.filter(({ text }) => terms.every((t) => text.includes(t))).map(({ f }) => f);
  }, [index, query]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (flights.isPending) return <Loading />;

  return (
    <div className="page">
      <div className="page-head">
        <h1>航班</h1>
        <Link className="button primary" to="/add">
          添加
        </Link>
      </div>
      <input
        className="search"
        type="search"
        placeholder="搜索航班号、机场、城市、航司、机型…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="muted small">
        {query ? `${shown.length} / ${index.length} 条` : `共 ${index.length} 条`}
      </p>
      {index.length === 0 ? (
        <Empty>
          还没有航班记录，<Link to="/add">添加第一条</Link>。
        </Empty>
      ) : (
        <div className="flight-list">
          {shown.map((f) => (
            <FlightRow key={f.id} flight={f} refData={ref.data} unit={unit} to={`/flights/${f.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
