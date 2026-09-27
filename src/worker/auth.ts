import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env";

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
 * 再校验一次 Cloudflare Access 签发的 JWT，防止绕过 Access 直接访问 Worker。
 * 本地开发时通过 DEV_SKIP_AUTH=true 跳过。
 */
export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.DEV_SKIP_AUTH === "true") {
    c.set("userEmail", "dev@localhost");
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
    c.set("userEmail", String(payload.email ?? ""));
  } catch {
    return c.json({ error: "Access 凭证无效" }, 403);
  }
  return next();
});
