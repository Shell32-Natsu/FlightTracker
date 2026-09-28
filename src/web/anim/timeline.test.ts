import { describe, expect, it } from "vitest";
import { geoInterpolate } from "d3-geo";
import { buildTimeline, CAMERA, frameAt, legDuration, TIMING, type Leg, type Scales } from "./timeline";
import { groupTrips, tripPath } from "./trips";
import type { Flight } from "../../shared/types";

const PVG: [number, number] = [121.8, 31.1];
const SIN: [number, number] = [103.99, 1.36];
const SYD: [number, number] = [151.18, -33.95];
const legs: Leg[] = [
  { dep: PVG, arr: SIN, depCode: "PVG", arrCode: "SIN", km: 3800 },
  { dep: SIN, arr: SYD, depCode: "SIN", arrCode: "SYD", km: 6300 },
  { dep: [174.8, -37], arr: PVG, depCode: "AKL", arrCode: "PVG", km: 9500 },
];
const scales: Scales = { near: 4000, leg: [1200, 900, 700], overview: 500, overviewCenter: [130, 0] };

describe("时间轴", () => {
  it("航段时长按距离缩放，限制在 2.5–6 秒巡航", () => {
    expect(legDuration(100)).toBe(TIMING.approach * 2 + TIMING.cruiseMin);
    expect(legDuration(1e6)).toBe(TIMING.approach * 2 + TIMING.cruiseMax);
    expect(legDuration(5400)).toBeCloseTo(TIMING.approach * 2 + 3);
  });

  it("同机场转机 0.5 秒；不衔接的航段镜头飞过去", () => {
    const tl = buildTimeline(legs);
    expect(tl.segments.map((s) => s.kind)).toEqual([
      "intro",
      "leg",
      "transfer",
      "leg",
      "reposition",
      "leg",
      "outro",
    ]);
    const transfer = tl.segments[2];
    expect(transfer.end - transfer.start).toBeCloseTo(TIMING.transfer);
  });

  it("速度倍率缩短整体时长；可关闭片尾卡片", () => {
    const a = buildTimeline(legs).duration;
    expect(buildTimeline(legs, { speed: 2 }).duration).toBeCloseTo(a / 2);
    expect(buildTimeline(legs, { endCard: false }).duration).toBeLessThan(a);
  });
});

