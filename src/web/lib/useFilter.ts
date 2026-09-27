import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { FlightFilter } from "../../shared/stats";

/** 年份 / 航司筛选，存在 URL 查询参数里，地图页和统计页共用。 */
export function useFilter(): [FlightFilter, (f: FlightFilter) => void] {
  const [params, setParams] = useSearchParams();
  const year = params.get("year");
  const airline = params.get("airline");
  // 引用保持稳定，否则下游 useMemo（航线图层、统计）每次渲染都会重算
  const filter = useMemo<FlightFilter>(
    () => ({ year: year ? Number(year) : undefined, airline: airline ?? undefined }),
    [year, airline],
  );
  const setFilter = useCallback(
    (f: FlightFilter) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(f)) {
            if (v === undefined || v === "") next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [filter, setFilter];
}
