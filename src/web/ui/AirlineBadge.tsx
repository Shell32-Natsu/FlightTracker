import { useEffect, useState } from "react";
import { airlineAccent } from "../aircraft/livery";
import { logoUrl, missingLogos } from "../lib/logos";

/** 航司代码徽标：取不到 logo 时的替代，颜色与票面上的航司色一致。 */
export function AirlineBadge({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`airline-badge ${size}`}
      style={{ "--air": airlineAccent(code) } as React.CSSProperties}
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
