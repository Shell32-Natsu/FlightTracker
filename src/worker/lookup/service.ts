import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { lookupCache } from "../db/schema";
import type { Env } from "../env";
import { fetchAeroDataBox, normalizeFlights, type LookupCandidate } from "./aerodatabox";

const HOUR = 3600_000;

/**
 * 缓存是否还能用：起飞日期两天以前的航班不会再变，查到时已经是这样的就一直用；
 * 最近和未来的航班时刻、机型还可能变，有结果的缓存 6 小时，查不到的 1 小时。
 */
export function cacheFresh(date: string, fetchedAt: string, empty: boolean, now = Date.now()): boolean {
  const day = Date.parse(`${date}T00:00:00Z`);
  const fetched = Date.parse(fetchedAt);
  if (day < fetched - 2 * 24 * HOUR) return true;
  return now - fetched < (empty ? 1 : 6) * HOUR;
}

/**
 * 按航班号 + 起飞当地日期查航班（先查 D1 缓存，缓存是全体用户共用的）。
 * 没配置 API key 时返回 null；查询失败抛 LookupError。
 */
export async function lookupFlight(
  env: Pick<Env, "DB" | "AERODATABOX_API_KEY">,
  airline: string,
  flightNumber: string,
  date: string,
  fetcher: typeof fetch = fetch,
): Promise<{ candidates: LookupCandidate[]; cached: boolean } | null> {
  const key = env.AERODATABOX_API_KEY;
  if (!key) return null;
  const flight = `${airline}${flightNumber}`;
  const cacheKey = `${flight}:${date}`;
  const db = drizzle(env.DB);

  const [hit] = await db.select().from(lookupCache).where(eq(lookupCache.key, cacheKey));
  if (hit) {
    const body = JSON.parse(hit.responseJson) as { flights?: unknown[] };
    const raw = Array.isArray(body.flights) ? body.flights : [];
    if (cacheFresh(date, hit.fetchedAt, raw.length === 0)) {
      return { candidates: normalizeFlights(raw, airline, flightNumber), cached: true };
    }
  }

  const raw = await fetchAeroDataBox(key, flight, date, fetcher);
  const row = { key: cacheKey, responseJson: JSON.stringify({ flights: raw }), fetchedAt: new Date().toISOString() };
  await db
    .insert(lookupCache)
    .values(row)
    .onConflictDoUpdate({ target: lookupCache.key, set: { responseJson: row.responseJson, fetchedAt: row.fetchedAt } });
  return { candidates: normalizeFlights(raw, airline, flightNumber), cached: false };
}

/** 从候选里挑出和已知起降机场对得上的那一段（一个航班号可能有多段经停）。 */
export function pickCandidate(
  candidates: LookupCandidate[],
  depAirport?: string | null,
  arrAirport?: string | null,
): LookupCandidate | null {
  const dep = depAirport?.toUpperCase();
  const arr = arrAirport?.toUpperCase();
  // 起降机场都不知道时，只有一段才能确定是它
  if (!dep && !arr) return candidates.length === 1 ? candidates[0] : null;
  return candidates.find((c) => (!dep || c.depAirport === dep) && (!arr || c.arrAirport === arr)) ?? null;
}
