import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileUp, RotateCcw } from "lucide-react";
import { useFlights, useImportFlights, type ImportResult } from "../lib/api";
import { useRefData } from "../lib/refdata";
import { importContext } from "../lib/importContext";
import { dedupeKey, parseFlightCsv, type ImportRow, type ParsedImport } from "../../shared/flightCsv";
import { AirlineLogo } from "../ui/AirlineBadge";
import { flightDurationMin } from "../../shared/derive";
import { formatDuration } from "../../shared/time";
import { ErrorBox, Loading } from "../components/Status";

type Status = "new" | "duplicate" | "error" | "skipped";
type Filter = Status | "all";

const STATUS_LABEL: Record<Status, string> = { new: "新增", duplicate: "已存在", error: "有问题", skipped: "跳过" };
const FORMAT_LABEL = { flighty: "Flighty 导出", native: "航迹导出" };

interface Classified extends ImportRow {
  status: Status;
  reason: string | null;
}

export function ImportPage() {
  const ref = useRefData();
  const existing = useFlights("all");
  const importFlights = useImportFlights();
  const [file, setFile] = useState<{ name: string; parsed: ParsedImport } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [includeFuture, setIncludeFuture] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const rows = useMemo<Classified[]>(() => {
    if (!file) return [];
    const seen = new Set((existing.data ?? []).map(dedupeKey));
    return file.parsed.rows.map((r) => {
      if (r.error) return { ...r, status: "error", reason: r.error };
      if (r.skipped || !r.input) return { ...r, status: "skipped", reason: r.skipped };
      const key = dedupeKey(r.input);
      if (seen.has(key)) return { ...r, status: "duplicate", reason: "已有同一航班" };
      seen.add(key);
      return { ...r, status: "new", reason: null };
    });
  }, [file, existing.data]);

  const toImport = rows.filter((r) => r.status === "new" && (includeFuture || !r.future));
  const futureCount = rows.filter((r) => r.status === "new" && r.future).length;
  const counts = rows.reduce<Record<Status, number>>(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { new: 0, duplicate: 0, error: 0, skipped: 0 },
  );
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || existing.isPending) return <Loading />;
  const refData = ref.data;

  const readFile = async (f: File) => {
    setParseError(null);
    setResult(null);
    setFilter("all");
    try {
      const parsed = parseFlightCsv(await f.text(), importContext(refData));
      if (!parsed.rows.length) throw new Error("文件里没有航班");
      setFile({ name: f.name, parsed });
    } catch (err) {
      setFile(null);
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setParseError(null);
    if (input.current) input.current.value = "";
  };

  const submit = async () => {
    const res = await importFlights.mutateAsync(toImport.map((r) => r.input!));
    setResult(res);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">导入航班</h1>
          <p className="page-sub">支持 Flighty 导出的 CSV 和航迹自己导出的 CSV。导入前会先预览，重复的航班自动跳过。</p>
        </div>
      </header>

      {result ? (
        <section className="card import-result">
          <CheckCircle2 size={28} />
          <div>
            <h2>已导入 {result.inserted} 段航班</h2>
            <p className="muted">
              {result.duplicates > 0 && `${result.duplicates} 段已存在，已跳过。`}
              {result.invalid.length > 0 && `${result.invalid.length} 段未通过校验：`}
            </p>
            {result.invalid.length > 0 && (
              <ul className="import-invalid">
                {result.invalid.map((i) => (
                  <li key={i.index}>
                    {toImport[i.index]?.label}：{i.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions">
              <Link to="/flights" className="button primary">
                查看航班
              </Link>
              <Link to="/" className="button">
                在地图上看
              </Link>
              <button className="button ghost" onClick={reset}>
                <RotateCcw size={16} /> 再导入一个文件
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <label
            className={`dropzone${dragging ? " over" : ""}${file ? " compact" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void readFile(f);
            }}
          >
            <input
              ref={input}
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
              }}
            />
            <FileUp size={file ? 20 : 30} />
            {file ? (
              <span>
                <b>{file.name}</b>
                <small>
                  {FORMAT_LABEL[file.parsed.format]} · {rows.length} 行 · 点击换一个文件
                </small>
              </span>
            ) : (
              <span>
                <b>选择或拖入 CSV 文件</b>
                <small>Flighty：设置 → 导出航班数据</small>
              </span>
            )}
          </label>

          {parseError && <ErrorBox error={parseError} />}

          {file && (
            <>
              <div className="import-summary">
                {(["all", "new", "duplicate", "error", "skipped"] as Filter[]).map((f) => {
                  const n = f === "all" ? rows.length : counts[f];
                  if (f !== "all" && n === 0) return null;
                  return (
                    <button
                      key={f}
                      className={`chip${filter === f ? " on" : ""} status-${f}`}
                      onClick={() => setFilter(f)}
                    >
                      {f === "all" ? "全部" : STATUS_LABEL[f]} {n}
                    </button>
                  );
                })}
              </div>

              <ul className="import-rows">
                {shown.map((r) => (
                  <li key={r.line} className={`import-row ${r.status}`}>
                    <span className="ir-date">
                      {r.input?.flightDate ?? r.label.slice(0, 10)}
                      <span className="ir-code-m"> · {r.label.split(" ")[1]}</span>
                    </span>
                    <span className="ir-flight">
                      {r.input ? <AirlineLogo code={r.input.airline} size="sm" /> : null}
                      <b>{r.input ? `${r.input.airline}${r.input.flightNumber}` : r.label.split(" ")[1]}</b>
                    </span>
                    <span className="ir-route">
                      {r.input ? `${r.input.depAirport} → ${r.input.arrAirport}` : r.label.split(" ")[2]}
                    </span>
                    <span className="ir-meta">{r.input ? rowMeta(r.input) : ""}</span>
                    <span className="ir-status">
                      <span className={`pill ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      {r.future && r.status === "new" && <span className="pill future">未起飞</span>}
                    </span>
                    {(r.reason || r.warnings.length > 0) && (
                      <span className="ir-note">
                        {r.reason && r.status !== "new" ? r.reason : null}
                        {r.warnings.map((w) => (
                          <span key={w} className="ir-warn">
                            <AlertTriangle size={12} /> {w}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="import-footer">
                {futureCount > 0 && (
                  <label className="check">
                    <input
                      id="include-future"
                      type="checkbox"
                      checked={includeFuture}
                      onChange={(e) => setIncludeFuture(e.target.checked)}
                    />
                    包含 {futureCount} 段尚未起飞的航班
                  </label>
                )}
                <span className="spacer" />
                <button className="button ghost" onClick={reset}>
                  取消
                </button>
                <button
                  className="button primary"
                  disabled={toImport.length === 0 || importFlights.isPending}
                  onClick={() => void submit()}
                >
                  {importFlights.isPending ? "导入中…" : `导入 ${toImport.length} 段航班`}
                </button>
              </div>
              {importFlights.error && <ErrorBox error={importFlights.error} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function rowMeta(f: NonNullable<ImportRow["input"]>): string {
  const min = flightDurationMin(f);
  return [f.aircraftType, min && min > 0 ? formatDuration(min) : null].filter(Boolean).join(" · ");
}
