import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { flights } from "../db/schema";
import { findAirport } from "../airports";
import { flightDistanceKm, flightDurationMin } from "../../shared/derive";
import { CABINS, FLIGHT_SOURCES, FLIGHT_STATUSES, PURPOSES } from "../../shared/types";
import type { AppEnv } from "../env";

const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const upper = (re: RegExp, msg: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(re, msg));

const airport = upper(/^[A-Z]{3}$/, "机场需为 IATA 三字码").refine(
  (v) => findAirport(v) !== undefined,
  "机场表里没有这个三字码",
);

const utc = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "时间需为 ISO 8601")
  .transform((v) => (v === null ? null : new Date(v).toISOString().replace(/\.\d{3}Z$/, "Z")));

export const flightInputSchema = z
  .object({
    status: z.enum(FLIGHT_STATUSES).optional(),
    source: z.enum(FLIGHT_SOURCES).default("manual"),
    flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式为 YYYY-MM-DD"),
    airline: upper(/^[A-Z0-9]{2}$/, "航司需为 IATA 二字码"),
    flightNumber: upper(/^\d{1,4}[A-Z]?$/, "航班号为 1–4 位数字"),
    operatingAirline: optionalText.transform((v) => v?.toUpperCase() ?? null),
    depAirport: airport,
    arrAirport: airport,
    schedDepUtc: utc,
    schedArrUtc: utc,
    actualDepUtc: utc,
    actualArrUtc: utc,
    aircraftType: optionalText.transform((v) => v?.toUpperCase() ?? null),
    registration: optionalText.transform((v) => v?.toUpperCase() ?? null),
    seat: optionalText.transform((v) => v?.toUpperCase() ?? null),
    cabin: z.enum(CABINS).nullish().transform((v) => v ?? null),
    purpose: z.enum(PURPOSES).nullish().transform((v) => v ?? null),
    confirmationCode: optionalText.transform((v) => v?.toUpperCase() ?? null),
    notes: optionalText,
  })
  .refine((f) => f.depAirport !== f.arrAirport, { message: "起降机场不能相同", path: ["arrAirport"] })
  .refine((f) => !f.schedDepUtc || !f.schedArrUtc || f.schedArrUtc > f.schedDepUtc, {
    message: "计划到达需晚于计划起飞",
    path: ["schedArrUtc"],
  })
  .refine((f) => !f.actualDepUtc || !f.actualArrUtc || f.actualArrUtc > f.actualDepUtc, {
    message: "实际到达需晚于实际起飞",
    path: ["actualArrUtc"],
  });

type FlightValues = z.infer<typeof flightInputSchema>;

/** 写入前在服务端算好距离和时长。 */
export function withDerived(v: FlightValues) {
  return {
    ...v,
    distanceKm: flightDistanceKm(findAirport(v.depAirport), findAirport(v.arrAirport)),
    durationMin: flightDurationMin(v),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const msg = String((err as { cause?: unknown })?.cause ?? err);
  return msg.includes("UNIQUE constraint failed");
}

const DUPLICATE = { error: "已存在相同航班（航司 + 航班号 + 日期 + 出发机场）" };

export const flightRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const db = drizzle(c.env.DB);
    const status = c.req.query("status");
    const parsed = z.enum(FLIGHT_STATUSES).optional().safeParse(status);
    if (!parsed.success) return c.json({ error: "status 只能是 confirmed 或 pending" }, 400);
    const rows = await db
      .select()
      .from(flights)
      .where(parsed.data ? eq(flights.status, parsed.data) : undefined)
      .orderBy(desc(flights.flightDate), desc(flights.schedDepUtc));
    return c.json(rows);
  })

  .post("/", async (c) => {
    const parsed = flightInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "校验失败", issues: parsed.error.issues }, 400);
    const now = new Date().toISOString();
    const row = {
      ...withDerived(parsed.data),
      id: crypto.randomUUID(),
      status: parsed.data.status ?? "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    try {
      const [created] = await drizzle(c.env.DB).insert(flights).values(row).returning();
      return c.json(created, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(DUPLICATE, 409);
      throw err;
    }
  })

  .put("/:id", async (c) => {
    const parsed = flightInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "校验失败", issues: parsed.error.issues }, 400);
    const { status, ...values } = withDerived(parsed.data);
    try {
      const [updated] = await drizzle(c.env.DB)
        .update(flights)
        .set({ ...values, ...(status ? { status } : {}), updatedAt: new Date().toISOString() })
        .where(eq(flights.id, c.req.param("id")))
        .returning();
      if (!updated) return c.json({ error: "航班不存在" }, 404);
      return c.json(updated);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(DUPLICATE, 409);
      throw err;
    }
  })

  .delete("/:id", async (c) => {
    const [deleted] = await drizzle(c.env.DB)
      .delete(flights)
      .where(eq(flights.id, c.req.param("id")))
      .returning({ id: flights.id });
    if (!deleted) return c.json({ error: "航班不存在" }, 404);
    return c.body(null, 204);
  })

  .post("/:id/confirm", async (c) => {
    const [updated] = await drizzle(c.env.DB)
      .update(flights)
      .set({ status: "confirmed", updatedAt: new Date().toISOString() })
      .where(and(eq(flights.id, c.req.param("id")), eq(flights.status, "pending")))
      .returning();
    if (!updated) return c.json({ error: "没有这条待确认航班" }, 404);
    return c.json(updated);
  });
