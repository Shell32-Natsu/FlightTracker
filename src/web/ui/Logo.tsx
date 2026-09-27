/** 品牌标志：一段航线弧 + 两端机场。 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo">
      <defs>
        <linearGradient id="logo-arc" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffd48a" />
          <stop offset="1" stopColor="#ff7a5c" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0f1728" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="rgba(255,255,255,0.08)" />
      <path d="M7 22 Q16 4 25 22" fill="none" stroke="url(#logo-arc)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="7" cy="22" r="2.6" fill="#fff" />
      <circle cx="25" cy="22" r="2.6" fill="#ff7a5c" />
    </svg>
  );
}
