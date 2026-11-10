import { useId, useMemo } from "react";
import { profileFor } from "../../shared/aircraft";
import type { RefData } from "../lib/refdata";
import { useAirlineLogo } from "../lib/logos";
import { profileGeometry, type ProfileGeometry } from "./geometry";
import { airlineAccent, isLight, liveryFor } from "./livery";

interface Props {
  /** ICAO 机型代码 */
  type: string;
  /** 用哪家航司的涂装；不给就是素白机身 */
  airline?: string | null;
  refData?: RefData;
  className?: string;
  /** 画布内对齐方式：居中，或机头贴左 */
  align?: "center" | "left";
  /** 蓝图式的尺寸标注（机身长度、垂尾高度） */
  dimensions?: boolean;
}

const FONT = "'Inter Variable', 'Noto Sans SC Variable', system-ui, sans-serif";

/** 带航司涂装的侧视图（矢量，自己画的）。 */
export function AircraftProfile({ type, airline, refData, className, align = "center", dimensions }: Props) {
  const uid = useId().replace(/:/g, "");
  const logo = useAirlineLogo(airline);
  const g = useMemo(() => profileGeometry(profileFor(type, refData?.aircraft[type])), [type, refData]);
  const liv = airline
    ? liveryFor(airline, logo.data?.color, refData)
    : { tail: "#e8ecf2", logo: "color" as const, titles: "", titleColor: "#000" };
  const id = (k: string) => `${uid}-${k}`;
  const [vx, vy, vw, vh] = g.viewBox;
  const room = dimensions ? g.length * 0.062 : 0;
  const tailIsLight = isLight(liv.tail);

  return (
    <svg
      className={className}
      viewBox={`${vx} ${vy} ${vw} ${vh + room}`}
      preserveAspectRatio={align === "left" ? "xMinYMid meet" : "xMidYMid meet"}
      role="img"
      aria-label={refData?.aircraft[type] ?? type}
    >
      <defs>
        <linearGradient id={id("body")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f3f5f8" />
          <stop offset="1" stopColor="#cfd6df" />
        </linearGradient>
        <linearGradient id={id("shade")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1a33" stopOpacity={0.1} />
          <stop offset="0.16" stopColor="#fff" stopOpacity={0.5} />
          <stop offset="0.34" stopColor="#fff" stopOpacity={0.12} />
          <stop offset="0.58" stopColor="#0b1a33" stopOpacity={0.03} />
          <stop offset="1" stopColor="#0b1a33" stopOpacity={0.42} />
        </linearGradient>
        <linearGradient id={id("metal")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e8ee" />
          <stop offset="1" stopColor="#aeb7c3" />
        </linearGradient>
        <linearGradient id={id("fin")} x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0" stopColor={liv.tail} />
          <stop offset="1" stopColor={liv.tail} stopOpacity={tailIsLight ? 1 : 0.88} />
        </linearGradient>
        <clipPath id={id("clip")}>
          <path d={g.fuselage} />
        </clipPath>
        <clipPath id={id("finclip")}>
          <path d={g.fin} />
        </clipPath>
        {/* 白色剪影：用徽标的形状，填白色 */}
        <filter id={id("mono")} colorInterpolationFilters="sRGB">
          <feFlood floodColor="#ffffff" />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>

      {/* 垂尾 */}
      <path d={g.fin} fill={`url(#${id("fin")})`} stroke={tailIsLight ? "#b9c1cc" : "rgba(255,255,255,0.32)"} strokeWidth={0.06} />
      {/* 白尾翼又取不到徽标时，给垂尾一道航司色的斜带 */}
      {airline && tailIsLight && !logo.data && (
        <g clipPath={`url(#${id("finclip")})`}>
          <rect
            x={g.logo.cx - g.logo.size * 2}
            y={g.logo.cy - g.logo.size * 0.42}
            width={g.logo.size * 4}
            height={g.logo.size * 0.9}
            fill={airlineAccent(airline)}
            transform={`rotate(-32 ${g.logo.cx} ${g.logo.cy})`}
          />
        </g>
      )}
      {airline && logo.data && (
        <g clipPath={`url(#${id("finclip")})`}>
          <image
            href={logo.data.src}
            x={g.logo.cx - g.logo.size / 2}
            y={g.logo.cy - g.logo.size / 2}
            width={g.logo.size}
            height={g.logo.size}
            preserveAspectRatio="xMidYMid meet"
            filter={liv.logo === "white" ? `url(#${id("mono")})` : undefined}
          />
        </g>
      )}

      <path d={g.rudder} fill="none" stroke={tailIsLight ? "#0b1a33" : "#fff"} strokeOpacity={0.16} strokeWidth={0.07} />

      {/* 机身 + 涂装色块 */}
      <path d={g.fuselage} fill={`url(#${id("body")})`} />
      <g clipPath={`url(#${id("clip")})`}>
        {liv.upper && <rect x={vx} y={vy} width={vw} height={g.upperY - vy} fill={liv.upper} />}
        {liv.stripe && <rect x={vx} y={g.upperY} width={vw} height={g.radius * 0.1} fill={liv.stripe} />}
        {liv.belly && <rect x={vx} y={g.bellyY} width={vw} height={g.radius * 2} fill={liv.belly} />}
        <rect x={vx} y={-g.top} width={vw} height={g.top + g.radius} fill={`url(#${id("shade")})`} />
        {g.doors.map((d, i) => (
          <rect
            key={i}
            x={d.x}
            y={d.y}
            width={d.w}
            height={d.h}
            rx={0.18}
            fill="none"
            stroke="#8a94a3"
            strokeOpacity={0.7}
            strokeWidth={0.05}
          />
        ))}
        {g.windows.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} rx={w.w * 0.45} fill="#2a3342" />
        ))}
        {airline && liv.titles && (
          <text
            x={g.titles.x}
            y={g.titles.y}
            fontSize={g.titles.size}
            fontWeight={800}
            fontFamily={FONT}
            letterSpacing={g.titles.size * 0.06}
            fill={liv.titleColor}
            textLength={liv.titles.length * g.titles.size * 0.68 > g.titles.maxWidth ? g.titles.maxWidth : undefined}
            lengthAdjust="spacingAndGlyphs"
          >
            {liv.titles}
          </text>
        )}
      </g>
      <path d={g.fuselage} fill="none" stroke="#9aa4b2" strokeWidth={0.05} />
      <path d={g.cockpit} fill="#1b2230" />

      {/* 近侧平尾、整流罩、机翼、发动机 */}
      <path d={g.stabilizer} fill={`url(#${id("metal")})`} stroke="#8d97a5" strokeWidth={0.05} strokeLinejoin="round" />
      {g.fairing && <ellipse {...g.fairing} fill={liv.belly ?? "#c3cbd6"} stroke="#8d97a5" strokeOpacity={0.5} strokeWidth={0.04} />}
      <path d={g.wing} fill={`url(#${id("metal")})`} stroke="#8d97a5" strokeWidth={0.04} />
      {g.winglet && <path d={g.winglet} fill={liv.tail} stroke="#8d97a5" strokeWidth={0.04} />}
      {g.engines.map((e, i) => (
        <g key={i}>
          {e.pylon && <path d={e.pylon} fill="#c3cad4" />}
          <path d={e.exhaust} fill="#6d7684" />
          <path d={e.body} fill={liv.engine ?? `url(#${id("metal")})`} stroke="#8d97a5" strokeWidth={0.04} />
          <ellipse cx={e.lip.cx} cy={e.lip.cy} rx={e.lip.rx} ry={e.lip.ry} fill="#c4ccd6" />
          <ellipse cx={e.lip.cx + e.lip.rx * 0.35} cy={e.lip.cy} rx={e.lip.rx * 0.6} ry={e.lip.ry * 0.82} fill="#343c4a" />
        </g>
      ))}
      {dimensions && <Dimensions g={g} y={vy + vh + room * 0.45} size={room * 0.4} />}
      {g.props.map((q, i) => (
        <ellipse key={i} cx={q.cx} cy={q.cy} rx={q.rx} ry={q.ry} fill="#8f99a8" opacity={0.28} />
      ))}
    </svg>
  );
}

/** 机身长度的标注线：两端短竖线，中间断开写数字。 */
function Dimensions({ g, y, size }: { g: ProfileGeometry; y: number; size: number }) {
  const text = `${g.length.toFixed(1)} m`;
  const gap = text.length * size * 0.36 + size * 0.5;
  const mid = g.length / 2;
  const line = { stroke: "#fff", strokeOpacity: 0.5, strokeWidth: size * 0.06 };
  return (
    <g>
      <line x1={0} x2={mid - gap} y1={y} y2={y} {...line} />
      <line x1={mid + gap} x2={g.length} y1={y} y2={y} {...line} />
      {[0, g.length].map((x) => (
        <line key={x} x1={x} x2={x} y1={y - size * 0.45} y2={y + size * 0.45} {...line} />
      ))}
      <text x={mid} y={y + size * 0.34} textAnchor="middle" fontSize={size} fill="#fff" fillOpacity={0.85} className="dimension-text">
        {text}
      </text>
    </g>
  );
}
