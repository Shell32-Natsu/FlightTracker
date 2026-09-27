import { z } from "zod";
import { DEFAULT_SETTINGS, SETTING_KEYS, type Settings } from "../shared/settings";
import { findAirport } from "./airports";

/** 每项设置的校验规则；PUT 时只允许这里列出的键。 */
export const settingsPatchSchema = z
  .object({
    distanceUnit: z.enum(["km", "mi"]),
    homeAirport: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, "机场需为 IATA 三字码"))
      .refine((v) => findAirport(v) !== undefined, "机场表里没有这个三字码")
      .nullable(),
  } satisfies { [K in keyof Settings]: z.ZodType<Settings[K], unknown> })
  .partial()
  .strict();

/** 把数据库里的行合并成完整设置：未知键忽略，损坏或不合法的值回落到默认值。 */
export function settingsFromRows(rows: { key: string; value: string }[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  const shape = settingsPatchSchema.shape;
  for (const { key, value } of rows) {
    if (!(SETTING_KEYS as string[]).includes(key)) continue;
    const k = key as keyof Settings;
    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch {
      continue;
    }
    const parsed = shape[k].safeParse(raw);
    if (parsed.success && parsed.data !== undefined) Object.assign(out, { [k]: parsed.data });
  }
  return out;
}
