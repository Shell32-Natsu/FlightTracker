import { describe, expect, it } from "vitest";
import { dedupeKey, detectFormat, flightsToCsv, normalizeAircraftName, parseFlightCsv, type ImportContext } from "./flightCsv";
import { parseCsv } from "./csv";
import type { Flight } from "./types";

const airports = {
  ICN: { tz: "Asia/Seoul" },
  SFO: { tz: "America/Los_Angeles" },
  LAX: { tz: "America/Los_Angeles" },
  SYD: { tz: "Australia/Sydney" },
  NAN: { tz: "Pacific/Fiji" },
  SIN: { tz: "Asia/Singapore" },
  SAN: { tz: "America/Los_Angeles" },
  NRT: { tz: "Asia/Tokyo" },
};

const ctx: ImportContext = {
  airports,
  airlineIcaoToIata: { KAL: "KE", QFA: "QF", FJI: "FJ", UAL: "UA", TZP: "ZG" },
  aircraftByName: Object.fromEntries(
    [
      ["Boeing 777-300ER", "B77W"],
      ["Airbus A380-800", "A388"],
      ["Airbus A350-900", "A359"],
      ["Boeing 787-8", "B788"],
      ["Boeing 787-9", "B789"],
    ].map(([n, c]) => [normalizeAircraftName(n), c]),
  ),
  today: "2026-09-27",
};

/** 按 Flighty 导出格式虚构的样例（非真实行程）。 */
const sample = `Date,Airline,Flight,From,To,Dep Terminal,Dep Gate,Arr Terminal,Arr Gate,Canceled,Diverted To,Gate Departure (Scheduled),Gate Departure (Actual),Take off (Scheduled),Take off (Actual),Landing (Scheduled),Landing (Actual),Gate Arrival (Scheduled),Gate Arrival (Actual),Aircraft Type Name,Tail Number,PNR,Seat,Seat Type,Cabin Class,Flight Reason,Notes,Flight Flighty ID,Airline Flighty ID,Departure Airport Flighty ID,Arrival Airport Flighty ID,Diverted To Airport Flighty ID,Aircraft Type Flighty ID
2026-01-07,KAL,23,ICN,SFO,2,221,INTL,A8,false,,2026-01-07T16:00,2026-01-07T16:05,,,,,2026-01-07T09:30,2026-01-07T09:11,Boeing 777-300 ER,HL7782,ABC123,41A,WINDOW,BUSINESS,LEISURE,"Great crew, ""on time""",00000000-0000-0000-0000-000000000001,,,,,
2026-02-18,QFA,12,LAX,SYD,TBIT,148,1,10,false,,2026-02-18T21:25,2026-02-18T21:26,,,,,2026-02-20T07:25,2026-02-20T07:48,Airbus A380-800,,,,,,,,00000000-0000-0000-0000-000000000002,,,,,
2026-03-08,FJI,870,NAN,SFO,,,INTL,A2,false,,2026-03-08T22:00,2026-03-08T22:06,,,,,2026-03-08T13:25,2026-03-08T13:23,Airbus A350-900,,,,,,,,00000000-0000-0000-0000-000000000003,,,,,
2026-04-01,UAL,1,SFO,SIN,,,,,true,,2026-04-01T10:00,,,,,,2026-04-02T18:00,,Boeing 787-9,,,,,,,,00000000-0000-0000-0000-000000000004,,,,,
2026-05-02,UAL,2,SFO,LAX,,,,,false,SAN,2026-05-02T08:00,2026-05-02T08:10,,,,,2026-05-02T09:30,2026-05-02T10:05,Concorde Mk2,,,,,,,,00000000-0000-0000-0000-000000000005,,,,,
2027-01-11,TZP,23,LAX,NRT,B,,1,,false,,2027-01-11T09:30,,,,,,2027-01-12T14:25,,Boeing 787-8,,,,,,,,00000000-0000-0000-0000-000000000006,,,,,
2026-06-01,XXX,9,SFO,LAX,,,,,false,,2026-06-01T08:00,,,,,,2026-06-01T09:30,,,,,,,,,,00000000-0000-0000-0000-000000000007,,,,,
2026-06-02,UAL,10,SFO,ZZZ,,,,,false,,,,,,,,,,,,,,,,,,00000000-0000-0000-0000-000000000008,,,,,
`;

