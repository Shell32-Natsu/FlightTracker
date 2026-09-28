import { describe, expect, it } from "vitest";
import { normalizeTime, toSegments } from "./prompt";
import { estimateTokens, extractWithWorkersAi, WORKERS_AI_MODEL } from "./workersAi";

/** 假的 Workers AI 绑定：记录请求，返回给定结果。 */
function fakeAi(response: unknown | (() => never)) {
  const calls: { model: string; input: Record<string, unknown> }[] = [];
  const ai = {
    run: async (model: string, input: Record<string, unknown>) => {
      calls.push({ model, input });
      if (typeof response === "function") (response as () => never)();
      return { response };
    },
  } as unknown as Ai;
  return { ai, calls };
}

const segment = {
  airline: "mu",
  flight_number: "MU5101",
  departure_airport: "pvg",
  arrival_airport: "PEK",
  departure_date: "2026-11-02",
  departure_time: "8:00",
  arrival_date: null,
  arrival_time: "10:15:00",
  confirmation_code: "abc123",
  seat: "31a",
  cabin: "Economy Class",
  cancelled: "false",
};

describe("Workers AI 识别", () => {
  it("用 JSON Schema 约束输出，并整理模型结果", async () => {
    const { ai, calls } = fakeAi({ kind: "booking", segments: [segment] });
    const segs = await extractWithWorkersAi(ai, "东航行程单", "MU5101 上海浦东-北京首都");
    expect(calls[0].model).toBe(WORKERS_AI_MODEL);
    expect(calls[0].input.response_format).toMatchObject({ type: "json_schema" });
    expect(segs).toEqual([
      {
        airline: "MU",
        flightNumber: "5101",
        depAirport: "PVG",
        arrAirport: "PEK",
        depDate: "2026-11-02",
        depTime: "08:00",
        arrDate: null,
        arrTime: "10:15",
        confirmationCode: "ABC123",
        seat: "31A",
        cabin: "economy",
        cancelled: false,
        notes: [],
      },
    ]);
  });

  it("结果是 JSON 字符串（含代码块标记）也能解析", async () => {
    const { ai } = fakeAi('```json\n{"kind":"booking","segments":[]}\n```');
    expect(await extractWithWorkersAi(ai, "s", "t")).toEqual([]);
  });

  it("不是 JSON / 调用失败 / 正文过长：给出可读的失败原因", async () => {
    await expect(extractWithWorkersAi(fakeAi("抱歉").ai, "s", "t")).rejects.toThrow("合法的 JSON");
    await expect(
      extractWithWorkersAi(
        fakeAi(() => {
          throw new Error("3036: account limited");
        }).ai,
        "s",
        "t",
      ),
    ).rejects.toThrow("Workers AI 出错");
    await expect(extractWithWorkersAi(fakeAi({}).ai, "s", "航".repeat(20_000))).rejects.toThrow("过长");
  });
});

describe("结果整理", () => {
  it("缺关键字段的航段丢弃，其余字段不合法时置空", () => {
    const segs = toSegments({
      segments: [
        { ...segment, departure_date: "11月2日" },
        { ...segment, airline: null },
        { ...segment, departure_time: "早上", cabin: "whatever", cancelled: true },
      ],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ depTime: null, cabin: null, cancelled: true });
    // 认不出的时间写进备注，方便核对
    expect(segs[0].notes).toEqual(["起飞时间“早上”格式认不出，已留空"]);
  });

  it("时间格式", () => {
    expect(normalizeTime("8:05")).toBe("08:05");
    expect(normalizeTime("0805")).toBe("08:05");
    expect(normalizeTime("23:59:00")).toBe("23:59");
    expect(normalizeTime("25:00")).toBeNull();
    // 12 小时制和中文写法
    expect(normalizeTime("5:25 PM")).toBe("17:25");
    expect(normalizeTime("10:05am")).toBe("10:05");
    expect(normalizeTime("12:30 A.M.")).toBe("00:30");
    expect(normalizeTime("12:10 pm")).toBe("12:10");
    expect(normalizeTime("下午 5:25")).toBe("17:25");
    expect(normalizeTime("晚上9点30")).toBe("21:30");
    expect(normalizeTime("10:05 (+1)")).toBe("10:05");
    expect(normalizeTime("8")).toBeNull();
    expect(normalizeTime("13:00 PM")).toBeNull();
  });

  it("token 估算：中文按字、其余按 4 字符", () => {
    expect(estimateTokens("航班")).toBe(2);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
