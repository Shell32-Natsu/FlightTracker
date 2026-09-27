import { useSearchParams } from "react-router-dom";
import type { FlightFilter } from "../../shared/stats";

/** 年份 / 航司筛选，存在 URL 查询参数里，地图页和统计页共用。 */
export function useFilter(): [FlightFilter, (f: FlightFilter) => void] {
  const [params, setParams] = useSearchParams();
  const year = params.get("year");
  const airline = params.get("airline");
  const filter: FlightFilter = {
    year: year ? Number(year) : undefined,
    airline: airline ?? undefined,
  };
  const setFilter = (f: FlightFilter) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };
  return [filter, setFilter];
}
