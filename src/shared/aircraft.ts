/**
 * 机型系列：侧视图的外形参数和维基百科条目。
 * 尺寸用真实数值（米），画图时按比例缩放，所以各机型的胖瘦、长短都是对的。
 */

export type NoseShape = "airbus" | "boeing" | "b787" | "a350" | "regional";
export type Winglet = "none" | "fence" | "blended" | "sharklet" | "split";

export interface ProfileSpec {
  /** 机身长度 */
  length: number;
  /** 机身直径 */
  diameter: number;
  nose: NoseShape;
  /** 发动机：翼吊 / 尾吊 / 螺旋桨；count 是总数（侧视只画近侧） */
  engine: { mount: "wing" | "rear" | "prop"; count: 2 | 3 | 4; length: number; diameter: number };
  /** T 形尾翼（平尾在垂尾顶端） */
  tTail: boolean;
  /** 垂尾高出机身顶部的高度 */
  finHeight: number;
  /** 机翼前缘根部在机身上的位置（占机身长度的比例） */
  wingAt: number;
  winglet: Winglet;
  /** 747 的二层驼峰到机身的哪个位置结束（比例） */
  hump?: number;
  /** A380 通体双层 */
  doubleDeck?: boolean;
}

export interface AircraftFamily {
  id: string;
  name: string;
  maker: string;
  /** 维基百科条目：先中文，没有再英文 */
  wiki: { zh: string; en: string };
  profile: Omit<ProfileSpec, "length">;
}

const narrow = (d: number, engineLen: number, engineDia: number, winglet: Winglet, nose: NoseShape) => ({
  diameter: d,
  nose,
  engine: { mount: "wing" as const, count: 2 as const, length: engineLen, diameter: engineDia },
  tTail: false,
  finHeight: d * 1.55,
  wingAt: 0.36,
  winglet,
});

const wide = (d: number, engineLen: number, engineDia: number, winglet: Winglet, nose: NoseShape, count: 2 | 4 = 2) => ({
  diameter: d,
  nose,
  engine: { mount: "wing" as const, count, length: engineLen, diameter: engineDia },
  tTail: false,
  finHeight: d * 1.5,
  wingAt: 0.37,
  winglet,
});

const rearJet = (d: number, engineLen: number, engineDia: number) => ({
  diameter: d,
  nose: "regional" as const,
  engine: { mount: "rear" as const, count: 2 as const, length: engineLen, diameter: engineDia },
  tTail: true,
  finHeight: d * 1.55,
  wingAt: 0.45,
  winglet: "blended" as const,
});

const turboprop = (d: number) => ({
  diameter: d,
  nose: "regional" as const,
  engine: { mount: "prop" as const, count: 2 as const, length: d * 1.6, diameter: d * 0.42 },
  tTail: true,
  finHeight: d * 1.9,
  wingAt: 0.4,
  winglet: "none" as const,
});

