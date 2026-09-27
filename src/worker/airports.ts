import coords from "./refdata/airports-coords.json";

type Row = [lat: number, lon: number, country: string, tz: string];
const table = coords as unknown as Record<string, Row>;

export interface AirportLite {
  lat: number;
  lon: number;
  country: string;
  tz: string;
}

/** 按 IATA 三字码查机场；不存在返回 undefined。 */
export function findAirport(iata: string): AirportLite | undefined {
  const r = table[iata.toUpperCase()];
  return r && { lat: r[0], lon: r[1], country: r[2], tz: r[3] };
}
