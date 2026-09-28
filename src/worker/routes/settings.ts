import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { settings } from "../db/schema";
import { settingsFromRows, settingsPatchSchema } from "../settings";
import type { AppEnv } from "../env";

export const settingsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await drizzle(c.env.DB)
      .select()
      .from(settings)
      .where(eq(settings.userId, c.get("user").id));
    return c.json(settingsFromRows(rows));
  })

  /** 部分更新：只写请求里带的键，返回合并后的完整设置。 */
  .put("/", async (c) => {
    const parsed = settingsPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "校验失败", issues: parsed.error.issues }, 400);
    const now = new Date().toISOString();
    const userId = c.get("user").id;
    const values = Object.entries(parsed.data).map(([key, value]) => ({
      userId,
      key,
      value: JSON.stringify(value),
      updatedAt: now,
    }));
    const db = drizzle(c.env.DB);
    if (values.length) {
      await db
        .insert(settings)
        .values(values)
        .onConflictDoUpdate({
          target: [settings.userId, settings.key],
          set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
        });
    }
    return c.json(settingsFromRows(await db.select().from(settings).where(eq(settings.userId, userId))));
  });
