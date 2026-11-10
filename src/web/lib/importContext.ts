import { normalizeAircraftName, type ImportContext } from "../../shared/flightCsv";
import { localToday } from "./format";
import type { RefData } from "./refdata";

/** 用前端的参考数据构造 CSV 导入需要的查找表。 */
export function importContext(ref: RefData): ImportContext {
  const airlineIcaoToIata: Record<string, string> = {};
  for (const [iata, a] of Object.entries(ref.airlines)) if (a.icao) airlineIcaoToIata[a.icao] = iata;
  const aircraftByName: Record<string, string> = {};
  for (const [code, name] of Object.entries(ref.aircraft)) aircraftByName[normalizeAircraftName(name)] ??= code;
  return { airports: ref.airports, airlineIcaoToIata, aircraftByName, today: localToday() };
}
