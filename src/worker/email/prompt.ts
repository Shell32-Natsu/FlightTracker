import { z } from "zod";
import { CABINS } from "../../shared/types";
import { cabinFromName, type ExtractedSegment } from "./segments";

/**
 * 用 LLM 从邮件正文提取航段：提示词、输出结构和结果整理，Workers AI 和 Claude 共用。
 */

export class ExtractionError extends Error {}

export const SYSTEM_PROMPT = `你负责从航空公司或旅行平台的邮件里提取航班行程，供个人航班记录网站导入。
邮件可能是用户转发的，正文前面会有转发说明，以原始邮件内容为准。

规则：
- 只提取这封邮件确认的航段；同一行程的往返、中转每一段各算一条。
- 日期和时间都用各自机场的当地时间，按邮件原文，不要换算时区。日期写成 YYYY-MM-DD，时间写成 24 小时制 HH:MM。
- 机场用 IATA 三字码；邮件只写了城市或机场名时，填你能确定的三字码，不确定就不要输出这一段。
- 航班号拆成航司二字码和数字部分：“MU 5101” → airline "MU", flight_number "5101"。
- 舱位 cabin 只能是 economy、premium、business、first 之一，不确定填 null。
- 改签邮件只输出改签后的新航段；取消邮件输出被取消的航段并把 cancelled 设为 true。
- 不是航班行程的邮件（广告、值机提醒里没有航段信息等），kind 设为 not_flight，segments 为空数组。
- 不要编造邮件里没有的信息，拿不准的字段填 null。
- 只输出 JSON。`;

export const userMessage = (subject: string, text: string) => `邮件主题：${subject}\n\n邮件正文：\n${text}`;

/** 严格结构：给支持结构化输出的模型（Claude）。 */
export const ExtractionSchema = z.object({
  kind: z
    .enum(["booking", "change", "cancellation", "not_flight"])
    .describe("邮件类型：新订、改签、取消，或与航班行程无关"),
  segments: z.array(
    z.object({
      airline: z.string().describe("承运航司 IATA 二字码，如 MU、UA、3U"),
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
    }),
  ),
});

/** JSON Schema 版本，给按 JSON Schema 约束输出的模型（Workers AI）。 */
export const EXTRACTION_JSON_SCHEMA = z.toJSONSchema(ExtractionSchema);

/** 宽松结构：开源模型不一定严格遵守 schema，缺字段、多字段、数字当字符串都接受，再统一整理。 */
const text = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? null : String(v).trim() || null));

const LenientSchema = z.object({
  kind: z.string().nullish(),
  segments: z
    .array(
      z.looseObject({
        airline: text,
        flight_number: text,
        departure_airport: text,
        arrival_airport: text,
        departure_date: text,
        departure_time: text,
        arrival_date: text,
        arrival_time: text,
        confirmation_code: text,
        seat: text,
        cabin: text,
        cancelled: z.union([z.boolean(), z.string()]).nullish(),
      }),
    )
    .nullish(),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "8:05" / "08:05:00" / "0805" → "08:05"；认不出返回 null。 */
export function normalizeTime(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{1,2}):?(\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * 模型输出 → 航段。缺关键字段（航司、航班号、机场、日期）的段丢弃；
 * 其余字段不合法时置空，由后续校验兜底。
 */
export function toSegments(output: unknown): ExtractedSegment[] {
  const parsed = LenientSchema.safeParse(output);
  if (!parsed.success) throw new ExtractionError("模型返回的 JSON 结构不对");
  const segments: ExtractedSegment[] = [];
  for (const s of parsed.data.segments ?? []) {
    const airline = s.airline?.toUpperCase().replace(/\s+/g, "");
    const number = s.flight_number?.toUpperCase().replace(/\s+/g, "");
    const dep = s.departure_airport?.toUpperCase();
    const arr = s.arrival_airport?.toUpperCase();
    const depDate = s.departure_date;
    if (!airline || !number || !dep || !arr || !depDate || !DATE.test(depDate)) continue;
    const cabin = CABINS.includes(s.cabin as never)
      ? (s.cabin as ExtractedSegment["cabin"])
      : cabinFromName(s.cabin);
    segments.push({
      airline,
      // 模型偶尔把航司代码也写进航班号：UA110 → 110
      flightNumber:
        number.startsWith(airline) && number.length > airline.length ? number.slice(airline.length) : number,
      depAirport: dep,
      arrAirport: arr,
      depDate,
      depTime: normalizeTime(s.departure_time),
      arrDate: s.arrival_date && DATE.test(s.arrival_date) ? s.arrival_date : null,
      arrTime: normalizeTime(s.arrival_time),
      confirmationCode: s.confirmation_code?.toUpperCase() ?? null,
      seat: s.seat?.toUpperCase() ?? null,
      cabin,
      cancelled: s.cancelled === true || s.cancelled === "true",
    });
  }
  return segments;
}