describe("parseCsv", () => {
  it("引号、转义引号、引号内换行、BOM", () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi"""\n"multi\nline",z\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["multi\nline", "z"],
    ]);
  });
});

describe("Flighty 导入", () => {
  const { format, rows } = parseFlightCsv(sample, ctx);
  const byLine = (n: number) => rows.find((r) => r.line === n)!;

  it("识别格式", () => {
    expect(format).toBe("flighty");
    expect(rows).toHaveLength(8);
  });

  it("ICAO 航司转 IATA，当地时间转 UTC，机型名称转代码，舱位和目的", () => {
    const r = byLine(2);
    expect(r.error).toBeNull();
    expect(r.input).toMatchObject({
      source: "csv",
      flightDate: "2026-01-07",
      airline: "KE",
      flightNumber: "23",
      depAirport: "ICN",
      arrAirport: "SFO",
      // ICN 16:00 KST = 07:00Z；SFO 09:30 PST = 17:30Z
      schedDepUtc: "2026-01-07T07:00:00Z",
      schedArrUtc: "2026-01-07T17:30:00Z",
      actualDepUtc: "2026-01-07T07:05:00Z",
      actualArrUtc: "2026-01-07T17:11:00Z",
      aircraftType: "B77W",
      registration: "HL7782",
      confirmationCode: "ABC123",
      seat: "41A",
      cabin: "business",
      purpose: "leisure",
      notes: 'Great crew, "on time"',
    });
  });

  it("跨日期变更线：到达日期早于起飞日期也能换算", () => {
    // NAN 22:00 (UTC+12) → SFO 当天 13:25。2026-03-08 正好是美国夏令时开始日，
    // 13:25 已是 PDT (UTC-7)
    const r = byLine(4);
    expect(r.input?.schedDepUtc).toBe("2026-03-08T10:00:00Z");
    expect(r.input?.schedArrUtc).toBe("2026-03-08T20:25:00Z");
  });

  it("两天后到达（LAX → SYD）", () => {
    expect(byLine(3).input?.schedArrUtc).toBe("2026-02-19T20:25:00Z");
  });

  it("已取消的航班跳过", () => {
    const r = byLine(5);
    expect(r.skipped).toBe("航班已取消");
    expect(r.input).toBeNull();
  });

  it("备降：按实际降落机场记录并写备注；未识别机型写进备注", () => {
    const r = byLine(6);
    expect(r.input?.arrAirport).toBe("SAN");
    expect(r.input?.aircraftType).toBeNull();
    expect(r.input?.notes).toContain("备降 SAN，原计划到达 LAX");
    expect(r.input?.notes).toContain("机型：Concorde Mk2");
    expect(r.warnings).toHaveLength(2);
  });

  it("尚未起飞的航班打标记", () => {
    const r = byLine(7);
    expect(r.future).toBe(true);
    expect(r.input?.airline).toBe("ZG");
  });

  it("未知航司、未知机场报错", () => {
    expect(byLine(8).error).toMatch(/航司代码 XXX/);
    expect(byLine(9).error).toMatch(/ZZZ/);
  });
});

describe("本应用格式：导出后能原样导入", () => {
  const flight = (p: Partial<Flight>): Flight => ({
    id: "1",
    status: "confirmed",
    source: "manual",
    flightDate: "2026-03-08",
    airline: "FJ",
    flightNumber: "870",
    operatingAirline: null,
    depAirport: "NAN",
    arrAirport: "SFO",
    schedDepUtc: "2026-03-08T10:00:00Z",
    schedArrUtc: "2026-03-08T20:25:00Z",
    actualDepUtc: null,
    actualArrUtc: null,
    aircraftType: "A359",
    registration: null,
    seat: "12A",
    cabin: "economy",
    purpose: "other",
    confirmationCode: null,
    distanceKm: 8800,
    durationMin: 685,
    trackKey: null,
    emailId: null,
    notes: "line1\nline2, with comma",
    createdAt: "",
    updatedAt: "",
    ...p,
  });

  it("往返一致", () => {
    const flights = [flight({}), flight({ id: "2", flightDate: "2026-01-07", airline: "KE", flightNumber: "23", depAirport: "ICN", schedDepUtc: "2026-01-07T07:00:00Z", schedArrUtc: "2026-01-07T17:30:00Z", notes: null })];
    const csv = flightsToCsv(flights, airports);
    expect(csv.split("\r\n")[1]).toMatch(/^2026-01-07,KE,23,ICN,SFO,2026-01-07T16:00,2026-01-07T09:30,/);
    const { format, rows } = parseFlightCsv(csv, ctx);
    expect(format).toBe("native");
    expect(rows.map((r) => r.error)).toEqual([null, null]);
    const nan = rows.find((r) => r.input?.depAirport === "NAN")!.input!;
    const { id, status, distanceKm, durationMin, trackKey, emailId, createdAt, updatedAt, ...expected } = flight({});
    void [id, status, distanceKm, durationMin, trackKey, emailId, createdAt, updatedAt];
    expect(nan).toEqual({ ...expected, source: "csv" });
  });
});

describe("其他", () => {
  it("无法识别的文件报错", () => {
    expect(() => parseFlightCsv("a,b\n1,2\n", ctx)).toThrow(/无法识别/);
    expect(detectFormat(["Date", "Airline", "Gate Departure (Scheduled)"])).toBe("flighty");
  });
  it("机型名称归一化", () => {
    expect(normalizeAircraftName("Boeing 777-300 ER")).toBe(normalizeAircraftName("Boeing 777-300ER"));
  });
  it("去重键", () => {
    expect(dedupeKey({ airline: "KE", flightNumber: "23", flightDate: "2026-01-07", depAirport: "ICN" })).toBe(
      "KE|23|2026-01-07|ICN",
    );
  });
});
