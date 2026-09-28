import { useEffect, useState } from "react";
import { logoUrl, missingLogos } from "../lib/logos";

/** 航司徽标：用代码生成稳定的颜色（同一航司在各处颜色一致）。 */
export function airlineHue(code: string): number {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 360;
  // 跳开和强调色（琥珀）太接近的色相，避免与数据高亮混淆
  return (h * 7 + 190) % 360;
}

export function AirlineBadge({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  const h = airlineHue(code);
  return (
    <span
      className={`airline-badge ${size}`}
      style={
        {
          "--badge-bg": `hsl(${h} 42% 17%)`,
          "--badge-line": `hsl(${h} 45% 28%)`,
          "--badge-ink": `hsl(${h} 90% 80%)`,
        } as React.CSSProperties
      }
      aria-hidden
    >
      {code}
    </span>
  );
}

/** 航司徽标：浅色小方块里放真实 logo，取不到时退回代码徽标。 */
export function AirlineLogo({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(() => missingLogos.has(code));
  useEffect(() => setFailed(missingLogos.has(code)), [code]);
  if (failed) return <AirlineBadge code={code} size={size} />;
  return (
    <span className={`airline-logo ${size}`} aria-hidden>
      <img
        src={logoUrl(code)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          missingLogos.add(code);
          setFailed(true);
        }}
      />
    </span>
  );
}
