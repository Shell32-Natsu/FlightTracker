import names from "../../../public/refdata/aircraft.json";
import { aircraftTypeFromModel } from "../../shared/aircraftModel";
import type { LookupCandidate } from "../../shared/types";

/**
 * AeroDataBox（RapidAPI）：按航班号 + 起飞当地日期查航班。
 * 文档：https://doc.aerodatabox.com/ —— 用的是 GET /flights/number/{number}/{dateLocal}。
 */

export const AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";

export type { LookupCandidate };

interface RawTime {
  utc?: string;
  local?: string;
}
interface RawMovement {
  airport?: { iata?: string; icao?: string };
  scheduledTime?: RawTime;
  revisedTime?: RawTime;
  actualTime?: RawTime;
}
export interface RawFlight {
  number?: string;
  status?: string;
  codeshareStatus?: string;
  airline?: { iata?: string; name?: string };
  departure?: RawMovement;
  arrival?: RawMovement;
  aircraft?: { reg?: string; model?: string };
}

export class LookupError extends Error {
  constructor(
    message: string,
    readonly status: 422 | 429 | 502 | 503,
  ) {
    super(message);
  }
}

/** "2024-05-01 18:05Z" / "2024-05-01T18:05:00Z" → "2024-05-01T18:05:00Z" */
export function toUtcIso(t: RawTime | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t?.utc ?? "");
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}Z` : null;
}

const FLOWN = new Set(["Departed", "EnRoute", "Approaching", "Arrived"]);

export function normalizeFlights(raw: unknown, airline: string, flightNumber: string): LookupCandidate[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawFlight[])
    .filter((f) => f && typeof f === "object")
    .map((f) => {
      const flown = FLOWN.has(f.status ?? "");
      const actual = (m: RawMovement | undefined) => (flown ? toUtcIso(m?.actualTime ?? m?.revisedTime) : null);
      const carrier = f.airline?.iata?.toUpperCase() ?? null;
      return {
        airline,
        flightNumber,
        operatingAirline: carrier && carrier !== airline ? carrier : null,
        depAirport: f.departure?.airport?.iata?.toUpperCase() ?? null,
        arrAirport: f.arrival?.airport?.iata?.toUpperCase() ?? null,
        schedDepUtc: toUtcIso(f.departure?.scheduledTime),
        schedArrUtc: toUtcIso(f.arrival?.scheduledTime),
        actualDepUtc: actual(f.departure),
        actualArrUtc: f.status === "Arrived" ? actual(f.arrival) : null,
        aircraftModel: f.aircraft?.model?.trim() || null,
        aircraftType: aircraftTypeFromModel(f.aircraft?.model, names),
        registration: f.aircraft?.reg?.trim().toUpperCase() || null,
        status: f.status ?? null,
      };
    })
    .filter((c) => c.depAirport && c.arrAirport);
}

/** 调 AeroDataBox，返回原始 JSON（查不到时是空数组）。 */
export async function fetchAeroDataBox(
  apiKey: string,
  flight: string,
  date: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown[]> {
  const url =
    `https://${AERODATABOX_HOST}/flights/number/${encodeURIComponent(flight)}/${date}` +
    "?withAircraftImage=false&withLocation=false&dateLocalRole=Departure";
  let res: Response;
  try {
    res = await fetcher(url, { headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": AERODATABOX_HOST } });
  } catch {
    throw new LookupError("连不上航班数据服务，稍后再试", 502);
  }
  // 204 / 404：这天没有这个航班
  if (res.status === 204 || res.status === 404) return [];
  if (res.status === 429) throw new LookupError("航班数据服务的免费额度用完了，下个月会恢复", 429);
  if (res.status === 401 || res.status === 403) throw new LookupError("航班数据服务的 API key 无效或未订阅", 503);
  if (!res.ok) throw new LookupError(`航班数据服务出错（${res.status}）`, 502);
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body : [];
}
