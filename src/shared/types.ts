export const FLIGHT_STATUSES = ["confirmed", "pending"] as const;
export const FLIGHT_SOURCES = ["manual", "lookup", "email", "csv"] as const;
export const CABINS = ["economy", "premium", "business", "first"] as const;
export const PURPOSES = ["leisure", "business", "other"] as const;

export type FlightStatus = (typeof FLIGHT_STATUSES)[number];
export type FlightSource = (typeof FLIGHT_SOURCES)[number];
export type Cabin = (typeof CABINS)[number];
export type Purpose = (typeof PURPOSES)[number];

/** API 返回的航班记录，字段与 D1 flights 表一一对应（驼峰命名）。 */
export interface Flight {
  id: string;
  status: FlightStatus;
  source: FlightSource;
  /** 起飞当地日期 YYYY-MM-DD */
  flightDate: string;
  airline: string;
  flightNumber: string;
  operatingAirline: string | null;
  depAirport: string;
  arrAirport: string;
  /** ISO 8601 UTC */
  schedDepUtc: string | null;
  schedArrUtc: string | null;
  actualDepUtc: string | null;
  actualArrUtc: string | null;
  aircraftType: string | null;
  registration: string | null;
  seat: string | null;
  cabin: Cabin | null;
  purpose: Purpose | null;
  confirmationCode: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  trackKey: string | null;
  emailId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 新增/修改航班时提交的字段；距离和时长由服务端计算。 */
export type FlightInput = Omit<
  Flight,
  "id" | "status" | "distanceKm" | "durationMin" | "trackKey" | "emailId" | "createdAt" | "updatedAt"
> & { status?: FlightStatus };

export interface Airport {
  name: string;
  city?: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  icao?: string;
  lat: number;
  lon: number;
  /** IANA 时区 */
  tz: string;
}

export interface Country {
  name: string;
  nameZh: string;
  /** ISO 3166 数字码，对应国界 TopoJSON 的 id */
  numeric?: string;
  continent: string;
}

export interface Airline {
  name: string;
  icao?: string;
  country?: string;
}

export const EMAIL_STATUSES = ["pending", "parsed", "failed", "ignored"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** 邮件导入记录（不含正文）。 */
export interface EmailRecord {
  id: string;
  receivedAt: string;
  fromAddr: string | null;
  subject: string | null;
  parseStatus: EmailStatus;
  parseMethod: "jsonld" | "llm" | null;
  error: string | null;
  /** 新增或更新的航段数 */
  flightCount: number;
  /** 其中还没确认的段数 */
  pendingCount: number;
}

/** 当前用户的邮件导入配置。 */
export interface InboxInfo {
  /** 专属收件地址；服务端没配置收件域名时为 null */
  address: string | null;
  loginEmail: string;
  /** 允许的发件地址（登录邮箱 + 额外添加的） */
  senders: string[];
  /** 服务端是否配置了 Claude，能识别没有结构化数据的邮件 */
  llm: boolean;
}

/** 航班数据服务按航班号 + 日期查到的一段航班；时间都是 UTC ISO。 */
export interface LookupCandidate {
  airline: string;
  flightNumber: string;
  /** 代码共享时的实际承运航司 */
  operatingAirline: string | null;
  depAirport: string | null;
  arrAirport: string | null;
  schedDepUtc: string | null;
  schedArrUtc: string | null;
  /** 已经飞过的航班才有：实际（或最新预计）上下客时间 */
  actualDepUtc: string | null;
  actualArrUtc: string | null;
  /** 机型名称，如 "Boeing 777-300ER" */
  aircraftModel: string | null;
  /** 对应的 ICAO 机型代码，如 B77W；认不出为 null */
  aircraftType: string | null;
  registration: string | null;
  status: string | null;
}

export interface LookupResult {
  candidates: LookupCandidate[];
  /** 是否来自缓存 */
  cached: boolean;
}
