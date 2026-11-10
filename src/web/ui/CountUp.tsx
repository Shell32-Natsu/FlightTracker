import { useEffect, useRef, useState } from "react";

const DURATION = 900;

/** 大数字：首次出现和数值变化时滚动到新值。读屏只读最终值；系统要求减少动态效果时直接显示。 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = reduced ? 1 : Math.min(1, Math.max(0, (now - start) / DURATION));
      const v = t === 1 ? value : Math.round(from + (value - from) * (1 - (1 - t) ** 4));
      current.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <>
      <span className="sr-only">{value.toLocaleString()}</span>
      <span aria-hidden>{shown.toLocaleString()}</span>
    </>
  );
}
