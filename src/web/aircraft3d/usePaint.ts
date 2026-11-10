import { useEffect, useMemo, useState } from "react";
import type { RefData } from "../lib/refdata";
import { useAirlineLogo } from "../lib/logos";
import { airlineAccent, liveryFor, type Livery } from "../aircraft/livery";
import type { PaintInput } from "./paint";

export type Paint = Omit<PaintInput, "spec">;

const PLAIN: Livery = { tail: "#e8ecf2", logo: "color", titles: "", titleColor: "#000" };

/** 航司涂装；ready 表示徽标已经有了定论（拿到了，或者没有） */
export function usePaint(airline: string | null, refData: RefData): { paint: Paint; ready: boolean } {
  const logo = useAirlineLogo(airline);
  const src = logo.data?.src;
  const color = logo.data?.color;
  const [decoded, setDecoded] = useState<{ src: string; img: HTMLImageElement | null } | null>(null);

  // 徽标是 data URL，解码成图片才能画进贴图
  useEffect(() => {
    if (!src) return;
    let live = true;
    const img = new Image();
    img.src = src;
    img.decode().then(
      () => live && setDecoded({ src, img }),
      () => live && setDecoded({ src, img: null }),
    );
    return () => {
      live = false;
    };
  }, [src]);

  // 换航司的那一刻，解码好的还是上一家的徽标，不能画上去
  const current = decoded && decoded.src === src ? decoded : null;
  const image = current?.img ?? null;
  const paint = useMemo(
    () => ({
      livery: airline ? liveryFor(airline, color, refData) : PLAIN,
      accent: airline ? airlineAccent(airline) : null,
      logo: image,
    }),
    [airline, color, refData, image],
  );
  return { paint, ready: !airline || (src ? !!current : !logo.isPending) };
}
