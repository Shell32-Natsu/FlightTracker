import { useMemo } from "react";
import type { Flight } from "../../shared/types";
import { flightYear, type FlightFilter } from "../../shared/stats";
import type { RefData } from "../lib/refdata";
import { airlineName } from "../lib/format";

/** 年份条 + 航司下拉：地图页和统计页共用的一行筛选。 */
export function YearFilter({
  flights,
  filter,
  onChange,
  refData,
}: {
  flights: Flight[];
  filter: FlightFilter;
  onChange: (f: FlightFilter) => void;
  refData: RefData | undefined;
}) {
  const years = useMemo(() => [...new Set(flights.map(flightYear))].sort((a, b) => b - a), [flights]);
  const airlines = useMemo(() => {
    const count = new Map<string, number>();
    for (const f of flights) count.set(f.airline, (count.get(f.airline) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([code]) => code);
  }, [flights]);

  return (
    <>
      <div className="chips" role="radiogroup" aria-label="年份">
        <button
          className={`chip${filter.year === undefined ? " on" : ""}`}
          role="radio"
          aria-checked={filter.year === undefined}
          onClick={() => onChange({ ...filter, year: undefined })}
        >
          全部
        </button>
        {years.map((y) => (
          <button
            key={y}
            className={`chip${filter.year === y ? " on" : ""}`}
            role="radio"
            aria-checked={filter.year === y}
            onClick={() => onChange({ ...filter, year: filter.year === y ? undefined : y })}
          >
            {y}
          </button>
        ))}
      </div>
      <select
        className="select"
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
    </>
  );
}
