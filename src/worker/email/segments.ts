import type { Cabin } from "../../shared/types";

/**
 * 从邮件里识别出的一个航段。日期时间都是机场当地的“墙上时间”，
 * 写库前再按机场时区换算成 UTC。
 */
export interface ExtractedSegment {
  airline: string;
  flightNumber: string;
  depAirport: string;
  arrAirport: string;
  /** 起飞当地日期 YYYY-MM-DD */
  depDate: string;
  /** 起飞当地时间 HH:MM */
  depTime: string | null;
  arrDate: string | null;
  arrTime: string | null;
  confirmationCode: string | null;
  seat: string | null;
  cabin: Cabin | null;
  /** 邮件说这一段已取消 */
  cancelled: boolean;
  /** 识别过程中的提示（如时间格式认不出），写进航班备注 */
  notes?: string[];
  /** 航班数据服务查到的补充信息（配置了 AERODATABOX_API_KEY 时） */
  lookup?: {
    aircraftType: string | null;
    registration: string | null;
    schedDepUtc: string | null;
    schedArrUtc: string | null;
  } | null;
}

/** 舱位名称（各种写法）→ 四个舱位之一。 */
export function cabinFromName(name: unknown): Cabin | null {
  if (typeof name !== "string") return null;
  const s = name.toLowerCase();
  if (/first|头等/.test(s)) return "first";
  if (/premium|超级经济|高端经济/.test(s)) return "premium";
  if (/business|公务|商务/.test(s)) return "business";
  if (/economy|coach|经济/.test(s)) return "economy";
  return null;
}

/** "UA110" / "110" / "UA 110" → 航司 + 纯数字航班号（航司由调用方兜底）。 */
export function splitFlightNumber(
  raw: unknown,
  airline: string | null,
): { airline: string | null; number: string } | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).toUpperCase().replace(/\s+/g, "");
  // 航司二字码至少含一个字母（如 MU、3U、B6），纯数字 "110" 不会被拆出航司
  const m = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])?(\d{1,4}[A-Z]?)$/.exec(s);
  if (!m) return null;
  return { airline: m[1] ?? airline, number: m[2] };
}

/**
 * 座位号：排号 + 字母，如 "32A"、"9 K"。邮件里常见的 “CHECK-IN REQUIRED”
 * “Seat selection at check-in” 之类的说明不是座位，返回 null。
 */
export function normalizeSeat(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toUpperCase().replace(/\s+/g, "");
  return /^\d{1,3}[A-L]$/.test(s) ? s : null;
}
