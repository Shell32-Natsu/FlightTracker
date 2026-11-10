import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Flight } from "../../shared/types";
import { flightYear, type FlightFilter } from "../../shared/stats";
import type { RefData } from "../lib/refdata";
import { airlineName } from "../lib/format";

/** 按年播放时每年停留多久 */
const STEP_MS = 2000;

/**
 * 地图底部的年份时间轴：每年一根柱（高度是当年航段数），点一下只看那一年，再点一下回到全部；
 * 播放键从第一年走到最后一年，再回到全部。
 */
export function YearTimeline({
  flights,
  filter,
  onChange,
  refData,
}: {
  flights: Flight[];
  filter: FlightFilter;
  onChange: (f: FlightFilter) => void;
  refData: RefData;
}) {
  // 柱高按当前航司筛选算，没有航班的年份也留位置，时间轴才是连续的
  const years = useMemo(() => {
    const all = flights.map(flightYear);
    const count = new Map<number, number>();
    for (const f of flights) {
      if (filter.airline && f.airline !== filter.airline) continue;
      const y = flightYear(f);
      count.set(y, (count.get(y) ?? 0) + 1);
    }
    const [from, to] = [Math.min(...all), Math.max(...all)];
    return Array.from({ length: to - from + 1 }, (_, i) => ({ year: from + i, n: count.get(from + i) ?? 0 }));
  }, [flights, filter.airline]);
  const max = Math.max(1, ...years.map((y) => y.n));

  const airlines = useMemo(() => {
    const count = new Map<string, number>();
    for (const f of flights) count.set(f.airline, (count.get(f.airline) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([code]) => code);
  }, [flights]);

  const [playing, setPlaying] = useState(false);
  const latest = useRef({ years, filter, onChange });
  latest.current = { years, filter, onChange };
  const playable = years.filter((y) => y.n > 0).length > 1;

  useEffect(() => {
    if (!playing) return;
    const go = (from: number | undefined) => {
      const { years, filter, onChange } = latest.current;
      const next = years.find((y) => y.n > 0 && (from === undefined || y.year > from));
      onChange({ ...filter, year: next?.year });
      if (!next) setPlaying(false);
      return next?.year;
    };
    let year = go(undefined);
    const t = setInterval(() => (year = go(year)), STEP_MS);
    return () => clearInterval(t);
  }, [playing]);

  const strip = useRef<HTMLDivElement>(null);
  // 选中的年份滚到看得见的地方；没选时停在最近几年
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const on = el.querySelector<HTMLElement>(".tl-year.on");
    const left = on ? on.offsetLeft - el.clientWidth / 2 + on.clientWidth / 2 : el.scrollWidth;
    el.scrollTo({ left, behavior: on && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
  }, [filter.year, years.length]);

  const choose = (year: number | undefined) => {
    setPlaying(false);
    onChange({ ...filter, year });
  };

  return (
    <div className="timeline glass">
      {playable && (
        <button
          type="button"
          className={`tl-play${playing ? " on" : ""}`}
          aria-label={playing ? "停止播放" : "按年播放"}
          title={playing ? "停止播放" : "按年播放"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
      )}
      <button
        type="button"
        className={`tl-all${filter.year === undefined ? " on" : ""}`}
        aria-pressed={filter.year === undefined}
        onClick={() => choose(undefined)}
      >
        全部
      </button>
      <div className="tl-years" ref={strip} role="group" aria-label="年份">
        {years.map(({ year, n }) => (
          <button
            key={year}
            type="button"
            className={`tl-year${filter.year === year ? " on" : ""}`}
            aria-pressed={filter.year === year}
            aria-label={`${year} 年，${n} 段`}
            title={`${year} 年 · ${n} 段`}
            disabled={n === 0 && filter.year !== year}
            onClick={() => choose(filter.year === year ? undefined : year)}
          >
            <span className="tl-bar" style={{ "--h": n ? Math.max(0.12, n / max) : 0 } as React.CSSProperties} />
            <span className="tl-label">{year}</span>
          </button>
        ))}
      </div>
      <select
        className={`select${filter.airline ? " on" : ""}`}
        aria-label="航司"
        value={filter.airline ?? ""}
        onChange={(e) => {
          setPlaying(false);
          const airline = e.target.value || undefined;
          // 选中的那一年没坐过这家航司，就回到全部年份
          const keep = flights.some((f) => flightYear(f) === filter.year && (!airline || f.airline === airline));
          onChange({ year: keep ? filter.year : undefined, airline });
        }}
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
