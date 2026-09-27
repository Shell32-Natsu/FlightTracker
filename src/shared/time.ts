/**
 * 时区换算。约定：数据库里一律存 UTC（ISO 8601，精确到分钟），
 * 表单输入和页面显示使用起降机场各自的当地时间（IANA 时区）。
 *
 * 只用 Intl，不依赖第三方库，前端和 Worker 共用。
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsAt(utcMs: number, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as unknown as Parts;
}

/** 某一 UTC 时刻在 tz 下相对 UTC 的偏移（分钟，东正西负）。 */
export function tzOffsetMinutes(utcMs: number, tz: string): number {
  const p = partsAt(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * 当地日期 + 时间 → UTC ISO 字符串。
 * 夏令时开始时不存在的时刻（如 02:30）按切换前的偏移换算，结果会落在切换后；
 * 夏令时结束时重复的时刻取较早的那一个。
 */
export function localToUtc(date: string, time: string, tz: string): string {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) throw new Error(`无效的日期或时间：${date} ${time}`);
  const localMs = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  // 在目标时刻前后各取一次偏移：两者不同说明附近有夏令时切换
  const before = tzOffsetMinutes(localMs - 36 * 3600_000, tz);
  const after = tzOffsetMinutes(localMs + 36 * 3600_000, tz);
  let utcMs = localMs - before * 60000;
  if (before !== after) {
    const candidate = localMs - after * 60000;
    // 优先取较早且能正确往返的解
    const ok = (ms: number) => tzOffsetMinutes(ms, tz) === (localMs - ms) / 60000;
    const options = [utcMs, candidate].filter(ok).sort((a, b) => a - b);
    utcMs = options[0] ?? utcMs;
  }
  return toIsoMinute(utcMs);
}

/** UTC ISO 字符串 → 当地日期和时间。 */
export function utcToLocal(utcIso: string, tz: string): { date: string; time: string } {
  const p = partsAt(Date.parse(utcIso), tz);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** 两个 YYYY-MM-DD 相差的天数（b − a），用于显示“+1”。 */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

/** 两个 UTC 时刻之间的分钟数。 */
export function minutesBetween(fromUtc: string, toUtc: string): number {
  return Math.round((Date.parse(toUtc) - Date.parse(fromUtc)) / 60000);
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${pad(m)}m` : ""}` : `${m}m`;
}

function toIsoMinute(ms: number): string {
  return new Date(ms).toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00Z");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
