# FlightTracker · 个人航班记录

只给自己用的航班记录网站：手动记录历史航班，查看航线地图和飞行统计。全部运行在 Cloudflare 上（一个 Worker 同时托管前端和 API，数据存 D1，登录交给 Cloudflare Access）。

设计文档：个人航班记录网站 · 设计文档（Claude Docs）。

## 当前进度

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 基础骨架 | Worker + Access 校验、D1 建表、手动添加航班、航班列表 | ✅ |
| M2 地图统计 | 参考数据脚本、航线地图、统计页、时区测试 | ✅ |
| M3 自动补全 | AeroDataBox 查询 + 缓存、CSV 导入导出 | CSV 导入导出 ✅（含 Flighty），补全待做 |
| M4 邮件导入 | Email Routing、JSON-LD / LLM 解析、待确认页 | 待确认页已就绪 |
| M5 图片导出 | D3 海报模板、字体内嵌、PNG 导出 | — |
| M6 航线动画 | 时间轴、镜头、MP4 导出 | — |

## 技术栈

- 前端：Vite + React + TanStack Query + React Router
- 地图：MapLibre GL 3D 地球（globe 投影）+ turf 大圆航线，不依赖外部瓦片；表单里的小地球用 d3-geo 正射投影
- 视觉：深色“夜航”主题，Inter 可变字体（本地打包）、lucide 图标；统计图表为手写 SVG，无图表库
- 后端：Hono（Cloudflare Worker）、D1 + Drizzle ORM、jose 校验 Access JWT、zod 校验输入
- 参考数据：OurAirports、OpenFlights、Natural Earth（world-atlas），由 `scripts/build-refdata.ts` 生成

## 目录

```
src/
  shared/      前后端共用：类型、大圆距离、时区换算、统计（含单元测试）
  worker/      Hono API、Access 中间件、Drizzle schema、Worker 用精简机场表
  web/         React 前端（pages / components / lib）
scripts/       build-refdata.ts 参考数据生成脚本
migrations/    drizzle-kit 生成的 D1 迁移
public/refdata 前端静态参考数据（机场、国家、航司、机型、国界 50m/110m）
public/flags   国家/地区旗帜 SVG（country-flag-icons）
```

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars        # DEV_SKIP_AUTH=true，本地跳过 Access 校验
npm run db:migrate:local              # 在本地 D1 建表
npm run dev                           # http://localhost:5173
```

其他命令：

```bash
npm test              # 单元测试（时区换算、距离、统计、表单换算）
npm run typecheck     # TypeScript 检查
npm run refdata       # 重新生成参考数据（需要联网）
npm run db:generate   # 修改 src/worker/db/schema.ts 后生成新迁移
```

## 演示版

在线演示：<https://blog.xiadong.info/FlightTracker/>（推送到 `main` 后由 `.github/workflows/pages.yml` 自动发布）

```bash
npm run dev:demo      # 本地预览演示版，不需要 Worker 和 D1
npm run build:demo    # 输出 dist-demo/：纯静态
```

演示版把 `/api` 换成浏览器内的模拟实现（`src/web/lib/demoApi.ts`），带 50 段虚构航班；
资源用相对路径、用哈希路由（`#/flights`），可以放在任意静态托管的子路径下。改动只保存在当前页面，刷新后恢复。
生产构建不会包含演示代码和数据。

## 部署

推送到 `main` 后，`.github/workflows/deploy.yml` 自动完成：测试 → 确保 D1 数据库存在（第一次会创建）→ 数据库迁移 → 构建 → 部署 Worker。
站点只挂在自定义域名 `flights.xiadong.info` 上（`wrangler.jsonc` 的 `routes`），`workers.dev` 和预览地址都关掉了，所有访问都经过 Cloudflare Access。

### 一次性设置

**1. Cloudflare API Token**（My Profile → API Tokens → Create Token）
- 模板选 **Edit Cloudflare Workers**，再加一项权限 **Account → D1 → Edit**
- Zone Resources 选 `xiadong.info`
- 如果部署时绑定自定义域名报权限错误，再加 **Zone → DNS → Edit**

**2. Cloudflare Access**（Zero Trust → Access → Applications → Add → Self-hosted）
- 应用域名：`flights.xiadong.info`（整个域名，不填路径）
- 策略：Action = Allow，Include → Emails = 你自己的邮箱
- 保存后在应用的 Overview 里复制 **Application Audience (AUD) Tag**
- 团队域名在 Zero Trust → Settings → Custom Pages（形如 `xxx.cloudflareaccess.com`）

**3. GitHub 仓库配置**（Settings → Secrets and variables → Actions）

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 第 1 步的 token |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 首页右侧的 Account ID |
| Variable | `ACCESS_TEAM_DOMAIN` | 如 `xxx.cloudflareaccess.com` |
| Variable | `ACCESS_AUD` | 第 2 步的 AUD Tag |

配好后在 Actions 里手动运行一次 **Deploy to Cloudflare**（或推送 `main`）。

### 本地手动部署

```bash
npx wrangler login
CLOUDFLARE_ACCOUNT_ID=… ACCESS_TEAM_DOMAIN=… ACCESS_AUD=… CLOUDFLARE_API_TOKEN=… node scripts/ci-configure.mjs
npm run db:migrate:remote
npm run deploy
git checkout wrangler.jsonc   # 脚本改动只用于这次部署，不要提交
```

## 约定

- **时间**：数据库一律存 UTC；表单输入和页面显示用起降机场各自的当地时间（IANA 时区），到达跨日显示 `+1`。
- **距离**：起降机场间大圆距离（公里，可切换英里），写入时由服务端计算。
- **时长**：实际轮挡时间优先，没有实际数据时用计划时间，写入时计算。
- **去重**：航司 + 航班号 + 起飞日期 + 出发机场唯一。
- **统计**：前端从航班列表实时计算；国家按起降机场所在国家计数；年份按起飞当地日期归属。
- **CSV**：导入在浏览器里解析并预览（`src/shared/flightCsv.ts`，自动识别 Flighty 导出和本应用导出），确认后 `POST /api/import` 逐条服务端校验，按去重键跳过已有航班；`GET /api/export/csv` 导出已确认航班，时间为机场当地时间，可原样导入。Flighty 的航司 ICAO 码按参考数据转成 IATA，机型名称转成 ICAO 机型代码，识别不了的写进备注；已取消的航班跳过，备降按实际降落机场记录。
- **设置**：距离单位、地图起始机场等偏好存在 D1 的 `settings` 表（每项一行，值为 JSON），经 `GET/PUT /api/settings` 读写，不放在浏览器本地。
