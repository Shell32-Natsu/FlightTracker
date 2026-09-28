import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clapperboard,
  Download,
  Upload,
  FileSpreadsheet,
  FlaskConical,
  Image,
  LocateFixed,
  Ruler,
  ScanSearch,
} from "lucide-react";
import { DEMO } from "../lib/env";
import { downloadExportCsv, useFlights, useSettings, useUpdateSettings } from "../lib/api";
import { Link } from "react-router-dom";
import { useRefData, useWorldTopo, type RefData } from "../lib/refdata";
import { computeStats, mostVisitedAirport } from "../../shared/stats";
import { RouteGlobe } from "../components/RouteGlobe";
import { useUnit } from "../lib/useUnit";
import { Segmented } from "../ui/Segmented";
import { Logo } from "../ui/Logo";
import { EmailImportCard } from "../components/EmailImportCard";

const ROADMAP = [
  {
    icon: ScanSearch,
    title: "航班号自动补全",
    desc: "输入航班号和日期，自动带出时间、机型和机尾号",
    tag: "M3",
  },
];

export function SettingsPage() {
  const [unit, setUnit] = useUnit();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">偏好设置保存在你的数据库里，换设备也一样</p>
        </div>
      </header>

      <div className="settings">
        {DEMO && (
          <section className="card demo-note">
            <FlaskConical size={18} />
            <div>
              <b>演示模式</b>
              <p>
                航班是虚构的示例数据，改动只保存在当前页面，刷新后恢复初始状态。正式部署后数据存进 Cloudflare
                D1。
              </p>
            </div>
          </section>
        )}
        <section className="card">
          <div className="setting-row">
            <div>
              <h2 className="section-title">
                <Ruler size={18} className="faint" /> 距离单位
              </h2>
              <p>地图、列表和统计里的里程显示</p>
            </div>
            <Segmented
              value={unit}
              onChange={setUnit}
              ariaLabel="距离单位"
              options={[
                { value: "km", label: "公里" },
                { value: "mi", label: "英里" },
              ]}
            />
          </div>
        </section>

        <HomeAirportSetting />

        <EmailImportCard />

        <ImportExportCard />

        <section className="card">
          <div className="setting-row">
            <div>
              <h2 className="section-title">
                <Image size={18} className="faint" /> 海报与卡片
              </h2>
              <p>年度海报、生涯总览、单次航班卡片、手机壁纸，导出高清 PNG</p>
            </div>
            <Link to="/poster" className="button">
              打开
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="setting-row">
            <div>
              <h2 className="section-title">
                <Clapperboard size={18} className="faint" /> 航线动画
              </h2>
              <p>飞机沿真实航线飞过一次旅行或一整年，导出竖屏、方形或横屏短视频</p>
            </div>
            <Link to="/animation" className="button">
              打开
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="section-title">即将推出</h2>
          </div>
          <ul className="roadmap">
            {ROADMAP.map(({ icon: Icon, title, desc, tag }) => (
              <li key={title}>
                <span className="ico">
                  <Icon size={18} />
                </span>
                <span className="txt">
                  <b>{title}</b>
                  <span>{desc}</span>
                </span>
                <span className="tag">{tag}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="setting-row">
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Logo size={44} />
              <div>
                <h2 className="section-title">航迹</h2>
                <p>个人航班记录 · 数据来自 OurAirports、OpenFlights、Natural Earth</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function airportName(code: string, ref: RefData | undefined): string {
  const a = ref?.airports[code];
  if (!a) return code;
  return a.city && !a.name.includes(a.city) ? `${a.city} · ${a.name}` : a.name;
}

/** 地图起始位置：自动（起降次数最多的机场）或手动指定一个机场。 */
function HomeAirportSetting() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const flights = useFlights();
  const ref = useRefData();
  const world = useWorldTopo("110m");

  const saved = settings.data?.homeAirport ?? null;
  const [mode, setMode] = useState<"auto" | "custom">(saved ? "custom" : "auto");
  const [draft, setDraft] = useState(saved ?? "");

  // 设置晚于页面加载完成时，同步一次
  useEffect(() => {
    if (!settings.data) return;
    setMode(settings.data.homeAirport ? "custom" : "auto");
    setDraft(settings.data.homeAirport ?? "");
  }, [settings.data?.homeAirport]); // eslint-disable-line react-hooks/exhaustive-deps

  const airports = ref.data?.airports;
  const auto = useMemo(() => mostVisitedAirport(flights.data ?? []), [flights.data]);
  const ranked = useMemo(
    () => (airports ? computeStats(flights.data ?? [], airports).airports.slice(0, 6) : []),
    [flights.data, airports],
  );
  const autoCount = ranked.find((r) => r.key === auto)?.count ?? 0;

  const valid = (code: string) => /^[A-Z]{3}$/.test(code) && !!airports?.[code];
  const save = (code: string | null) => {
    if (code !== saved) update.mutate({ homeAirport: code });
  };

  const choose = (code: string) => {
    setDraft(code);
    if (valid(code)) save(code);
  };

  const switchMode = (m: "auto" | "custom") => {
    setMode(m);
    if (m === "auto") return save(null);
    const initial = draft || auto || "";
    choose(initial);
  };

  const shown = mode === "custom" ? (valid(draft) ? draft : null) : auto;
  const shownAirport = shown && airports ? { ...airports[shown], code: shown } : undefined;
  const invalid = mode === "custom" && draft.length === 3 && !valid(draft);

  return (
    <section className="card">
      <div className="setting-row">
        <div>
          <h2 className="section-title">
            <LocateFixed size={18} className="faint" /> 地图起始位置
          </h2>
          <p>打开地图时地球转向这个机场，它也是地图上金色标记的“大本营”</p>
        </div>
        <Segmented
          value={mode}
          onChange={switchMode}
          ariaLabel="地图起始位置"
          options={[
            { value: "auto", label: "自动" },
            { value: "custom", label: "指定机场" },
          ]}
        />
      </div>

      <div className="home-setting">
        <div className="home-globe">
          <RouteGlobe world={world.data} dep={shownAirport} width={240} height={200} />
        </div>

        <div className="home-body">
          {mode === "auto" ? (
            auto ? (
              <>
                <div className="home-current">
                  <span className="iata-chip lg">{auto}</span>
                  <span>
                    <b>{airportName(auto, ref.data)}</b>
                    <small>起降 {autoCount} 次，是你去得最多的机场</small>
                  </span>
                </div>
                <p className="faint small-note">以后别的机场去得更多了，地图会自动跟着换。</p>
              </>
            ) : (
              <p className="faint small-note">还没有航班记录。添加航班后，会以起降次数最多的机场为中心。</p>
            )
          ) : (
            <>
              <label className="field">
                <span className="field-label">机场三字码</span>
                <input
                  id="home-airport"
                  className="input big"
                  value={draft}
                  maxLength={3}
                  placeholder="PVG"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => choose(e.target.value.trim().toUpperCase())}
                />
                <span className={`field-hint${invalid ? " bad" : valid(draft) ? " ok" : ""}`}>
                  {invalid
                    ? "机场表里没有这个三字码"
                    : valid(draft)
                      ? airportName(draft, ref.data)
                      : "输入三个字母，如 PVG"}
                </span>
              </label>
              {ranked.length > 0 && (
                <div className="home-picks">
                  <span className="field-label">常去的机场</span>
                  <div className="home-pick-list">
                    {ranked.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className={`chip${draft === r.key ? " on" : ""}`}
                        onClick={() => choose(r.key)}
                        title={airportName(r.key, ref.data)}
                      >
                        {r.key}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="save-status" aria-live="polite">
            {update.isPending ? (
              "保存中…"
            ) : update.isError ? (
              <span className="bad">保存失败：{update.error.message}</span>
            ) : update.isSuccess ? (
              <>
                <Check size={14} /> 已保存
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ImportExportCard() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <div className="setting-row">
        <div>
          <h2 className="section-title">
            <FileSpreadsheet size={18} className="faint" /> 导入与导出
          </h2>
          <p>从 Flighty 或之前导出的 CSV 批量导入；导出全部航班作为备份（时间为机场当地时间）</p>
        </div>
      </div>
      <div className="io-actions" style={{ marginTop: 16 }}>
        <Link to="/import" className="button primary">
          <Upload size={16} /> 导入 CSV
        </Link>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setError(null);
            setBusy(true);
            try {
              await downloadExportCsv();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} /> {busy ? "导出中…" : "导出 CSV"}
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
    </section>
  );
}
