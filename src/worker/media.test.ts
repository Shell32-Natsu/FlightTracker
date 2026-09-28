import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchAircraftInfo, fetchLogo } from "./routes/media";
import { apiAs, migrate, MIGRATIONS, startDb } from "./testing";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#c8102e" d="M0 0h10v10H0z"/>${" ".repeat(120)}</svg>`;

/** 按 URL 返回预设响应的假 fetch */
function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [part, make] of Object.entries(routes)) if (url.includes(part)) return make();
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

describe("航司徽标", () => {
  it("优先用 Duffel 的矢量图", async () => {
    const f = fakeFetch({ "duffel.com": () => new Response(SVG, { headers: { "Content-Type": "image/svg+xml" } }) });
    const logo = await fetchLogo("JL", f);
    expect(logo?.type).toBe("image/svg+xml");
    expect(f.calls).toHaveLength(1);
  });

  it("矢量图没有时退到位图；不是图片、太小的都跳过", async () => {
    const png = new Uint8Array(400).fill(7);
    const f = fakeFetch({
      "duffel.com": () => new Response("<html>denied</html>", { headers: { "Content-Type": "text/html" } }),
      "avs.io": () => new Response(png, { headers: { "Content-Type": "image/png" } }),
    });
    expect((await fetchLogo("3U", f))?.type).toBe("image/png");

    const tiny = fakeFetch({ "avs.io": () => new Response(new Uint8Array(10), { headers: { "Content-Type": "image/png" } }) });
    expect(await fetchLogo("ZZ", tiny)).toBeNull();
  });

  it("网络错误不抛出", async () => {
    const boom = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await fetchLogo("JL", boom)).toBeNull();
  });
});

describe("机型介绍", () => {
  const wiki = { zh: "波音787", en: "Boeing_787_Dreamliner" };

  it("中文条目优先", async () => {
    const f = fakeFetch({
      "zh.wikipedia.org": () =>
        Response.json({
          type: "standard",
          title: "波音787",
          extract: "波音787是……",
          content_urls: { desktop: { page: "https://zh.wikipedia.org/wiki/B787" } },
        }),
    });
    expect(await fetchAircraftInfo(wiki, f)).toMatchObject({ lang: "zh", title: "波音787", thumbnail: null });
  });

  it("中文没有或是消歧义页时用英文", async () => {
    const f = fakeFetch({
      "zh.wikipedia.org": () => Response.json({ type: "disambiguation", extract: "可以指……" }),
      "en.wikipedia.org": () => Response.json({ type: "standard", title: "Boeing 787", extract: "The Boeing 787…" }),
    });
    const info = await fetchAircraftInfo(wiki, f);
    expect(info).toMatchObject({ lang: "en", title: "Boeing 787" });
    expect(info?.url).toContain("en.wikipedia.org/wiki/Boeing_787_Dreamliner");
  });
});

describe("接口", () => {
  let proxy: Awaited<ReturnType<typeof startDb>>;
  let api: ReturnType<typeof apiAs>;

  beforeAll(async () => {
    proxy = await startDb();
    for (const m of MIGRATIONS) await migrate(proxy.env.DB, m);
    api = apiAs({ DB: proxy.env.DB });
  });
  afterAll(() => proxy.dispose());
  afterEach(() => vi.unstubAllGlobals());

  it("徽标：代码校验、禁止脚本、没有时 404", async () => {
    expect((await api("a", "/logos/..%2Fx")).status).toBe(400);

    vi.stubGlobal("fetch", fakeFetch({ "duffel.com": () => new Response(SVG, { headers: { "Content-Type": "image/svg+xml" } }) }));
    const ok = await api("a", "/logos/jl");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(ok.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(await ok.text()).toContain("#c8102e");

    vi.stubGlobal("fetch", fakeFetch({}));
    expect((await api("a", "/logos/ZZ")).status).toBe(404);
  });

  it("机型介绍：只接受认识的机型", async () => {
    vi.stubGlobal("fetch", fakeFetch({ "wikipedia.org": () => Response.json({ title: "空中客车A350", extract: "A350……" }) }));
    const res = await api("a", "/aircraft-info/A35K");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "空中客车A350" });
    expect((await api("a", "/aircraft-info/XXXX")).status).toBe(404);
  });
});
