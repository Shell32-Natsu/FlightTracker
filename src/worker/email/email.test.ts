import { describe, expect, it } from "vitest";
import { checkSender, normalizeAddress } from "./auth";
import { htmlToText } from "./html";
import { segmentsFromJsonLd } from "./jsonld";
import { cabinFromName, normalizeSeat, splitFlightNumber, type ExtractedSegment } from "./segments";
import { JSONLD_HTML } from "./fixtures";

describe("JSON-LD FlightReservation", () => {
  it("提取航段：墙上时间、座位、舱位、订座号、取消状态", () => {
    const [a, b] = segmentsFromJsonLd(JSONLD_HTML);
    expect(a).toEqual({
      airline: "UA",
      flightNumber: "110",
      depAirport: "SFO",
      arrAirport: "JFK",
      depDate: "2027-03-04",
      depTime: "20:15",
      arrDate: "2027-03-05",
      arrTime: "06:30",
      confirmationCode: "RXJ34P",
      seat: "9a",
      cabin: "business",
      cancelled: false,
    });
    // 航司写在航班号里、没有单独的 airline 对象
    expect(b).toMatchObject({ airline: "UA", flightNumber: "111", cancelled: true, arrTime: null });
  });

  it("没有结构化数据时返回空", () => {
    expect(segmentsFromJsonLd("<p>hello</p>")).toEqual([]);
    expect(segmentsFromJsonLd('<script type="application/ld+json">{bad json</script>')).toEqual([]);
  });
});

describe("工具函数", () => {
  it("HTML 转纯文本保留段落与表格结构", () => {
    const text = htmlToText(
      "<style>p{}</style><p>航班&nbsp;MU5101</p><table><tr><td>PVG</td><td>PEK</td></tr></table><!-- x -->",
    );
    expect(text).toBe("航班 MU5101\nPVG PEK");
  });

  it("航班号拆分：航司码至少含一个字母", () => {
    expect(splitFlightNumber("UA110", null)).toEqual({ airline: "UA", number: "110" });
    expect(splitFlightNumber("110", "UA")).toEqual({ airline: "UA", number: "110" });
    expect(splitFlightNumber("3U 8888", null)).toEqual({ airline: "3U", number: "8888" });
    expect(splitFlightNumber("B6 1234", null)).toEqual({ airline: "B6", number: "1234" });
    expect(splitFlightNumber("hello", null)).toBeNull();
  });

  it("座位号：只接受“排号 + 字母”，说明文字丢掉", () => {
    expect(normalizeSeat("32a")).toBe("32A");
    expect(normalizeSeat(" 9 K ")).toBe("9K");
    expect(normalizeSeat("CHECK-IN REQUIRED")).toBeNull();
    expect(normalizeSeat("Seat selection at check-in")).toBeNull();
    expect(normalizeSeat(null)).toBeNull();
  });

  it("舱位名称归类", () => {
    expect(cabinFromName("Premium Economy")).toBe("premium");
    expect(cabinFromName("公务舱")).toBe("business");
    expect(cabinFromName("Coach")).toBe("economy");
    expect(cabinFromName(undefined)).toBeNull();
  });

  it("地址规范化去掉 +标签和显示名", () => {
    expect(normalizeAddress("Eva <Eva.Green+caf_=f-x=in.example.com@Gmail.com>")).toBe("eva.green@gmail.com");
  });
});

describe("发件人校验", () => {
  const allowed = ["eva@gmail.com"];
  const ar = (s: string) => [`mx.cloudflare.net; ${s}`];

  it("手动转发：信头 From 是本人且 DMARC 通过", () => {
    expect(
      checkSender({
        envelopeFrom: "eva@gmail.com",
        headerFrom: "eva@gmail.com",
        authResults: ar(
          "dkim=pass header.d=gmail.com; spf=pass smtp.mailfrom=eva@gmail.com; dmarc=pass header.from=gmail.com",
        ),
        allowed,
      }),
    ).toEqual({ ok: true, via: "header" });
  });

  it("自动转发：信头是航司，信封是本人（带 +caf_ 标签）且 SPF 通过", () => {
    expect(
      checkSender({
        envelopeFrom: "eva+caf_=f-abc=in.example.com@gmail.com",
        headerFrom: "noreply@united.com",
        authResults: ar(
          "spf=pass smtp.mailfrom=eva+caf_=f-abc=in.example.com@gmail.com; dmarc=pass header.from=united.com",
        ),
        allowed,
      }),
    ).toEqual({ ok: true, via: "envelope" });
  });

  it("伪造：自己域名的 DMARC 通过，但冒用本人的信封地址", () => {
    const v = checkSender({
      envelopeFrom: "eva@gmail.com",
      headerFrom: "attacker@evil.example",
      authResults: ar("spf=pass smtp.mailfrom=bounce@evil.example; dmarc=pass header.from=evil.example"),
      allowed,
    });
    expect(v.ok).toBe(false);
  });

  it("伪造：信头冒用本人但验证不通过", () => {
    const v = checkSender({
      envelopeFrom: "x@evil.example",
      headerFrom: "eva@gmail.com",
      authResults: ar("dkim=none; spf=fail smtp.mailfrom=x@evil.example; dmarc=fail header.from=gmail.com"),
      allowed,
    });
    expect(v).toMatchObject({ ok: false, reason: expect.stringContaining("验证") });
  });

  it("陌生发件人", () => {
    const v = checkSender({
      envelopeFrom: "bob@gmail.com",
      headerFrom: "bob@gmail.com",
      authResults: ar("dmarc=pass header.from=gmail.com"),
      allowed,
    });
    expect(v).toMatchObject({ ok: false, reason: expect.stringContaining("不在") });
  });
});

