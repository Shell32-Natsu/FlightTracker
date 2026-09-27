import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

/** 航班记录，每个航段一行。所有时间都是 UTC。 */
export const flights = sqliteTable(
  "flights",
  {
    id: text("id").primaryKey(),
    status: text("status", { enum: ["confirmed", "pending"] }).notNull().default("confirmed"),
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
    uniqueIndex("flights_dedupe").on(t.airline, t.flightNumber, t.flightDate, t.depAirport),
    index("flights_date").on(t.flightDate),
    index("flights_status").on(t.status),
  ],
);

/** 收到的转发邮件（M4 使用）。 */
export const emails = sqliteTable("emails", {
  id: text("id").primaryKey(),
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

/** 用户设置：每项一行，value 为 JSON（单用户应用，不需要用户列）。 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
