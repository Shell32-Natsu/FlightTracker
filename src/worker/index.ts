import { Hono } from "hono";
import { accessAuth } from "./auth";
import { flightRoutes } from "./routes/flights";
import { settingsRoutes } from "./routes/settings";
import { importExportRoutes } from "./routes/importExport";
import { emailRoutes } from "./routes/emails";
import { mediaRoutes } from "./routes/media";
import { lookupRoutes } from "./routes/lookup";
import { receiveEmail } from "./email/ingest";
import type { AppEnv } from "./env";

const api = new Hono<AppEnv>()
  .use("*", accessAuth)
  .get("/me", (c) => c.json({ email: c.get("user").email, lookup: !!c.env.AERODATABOX_API_KEY }))
  .route("/flights", flightRoutes)
  .route("/settings", settingsRoutes)
  .route("/", importExportRoutes)
  .route("/", emailRoutes)
  .route("/", mediaRoutes)
  .route("/", lookupRoutes);

const app = new Hono<AppEnv>()
  .route("/api", api)
  .all("/api/*", (c) => c.json({ error: "Not found" }, 404))
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  });

export default {
  fetch: app.fetch,

  /** Email Routing 把收件域名上的邮件转给这里（见 README“邮件导入”）。 */
  async email(message, env) {
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const result = await receiveEmail(env, { from: message.from, to: message.to, raw });
      console.log("email", message.to, result.status);
    } catch (err) {
      // 不抛出：抛出会让发件方收到退信并反复重试
      console.error("email handler failed", err);
    }
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
