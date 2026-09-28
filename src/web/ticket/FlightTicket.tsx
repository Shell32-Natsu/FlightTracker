import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import type { Flight } from "../../shared/types";
import { formatDuration } from "../../shared/time";
import type { RefData } from "../lib/refdata";
import {
  CABIN_LABEL,
  aircraftName,
  airlineName,
  cityName,
  distanceParts,
  flightCode,
  formatDate,
  formatWeekday,
  localTimes,
  type DistanceUnit,
} from "../lib/format";
import { AirlineLogo } from "../ui/AirlineBadge";

export interface TicketData {
  airline: string;
  flightNumber: string;
  flightDate: string;
  depAirport: string;
  arrAirport: string;
  depTime: string | null;
  arrTime: string | null;
  arrOffset: string;
  durationMin: number | null;
  distanceKm: number | null;
  aircraftType: string | null;
  seat: string | null;
  cabin: string | null;
}

export function ticketFromFlight(f: Flight, ref: RefData | undefined): TicketData {
  const t = localTimes(f, ref);
  return {
    airline: f.airline,
    flightNumber: f.flightNumber,
    flightDate: f.flightDate,
    depAirport: f.depAirport,
    arrAirport: f.arrAirport,
    depTime: t.dep,
    arrTime: t.arr,
    arrOffset: t.arrOffset,
    durationMin: f.durationMin,
    distanceKm: f.distanceKm,
    aircraftType: f.aircraftType,
    seat: f.seat,
    cabin: f.cabin,
  };
}

interface Props {
  data: TicketData;
  refData: RefData | undefined;
  unit?: DistanceUnit;
  to?: string;
  compact?: boolean;
  /** 在卡片底部插入的内容（如待确认页的操作按钮） */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * 票根两侧的半圆缺口是真正镂空的（mask），能透出后面的玻璃和柔光背景；
 * 缺口的纵向位置随内容高度变化，这里量出来写进 --perf-y。
 */
function usePerforation(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const perf = el?.querySelector<HTMLElement>(".ticket-perf");
    if (!el || !perf || !enabled) return;
    const update = () => el.style.setProperty("--perf-y", `${perf.offsetTop}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return ref;
}

/** 登机牌样式的航班卡片。 */
export function FlightTicket({ data: d, refData, unit = "km", to, compact, footer, className = "" }: Props) {
  const ref = usePerforation(!compact);
  const dist = d.distanceKm != null ? distanceParts(d.distanceKm, unit) : null;
  const body = (
    <>
      <div className="ticket-head">
        {d.airline ? (
          <AirlineLogo code={d.airline} size={compact ? "sm" : "md"} />
        ) : (
          <span className={`airline-badge placeholder ${compact ? "sm" : "md"}`} aria-hidden />
        )}
        <div className="ticket-carrier">
          <span className="ticket-code">{d.airline ? flightCode(d) : "—"}</span>
          {!compact && (
            <span className="ticket-airline">{d.airline ? airlineName(d.airline, refData) : ""}</span>
          )}
        </div>
        <div className="ticket-date">
          <span>{formatDate(d.flightDate)}</span>
          <span className="ticket-weekday">{formatWeekday(d.flightDate)}</span>
        </div>
      </div>

      <div className="ticket-route">
        <div className="ticket-end">
          <span className={`iata${d.depAirport ? "" : " blank"}`}>{d.depAirport || "···"}</span>
          <span className="city">{d.depAirport ? cityName(d.depAirport, refData) : "出发"}</span>
          {d.depTime && <span className="time">{d.depTime}</span>}
        </div>
        <div className="ticket-path" aria-hidden>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none">
            <path d="M2 22 Q50 -8 98 22" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="ticket-plane">
            <Plane size={compact ? 14 : 16} />
          </span>
          {d.durationMin != null && d.durationMin > 0 && (
            <span className="ticket-duration">{formatDuration(d.durationMin)}</span>
          )}
        </div>
        <div className="ticket-end right">
          <span className={`iata${d.arrAirport ? "" : " blank"}`}>{d.arrAirport || "···"}</span>
          <span className="city">{d.arrAirport ? cityName(d.arrAirport, refData) : "到达"}</span>
          {d.arrTime && (
            <span className="time">
              {d.arrTime}
              {d.arrOffset && <sup>{d.arrOffset}</sup>}
            </span>
          )}
        </div>
      </div>

      {!compact && (
        <>
          <div className="ticket-perf" aria-hidden />
          <dl className="ticket-foot">
            <div>
              <dt>机型</dt>
              <dd title={d.aircraftType ? aircraftName(d.aircraftType, refData) : undefined}>
                {d.aircraftType ?? "—"}
              </dd>
            </div>
            <div>
              <dt>座位</dt>
              <dd>{d.seat ?? "—"}</dd>
            </div>
            <div>
              <dt>舱位</dt>
              <dd>{d.cabin ? CABIN_LABEL[d.cabin] : "—"}</dd>
            </div>
            <div>
              <dt>距离</dt>
              <dd>
                {dist ? (
                  <>
                    {dist.value}
                    <small> {dist.unit}</small>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
      {footer}
    </>
  );

  const cls = `ticket${compact ? " compact" : ""} ${className}`;
  return to ? (
    <Link ref={ref as React.Ref<HTMLAnchorElement>} className={`${cls} interactive`} to={to}>
      {body}
    </Link>
  ) : (
    <div ref={ref as React.Ref<HTMLDivElement>} className={cls}>
      {body}
    </div>
  );
}
