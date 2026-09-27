import { describe, expect, it } from "vitest";
import { addDays, dayDiff, formatDuration, localToUtc, minutesBetween, utcToLocal } from "./time";

describe("localToUtc / utcToLocal", () => {
  it("普通航班：往返换算一致", () => {
    const utc = localToUtc("2024-05-01", "11:10", "America/Chicago"); // CDT, UTC-5
    expect(utc).toBe("2024-05-01T16:10:00Z");
    expect(utcToLocal(utc, "America/Chicago")).toEqual({ date: "2024-05-01", time: "11:10" });
  });

  it("红眼航班：JFK 22:00 起飞，LHR 次日 10:05 到达", () => {
    const dep = localToUtc("2024-07-10", "22:00", "America/New_York"); // EDT
    const arr = localToUtc("2024-07-11", "10:05", "Europe/London"); // BST
    expect(dep).toBe("2024-07-11T02:00:00Z");
    expect(arr).toBe("2024-07-11T09:05:00Z");
    expect(minutesBetween(dep, arr)).toBe(7 * 60 + 5);
    expect(dayDiff("2024-07-10", utcToLocal(arr, "Europe/London").date)).toBe(1);
  });

  it("夏令时开始日：跨切换时刻的航班时长正确", () => {
    // 2024-03-10 02:00 美东拨快一小时。BOS 01:00 EST 起飞 → ORD 03:30 CDT 到达
    const dep = localToUtc("2024-03-10", "01:00", "America/New_York");
    const arr = localToUtc("2024-03-10", "03:30", "America/Chicago");
    expect(dep).toBe("2024-03-10T06:00:00Z");
    expect(arr).toBe("2024-03-10T08:30:00Z");
    expect(minutesBetween(dep, arr)).toBe(150);
  });

  it("夏令时开始日：不存在的当地时刻顺延到切换后", () => {
    // 02:30 不存在，按 EST 换算得 07:30Z，即 03:30 EDT
    const utc = localToUtc("2024-03-10", "02:30", "America/New_York");
    expect(utc).toBe("2024-03-10T07:30:00Z");
    expect(utcToLocal(utc, "America/New_York").time).toBe("03:30");
  });

  it("夏令时结束日：重复的当地时刻取较早的一次", () => {
    // 2024-11-03 01:30 在美东出现两次（EDT 与 EST）
    expect(localToUtc("2024-11-03", "01:30", "America/New_York")).toBe("2024-11-03T05:30:00Z");
    expect(localToUtc("2024-11-03", "03:00", "America/New_York")).toBe("2024-11-03T08:00:00Z");
  });

  it("欧洲夏令时切换同样生效", () => {
    // 2024-10-27 欧洲冬令时开始，CET = UTC+1
    expect(localToUtc("2024-10-27", "12:00", "Europe/Paris")).toBe("2024-10-27T11:00:00Z");
    expect(localToUtc("2024-10-26", "12:00", "Europe/Paris")).toBe("2024-10-26T10:00:00Z");
  });

  it("向东跨日期变更线：SFO → HKG 到达显示 +2", () => {
    // SFO 2024-01-15 23:55 PST 起飞 → HKG 2024-01-17 06:25 HKT 到达（14h30m）
    const dep = localToUtc("2024-01-15", "23:55", "America/Los_Angeles");
    const arr = localToUtc("2024-01-17", "06:25", "Asia/Hong_Kong");
    expect(dep).toBe("2024-01-16T07:55:00Z");
    expect(minutesBetween(dep, arr)).toBe(14 * 60 + 30);
    const arrLocal = utcToLocal(arr, "Asia/Hong_Kong");
    expect(dayDiff("2024-01-15", arrLocal.date)).toBe(2);
  });

  it("向西跨日期变更线：AKL → HNL 到达日期早于起飞日期（−1）", () => {
    // NZ10 AKL 2024-02-20 21:50 NZDT → HNL 2024-02-20 08:15 HST
    const dep = localToUtc("2024-02-20", "21:50", "Pacific/Auckland");
    const arr = localToUtc("2024-02-20", "08:15", "Pacific/Honolulu");
    expect(dep).toBe("2024-02-20T08:50:00Z");
    expect(arr).toBe("2024-02-20T18:15:00Z");
    expect(minutesBetween(dep, arr)).toBe(9 * 60 + 25);
    expect(dayDiff("2024-02-20", utcToLocal(arr, "Pacific/Honolulu").date)).toBe(0);
    // 同一航班如果晚点跨过当地午夜，则到达日比起飞日早一天
    const arr2 = localToUtc("2024-02-19", "23:30", "Pacific/Honolulu");
    expect(dayDiff("2024-02-20", utcToLocal(arr2, "Pacific/Honolulu").date)).toBe(-1);
  });

  it("非整点时区（加德满都 UTC+5:45）", () => {
    expect(localToUtc("2024-04-01", "12:00", "Asia/Kathmandu")).toBe("2024-04-01T06:15:00Z");
  });

  it("非法输入报错", () => {
    expect(() => localToUtc("2024/04/01", "12:00", "UTC")).toThrow();
    expect(() => localToUtc("2024-04-01", "noon", "UTC")).toThrow();
  });
});

describe("工具函数", () => {
  it("addDays 跨月跨年", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("formatDuration", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(785)).toBe("13h 05m");
  });
});
