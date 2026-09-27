import { Clapperboard, FileSpreadsheet, FlaskConical, Image, MailPlus, Ruler, ScanSearch } from "lucide-react";
import { DEMO } from "../lib/env";
import { useUnit } from "../lib/useUnit";
import { Segmented } from "../ui/Segmented";
import { Logo } from "../ui/Logo";

const ROADMAP = [
  { icon: ScanSearch, title: "航班号自动补全", desc: "输入航班号和日期，自动带出时间、机型和机尾号", tag: "M3" },
  { icon: FileSpreadsheet, title: "CSV 导入导出", desc: "批量导入历史航班，随时导出备份", tag: "M3" },
  { icon: MailPlus, title: "邮件转发导入", desc: "把确认邮件转发到专用地址，自动识别航段", tag: "M4" },
  { icon: Image, title: "海报与卡片导出", desc: "年度海报、单次航班卡片、手机壁纸", tag: "M5" },
  { icon: Clapperboard, title: "航线动画", desc: "飞机沿航线飞行的短视频，导出 MP4", tag: "M6" },
];

export function SettingsPage() {
  const [unit, setUnit] = useUnit();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">导出、导入和偏好设置</p>
        </div>
      </header>

      <div className="settings">
        {DEMO && (
          <section className="card demo-note">
            <FlaskConical size={18} />
            <div>
              <b>演示模式</b>
              <p>航班是虚构的示例数据，改动只保存在当前页面，刷新后恢复初始状态。正式部署后数据存进 Cloudflare D1。</p>
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
