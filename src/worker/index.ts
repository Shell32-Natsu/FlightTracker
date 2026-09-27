import { Hono } from "hono";
import { accessAuth } from "./auth";
import { flightRoutes } from "./routes/flights";
import type { AppEnv } from "./env";

const api = new Hono<AppEnv>()
  .use("*", accessAuth)
  .get("/me", (c) => c.json({ email: c.get("userEmail") }))
  .route("/flights", flightRoutes);

const app = new Hono<AppEnv>()
  .route("/api", api)
  .all("/api/*", (c) => c.json({ error: "Not found" }, 404))
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  });

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<AppEnv["Bindings"]>;
