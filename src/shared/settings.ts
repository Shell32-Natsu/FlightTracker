/**
 * 用户设置：存在 D1 的 settings 表里（每项一行，值为 JSON），
 * 这样换设备、清浏览器数据都不会丢。
 */
export interface Settings {
  /** 距离单位 */
  distanceUnit: "km" | "mi";
  /** 地图起始位置和“大本营”标记；null 表示按起降次数自动选择 */
  homeAirport: string | null;
  /** 除登录邮箱外，允许转发确认邮件的其他发件地址（小写） */
  importSenders: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  distanceUnit: "km",
  homeAirport: null,
  importSenders: [],
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
