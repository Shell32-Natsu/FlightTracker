import { describe, expect, it } from "vitest";
import names from "../../public/refdata/aircraft.json";
import { aircraftTypeFromModel } from "./aircraftModel";

describe("机型名称 → ICAO 代码", () => {
  it.each([
    ["Boeing 777-300ER", "B77W"],
    ["Boeing 777-300", "B773"],
    ["Boeing 787-9 Dreamliner", "B789"],
    ["Boeing 787-10", "B78X"],
    ["Boeing 737-800", "B738"],
    ["Boeing 737 MAX 8", "B38M"],
    ["Boeing 747-8", "B748"],
    ["Airbus A321-200", "A321"],
    ["Airbus A321neo", "A21N"],
    ["Airbus A320 NEO", "A20N"],
    ["Airbus A350-900", "A359"],
    ["Airbus A350-1000", "A35K"],
    ["Airbus A330-300", "A333"],
    ["Airbus A380-800", "A388"],
    ["Airbus A220-300", "BCS3"],
    ["Embraer 175", "E75L"],
    ["Embraer 190", "E190"],
    ["Bombardier CRJ900", "CRJ9"],
    ["De Havilland Canada Dash 8-400", "DH8D"],
    ["ATR 72-600", "AT72"],
    ["COMAC C919", "C919"],
    ["B77W", "B77W"],
  ])("%s → %s", (model, code) => {
    expect(aircraftTypeFromModel(model, names)).toBe(code);
  });

  it("认不出时返回 null", () => {
    expect(aircraftTypeFromModel("", names)).toBeNull();
    expect(aircraftTypeFromModel("Unknown jet", names)).toBeNull();
    expect(aircraftTypeFromModel(null, names)).toBeNull();
  });
});