describe("到达时间换算", () => {
  // SQ12 这类跨日期变更线的航班：东京傍晚起飞，洛杉矶同一天上午到
  const NRT_LAX_KM = 8750;
  const depUtc = "2026-10-20T08:25:00Z"; // 东京 17:25（UTC+9）
  const lax = { tz: "America/Los_Angeles" };
  const seg = (arrDate: string | null, arrTime: string | null = "10:05") => ({
    depDate: "2026-10-20",
    arrDate,
    arrTime,
  });

  it("到达日期缺失、写成次日或前一天，都能选出同一天到达", async () => {
    const { resolveArrivalUtc } = await import("./ingest");
    for (const d of [null, "2026-10-20", "2026-10-21", "2026-10-19"]) {
      // 洛杉矶 10:05（夏令时 UTC−7）→ 17:05Z，飞行 8 小时 40 分
      expect(resolveArrivalUtc(seg(d), depUtc, lax, NRT_LAX_KM)).toBe("2026-10-20T17:05:00Z");
    }
  });

  it("模型给的次日到达合理时采用（如向西飞跨日）", async () => {
    const { resolveArrivalUtc } = await import("./ingest");
    // LAX 23:40 起飞 → 东京次日 05:25 到？不合理（太快），东京第三天 05:25 才合理
    const r = resolveArrivalUtc(
      { depDate: "2026-10-20", arrDate: "2026-10-22", arrTime: "05:25" },
      "2026-10-21T06:40:00Z",
      { tz: "Asia/Tokyo" },
      NRT_LAX_KM,
    );
    expect(r).toBe("2026-10-21T20:25:00Z");
  });

  it("短途航班：次日 0 点这种离谱的到达时间不采用", async () => {
    const { resolveArrivalUtc } = await import("./ingest");
    // PVG 19:05 起飞（UTC+8）→ KIX，约 1,300 km，实际 22:25 左右到
    const dep = "2025-01-06T11:05:00Z";
    const kix = { tz: "Asia/Tokyo" };
    const s = (arrTime: string) => ({ depDate: "2025-01-06", arrDate: "2025-01-06", arrTime });
    expect(resolveArrivalUtc(s("00:00"), dep, kix, 1307)).toBeNull();
    expect(resolveArrivalUtc(s("22:25"), dep, kix, 1307)).toBe("2025-01-06T13:25:00Z");
  });

  it("长途航班的正常时长都还在范围内", async () => {
    const { resolveArrivalUtc } = await import("./ingest");
    // 新加坡 → 纽约约 19 小时 40 分（15,340 km）
    const sinJfk = { depDate: "2026-03-01", arrDate: "2026-03-02", arrTime: "06:00" };
    expect(resolveArrivalUtc(sinJfk, "2026-03-01T15:20:00Z", { tz: "America/New_York" }, 15340)).toBe(
      "2026-03-02T11:00:00Z",
    );
    // 旧金山 → 香港约 15 小时 55 分（11,100 km）
    const sfoHkg = { depDate: "2026-03-01", arrDate: "2026-03-02", arrTime: "18:55" };
    expect(resolveArrivalUtc(sfoHkg, "2026-03-01T19:00:00Z", { tz: "Asia/Hong_Kong" }, 11100)).toBe(
      "2026-03-02T10:55:00Z",
    );
  });

  it("同一封邮件里几段到达时间都是 0 点：当作占位值丢掉", async () => {
    const { dropPlaceholderArrivals } = await import("./ingest");
    const seg = (arrTime: string | null): ExtractedSegment => ({
      airline: "NH",
      flightNumber: "976",
      depAirport: "PVG",
      arrAirport: "KIX",
      depDate: "2025-01-06",
      depTime: "19:05",
      arrDate: "2025-01-06",
      arrTime,
      confirmationCode: null,
      seat: null,
      cabin: null,
      cancelled: false,
    });
    const two = [seg("00:00"), seg("00:00")];
    dropPlaceholderArrivals(two);
    expect(two.map((s) => s.arrTime)).toEqual([null, null]);
    expect(two[0].notes?.[0]).toContain("占位");
    // 只有一段 0 点：可能是真的，交给时长校验
    const one = [seg("00:00"), seg("22:25")];
    dropPlaceholderArrivals(one);
    expect(one.map((s) => s.arrTime)).toEqual(["00:00", "22:25"]);
  });

  it("时间对不上（按距离不可能）时留空", async () => {
    const { resolveArrivalUtc } = await import("./ingest");
    expect(resolveArrivalUtc(seg("2026-10-20", "03:00"), depUtc, lax, NRT_LAX_KM)).toBeNull();
    expect(resolveArrivalUtc(seg(null, null), depUtc, lax, NRT_LAX_KM)).toBeNull();
  });
});
