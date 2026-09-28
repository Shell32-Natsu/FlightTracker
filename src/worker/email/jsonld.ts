import { extractJsonLd } from "./html";
import { cabinFromName, splitFlightNumber, type ExtractedSegment } from "./segments";

/**
 * schema.org FlightReservation（很多航司、OTA 的确认邮件里都有，Gmail 也靠它做行程卡片）。
 * https://developers.google.com/gmail/markup/reference/flight-reservation
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function typeOf(o: Obj): string[] {
  const t = o["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

/** 展开数组和 @graph，收集所有 FlightReservation 对象。 */
function collect(node: unknown, out: Obj[]) {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
  } else if (isObj(node)) {
    if (typeOf(node).some((t) => t.endsWith("FlightReservation"))) out.push(node);
    if (node["@graph"]) collect(node["@graph"], out);
  }
}

const code = (v: unknown): string | null => {
  if (isObj(v)) v = v.iataCode ?? v.name;
  return typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null;
};

/** "2024-03-04T20:15:00-08:00" → 当地日期和时间（取字面上的墙上时间）。 */
function wallClock(v: unknown): { date: string; time: string | null } | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v.trim());
  return m ? { date: m[1], time: m[2] ?? null } : null;
}

export function segmentsFromJsonLd(html: string): ExtractedSegment[] {
  const reservations: Obj[] = [];
  for (const doc of extractJsonLd(html)) collect(doc, reservations);

  const segments: ExtractedSegment[] = [];
  for (const r of reservations) {
    const flight = isObj(r.reservationFor) ? r.reservationFor : null;
    if (!flight) continue;
    const airlineCode = code(flight.airline);
    const fn = splitFlightNumber(flight.flightNumber, airlineCode);
    const dep = wallClock(flight.departureTime);
    const arr = wallClock(flight.arrivalTime);
    const depAirport = code(flight.departureAirport);
    const arrAirport = code(flight.arrivalAirport);
    if (!fn?.airline || !dep || !depAirport || !arrAirport) continue;
    const seatClass = isObj(r.airplaneSeatClass) ? r.airplaneSeatClass.name : r.airplaneSeatClass;
    segments.push({
      airline: fn.airline,
      flightNumber: fn.number,
      depAirport,
      arrAirport,
      depDate: dep.date,
      depTime: dep.time,
      arrDate: arr?.date ?? null,
      arrTime: arr?.time ?? null,
      confirmationCode: typeof r.reservationNumber === "string" ? r.reservationNumber.trim() || null : null,
      seat: typeof r.airplaneSeat === "string" ? r.airplaneSeat.trim() || null : null,
      cabin: cabinFromName(seatClass),
      cancelled: typeof r.reservationStatus === "string" && /Cancel/i.test(r.reservationStatus),
    });
  }
  return segments;
}
