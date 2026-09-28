import { Hono } from "hono";
import { aircraftFamily } from "../../shared/aircraft";
import type { AppEnv } from "../env";

/**
 * 外部图片和介绍的代理：航司徽标、机型的维基百科简介。
 * 走 Worker 的好处：同源（导出 PNG 能嵌入）、边缘缓存、在访问不了维基百科的网络里也能用。
 */

const UA = "FlightTracker/1.0 (personal flight log; https://github.com/Shell32-Natsu/FlightTracker)";
const DAY = 86400;

export interface LogoSource {
  url: string;
  type: string;
}

/** 徽标图源：Duffel 的矢量图标优先，其次 Aviasales 的位图。 */
export function logoSources(code: string): LogoSource[] {
  return [
    {
      url: `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`,
      type: "image/svg+xml",
    },
    { url: `https://pics.avs.io/200/200/${code}.png`, type: "image/png" },
  ];
}

/** 依次尝试各图源，返回第一张像样的图片。 */
export async function fetchLogo(
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<{ body: ArrayBuffer; type: string } | null> {
  for (const src of logoSources(code)) {
    try {
      const res = await fetcher(src.url, { headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      const type = (res.headers.get("Content-Type") ?? "").split(";")[0].trim();
      if (!type.startsWith("image/")) continue;
      const body = await res.arrayBuffer();
      // 太小的多半是占位图，太大的不像徽标
      if (body.byteLength < 100 || body.byteLength > 300_000) continue;
      return { body, type: src.type === "image/svg+xml" && type.includes("svg") ? "image/svg+xml" : type };
    } catch {
      // 下一个图源
    }
  }
  return null;
}

export interface AircraftInfo {
  lang: "zh" | "en";
  title: string;
  extract: string;
  url: string;
  thumbnail: string | null;
}

/** 维基百科摘要：先中文（简体），没有再英文。 */
export async function fetchAircraftInfo(
  wiki: { zh: string; en: string },
  fetcher: typeof fetch = fetch,
): Promise<AircraftInfo | null> {
  for (const lang of ["zh", "en"] as const) {
    try {
      const res = await fetcher(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki[lang])}`,
        { headers: { "User-Agent": UA, "Accept-Language": lang === "zh" ? "zh-cn" : "en" } },
      );
      if (!res.ok) continue;
      const j = (await res.json()) as {
        type?: string;
        title?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
        thumbnail?: { source?: string };
      };
      if (j.type === "disambiguation" || !j.extract) continue;
      return {
        lang,
        title: j.title ?? wiki[lang],
        extract: j.extract,
        url: j.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(wiki[lang])}`,
        thumbnail: j.thumbnail?.source ?? null,
      };
    } catch {
      // 换一种语言
    }
  }
  return null;
}

/** 边缘缓存（绑定了自定义域名时生效；workers.dev 和本地开发下是空操作） */
function edgeCache(): Cache | null {
  return typeof caches !== "undefined" && "default" in caches ? (caches as unknown as { default: Cache }).default : null;
}
/** 后台写缓存；没有执行上下文时（测试）直接等它写完 */
async function later(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }, task: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    await task;
  }
}
const cacheKey = (path: string) => new Request(`https://media-cache.flighttracker.internal/${path}`);

// 第三方 SVG：只当图片用，禁止脚本
const SVG_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  "X-Content-Type-Options": "nosniff",
};

export const mediaRoutes = new Hono<AppEnv>()
  .get("/logos/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!/^[A-Z0-9]{2}$/.test(code)) return c.json({ error: "航司代码无效" }, 400);

    const cache = edgeCache();
    const key = cacheKey(`logos/v1/${code}`);
    let hit = await cache?.match(key);
    if (!hit) {
      const logo = await fetchLogo(code);
      hit = logo
        ? new Response(logo.body, {
            headers: { "Content-Type": logo.type, "Cache-Control": `public, max-age=${30 * DAY}` },
          })
        : // 没有徽标也缓存一天，免得每次都去问图源
          new Response(null, { headers: { "X-Logo-Missing": "1", "Cache-Control": `public, max-age=${DAY}` } });
      if (cache) await later(c, cache.put(key, hit.clone()));
    }
    if (hit.headers.get("X-Logo-Missing")) {
      return c.json({ error: "没有这家航司的徽标" }, 404, { "Cache-Control": `private, max-age=${DAY}` });
    }
    return new Response(hit.body, {
      headers: {
        ...SVG_HEADERS,
        "Content-Type": hit.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": `private, max-age=${7 * DAY}`,
      },
    });
  })

  .get("/aircraft-info/:type", async (c) => {
    const family = aircraftFamily(c.req.param("type"));
    if (!family) return c.json({ error: "暂无这个机型的介绍" }, 404);

    const cache = edgeCache();
    const key = cacheKey(`aircraft-info/v1/${family.id}`);
    const hit = await cache?.match(key);
    if (hit) return c.json(await hit.json<AircraftInfo>(), 200, { "Cache-Control": `private, max-age=${DAY}` });

    const info = await fetchAircraftInfo(family.wiki);
    if (!info) return c.json({ error: "暂时取不到机型介绍" }, 502);
    if (cache) {
      const res = Response.json(info, { headers: { "Cache-Control": `public, max-age=${7 * DAY}` } });
      await later(c, cache.put(key, res));
    }
    return c.json(info, 200, { "Cache-Control": `private, max-age=${DAY}` });
  });
