import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { flights } from "../db/schema";
import { findAirport } from "../airports";
import { flightsToCsv } from "../../shared/flightCsv";
import type { Flight } from "../../shared/types";
import { flightColumns, flightInputSchema, withDerived } from "./flights";
import type { AppEnv } from "../env";

/** 一次导入的上限，防止误传超大文件。 */
const MAX_IMPORT = 2000;
/** D1 单次 batch 的语句数，分批写入。 */
const CHUNK = 50;

export const importExportRoutes = new Hono<AppEnv>()
  /**
   * 批量导入：CSV 在浏览器里解析并预览，确认后把航班数组发到这里。
   * 每条都重新校验；和已有航班重复（航司 + 航班号 + 日期 + 出发机场）的跳过，不覆盖。
   */
  .post("/import", async (c) => {
    const body = z
      .object({ flights: z.array(z.unknown()).min(1).max(MAX_IMPORT) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: `需要 1–${MAX_IMPORT} 条航班` }, 400);

    const userId = c.get("user").id;
    const invalid: { index: number; message: string }[] = [];
    const now = new Date().toISOString();
    const rows = body.data.flights.flatMap((raw, index) => {
      const parsed = flightInputSchema.safeParse({ ...(raw as object), source: "csv" });
      if (!parsed.success) {
        invalid.push({ index, message: parsed.error.issues.map((i) => i.message).join("；") });
        return [];
      }
      const { status, ...values } = withDerived(parsed.data);
      return [
        {
          ...values,
          id: crypto.randomUUID(),
          userId,
          status: status ?? "confirmed",
          createdAt: now,
          updatedAt: now,
        },
      ];
    });

    const db = drizzle(c.env.DB);
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const stmts = chunk.map((r) =>
        db.insert(flights).values(r).onConflictDoNothing().returning({ id: flights.id }),
      );
      const results = await db.batch(stmts as [(typeof stmts)[0], ...typeof stmts]);
      inserted += results.reduce((n, r) => n + r.length, 0);
    }
    return c.json({ inserted, duplicates: rows.length - inserted, invalid });
  })

  /** 导出全部已确认航班（本应用格式，时间为机场当地时间）。 */
  .get("/export/csv", async (c) => {
    const rows = await drizzle(c.env.DB)
      .select(flightColumns)
      .from(flights)
      .where(and(eq(flights.userId, c.get("user").id), eq(flights.status, "confirmed")));
    const csv = flightsToCsv(
      rows as Flight[],
      new Proxy({}, { get: (_, code: string) => findAirport(code) }),
    );
    const date = new Date().toISOString().slice(0, 10);
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flighttracker-${date}.csv"`,
    });
  });