export const FAMILIES: Record<string, AircraftFamily> = {
  a220: {
    id: "a220",
    name: "A220",
    maker: "Airbus",
    wiki: { zh: "空中客车A220", en: "Airbus_A220" },
    profile: narrow(3.7, 3.9, 2.2, "none", "a350"),
  },
  a320: {
    id: "a320",
    name: "A320 系列",
    maker: "Airbus",
    wiki: { zh: "空中客车A320系列", en: "Airbus_A320_family" },
    profile: narrow(3.95, 4.4, 2.1, "sharklet", "airbus"),
  },
  a320neo: {
    id: "a320neo",
    name: "A320neo 系列",
    maker: "Airbus",
    wiki: { zh: "空中客车A320neo系列", en: "Airbus_A320neo_family" },
    profile: narrow(3.95, 4.9, 2.5, "sharklet", "airbus"),
  },
  a300: {
    id: "a300",
    name: "A300 / A310",
    maker: "Airbus",
    wiki: { zh: "空中客车A300", en: "Airbus_A300" },
    profile: wide(5.64, 6.2, 2.7, "fence", "airbus"),
  },
  a330: {
    id: "a330",
    name: "A330",
    maker: "Airbus",
    wiki: { zh: "空中客车A330", en: "Airbus_A330" },
    profile: wide(5.64, 7, 3.1, "blended", "airbus"),
  },
  a330neo: {
    id: "a330neo",
    name: "A330neo",
    maker: "Airbus",
    wiki: { zh: "空中客车A330neo", en: "Airbus_A330neo" },
    profile: wide(5.64, 7.2, 3.6, "sharklet", "airbus"),
  },
  a340: {
    id: "a340",
    name: "A340",
    maker: "Airbus",
    wiki: { zh: "空中客车A340", en: "Airbus_A340" },
    profile: wide(5.64, 5.6, 2.4, "blended", "airbus", 4),
  },
  a350: {
    id: "a350",
    name: "A350",
    maker: "Airbus",
    wiki: { zh: "空中客车A350", en: "Airbus_A350" },
    profile: wide(5.96, 7.5, 3.8, "sharklet", "a350"),
  },
  a380: {
    id: "a380",
    name: "A380",
    maker: "Airbus",
    wiki: { zh: "空中客车A380", en: "Airbus_A380" },
    profile: { ...wide(7.14, 7, 3.4, "fence", "airbus", 4), finHeight: 10.6, doubleDeck: true },
  },
  b717: {
    id: "b717",
    name: "717",
    maker: "Boeing",
    wiki: { zh: "波音717", en: "Boeing_717" },
    profile: { ...rearJet(3.34, 4.9, 1.9), winglet: "none" },
  },
  b737: {
    id: "b737",
    name: "737 Classic / NG",
    maker: "Boeing",
    wiki: { zh: "波音737新世代", en: "Boeing_737_Next_Generation" },
    profile: narrow(3.76, 4.3, 2.1, "blended", "boeing"),
  },
  b737max: {
    id: "b737max",
    name: "737 MAX",
    maker: "Boeing",
    wiki: { zh: "波音737 MAX", en: "Boeing_737_MAX" },
    profile: narrow(3.76, 4.9, 2.3, "split", "boeing"),
  },
  b747: {
    id: "b747",
    name: "747",
    maker: "Boeing",
    wiki: { zh: "波音747", en: "Boeing_747" },
    profile: { ...wide(6.5, 6.4, 2.9, "blended", "boeing", 4), finHeight: 12, hump: 0.3 },
  },
  b748: {
    id: "b748",
    name: "747-8",
    maker: "Boeing",
    wiki: { zh: "波音747-8", en: "Boeing_747-8" },
    profile: { ...wide(6.5, 6.8, 3.3, "none", "boeing", 4), finHeight: 12.3, hump: 0.34 },
  },
  b757: {
    id: "b757",
    name: "757",
    maker: "Boeing",
    wiki: { zh: "波音757", en: "Boeing_757" },
    profile: { ...narrow(3.76, 5.4, 2.4, "blended", "boeing"), finHeight: 7.4 },
  },
  b767: {
    id: "b767",
    name: "767",
    maker: "Boeing",
    wiki: { zh: "波音767", en: "Boeing_767" },
    profile: wide(5.03, 6.1, 2.9, "blended", "boeing"),
  },
  b777: {
    id: "b777",
    name: "777",
    maker: "Boeing",
    wiki: { zh: "波音777", en: "Boeing_777" },
    profile: wide(6.2, 7.3, 3.9, "none", "boeing"),
  },
  b777x: {
    id: "b777x",
    name: "777X",
    maker: "Boeing",
    wiki: { zh: "波音777X", en: "Boeing_777X" },
    profile: wide(6.2, 7.6, 4.3, "none", "b787"),
  },
  b787: {
    id: "b787",
    name: "787",
    maker: "Boeing",
    wiki: { zh: "波音787", en: "Boeing_787_Dreamliner" },
    profile: wide(5.77, 7.1, 3.4, "none", "b787"),
  },
  ejet: {
    id: "ejet",
    name: "E-Jet",
    maker: "Embraer",
    wiki: { zh: "巴西航空工业E系列", en: "Embraer_E-Jet_family" },
    profile: { ...narrow(3.01, 3.5, 1.7, "blended", "regional"), finHeight: 5.2, wingAt: 0.38 },
  },
  ejet2: {
    id: "ejet2",
    name: "E-Jet E2",
    maker: "Embraer",
    wiki: { zh: "巴西航空工业E2系列", en: "Embraer_E-Jet_E2_family" },
    profile: { ...narrow(3.01, 4, 2.1, "none", "regional"), finHeight: 5.4, wingAt: 0.38 },
  },
  erj: {
    id: "erj",
    name: "ERJ",
    maker: "Embraer",
    wiki: { zh: "巴西航空工业ERJ系列", en: "Embraer_ERJ_family" },
    profile: { ...rearJet(2.28, 3.4, 1.4), winglet: "blended" },
  },
  crj: {
    id: "crj",
    name: "CRJ",
    maker: "Bombardier",
    wiki: { zh: "庞巴迪CRJ700系列", en: "Bombardier_CRJ700_series" },
    profile: rearJet(2.69, 3.6, 1.5),
  },
  atr: {
    id: "atr",
    name: "ATR 42 / 72",
    maker: "ATR",
    wiki: { zh: "ATR 72", en: "ATR_72" },
    profile: turboprop(2.57),
  },
  dash8: {
    id: "dash8",
    name: "Dash 8",
    maker: "De Havilland Canada",
    wiki: { zh: "DHC-8冲8型", en: "De_Havilland_Canada_Dash_8" },
    profile: turboprop(2.69),
  },
  c919: {
    id: "c919",
    name: "C919",
    maker: "COMAC",
    wiki: { zh: "中国商飞C919", en: "Comac_C919" },
    profile: narrow(3.96, 4.9, 2.4, "sharklet", "airbus"),
  },
  arj21: {
    id: "arj21",
    name: "ARJ21 / C909",
    maker: "COMAC",
    wiki: { zh: "中国商飞ARJ21", en: "Comac_ARJ21" },
    profile: rearJet(3.3, 4.2, 1.8),
  },
  md80: {
    id: "md80",
    name: "MD-80 / MD-90",
    maker: "McDonnell Douglas",
    wiki: { zh: "麦克唐纳-道格拉斯MD-80", en: "McDonnell_Douglas_MD-80" },
    profile: { ...rearJet(3.34, 5.2, 1.9), winglet: "none" },
  },
  md11: {
    id: "md11",
    name: "MD-11",
    maker: "McDonnell Douglas",
    wiki: { zh: "麦克唐纳-道格拉斯MD-11", en: "McDonnell_Douglas_MD-11" },
    profile: { ...wide(6.02, 6.8, 3.1, "fence", "boeing"), engine: { mount: "wing", count: 3, length: 6.8, diameter: 3.1 } },
  },
  ssj: {
    id: "ssj",
    name: "Superjet 100",
    maker: "Sukhoi",
    wiki: { zh: "苏霍伊超级喷气100", en: "Sukhoi_Superjet_100" },
    profile: narrow(3.46, 3.8, 1.9, "sharklet", "airbus"),
  },
};

