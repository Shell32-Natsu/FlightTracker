import { useMemo } from "react";
import type { Flight } from "../../shared/types";
import type { FlightFilter } from "../../shared/stats";
import { flightYear } from "../../shared/stats";
import type { RefData } from "../lib/refdata";
import { airlineName } from "../lib/format";

interface Props {
  flights: Flight[];
  filter: FlightFilter;
  onChange: (f: FlightFilter) => void;
  refData: RefData | undefined;
}

export function FilterBar({ flights, filter, onChange, refData }: Props) {
  const years = useMemo(
    () => [...new Set(flights.map(flightYear))].sort((a, b) => b - a),
    [flights],
  );
  const airlines = useMemo(() => {
    const count = new Map<string, number>();
    for (const f of flights) count.set(f.airline, (count.get(f.airline) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([code]) => code);
  }, [flights]);

  return (
    <div className="filter-bar">
      <select
        aria-label="年份"
        value={filter.year ?? ""}
        onChange={(e) => onChange({ ...filter, year: e.target.value ? Number(e.target.value) : undefined })}
      >
        <option value="">全部年份</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        aria-label="航司"
        value={filter.airline ?? ""}
        onChange={(e) => onChange({ ...filter, airline: e.target.value || undefined })}
      >
        <option value="">全部航司</option>
        {airlines.map((a) => (
          <option key={a} value={a}>
            {a} · {airlineName(a, refData)}
          </option>
        ))}
      </select>
    </div>
  );
}