describe("镜头", () => {
  const tl = buildTimeline(legs);
  const leg0 = tl.segments[1];

  it("开场从全景推近到出发机场", () => {
    const f0 = frameAt(tl, legs, scales, 0);
    // 开场比全景再远一点，缓缓推进
    expect(f0.scale).toBeCloseTo(scales.overview * CAMERA.introWide);
    const f1 = frameAt(tl, legs, scales, leg0.start - 0.001);
    expect(f1.scale).toBeCloseTo(scales.near, 0);
    expect(f1.center[0]).toBeCloseTo(PVG[0], 0);
  });

  it("航段：起飞近景 → 中途拉远看全程 → 降落近景，飞机单调前进", () => {
    const at = (u: number) => frameAt(tl, legs, scales, leg0.start + (leg0.end - leg0.start) * u);
    expect(at(0).scale).toBeCloseTo(scales.near, 0);
    // 中途拉远（以飞机为中心，比整段入画再远一些）
    expect(at(0.5).scale).toBeCloseTo(Math.max(scales.overview, scales.leg[0] * CAMERA.followWiden), 6);
    // 飞行全程镜头中心就是飞机位置
    for (const uu of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const f = at(uu);
      const plane = geoInterpolate(legs[0].dep, legs[0].arr)(f.progress);
      expect(f.center[0]).toBeCloseTo(plane[0], 6);
      expect(f.center[1]).toBeCloseTo(plane[1], 6);
    }
    // 只缩放一次：先单调拉远，再单调推近，不会在机场附近来回推拉
    let dir = -1;
    let turns = 0;
    let last = at(0).scale;
    for (let u = 0.01; u <= 1; u += 0.01) {
      const sc = at(u).scale;
      if (Math.abs(sc - last) > 1e-6) {
        const d = sc > last ? 1 : -1;
        if (d !== dir) turns++;
        dir = d;
      }
      last = sc;
    }
    expect(turns).toBe(1);
    expect(at(0.999).scale).toBeGreaterThan(scales.near * 0.9);
    let prev = -1;
    for (let u = 0; u <= 1; u += 0.05) {
      const p = at(u).progress;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(at(0).progress).toBe(0);
    expect(at(1).progress).toBeCloseTo(1, 3);
  });

  it("转机时镜头停在近景不动", () => {
    const transfer = tl.segments[2];
    const a = frameAt(tl, legs, scales, transfer.start + 0.01).scale;
    const b = frameAt(tl, legs, scales, (transfer.start + transfer.end) / 2).scale;
    expect(a).toBeCloseTo(scales.near);
    expect(b).toBeCloseTo(scales.near);
  });

  it("镜头全程平滑：60 帧下相邻两帧没有跳变（含分段衔接处）", () => {
    const dt = 1 / 60;
    let prev = frameAt(tl, legs, scales, 0);
    let worstZoom = 0;
    let worstPan = 0;
    for (let t = dt; t < tl.duration; t += dt) {
      const f = frameAt(tl, legs, scales, t);
      worstZoom = Math.max(worstZoom, Math.abs(Math.log(f.scale / prev.scale)));
      worstPan = Math.max(worstPan, Math.hypot(f.center[0] - prev.center[0], f.center[1] - prev.center[1]));
      prev = f;
    }
    // 每帧缩放变化 < 8%，平移 < 3°（测试里的缩放差距比真实画面更极端）
    expect(worstZoom).toBeLessThan(Math.log(1.08));
    expect(worstPan).toBeLessThan(3);
  });

  it("片尾拉回全景并淡入统计卡片", () => {
    const end = frameAt(tl, legs, scales, tl.duration - 0.01);
    // 卡片出现后继续缓缓拉远
    expect(end.scale).toBeCloseTo(scales.overview * CAMERA.outroDrift, 0);
    expect(end.endCard).toBeCloseTo(1);
    expect(end.progress).toBe(1);
  });
});

describe("旅行分组", () => {
  let n = 0;
  const f = (dep: string, arr: string, depUtc: string, arrUtc: string, pnr: string | null = null): Flight =>
    ({
      id: String(n++),
      flightDate: depUtc.slice(0, 10),
      depAirport: dep,
      arrAirport: arr,
      schedDepUtc: depUtc,
      schedArrUtc: arrUtc,
      confirmationCode: pnr,
    }) as Flight;

  it("72 小时内接续的航段归为一次旅行", () => {
    const trips = groupTrips([
      f("PVG", "SIN", "2024-03-28T01:00:00Z", "2024-03-28T06:00:00Z"),
      f("SIN", "SYD", "2024-03-30T12:00:00Z", "2024-03-30T20:00:00Z"),
      f("SYD", "PVG", "2024-04-10T01:00:00Z", "2024-04-10T11:00:00Z"),
    ]);
    expect(trips.map((t) => t.flights.length)).toEqual([2, 1]);
    expect(trips[0].label).toBe("2024年3月 · PVG–SIN–SYD");
  });

  it("同一订座记录即使间隔很久也归为一次", () => {
    const trips = groupTrips([
      f("PVG", "SFO", "2023-04-02T05:00:00Z", "2023-04-02T17:00:00Z", "ABC123"),
      f("SFO", "PVG", "2023-04-20T18:00:00Z", "2023-04-21T06:00:00Z", "ABC123"),
    ]);
    expect(trips).toHaveLength(1);
  });

  it("还没回到常驻机场、从上一段到达地继续出发的归为一次", () => {
    const flights = [
      f("PVG", "SIN", "2024-03-28T01:00:00Z", "2024-03-28T06:00:00Z"),
      f("SIN", "SYD", "2024-04-02T12:00:00Z", "2024-04-02T20:00:00Z"),
      f("SYD", "PVG", "2024-04-10T01:00:00Z", "2024-04-10T11:00:00Z"),
      f("PVG", "PEK", "2024-04-15T01:00:00Z", "2024-04-15T03:00:00Z"),
    ];
    expect(groupTrips(flights, "PVG").map((t) => t.flights.length)).toEqual([3, 1]);
    expect(groupTrips(flights).map((t) => t.flights.length)).toEqual([1, 1, 1, 1]);
  });

  it("途经机场合并相邻重复", () => {
    expect(
      tripPath([
        f("A", "B", "2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z"),
        f("B", "C", "2024-01-01T02:00:00Z", "2024-01-01T03:00:00Z"),
      ]),
    ).toEqual(["A", "B", "C"]);
  });
});
