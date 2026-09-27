import { useMemo, useState } from "react";
import { useFlights } from "../lib/api";
import { useRefData, useWorldTopo } from "../lib/refdata";
import { useFilter } from "../lib/useFilter";
import { useUnit } from "../lib/useUnit";
import { computeStats, filterFlights, routeKey } from "../../shared/stats";
import { FilterBar } from "../components/FilterBar";
import { FlightMap } from "../components/FlightMap";
import { FlightRow } from "../components/FlightRow";
import { formatDistance } from "../lib/format";
import { Loading, ErrorBox } from "../components/Status";

export function MapPage() {
  const flights = useFlights();
  const ref = useRefData();
  const world = useWorldTopo();
  const [filter, setFilter] = useFilter();
  const [unit] = useUnit();
  const [selected, setSelected] = useState<string | null>(null);

  const all = flights.data ?? [];
  const shown = useMemo(() => filterFlights(all, filter), [all, filter]);
  const stats = useMemo(() => (ref.data ? computeStats(shown, ref.data.airports) : null), [shown, ref.data]);
  const selectedFlights = useMemo(
    () => (selected ? shown.filter((f) => routeKey(f.depAirport, f.arrAirport) === selected) : []),
    [shown, selected],
  );

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || flights.isPending) return <Loading />;

  return (
    <div className="map-page">
      <div className="map-overlay">
        <FilterBar flights={all} filter={filter} onChange={setFilter} refData={ref.data} />
        {stats && (
          <div className="map-summary">
            <span>
              <b>{stats.flights}</b> 航段
            </span>
            <span>
              <b>{formatDistance(stats.distanceKm, unit)}</b>
            </span>
            <span>
              <b>{stats.airports.length}</b> 机场
            </span>
            <span>
              <b>{stats.countries.length}</b> 国家/地区
            </span>
          </div>
        )}
      </div>
      <FlightMap
        flights={shown}
        refData={ref.data}
        world={world.data}
        selectedRoute={selected}
        onSelectRoute={setSelected}
      />
      {selectedFlights.length > 0 && (
        <div className="route-sheet">
          <div className="route-sheet-head">
            <b>{selected}</b> · {selectedFlights.length} 次
            <button className="link" onClick={() => setSelected(null)}>
              关闭
            </button>
          </div>
          {selectedFlights.map((f) => (
            <FlightRow key={f.id} flight={f} refData={ref.data} unit={unit} to={`/flights/${f.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
