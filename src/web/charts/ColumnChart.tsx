import { useEffect, useId, useRef, useState } from "react";

export interface Column {
  key: string;
  label: string;
  /** 空间不够时用的短标签 */
  shortLabel?: string;
  value: number;
  /** tooltip 里额外显示的行 */
  details?: [string, string][];
}

interface Props {
  data: Column[];
  format: (v: number) => string;
  height?: number;
  /** 默认高亮（直接标注数值）的列 */
  highlightKey?: string;
}

/** 生成“好看”的刻度：步长取 1/2/2.5/5 × 10^k。 */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const compact = (v: number) =>
  v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${+(v / 1000).toFixed(0)}k` : v.toLocaleString();

/**
 * 单系列柱状图：柱宽 ≤ 24px、顶部 4px 圆角、发丝网格线，
 * 只直接标注最高的一列和悬停列，其余数值在 tooltip 与表格视图里。
 */
export function ColumnChart({ data, format, height = 240, highlightKey }: Props) {
  const id = useId().replace(/:/g, "");
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const m = { top: 22, right: 4, bottom: 28, left: 40 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const band = data.length ? iw / data.length : iw;
  const barW = Math.max(4, Math.min(24, band * 0.56));
  const y = (v: number) => m.top + ih - (v / top) * ih;
  const maxIdx = data.findIndex((d) => d.value === max);
  const labelled = new Set([maxIdx, data.findIndex((d) => d.key === highlightKey)]);
  // 空间不够时先换短标签，再不够就隔一个标一个
  const short = band < 42;
  const every = band < 22 ? 2 : 1;

  const bar = (x: number, v: number) => {
    const h = Math.max(0, (v / top) * ih);
    if (h === 0) return "";
    const r = Math.min(4, h, barW / 2);
    const x0 = x - barW / 2;
    const y0 = m.top + ih - h;
    const yb = m.top + ih;
    return `M${x0},${yb}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${yb}Z`;
  };

  const act = active != null ? data[active] : null;

  return (
    <div className="column-chart" ref={wrap}>
      <svg height={height} role="img" aria-label="柱状图">
        <defs>
          <linearGradient id={`${id}-col`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffd48a" />
            <stop offset="1" stopColor="#f59e2e" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "baseline" : "gridline"} x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} />
            <text className="tick" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.left + band * i + band / 2;
          return (
            <g key={d.key}>
              {active === i && (
                <rect className="hover-wash" x={cx - band / 2 + 2} y={m.top} width={band - 4} height={ih} rx={6} />
              )}
              <path
                d={bar(cx, d.value)}
                fill={`url(#${id}-col)`}
                className={`bar${active != null && active !== i ? " dim" : ""}`}
              />
              {(labelled.has(i) || active === i) && d.value > 0 && (
                <text className="cap-label" x={cx} y={y(d.value) - 8} textAnchor="middle">
                  {format(d.value)}
                </text>
              )}
              {i % every === 0 && (
                <text className={`xlabel${active === i ? " on" : ""}`} x={cx} y={height - 8} textAnchor="middle">
                  {short && d.shortLabel ? d.shortLabel : d.label}
                </text>
              )}
              <rect
                className="hit"
                x={cx - band / 2}
                y={m.top}
                width={band}
                height={ih + m.bottom}
                tabIndex={0}
                aria-label={`${d.label}：${format(d.value)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      {act && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(m.left + band * active! + band / 2, 70), width - 70), top: y(act.value) }}
        >
          <div className="tt-title">{act.label}</div>
          <div className="tt-row">
            <span>数值</span>
            <b>{format(act.value)}</b>
          </div>
          {act.details?.map(([k, v]) => (
            <div className="tt-row" key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
