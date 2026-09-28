import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CABINS } from "../../shared/types";
import type { ExtractedSegment } from "./segments";

/**
 * 没有结构化数据的邮件：把正文交给 Claude，用结构化输出（JSON Schema 约束）拿回航段数组。
 */

export const EXTRACTION_MODEL = "claude-opus-5";

/** 正文超过这个长度就不送去识别（不静默截断，直接标记失败让用户知道）。 */
export const MAX_EMAIL_CHARS = 60_000;

const SegmentSchema = z.object({
  airline: z.string().describe("承运航司 IATA 二字码，如 MU、UA、3U；代码共享时填实际销售的航班号所属航司"),
  flight_number: z.string().describe("航班号的数字部分（可带一个字母后缀），不含航司代码，如 5101"),
  departure_airport: z.string().describe("出发机场 IATA 三字码"),
  arrival_airport: z.string().describe("到达机场 IATA 三字码"),
  departure_date: z.string().describe("起飞当地日期 YYYY-MM-DD"),
  departure_time: z.string().nullable().describe("起飞当地时间 HH:MM（24 小时制），邮件没写则为 null"),
  arrival_date: z.string().nullable().describe("到达当地日期 YYYY-MM-DD，没写则为 null"),
  arrival_time: z.string().nullable().describe("到达当地时间 HH:MM，没写则为 null"),
  confirmation_code: z.string().nullable().describe("订座记录编号 / PNR"),
  seat: z.string().nullable().describe("座位号，如 32A"),
  cabin: z.enum(CABINS).nullable().describe("舱位等级"),
  cancelled: z.boolean().describe("这封邮件是否说明该航段已被取消"),
});

const ExtractionSchema = z.object({
  kind: z
    .enum(["booking", "change", "cancellation", "not_flight"])
    .describe("邮件类型：新订、改签、取消，或与航班行程无关"),
  segments: z.array(SegmentSchema),
});

const SYSTEM = `你负责从航空公司或旅行平台的邮件里提取航班行程，供个人航班记录网站导入。
邮件可能是用户转发的，正文前面会有转发说明，以原始邮件内容为准。

规则：
- 只提取这封邮件确认的航段；同一行程的往返、中转每一段各算一条。
- 日期和时间都用各自机场的当地时间，按邮件原文，不要换算时区。
- 机场用 IATA 三字码；邮件只写了城市或机场名时，填你能确定的三字码，不确定就不要输出这一段。
- 航班号拆成航司二字码和数字部分：“MU 5101” → airline "MU", flight_number "5101"。
- 改签邮件只输出改签后的新航段；取消邮件输出被取消的航段并把 cancelled 设为 true。
- 不是航班行程的邮件（广告、值机提醒里没有航段信息等），kind 设为 not_flight，segments 为空。
- 不要编造邮件里没有的信息，拿不准的字段填 null。`;

export class ExtractionError extends Error {}

export async function extractWithClaude(
  apiKey: string,
  subject: string,
  text: string,
): Promise<ExtractedSegment[]> {
  if (text.length > MAX_EMAIL_CHARS) {
    throw new ExtractionError(`邮件正文过长（${text.length} 字，上限 ${MAX_EMAIL_CHARS}），没有送去识别`);
  }
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      // 被安全分类器拒绝时由服务端自动换模型重试
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `邮件主题：${subject}\n\n邮件正文：\n${text}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ExtractionError("ANTHROPIC_API_KEY 无效");
    if (err instanceof Anthropic.RateLimitError) throw new ExtractionError("Claude API 限流，请稍后重新解析");
    if (err instanceof Anthropic.APIError)
      throw new ExtractionError(`Claude API 出错（${err.status}）：${err.message}`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new ExtractionError("模型拒绝处理这封邮件");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("识别结果过长被截断");
  const parsed = response.parsed_output;
  if (!parsed) throw new ExtractionError("模型没有返回合法的 JSON");
  return parsed.segments.map((s) => ({
    airline: s.airline.trim().toUpperCase(),
    flightNumber: s.flight_number.trim().toUpperCase(),
    depAirport: s.departure_airport.trim().toUpperCase(),
    arrAirport: s.arrival_airport.trim().toUpperCase(),
    depDate: s.departure_date.trim(),
    depTime: s.departure_time?.trim() || null,
    arrDate: s.arrival_date?.trim() || null,
    arrTime: s.arrival_time?.trim() || null,
    confirmationCode: s.confirmation_code?.trim() || null,
    seat: s.seat?.trim().toUpperCase() || null,
    cabin: s.cabin,
    cancelled: s.cancelled,
  }));
}
