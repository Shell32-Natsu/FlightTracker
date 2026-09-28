import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env";
import { ensureUser } from "./users";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/**
 * 再校验一次 Cloudflare Access 签发的 JWT，防止绕过 Access 直接访问 Worker；
 * 用凭证里的 sub 作为用户 ID，第一次访问时自动建用户。
 * 本地开发时通过 DEV_SKIP_AUTH=true 跳过校验，可用 X-Dev-User 请求头模拟不同用户。
 */
export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.DEV_SKIP_AUTH === "true") {
    const dev = c.req.header("X-Dev-User")?.trim() || "dev";
    const user = { id: `dev:${dev}`, email: `${dev}@localhost` };
    await ensureUser(c.env.DB, user.id, user.email);
    c.set("user", user);
    return next();
  }
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = c.env;
  if (!team || !aud) {
    return c.json({ error: "服务端未配置 ACCESS_TEAM_DOMAIN / ACCESS_AUD" }, 500);
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "缺少 Access 凭证" }, 403);
  try {
    const { payload } = await jwtVerify(token, jwks(team), {
      issuer: `https://${team}`,
      audience: aud,
    });
    if (!payload.sub) throw new Error("凭证缺少 sub");
    c.set("user", { id: payload.sub, email: String(payload.email ?? "") });
  } catch {
    return c.json({ error: "Access 凭证无效" }, 403);
  }
  const user = c.get("user");
  await ensureUser(c.env.DB, user.id, user.email);
  return next();
});
