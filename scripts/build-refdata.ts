/**
 * 生成参考数据：机场、国家/地区、航司、机型、国界底图。
 *
 *   npm run refdata
 *
 * 输出：
 *   public/refdata/*.json                   前端静态资源，加载一次常驻内存
 *   src/worker/refdata/airports-coords.json Worker 用的精简机场表（校验三字码、算距离）
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import tzlookup from "@photostructure/tz-lookup";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..");
const WEB_OUT = path.join(ROOT, "public/refdata");
const WORKER_OUT = path.join(ROOT, "src/worker/refdata");

const RAW = "https://raw.githubusercontent.com";
const SOURCES = {
  airports: `${RAW}/davidmegginson/ourairports-data/main/airports.csv`,
  countries: `${RAW}/davidmegginson/ourairports-data/main/countries.csv`,
  isoCodes: `${RAW}/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.csv`,
  airlines: `${RAW}/jpatokal/openflights/master/data/airlines.dat`,
  planes: `${RAW}/jpatokal/openflights/master/data/planes.dat`,
};

/** OpenFlights 的航司表停更多年，新航司在这里手动补。 */
const EXTRA_AIRLINES: Record<string, { name: string; icao?: string; country?: string }> = {
  // "XX": { name: "Example Air", icao: "XXX", country: "US" },
};

/** planes.dat 缺的或名称需要修正的机型。 */
const EXTRA_AIRCRAFT: Record<string, string> = {
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A19N: "Airbus A319neo",
  A339: "Airbus A330-900",
  A338: "Airbus A330-800",
  A35K: "Airbus A350-1000",
  BCS1: "Airbus A220-100",
  BCS3: "Airbus A220-300",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B3XM: "Boeing 737 MAX 10",
  B37M: "Boeing 737 MAX 7",
  B78X: "Boeing 787-10",
  B77W: "Boeing 777-300ER",
  B77L: "Boeing 777-200LR",
  B779: "Boeing 777-9",
  C919: "COMAC C919",
  AJ27: "COMAC ARJ21",
  E290: "Embraer E190-E2",
  E295: "Embraer E195-E2",
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** 最小 CSV 解析，支持引号、转义引号、引号内换行。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function toObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const TYPE_RANK: Record<string, number> = {
  large_airport: 5,
  medium_airport: 4,
  small_airport: 3,
  seaplane_base: 2,
  heliport: 1,
  closed: 0,
};

async function buildAirports() {
  const rows = toObjects(parseCsv(await fetchText(SOURCES.airports)));
  const best = new Map<string, Record<string, string>>();
  const score = (r: Record<string, string>) =>
    (r.scheduled_service === "yes" ? 10 : 0) + (TYPE_RANK[r.type] ?? 0);
  for (const r of rows) {
    const iata = r.iata_code?.trim().toUpperCase();
    if (!iata || !/^[A-Z]{3}$/.test(iata)) continue;
    const prev = best.get(iata);
    if (!prev || score(r) > score(prev)) best.set(iata, r);
  }

  const airports: Record<string, unknown> = {};
  const coords: Record<string, [number, number, string, string]> = {};
  for (const [iata, r] of [...best].sort(([a], [b]) => a.localeCompare(b))) {
    const lat = round(Number(r.latitude_deg), 5);
    const lon = round(Number(r.longitude_deg), 5);
    const tz = tzlookup(lat, lon);
    airports[iata] = {
      name: r.name,
      city: r.municipality || undefined,
      country: r.iso_country,
      icao: r.icao_code || r.gps_code || undefined,
      lat,
      lon,
      tz,
    };
    coords[iata] = [lat, lon, r.iso_country, tz];
  }
  return { airports, coords };
}

async function buildCountries() {
  const rows = toObjects(parseCsv(await fetchText(SOURCES.countries)));
  const iso = toObjects(parseCsv(await fetchText(SOURCES.isoCodes)));
  const numericByA2 = new Map(iso.map((r) => [r["alpha-2"], r["country-code"]]));
  const zh = new Intl.DisplayNames(["zh-Hans"], { type: "region" });
  const countries: Record<string, { name: string; nameZh: string; numeric?: string; continent: string }> = {};
  for (const r of rows) {
    const code = r.code;
    let nameZh = r.name;
    try {
      nameZh = zh.of(code) ?? r.name;
    } catch {
      // 非标准代码（如 XK）
    }
    countries[code] = {
      name: r.name,
      nameZh,
      numeric: numericByA2.get(code),
      continent: r.continent,
    };
  }
  return countries;
}

async function buildAirlines() {
  const rows = parseCsv(await fetchText(SOURCES.airlines));
  const airlines: Record<string, { name: string; icao?: string; country?: string }> = {};
  const active = new Map<string, boolean>();
  for (const [, name, , iata, icao, , country, isActive] of rows) {
    if (!iata || !/^[A-Z0-9]{2}$/.test(iata)) continue;
    const isAct = isActive === "Y";
    if (airlines[iata] && (active.get(iata) || !isAct)) continue;
    airlines[iata] = {
      name,
      icao: icao && icao !== "\\N" && icao !== "N/A" ? icao : undefined,
      country: country && country !== "\\N" ? country : undefined,
    };
    active.set(iata, isAct);
  }
  return { ...airlines, ...EXTRA_AIRLINES };
}

async function buildAircraft() {
  const rows = parseCsv(await fetchText(SOURCES.planes));
  const aircraft: Record<string, string> = {};
  for (const [name, , icao] of rows) {
    if (!icao || icao === "\\N" || !/^[A-Z0-9]{2,4}$/.test(icao)) continue;
    aircraft[icao] ??= name;
  }
  return { ...aircraft, ...EXTRA_AIRCRAFT };
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

async function main() {
  await mkdir(WEB_OUT, { recursive: true });
  await mkdir(WORKER_OUT, { recursive: true });

  const [{ airports, coords }, countries, airlines, aircraft] = await Promise.all([
    buildAirports(),
    buildCountries(),
    buildAirlines(),
    buildAircraft(),
  ]);

  const write = (file: string, data: unknown) => writeFile(file, JSON.stringify(data) + "\n");
  await write(path.join(WEB_OUT, "airports.json"), airports);
  await write(path.join(WEB_OUT, "countries.json"), countries);
  await write(path.join(WEB_OUT, "airlines.json"), airlines);
  await write(path.join(WEB_OUT, "aircraft.json"), aircraft);
  await write(path.join(WORKER_OUT, "airports-coords.json"), coords);
  // Natural Earth 1:50m 国界（world-atlas 已转成 TopoJSON，id 为 ISO 3166 数字码）
  await copyFile(
    require.resolve("world-atlas/countries-50m.json"),
    path.join(WEB_OUT, "countries-50m.json"),
  );

  console.log(
    `airports ${Object.keys(airports).length}, countries ${Object.keys(countries).length}, ` +
      `airlines ${Object.keys(airlines).length}, aircraft ${Object.keys(aircraft).length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