/** ICAO 机型代码 → [系列, 机身长度]。 */
// prettier-ignore
const TYPES: Record<string, [string, number]> = {
  BCS1: ["a220", 35], BCS3: ["a220", 38.7],
  A318: ["a320", 31.4], A319: ["a320", 33.8], A320: ["a320", 37.6], A321: ["a320", 44.5],
  A19N: ["a320neo", 33.8], A20N: ["a320neo", 37.6], A21N: ["a320neo", 44.5],
  A30B: ["a300", 53.6], A306: ["a300", 54.1], A310: ["a300", 46.7],
  A332: ["a330", 58.8], A333: ["a330", 63.7], A338: ["a330neo", 58.8], A339: ["a330neo", 63.7],
  A342: ["a340", 59.4], A343: ["a340", 63.7], A345: ["a340", 67.9], A346: ["a340", 75.4],
  A359: ["a350", 66.8], A35K: ["a350", 73.8],
  A388: ["a380", 72.7],
  B712: ["b717", 37.8],
  B732: ["b737", 30.5], B733: ["b737", 33.4], B734: ["b737", 36.4], B735: ["b737", 31],
  B736: ["b737", 31.2], B737: ["b737", 33.6], B738: ["b737", 39.5], B739: ["b737", 42.1],
  B37M: ["b737max", 35.6], B38M: ["b737max", 39.5], B39M: ["b737max", 42.2], B3XM: ["b737max", 43.8],
  B741: ["b747", 70.6], B742: ["b747", 70.6], B743: ["b747", 70.6], B744: ["b747", 70.7], B74D: ["b747", 70.7],
  B748: ["b748", 76.3],
  B752: ["b757", 47.3], B753: ["b757", 54.4],
  B762: ["b767", 48.5], B763: ["b767", 54.9], B764: ["b767", 61.4],
  B772: ["b777", 63.7], B77L: ["b777", 63.7], B773: ["b777", 73.9], B77W: ["b777", 73.9],
  B778: ["b777x", 70.9], B779: ["b777x", 76.7],
  B788: ["b787", 56.7], B789: ["b787", 62.8], B78X: ["b787", 68.3],
  E170: ["ejet", 29.9], E75L: ["ejet", 31.7], E75S: ["ejet", 31.7], E190: ["ejet", 36.2], E195: ["ejet", 38.7],
  E290: ["ejet2", 36.3], E295: ["ejet2", 41.5],
  E135: ["erj", 26.3], E145: ["erj", 29.9],
  CRJ1: ["crj", 26.8], CRJ2: ["crj", 26.8], CRJ7: ["crj", 32.3], CRJ9: ["crj", 36.2], CRJX: ["crj", 39.1],
  AT43: ["atr", 22.7], AT45: ["atr", 22.7], AT46: ["atr", 22.7], AT72: ["atr", 27.2], AT75: ["atr", 27.2], AT76: ["atr", 27.2],
  DH8A: ["dash8", 22.3], DH8B: ["dash8", 22.3], DH8C: ["dash8", 25.7], DH8D: ["dash8", 32.8],
  C919: ["c919", 38.9], AJ27: ["arj21", 33.5],
  MD81: ["md80", 45.1], MD82: ["md80", 45.1], MD83: ["md80", 45.1], MD87: ["md80", 39.8], MD88: ["md80", 45.1], MD90: ["md80", 46.5],
  MD11: ["md11", 61.2],
  SU95: ["ssj", 29.9],
};

export function aircraftFamily(type: string): AircraftFamily | null {
  const t = TYPES[type.toUpperCase()];
  return t ? FAMILIES[t[0]] : null;
}

/** 侧视图参数；不认识的机型按名字猜一个大致的外形。 */
export function profileFor(type: string, name = ""): ProfileSpec {
  const t = TYPES[type.toUpperCase()];
  if (t) return { ...FAMILIES[t[0]].profile, length: t[1] };
  const n = `${type} ${name}`.toLowerCase();
  if (/atr|dash|dhc|saab|q400|turboprop|fokker 50/.test(n)) return { ...turboprop(2.6), length: 26 };
  if (/crj|erj|regional|e1[34]5/.test(n)) return { ...rearJet(2.7, 3.6, 1.5), length: 30 };
  if (/wide|a3[3-5]|b7[678]|777|787|767/.test(n)) return { ...FAMILIES.a330.profile, length: 62 };
  return { ...FAMILIES.a320.profile, length: 37.6 };
}

/** 同系列的其他机型代码。 */
export function familyTypes(familyId: string): string[] {
  return Object.entries(TYPES)
    .filter(([, [f]]) => f === familyId)
    .map(([code]) => code);
}
