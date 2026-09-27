import { Link } from "react-router-dom";
import type { Flight } from "../../shared/types";
import type { RefData } from "../lib/refdata";
import { airportLabel, flightCode, formatDistance, localTimes, type DistanceUnit } from "../lib/format";
import { formatDuration } from "../../shared/time";

interface Props {
  flight: Flight;
  refData: RefData | undefined;
  unit?: DistanceUnit;
  to?: string;
}

/** 列表中的一条航班：航线、日期、航司、机型。 */
export function FlightRow({ flight: f, refData, unit = "km", to }: Props) {
  const t = localTimes(f, refData);
  const body = (
    <>
      <div className="flight-row-main">
        <span className="route">
          <b>{f.depAirport}</b>
          <span className="arrow">→</span>
          <b>{f.arrAirport}</b>
        </span>
        <span className="muted">
          {airportLabel(f.depAirport, refData)} – {airportLabel(f.arrAirport, refData)}
        </span>
      </div>
      <div className="flight-row-meta">
        <span>{f.flightDate}</span>
        <span>{flightCode(f)}</span>
        {t.dep && (
          <span>
            {t.dep}–{t.arr}
            {t.arrOffset && <sup>{t.arrOffset}</sup>}
          </span>
        )}
        {f.aircraftType && <span>{f.aircraftType}</span>}
        {f.distanceKm != null && <span>{formatDistance(f.distanceKm, unit)}</span>}
        {f.durationMin != null && <span>{formatDuration(f.durationMin)}</span>}
      </div>
    </>
  );
  return to ? (
    <Link className="flight-row" to={to}>
      {body}
    </Link>
  ) : (
    <div className="flight-row">{body}</div>
  );
}
