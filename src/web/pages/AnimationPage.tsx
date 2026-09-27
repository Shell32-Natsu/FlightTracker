import "@fontsource-variable/noto-sans-sc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Download, Pause, Play, RotateCcw, X } from "lucide-react";
import { useFlights, useSettings } from "../lib/api";
import { useRefData, useWorldTopo } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { flightYear, resolveHomeAirport } from "../../shared/stats";
import { ErrorBox, Empty, Loading } from "../components/Status";
import { Segmented } from "../ui/Segmented";
import { PALETTES, type PaletteId } from "../poster/palettes";
import { saveImage } from "../poster/exportPng";
import { groupTrips, sortByDeparture } from "../anim/trips";
import { createScene, loadSceneFonts, type ProjectionKind } from "../anim/renderer";
import { encodeScene } from "../anim/encode";

type Scope = "trip" | "year";
type Aspect = "9:16" | "1:1" | "16:9";

const SIZES: Record<Aspect, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

const SPEEDS = [
  { value: "0.75", label: "舒缓" },
  { value: "1", label: "标准" },
  { value: "1.6", label: "轻快" },
  { value: "2.5", label: "快速" },
] as const;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Status =
  | { kind: "busy"; progress: number }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string }
  | null;

export function AnimationPage() {
  const flights = useFlights();
  const ref = useRefData();
  const world = useWorldTopo("50m");
  const settings = useSettings();
  const [unit] = useUnit();
  const [params] = useSearchParams();

  const [scope, setScope] = useState<Scope>(params.get("year") ? "year" : "trip");
  const [tripId, setTripId] = useState<string | null>(params.get("trip"));
  const [year, setYear] = useState<number | null>(params.get("year") ? Number(params.get("year")) : null);
  const [paletteId, setPaletteId] = useState<PaletteId>("night");
  const [projection, setProjection] = useState<ProjectionKind>("globe");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["value"]>("1");
  const [endCard, setEndCard] = useState(true);
  const [fps, setFps] = useState<"30" | "60">("60");
  const [status, setStatus] = useState<Status>(null);
  const abortRef = useRef<AbortController | null>(null);

  const all = useMemo(() => (flights.data ?? []).filter((f) => f.status === "confirmed"), [flights.data]);
  const today = new Date().toISOString().slice(0, 10);
  const home = ref.data
    ? resolveHomeAirport(all, settings.data?.homeAirport ?? null, ref.data.airports)
    : null;
  const trips = useMemo(() => groupTrips(all, home).reverse(), [all, home]);
  const years = useMemo(() => [...new Set(all.map(flightYear))].sort((a, b) => b - a), [all]);
  const flightTrip = params.get("flight")
    ? trips.find((t) => t.flights.some((f) => f.id === params.get("flight")))
    : undefined;
  const trip =
    trips.find((t) => t.id === tripId) ??
    flightTrip ??
    trips.find((t) => t.flights[0].flightDate <= today) ??
    trips[0];
  const thisYear = new Date().getFullYear();
  const activeYear = year ?? years.find((y) => y <= thisYear) ?? years[0];

  const selected = useMemo(
    () =>
      scope === "trip"
        ? (trip?.flights ?? [])
        : sortByDeparture(all.filter((f) => flightYear(f) === activeYear)),
    [scope, trip, all, activeYear],
  );

  const [width, height] = SIZES[aspect];
  const scene = useMemo(() => {
    if (!ref.data || !world.data || selected.length === 0) return null;
    return createScene({
      flights: selected,
      ref: ref.data,
      world: world.data,
      palette: PALETTES[paletteId],
      projection,
      width,
      height,
      speed: Number(speed),
      endCard,
      unit,
      title: scope === "year" ? `${activeYear} 年度飞行` : undefined,
    });
  }, [
    selected,
    ref.data,
    world.data,
    paletteId,
    projection,
    width,
    height,
    speed,
    endCard,
    unit,
    scope,
    activeYear,
  ]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || flights.isPending || !world.data) return <Loading label="正在准备动画" />;
  if (all.length === 0) {
    return (
      <div className="page">
        <Empty title="还没有航班">添加航班后就能生成航线动画。</Empty>
      </div>
    );
  }

  const busy = status?.kind === "busy";
  const exportVideo = async () => {
    if (!scene) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus({ kind: "busy", progress: 0 });
    try {
      await loadSceneFonts(scene.text);
      let last = 0;
      const res = await encodeScene(scene, {
        fps: Number(fps),
        signal: ac.signal,
        onProgress: (p) => {
          if (p - last > 0.01 || p === 1) {
            last = p;
            setStatus({ kind: "busy", progress: p });
          }
        },
      });
      const name =
        scope === "year"
          ? `hangji-${activeYear}.${res.ext}`
          : `hangji-trip-${selected[0].flightDate}.${res.ext}`;
      const how = await saveImage(res.blob, name);
      const mb = (res.blob.size / 1024 / 1024).toFixed(1);
      setStatus({
        kind: "done",
        text: `${how === "shared" ? "已打开分享" : "已下载"} · ${res.ext.toUpperCase()} · ${mb} MB`,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") setStatus(null);
      else setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="page poster-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">航线动画</h1>
          <p className="page-sub">飞机沿着真实航线飞一遍，导出短视频</p>
        </div>
      </header>

      <div className="poster-layout">
        <section className="poster-controls">
          <div className="control-group">
            <span className="control-label">内容</span>
            <Segmented
              value={scope}
              onChange={(v) => {
                setScope(v);
                // 整年航段多，默认放快一些
                if (v === "year" && speed === "1") setSpeed("1.6");
                if (v === "trip" && speed === "1.6") setSpeed("1");
              }}
              ariaLabel="动画内容"
              options={[
                { value: "trip", label: "一次旅行" },
                { value: "year", label: "整年" },
              ]}
            />
            {scope === "trip" ? (
              <select
                className="select"
                aria-label="旅行"
                value={trip?.id ?? ""}
                onChange={(e) => setTripId(e.target.value)}
              >
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="chips wrap">
                {years.map((y) => (
                  <button
                    key={y}
                    className={`chip${activeYear === y ? " on" : ""}`}
                    onClick={() => setYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
            <small className="control-hint">
              {selected.length} 段航程 · 视频约 {scene ? fmtTime(scene.duration) : "—"}
              {scope === "trip" && " · 连续航班、回到常驻机场之前的航段算作一次旅行"}
            </small>
          </div>

          <div className="control-group">
            <span className="control-label">画幅</span>
            <div className="template-grid three">
              {(Object.keys(SIZES) as Aspect[]).map((a) => {
                const [w, h] = SIZES[a];
                return (
                  <button
                    key={a}
                    type="button"
                    className={`template-option${aspect === a ? " on" : ""}`}
                    onClick={() => setAspect(a)}
                    aria-pressed={aspect === a}
                  >
                    <span
                      className="template-shape"
                      style={{ height: w > h ? 36 * (h / w) + 10 : 36, aspectRatio: `${w} / ${h}` }}
                    />
                    <b>{a === "9:16" ? "竖屏" : a === "1:1" ? "方形" : "横屏"}</b>
                    <small>{a}</small>
                  </button>
                );
              })}
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

          <div className="control-group">
            <span className="control-label">地图</span>
            <Segmented
              value={projection}
              onChange={setProjection}
              ariaLabel="投影"
              options={[
                { value: "globe", label: "地球" },
                { value: "flat", label: "平面" },
              ]}
            />
          </div>

          <div className="control-group">
            <span className="control-label">节奏</span>
            <Segmented value={speed} onChange={setSpeed} ariaLabel="速度" options={[...SPEEDS]} />
          </div>

          <div className="control-group">
            <span className="control-label">视频</span>
            <Segmented
              value={fps}
              onChange={setFps}
              ariaLabel="帧率"
              options={[
                { value: "60", label: "60 帧" },
                { value: "30", label: "30 帧" },
              ]}
            />
            <label className="check-row">
              <input type="checkbox" checked={endCard} onChange={(e) => setEndCard(e.target.checked)} />
              片尾显示统计卡片
            </label>
          </div>

          <div className="poster-actions">
            {busy ? (
              <>
                <div
                  className="export-progress"
                  role="progressbar"
                  aria-valuenow={Math.round(status.progress * 100)}
                >
                  <i style={{ width: `${status.progress * 100}%` }} />
                  <span>正在生成视频 {Math.round(status.progress * 100)}%</span>
                </div>
                <button className="button" onClick={() => abortRef.current?.abort()}>
                  <X size={16} /> 取消
                </button>
              </>
            ) : (
              <button className="button primary" onClick={() => void exportVideo()} disabled={!scene}>
                <Download size={17} /> 导出视频
              </button>
            )}
            {!busy && (
              <span className={`save-status${status?.kind === "error" ? " bad" : ""}`} aria-live="polite">
                {status?.text ?? `${width} × ${height} · ${fps} fps`}
              </span>
            )}
          </div>
        </section>

        <section className="poster-preview">{scene && <Player scene={scene} paused={busy} />}</section>
      </div>
    </div>
  );
}

/** 预览播放器：canvas 按显示尺寸 × 设备像素比渲染，自动循环。 */
function Player({ scene, paused }: { scene: ReturnType<typeof createScene>; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const run = playing && !paused;

  // 换了参数：从头播放
  useEffect(() => {
    tRef.current = 0;
    setReady(false);
    let live = true;
    void loadSceneFonts(scene.text)
      .catch(() => {})
      .then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const paint = () => {
      const cssW = canvas.clientWidth || 360;
      const px = Math.min(scene.width, Math.round(cssW * Math.min(2, window.devicePixelRatio || 1)));
      const pxH = Math.round((px * scene.height) / scene.width);
      if (canvas.width !== px || canvas.height !== pxH) {
        canvas.width = px;
        canvas.height = pxH;
      }
      const k = px / scene.width;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      scene.draw(ctx, tRef.current);
      if (scrubRef.current) scrubRef.current.value = String(tRef.current);
      if (timeRef.current)
        timeRef.current.textContent = `${fmtTime(tRef.current)} / ${fmtTime(scene.duration)}`;
    };
    paint();
    if (!run) return;
    let raf = 0;
    let prev = performance.now();
    let hold = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (tRef.current >= scene.duration) {
        // 播完停一秒再从头开始
        hold += dt;
        if (hold > 1) {
          hold = 0;
          tRef.current = 0;
        }
      } else {
        tRef.current = Math.min(scene.duration, tRef.current + dt);
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, ready, run]);

  return (
    <>
      <div
        className="poster-frame anim-frame"
        style={{ "--ratio": `${scene.width / scene.height}` } as React.CSSProperties}
      >
        <canvas ref={canvasRef} onClick={() => setPlaying((p) => !p)} />
        {!ready && <div className="anim-loading">加载字体…</div>}
      </div>
      <div
        className="player-bar"
        style={{ "--ratio": `${scene.width / scene.height}` } as React.CSSProperties}
      >
        <button
          className="icon-button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "暂停" : "播放"}
          disabled={paused}
        >
          {run ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <input
          ref={scrubRef}
          type="range"
          className="scrubber"
          min={0}
          max={scene.duration}
          step={0.01}
          defaultValue={0}
          aria-label="进度"
          onInput={(e) => {
            tRef.current = Number(e.currentTarget.value);
            setPlaying(false);
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) {
              const k = canvas.width / scene.width;
              ctx.setTransform(k, 0, 0, k, 0, 0);
              scene.draw(ctx, tRef.current);
            }
            if (timeRef.current)
              timeRef.current.textContent = `${fmtTime(tRef.current)} / ${fmtTime(scene.duration)}`;
          }}
        />
        <span ref={timeRef} className="player-time">
          0:00 / {fmtTime(scene.duration)}
        </span>
        <button
          className="icon-button"
          aria-label="从头播放"
          onClick={() => {
            tRef.current = 0;
            setPlaying(true);
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </>
  );
}
