import "@fontsource-variable/noto-sans-sc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Download, RotateCcw } from "lucide-react";
import { useFlights, useSettings } from "../lib/api";
import { useRefData, useWorldTopo } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { flightYear } from "../../shared/stats";
import { ErrorBox, Empty, Loading } from "../components/Status";
import { Segmented } from "../ui/Segmented";
import { PALETTES, PALETTE_FOR_THEME, type PaletteId } from "../poster/palettes";
import { cachedTheme } from "../lib/theme";
import { buildPosterData, type ColorBy } from "../poster/data";
import { TEMPLATES, TEMPLATE_COMPONENTS, type TemplateId } from "../poster/templates";
import { saveImage, svgToPng } from "../poster/exportPng";

const SCALE = 3;

export function PosterPage() {
  const flights = useFlights();
  const ref = useRefData();
  const world = useWorldTopo("50m");
  const settings = useSettings();
  const [unit] = useUnit();
  const [params] = useSearchParams();

  const [template, setTemplate] = useState<TemplateId>((params.get("template") as TemplateId) ?? "year");
  const [paletteId, setPaletteId] = useState<PaletteId>(() => PALETTE_FOR_THEME[cachedTheme()]);
  const [colorBy, setColorBy] = useState<ColorBy>("single");
  const [year, setYear] = useState<number | null>(params.get("year") ? Number(params.get("year")) : null);
  const [scope, setScope] = useState<number | "all">("all");
  const [flightId, setFlightId] = useState<string | null>(params.get("flight"));
  const [holder, setHolder] = useState(() => {
    try {
      return localStorage.getItem("poster-holder") ?? "";
    } catch {
      return "";
    }
  });
  const [rotation, setRotation] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<{ kind: "busy" | "done" | "error"; text: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const all = useMemo(() => flights.data ?? [], [flights.data]);
  const years = useMemo(() => [...new Set(all.map(flightYear))].sort((a, b) => b - a), [all]);
  const thisYear = new Date().getFullYear();
  const activeYear = year ?? years.find((y) => y <= thisYear) ?? years[0];
  const sortedFlights = useMemo(
    () => [...all].sort((a, b) => b.flightDate.localeCompare(a.flightDate)),
    [all],
  );
  const today = new Date().toISOString().slice(0, 10);
  const flight = sortedFlights.find((f) => f.id === flightId) ?? sortedFlights.find((f) => f.flightDate <= today) ?? sortedFlights[0];

  const palette = PALETTES[paletteId];
  const effectiveColorBy: ColorBy =
    template === "card" || template === "passport" ? "single" : template === "year" && colorBy === "year" ? "single" : colorBy;

  const selected = useMemo(() => {
    if (template === "year") return all.filter((f) => flightYear(f) === activeYear);
    if (template === "card") return flight ? [flight] : [];
    if ((template === "wallpaper" || template === "passport") && scope !== "all") return all.filter((f) => flightYear(f) === scope);
    return all;
  }, [template, all, activeYear, flight, scope]);

  const data = useMemo(
    () =>
      ref.data ? buildPosterData(selected, ref.data, palette, effectiveColorBy, settings.data?.homeAirport ?? null) : null,
    [selected, ref.data, palette, effectiveColorBy, settings.data?.homeAirport],
  );

  // 换模板或范围时，壁纸地球回到默认角度
  useEffect(() => setRotation(null), [template, scope]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || flights.isPending || !world.data || !data) return <Loading label="正在准备海报" />;
  if (all.length === 0) {
    return (
      <div className="page">
        <Empty title="还没有航班">添加航班后就能生成海报和卡片。</Empty>
      </div>
    );
  }

  const spec = TEMPLATES[template];
  const Template = TEMPLATE_COMPONENTS[template];
  const defaultRotation: [number, number] = [data.home?.lon ?? 110, (data.home?.lat ?? 20) - 8];

  const save = async () => {
    if (!svgRef.current) return;
    setStatus({ kind: "busy", text: "正在生成图片…" });
    try {
      const blob = await svgToPng(svgRef.current, SCALE);
      const name =
        template === "card" && flight
          ? `hangji-${flight.airline}${flight.flightNumber}-${flight.flightDate}.png`
          : `hangji-${template}-${template === "year" ? activeYear : scope}.png`;
      const how = await saveImage(blob, name);
      setStatus({
        kind: "done",
        text: `${how === "shared" ? "已打开分享" : "已下载"} · ${spec.width * SCALE} × ${spec.height * SCALE} px`,
      });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="page poster-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">海报与卡片</h1>
          <p className="page-sub">选模板和配色，实时预览，导出 {SCALE} 倍高清 PNG</p>
        </div>
      </header>

      <div className="poster-layout">
        <section className="poster-controls">
          <div className="control-group">
            <span className="control-label">模板</span>
            <div className="template-grid">
              {(Object.values(TEMPLATES) as (typeof TEMPLATES)[TemplateId][]).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`template-option${template === t.id ? " on" : ""}`}
                  onClick={() => setTemplate(t.id)}
                  aria-pressed={template === t.id}
                >
                  <span
                    className="template-shape"
                    style={{ height: t.width > t.height ? 36 * (t.height / t.width) + 10 : 36, aspectRatio: `${t.width} / ${t.height}` }}
                  />
                  <b>{t.name}</b>
                  <small>{t.ratio}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <span className="control-label">配色</span>
            <div className="palette-list">
              {(Object.values(PALETTES) as (typeof PALETTES)[PaletteId][]).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`palette-option${paletteId === p.id ? " on" : ""}`}
                  onClick={() => setPaletteId(p.id)}
                  aria-pressed={paletteId === p.id}
                >
                  <span className="palette-swatch" style={{ background: p.bg }}>
                    <i style={{ background: p.visited }} />
                    <i style={{ background: p.accent }} />
                  </span>
                  {p.name}
                  {paletteId === p.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          {template === "year" && (
            <div className="control-group">
              <span className="control-label">年份</span>
              <div className="chips wrap">
                {years.map((y) => (
                  <button key={y} className={`chip${activeYear === y ? " on" : ""}`} onClick={() => setYear(y)}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(template === "wallpaper" || template === "passport") && (
            <div className="control-group">
              <span className="control-label">范围</span>
              <div className="chips wrap">
                <button className={`chip${scope === "all" ? " on" : ""}`} onClick={() => setScope("all")}>
                  全部
                </button>
                {years.map((y) => (
                  <button key={y} className={`chip${scope === y ? " on" : ""}`} onClick={() => setScope(y)}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {template === "card" && (
            <div className="control-group">
              <label className="control-label" htmlFor="poster-flight">
                航班
              </label>
              <select
                id="poster-flight"
                className="select"
                value={flight?.id ?? ""}
                onChange={(e) => setFlightId(e.target.value)}
              >
                {sortedFlights.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.flightDate} · {f.airline}
                    {f.flightNumber} · {f.depAirport}→{f.arrAirport}
                  </option>
                ))}
              </select>
            </div>
          )}

          {template === "passport" && (
            <div className="control-group">
              <label className="control-label" htmlFor="poster-holder">
                持有人（英文名，印在机读区）
              </label>
              <input
                id="poster-holder"
                className="input"
                placeholder="如 Donny Xia"
                value={holder}
                maxLength={32}
                autoComplete="off"
                onChange={(e) => {
                  setHolder(e.target.value);
                  try {
                    localStorage.setItem("poster-holder", e.target.value);
                  } catch {
                    /* 隐私模式 */
                  }
                }}
              />
            </div>
          )}

          {template !== "card" && template !== "passport" && (
            <div className="control-group">
              <span className="control-label">航线颜色</span>
              <Segmented
                value={effectiveColorBy}
                onChange={setColorBy}
                ariaLabel="航线颜色"
                options={[
                  { value: "single", label: "单色" },
                  ...(template === "year" ? [] : [{ value: "year" as const, label: "按年份" }]),
                  { value: "airline", label: "按航司" },
                ]}
              />
              {effectiveColorBy === "airline" && <small className="control-hint">前 3 家航司各一种颜色，其余为“其他”</small>}
            </div>
          )}

          <div className="poster-actions">
            <button className="button primary" onClick={() => void save()} disabled={status?.kind === "busy"}>
              <Download size={17} /> {status?.kind === "busy" ? "生成中…" : "保存图片"}
            </button>
            <span className={`save-status${status?.kind === "error" ? " bad" : ""}`} aria-live="polite">
              {status?.text ?? `${spec.width * SCALE} × ${spec.height * SCALE} px`}
            </span>
          </div>
        </section>

        <section className="poster-preview">
          <div
            className={`poster-frame${template === "wallpaper" ? " draggable" : ""}`}
            style={{ "--ratio": `${spec.width / spec.height}` } as React.CSSProperties}
            onPointerDown={(e) => {
              if (template !== "wallpaper") return;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const start = { x: e.clientX, y: e.clientY, rot: rotation ?? defaultRotation };
              // 预览里地球的屏幕半径 → 每像素对应的角度
              const degPerPx = 180 / Math.PI / ((260 * el.clientWidth) / spec.width);
              const move = (ev: PointerEvent) =>
                setRotation([
                  start.rot[0] - (ev.clientX - start.x) * degPerPx,
                  Math.max(-80, Math.min(80, start.rot[1] + (ev.clientY - start.y) * degPerPx)),
                ]);
              const up = () => {
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
              };
              el.addEventListener("pointermove", move);
              el.addEventListener("pointerup", up);
            }}
          >
            <Template
              ref={svgRef}
              data={data}
              palette={palette}
              world={world.data}
              refData={ref.data}
              unit={unit}
              year={template === "year" ? activeYear : scope === "all" ? undefined : scope}
              flight={flight}
              rotation={rotation ?? undefined}
              holder={holder}
            />
          </div>
          {template === "wallpaper" && (
            <p className="preview-note">
              拖动地球调整角度
              {rotation && (
                <button className="link" onClick={() => setRotation(null)}>
                  <RotateCcw size={13} /> 复位
                </button>
              )}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
