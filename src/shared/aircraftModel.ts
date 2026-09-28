/**
 * 机型名称（如 AeroDataBox 返回的 "Boeing 787-9 Dreamliner"、"Airbus A321-200"）→ ICAO 机型代码。
 * names 是机型表（ICAO 代码 → 名称，见 public/refdata/aircraft.json）。
 */

const MAKERS =
  /^(boeing|airbus|embraer|bombardier|canadair|aerospatialealenia|aerospatiale|alenia|dehavillandcanada|dehavilland|comac|mcdonnelldouglas|sukhoi|mitsubishi)/;

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
const bare = (s: string) => norm(s).replace(MAKERS, "");

/** 名称写法差别太大、前缀匹配不上的几种 */
const ALIASES: [RegExp, string][] = [
  [/q400|dash ?8.?400|dhc.?8.?4\d\d/i, "DH8D"],
  [/crj.?1000/i, "CRJX"],
  [/crj.?900/i, "CRJ9"],
  [/crj.?700/i, "CRJ7"],
  [/crj.?200/i, "CRJ2"],
  [/a220.?100|cs100/i, "BCS1"],
  [/a220.?300|cs300/i, "BCS3"],
  [/c909|arj.?21/i, "AJ27"],
];

export function aircraftTypeFromModel(model: string | null | undefined, names: Record<string, string>): string | null {
  if (!model?.trim()) return null;
  for (const [re, code] of ALIASES) if (re.test(model) && names[code]) return code;
  // 本身就是 ICAO 代码
  const upper = model.trim().toUpperCase();
  if (names[upper]) return upper;

  const target = bare(model);
  if (!target) return null;
  let best: { code: string; len: number } | null = null;
  for (const [code, name] of Object.entries(names)) {
    const n = bare(name);
    if (!n) continue;
    if (n === target) return code;
    // "a321200" 以 "a321" 开头 → A321；取最长的前缀，避免 "b777300er" 被 "b777" 抢走
    if (target.startsWith(n) && (!best || n.length > best.len)) best = { code, len: n.length };
  }
  if (best && best.len >= 3) return best.code;
  // 反过来："embraer 175" 对 "Embraer 175 (long wing)"
  for (const [code, name] of Object.entries(names)) if (bare(name).startsWith(target) && target.length >= 3) return code;
  return null;
}
