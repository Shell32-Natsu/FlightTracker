import { useState } from "react";

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** 单一琥珀色阶：0 为中性底色，其余按数量从浅到浓。 */
function cellColor(v: number, max: number): string | undefined {
  if (v === 0 || max === 0) return undefined;
  const t = max === 1 ? 1 : (v - 1) / (max - 1);
  const alpha = 0.28 + t * 0.72;
  return `rgba(255, 184, 77, ${alpha.toFixed(3)})`;
}

export function MonthHeatmap({
  years,
  counts,
  max,
}: {
  years: number[];
  counts: Map<number, number[]>;
  max: number;
}) {
  const [hover, setHover] = useState<{ y: number; m: number; x: number; top: number } | null>(null);
  const legend = Array.from({ length: Math.min(max, 5) }, (_, i) =>
    max <= 5 ? i + 1 : Math.round(1 + ((max - 1) * i) / 4),
  );

  return (
    <div className="heatmap" onMouseLeave={() => setHover(null)}>
      <div className="heatmap-grid" role="table" aria-label="每月航段数">
        <span />
        {MONTHS.map((m) => (
          <span key={m} className="hm-col" role="columnheader" aria-label={`${m}月`}>
            {m}
          </span>
        ))}
        {years.map((y) => (
          <Row key={y} year={y} row={counts.get(y)!} max={max} onHover={setHover} />
        ))}
      </div>
      <div className="heatmap-legend">
        <span>少</span>
        <span className="hm-cell" />
        {legend.map((v) => (
          <span key={v} className="hm-cell v" style={{ background: cellColor(v, max) }} title={`${v} 段`} />
        ))}
        <span>多</span>
        <span className="faint" style={{ marginLeft: "auto" }}>
          最多一个月 {max} 段
        </span>
      </div>
      {hover && (
        <div className="chart-tooltip" style={{ left: hover.x, top: hover.top }}>
          <div className="tt-title">
            {hover.y} 年 {hover.m + 1} 月
          </div>
          <div className="tt-row">
            <span>航段</span>
            <b>{counts.get(hover.y)![hover.m]}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  year,
  row,
  max,
  onHover,
}: {
  year: number;
  row: number[];
  max: number;
  onHover: (h: { y: number; m: number; x: number; top: number } | null) => void;
}) {
  return (
    <>
      <span className="hm-row" role="rowheader">
        {year}
      </span>
      {row.map((v, m) => (
        <span
          key={m}
          role="cell"
          aria-label={`${year} 年 ${m + 1} 月：${v} 段`}
          className={`hm-cell${v ? " v" : ""}`}
          style={{ background: cellColor(v, max) }}
          onMouseEnter={(e) => {
            const cell = e.currentTarget.getBoundingClientRect();
            const box = e.currentTarget.closest(".heatmap")!.getBoundingClientRect();
            onHover({ y: year, m, x: cell.left - box.left + cell.width / 2, top: cell.top - box.top });
          }}
        />
      ))}
    </>
  );
}
