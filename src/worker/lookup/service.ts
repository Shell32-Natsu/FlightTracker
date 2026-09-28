import { eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { lookupCache } from "../db/schema";
import type { Env } from "../env";
import { fetchAeroDataBox, LookupError, normalizeFlights, type LookupCandidate } from "./aerodatabox";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** AeroDataBox 使用条款：缓存的数据最多保留 7 天 */
export const CACHE_RETENTION_DAYS = 7;
/** 免费套餐只能查前后一年内的航班 */
export const LOOKUP_RANGE_DAYS = 365;

/**
 * 缓存是否还能用（都不超过 7 天的保留期）：起飞日期两天以前的航班不会再变，一直用到保留期满；
 * 最近和未来的航班时刻、机型还可能变，有结果的缓存 6 小时，查不到的 1 小时。
 */
export function cacheFresh(date: string, fetchedAt: string, empty: boolean, now = Date.now()): boolean {
  const day = Date.parse(`${date}T00:00:00Z`);
  const fetched = Date.parse(fetchedAt);
  const age = now - fetched;
  if (age >= CACHE_RETENTION_DAYS * DAY) return false;
  if (day < fetched - 2 * DAY) return true;
  return age < (empty ? 1 : 6) * HOUR;
}

/** 日期在不在可查询的范围（今天前后一年）里 */
export function inLookupRange(date: string, now = Date.now()): boolean {
  const day = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(day) && Math.abs(day - now) <= LOOKUP_RANGE_DAYS * DAY;
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
  if (!inLookupRange(date)) {
    throw new LookupError(`航班数据服务只能查一年以内的航班（前后 ${LOOKUP_RANGE_DAYS} 天）`, 422);
  }
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
  // 顺手清掉超过保留期的缓存
  const expired = new Date(Date.now() - CACHE_RETENTION_DAYS * DAY).toISOString();
  await db.delete(lookupCache).where(lt(lookupCache.fetchedAt, expired));
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
