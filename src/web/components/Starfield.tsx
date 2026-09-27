import { useEffect, useRef } from "react";

/** 静态星空背景：固定随机种子，每次打开都是同一片星空。 */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      let seed = 20260926;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const count = Math.round((w * h) / 2600);
      for (let i = 0; i < count; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const m = rand();
        const r = m > 0.985 ? 1.3 : m > 0.9 ? 0.9 : 0.55;
        const a = 0.15 + rand() * (m > 0.9 ? 0.75 : 0.45);
        const tint = rand();
        const color = tint > 0.85 ? "255,214,170" : tint > 0.7 ? "180,205,255" : "235,240,255";
        if (r > 1) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
          g.addColorStop(0, `rgba(${color},${a * 0.5})`);
          g.addColorStop(1, `rgba(${color},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
        }
        ctx.fillStyle = `rgba(${color},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden />;
}
