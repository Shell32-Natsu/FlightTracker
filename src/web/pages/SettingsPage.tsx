import { useUnit } from "../lib/useUnit";

export function SettingsPage() {
  const [unit, setUnit] = useUnit();
  return (
    <div className="page">
      <div className="page-head">
        <h1>导出与设置</h1>
      </div>

      <section className="card">
        <h2>距离单位</h2>
        <div className="segmented">
          <button className={unit === "km" ? "on" : ""} onClick={() => setUnit("km")}>
            公里
          </button>
          <button className={unit === "mi" ? "on" : ""} onClick={() => setUnit("mi")}>
            英里
          </button>
        </div>
      </section>

      <section className="card">
        <h2>即将推出</h2>
        <ul className="roadmap">
          <li>
            <b>CSV 导入导出</b> <span className="muted">M3</span>
          </li>
          <li>
            <b>邮件处理记录</b> <span className="muted">M4</span>
          </li>
          <li>
            <b>海报、航班卡片、手机壁纸导出</b> <span className="muted">M5</span>
          </li>
          <li>
            <b>航线动画 MP4</b> <span className="muted">M6</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
