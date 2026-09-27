import { describe, expect, it } from "vitest";
import { settingsFromRows, settingsPatchSchema } from "./settings";
import { DEFAULT_SETTINGS } from "../shared/settings";

describe("settingsPatchSchema", () => {
  it("部分更新，三字码转大写", () => {
    expect(settingsPatchSchema.parse({ homeAirport: "sfo" })).toEqual({ homeAirport: "SFO" });
    expect(settingsPatchSchema.parse({ distanceUnit: "mi" })).toEqual({ distanceUnit: "mi" });
  });
  it("可以清除指定的机场", () => {
    expect(settingsPatchSchema.parse({ homeAirport: null })).toEqual({ homeAirport: null });
  });
  it("拒绝不存在的机场、非法单位和未知键", () => {
    expect(settingsPatchSchema.safeParse({ homeAirport: "ZZZ" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ homeAirport: "SF" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ distanceUnit: "nm" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ theme: "light" }).success).toBe(false);
  });
});

describe("settingsFromRows", () => {
  it("没有记录时是默认值", () => {
    expect(settingsFromRows([])).toEqual(DEFAULT_SETTINGS);
  });
  it("合并已存的值", () => {
    expect(
      settingsFromRows([
        { key: "distanceUnit", value: '"mi"' },
        { key: "homeAirport", value: '"PEK"' },
      ]),
    ).toEqual({ distanceUnit: "mi", homeAirport: "PEK" });
  });
  it("忽略未知键和损坏的值", () => {
    expect(
      settingsFromRows([
        { key: "legacy", value: '"x"' },
        { key: "distanceUnit", value: "not json" },
        { key: "homeAirport", value: '"ZZZ"' },
      ]),
    ).toEqual(DEFAULT_SETTINGS);
  });
});
