import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

/**
 * 用户：id 是 Cloudflare Access 登录凭证里稳定的 sub，换邮箱也不变。
 * 第一次带着有效凭证访问 API 时自动创建。
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamps.createdAt,
});

/**
 * 多用户迁移之前的数据归属的占位用户；第一个登录的用户会认领这些数据。
 * 见 src/worker/users.ts。
 */
export const LEGACY_USER_ID = "legacy";

/** 航班记录，每个航段一行。所有时间都是 UTC。 */
export const flights = sqliteTable(
  "flights",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    status: text("status", { enum: ["confirmed", "pending"] })
      .notNull()
      .default("confirmed"),
    source: text("source", { enum: ["manual", "lookup", "email", "csv"] }).notNull(),
    flightDate: text("flight_date").notNull(),
    airline: text("airline").notNull(),
    flightNumber: text("flight_number").notNull(),
    operatingAirline: text("operating_airline"),
    depAirport: text("dep_airport").notNull(),
    arrAirport: text("arr_airport").notNull(),
    schedDepUtc: text("sched_dep_utc"),
    schedArrUtc: text("sched_arr_utc"),
    actualDepUtc: text("actual_dep_utc"),
    actualArrUtc: text("actual_arr_utc"),
    aircraftType: text("aircraft_type"),
    registration: text("registration"),
    seat: text("seat"),
    cabin: text("cabin", { enum: ["economy", "premium", "business", "first"] }),
    purpose: text("purpose", { enum: ["leisure", "business", "other"] }),
    confirmationCode: text("confirmation_code"),
    distanceKm: integer("distance_km"),
    durationMin: integer("duration_min"),
    trackKey: text("track_key"),
    emailId: text("email_id").references(() => emails.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    // 去重在同一用户内：两个人坐同一班飞机各记各的
    uniqueIndex("flights_dedupe").on(t.userId, t.airline, t.flightNumber, t.flightDate, t.depAirport),
    index("flights_user_date").on(t.userId, t.flightDate),
    index("flights_user_status").on(t.userId, t.status),
  ],
);

/** 收到的转发邮件（M4 使用）。 */
export const emails = sqliteTable("emails", {
  id: text("id").primaryKey(),
  /** 按发件人匹配到的用户；匹配不到时为空 */
  userId: text("user_id"),
  receivedAt: text("received_at").notNull(),
  fromAddr: text("from_addr"),
  subject: text("subject"),
  r2Key: text("r2_key"),
  parseStatus: text("parse_status", { enum: ["pending", "parsed", "failed", "ignored"] })
    .notNull()
    .default("pending"),
  parseMethod: text("parse_method", { enum: ["jsonld", "llm"] }),
  error: text("error"),
  flightCount: integer("flight_count").notNull().default(0),
});

/** 外部查询缓存（M3 使用），key 如 UA857:2024-05-01。 */
export const lookupCache = sqliteTable("lookup_cache", {
  key: text("key").primaryKey(),
  responseJson: text("response_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

/** 用户设置：每人每项一行，value 为 JSON。 */
export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
