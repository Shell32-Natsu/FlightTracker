import { useQuery } from "@tanstack/react-query";
import { pickBrandColor, svgColors } from "../aircraft/livery";

/**
 * 航司徽标地址。正式版走自己的 Worker（取图 + 缓存，同源所以导出 PNG 时也能嵌入）；
 * 演示版没有后端，直接用图源。
 */
export function logoUrl(code: string): string {
  return import.meta.env.MODE === "demo"
    ? `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`
    : `/api/logos/${encodeURIComponent(code)}`;
}

/** 已确认没有徽标的航司，避免反复请求、反复闪烁 */
export const missingLogos = new Set<string>();

export interface LogoData {
  /** data URL，可以直接嵌进要导出的 SVG */
  src: string;
  /** 徽标里的品牌色 */
  color: string | null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 位图徽标：缩小后取像素颜色 */
async function rasterColors(src: string): Promise<[number, number, number][]> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  const out: [number, number, number][] = [];
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) out.push([px[i], px[i + 1], px[i + 2]]);
  return out;
}

export async function loadLogo(code: string): Promise<LogoData | null> {
  if (missingLogos.has(code)) return null;
  try {
    const res = await fetch(logoUrl(code));
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const src = await blobToDataUrl(blob);
    const colors = blob.type.includes("svg") ? svgColors(await blob.text()) : await rasterColors(src);
    return { src, color: pickBrandColor(colors) };
  } catch {
    missingLogos.add(code);
    return null;
  }
}

export function useAirlineLogo(code: string | null | undefined) {
  return useQuery({
    queryKey: ["airline-logo", code],
    queryFn: () => loadLogo(code!),
    enabled: !!code,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
