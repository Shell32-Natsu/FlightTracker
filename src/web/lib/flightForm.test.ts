import { describe, expect, it } from "vitest";
import { applyLookup, emptyForm, flightToForm, formToInput, splitFlightCode } from "./flightForm";
import type { Airport, Flight, LookupCandidate } from "../../shared/types";

const airports: Record<string, Airport> = {
  JFK: { name: "JFK", country: "US", lat: 40.64, lon: -73.78, tz: "America/New_York" },
  LHR: { name: "LHR", country: "GB", lat: 51.47, lon: -0.46, tz: "Europe/London" },
};

describe("formToInput / flightToForm", () => {
  it("红眼航班往返一致", () => {
    const form = {
      ...emptyForm(),
      flightDate: "2024-07-10",
      airline: "ba",
      flightNumber: "178",
      depAirport: "jfk",
      arrAirport: "LHR",
      schedDep: "22:00",
      schedArr: "10:05",
      schedArrOffset: 1,
      actualDep: "00:20",
      actualDepOffset: 1,
      actualArr: "12:10",
      actualArrOffset: 1,
    };
    const input = formToInput(form, airports);
    expect(input).toMatchObject({
      airline: "BA",
      depAirport: "JFK",
      schedDepUtc: "2024-07-11T02:00:00Z",
      schedArrUtc: "2024-07-11T09:05:00Z",
      actualDepUtc: "2024-07-11T04:20:00Z",
      actualArrUtc: "2024-07-11T11:10:00Z",
    });
    const back = flightToForm({ ...(input as unknown as Flight), id: "x" }, airports);
    expect(back).toMatchObject({
      schedDep: "22:00",
      schedArr: "10:05",
      schedArrOffset: 1,
      actualDep: "00:20",
      actualDepOffset: 1,
      actualArrOffset: 1,
    });
  });

  it("未知机场报错", () => {
    expect(() => formToInput({ ...emptyForm(), depAirport: "XXX", arrAirport: "LHR" }, airports)).toThrow(
      /XXX/,
    );
  });
});

describe("splitFlightCode", () => {
  it.each([
    ["UA857", ["UA", "857"]],
    ["ua 857", ["UA", "857"]],
    ["3U8888", ["3U", "8888"]],
    ["MU5101A", ["MU", "5101A"]],
  ])("%s", (code, expected) => {
    expect(splitFlightCode(code)).toEqual(expected);
  });
  it("无效", () => expect(splitFlightCode("hello")).toBeNull());
});

describe("查询结果填表", () => {
  const c: LookupCandidate = {
    airline: "BA",
    flightNumber: "178",
    operatingAirline: null,
    depAirport: "JFK",
    arrAirport: "LHR",
    // 纽约 22:00（夏令时 UTC−4）→ 伦敦次日 10:05（UTC+1）
    schedDepUtc: "2024-07-11T02:00:00Z",
    schedArrUtc: "2024-07-11T09:05:00Z",
    actualDepUtc: "2024-07-11T02:21:00Z",
    actualArrUtc: "2024-07-11T08:58:00Z",
    aircraftModel: "Boeing 777-200",
    aircraftType: "B772",
    registration: "G-VIIA",
    status: "Arrived",
  };

  it("换成当地时间和日期偏移，填机型、机尾号", () => {
    const { form, filled } = applyLookup(
      { ...emptyForm(), flightDate: "2024-07-10", airline: "BA", flightNumber: "178", seat: "12A" },
      c,
      airports,
    );
    expect(form).toMatchObject({
      depAirport: "JFK",
      arrAirport: "LHR",
      schedDep: "22:00",
      schedArr: "10:05",
      schedArrOffset: 1,
      actualDep: "22:21",
      actualDepOffset: 0,
      actualArr: "09:58",
      actualArrOffset: 1,
      aircraftType: "B772",
      registration: "G-VIIA",
      seat: "12A",
    });
    expect(filled).toEqual(["航线", "计划时间", "实际时间", "机型 B772", "机尾号 G-VIIA"]);
  });

  it("日期对不上（查询日期和表单日期差太多）时不填时间", () => {
    const { form } = applyLookup({ ...emptyForm(), flightDate: "2024-07-01" }, c, airports);
    expect(form.schedDep).toBe("");
    expect(form.aircraftType).toBe("B772");
  });
});
