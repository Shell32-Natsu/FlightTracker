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
