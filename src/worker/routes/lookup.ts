import { Hono } from "hono";
import { splitFlightNumber } from "../email/segments";
import { LookupError } from "../lookup/aerodatabox";
import { lookupFlight } from "../lookup/service";
import type { AppEnv } from "../env";

/** GET /lookup?flight=UA857&date=2024-05-01：按航班号和起飞当地日期查时刻、机型、机尾号。 */
export const lookupRoutes = new Hono<AppEnv>().get("/lookup", async (c) => {
  const parsed = splitFlightNumber(c.req.query("flight") ?? "", null);
  const date = c.req.query("date") ?? "";
  if (!parsed?.airline || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "需要航班号和日期，如 ?flight=UA857&date=2024-05-01" }, 400);
  }
  try {
    const result = await lookupFlight(c.env, parsed.airline, parsed.number, date);
    if (!result) return c.json({ error: "服务端没有配置航班数据服务（AERODATABOX_API_KEY）" }, 503);
    return c.json(result);
  } catch (err) {
    if (err instanceof LookupError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
