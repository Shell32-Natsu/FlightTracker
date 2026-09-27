import interCss from "@fontsource-variable/inter/index.css?raw";
import notoCss from "@fontsource-variable/noto-sans-sc/index.css?raw";

/**
 * 把海报 SVG 导出成 PNG。
 *
 * SVG 当作图片渲染时不会加载页面上的网页字体，文字会退回系统字体；
 * 所以先把用到的字体内嵌进 SVG。中文字体按 unicode-range 切成了约 100 个分片，
 * 只挑覆盖了海报里实际出现字符的那几个分片，以 base64 @font-face 写进去。
 */

// 字体文件由 Vite 打包成静态资源；这里只拿到各分片的地址（eager 只内联 URL 字符串），用到时再下载
const FONT_URLS: Record<string, string> = {
  ...import.meta.glob<string>("/node_modules/@fontsource-variable/inter/files/*-wght-normal.woff2", {
    query: "?url",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("/node_modules/@fontsource-variable/noto-sans-sc/files/*.woff2", {
    query: "?url",
    import: "default",
    eager: true,
  }),
};

interface Face {
  family: string;
  file: string;
  url: string;
  rangeText: string;
  ranges: [number, number][];
}

function parseFaces(css: string, pkg: string): Face[] {
  const faces: Face[] = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
    const rangeText = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
    if (!family || !file || !rangeText || /italic/.test(file)) continue;
    const url = FONT_URLS[`/node_modules/${pkg}/files/${file}`];
    if (!url) continue;
    const ranges = rangeText.split(",").map((r): [number, number] => {
      const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
    faces.push({ family, file, url, rangeText, ranges });
  }
  return faces;
}

let facesCache: Face[] | null = null;
const allFaces = () =>
  (facesCache ??= [
    ...parseFaces(interCss, "@fontsource-variable/inter"),
    ...parseFaces(notoCss, "@fontsource-variable/noto-sans-sc"),
  ]);

const dataUrlCache = new Map<string, Promise<string>>();

async function toDataUrl(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(binary)}`;
}

/** 生成只覆盖 text 里字符的 @font-face 样式（字体以 data URL 内嵌）。 */
export async function embeddedFontCss(text: string): Promise<{ css: string; files: number; bytes: number }> {
  const codepoints = new Set([...text].map((c) => c.codePointAt(0)!));
  const needed = allFaces().filter((f) => [...codepoints].some((cp) => f.ranges.some(([a, b]) => cp >= a && cp <= b)));
  const blocks = await Promise.all(
    needed.map(async (f) => {
      let p = dataUrlCache.get(f.file);
      if (!p) {
        p = toDataUrl(f.url);
        dataUrlCache.set(f.file, p);
      }
      const url = await p;
      return {
        css: `@font-face{font-family:'${f.family}';font-style:normal;font-weight:100 900;src:url(${url}) format('woff2');unicode-range:${f.rangeText};}`,
        bytes: url.length,
      };
    }),
  );
  return { css: blocks.map((b) => b.css).join("\n"), files: blocks.length, bytes: blocks.reduce((s, b) => s + b.bytes, 0) };
}

/** SVG → PNG Blob。scale 为像素倍率（逻辑尺寸 × scale）。 */
export async function svgToPng(svg: SVGSVGElement, scale = 3): Promise<Blob> {
  await document.fonts.ready;
  const vb = svg.viewBox.baseVal;
  const width = Math.round(vb.width * scale);
  const height = Math.round(vb.height * scale);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("style");
  const { css } = await embeddedFontCss(svg.textContent ?? "");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);

  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    img.src = url;
    await img.decode();
    // 内嵌字体在部分浏览器里解码稍晚，留一帧再画
    await new Promise((r) => setTimeout(r, 60));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("生成图片失败"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 手机上优先用系统分享（可直接存进相册），否则下载。 */
export async function saveImage(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
