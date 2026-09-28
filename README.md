# FlightTracker · 个人航班记录

只给自己用的航班记录网站：手动记录历史航班，查看航线地图和飞行统计。全部运行在 Cloudflare 上（一个 Worker 同时托管前端和 API，数据存 D1，登录交给 Cloudflare Access）。

设计文档：个人航班记录网站 · 设计文档（Claude Docs）。

## 当前进度

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 基础骨架 | Worker + Access 校验、D1 建表、手动添加航班、航班列表 | ✅ |
| M2 地图统计 | 参考数据脚本、航线地图、统计页、时区测试 | ✅ |
| M3 自动补全 | AeroDataBox 查询 + 缓存、CSV 导入导出 | ✅ |
| M4 邮件导入 | 每人专属收件地址、发件人校验、JSON-LD / Claude 识别航段、待确认 | ✅ |
| M5 图片导出 | D3 海报模板、字体内嵌、PNG 导出 | ✅ |
| M6 航线动画 | Canvas 逐帧渲染、镜头推拉、WebCodecs 导出 MP4（不支持 H.264 时退回 WebM） | ✅ |

## 技术栈

- 前端：Vite + React + TanStack Query + React Router
- 地图：MapLibre GL 3D 地球（globe 投影）+ turf 大圆航线，不依赖外部瓦片；表单里的小地球用 d3-geo 正射投影
- 视觉：三套主题（深色“夜航”、浅色、复古，设置页切换，跟随账号保存），Inter 可变字体（本地打包）、lucide 图标；统计图表为手写 SVG，无图表库。主题的颜色都是 CSS 变量（`styles.css` 里的 `:root[data-theme]`），地图等 JS 绘制部分的配色在 `src/web/lib/theme.ts`
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
cp .dev.vars.example .dev.vars        # DEV_SKIP_AUTH=true，本地跳过 Access 校验（可用 X-Dev-User 请求头模拟不同用户）
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
- 模板选 **Edit Cloudflare Workers**，再加两项权限：**Account → D1 → Edit**、**Zone → DNS → Edit**（绑定自定义域名用）
- Account Resources 选你的账号，Zone Resources 选 `xiadong.info`
- 创建后 token 只显示一次，立即复制

**2. Cloudflare Access**（Zero Trust → Access controls → Applications → Create new application → Self-hosted and private）
- 先确认 `xiadong.info` 的 DNS 里没有 `flights` 记录（部署时会自动创建）
- Add public hostname：子域名 `flights`，域名 `xiadong.info`，路径留空
- Access policies：新建策略，Action = Allow，Include → Emails = 你自己的邮箱
- 保存后在应用的 Configure → Overview（或 Additional settings）里复制 **Application Audience (AUD) Tag**
- 团队域名在 Zero Trust → Settings → Team name and domain（形如 `xxx.cloudflareaccess.com`）

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

## 邮件导入

每个用户有一个专属收件地址（设置 → 邮件导入），把航司或旅行平台的确认邮件转发过去，识别出的航段进入“待确认”。

**处理流程**（`src/worker/email/`）：收件地址里的随机串认出用户 → 校验发件人 → 存下正文 → 先找 schema.org `FlightReservation` 结构化数据，没有再交给 AI 识别正文 → 校验机场、航班号后写成待确认航班。已有航段的改签会更新并转回待确认，取消会加备注提示删除。

**发件人校验**：只接受用户登录邮箱和在设置里额外添加的邮箱，并要求 Email Routing 记录的验证结果通过——手动转发看信头 From 的 DMARC / DKIM，自动转发（如 Gmail 过滤器）看信封发件人的 SPF。认不出收件人的邮件直接丢弃。

**识别正文用的模型**：默认 Cloudflare Workers AI（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`，JSON Schema 约束输出），用 Workers 免费计划每天 10,000 Neurons 的额度，一封确认邮件约几百 Neurons，邮件内容不出 Cloudflare。配置了 `ANTHROPIC_API_KEY` 时改用 Claude（按量付费）。

### 配置

**1. 收件地址**：用“子地址”形式——一个固定地址加 `+{token}`，比如 `flights+f-k8m2x9q7ra@xiadong.info`。把模板填到 GitHub 仓库变量 `INBOUND_EMAIL`：`flights+{token}@xiadong.info`。

**2. Email Routing**（Compute → Email Service → Email Routing，或在域名下找 Email Routing）：
- 域名**已经在用 Email Routing**（MX 是 `*.mx.cloudflare.net`）：直接加规则即可，不影响已有地址——
  - Settings 里打开 **Subaddressing**（`flights+xxx@` 会匹配 `flights@` 的规则）
  - 添加自定义地址 `flights@xiadong.info` → 动作 **Send to a Worker** → `flighttracker`
- 域名的邮件**托管在别处**（Google Workspace、iCloud 等）：不要在这个域名上开 Email Routing，开启流程会要求删除现有 MX 记录，子域名也一样。换一个不收邮件的域名来做收件地址。

**3. API Token**：部署时如果报 Workers AI 相关的权限错误，给部署用的 token 加上 **Account → Workers AI → Read / Edit**（My Profile → API Tokens → 编辑）。

**4.（可选）改用 Claude**：在 Anthropic Console 创建 API key，存为 GitHub 仓库 Secret `ANTHROPIC_API_KEY`，部署时会写入 Worker 的 secret。

改完变量后重新运行一次 **Deploy to Cloudflare**。本地开发（`npm run dev`）不连 Cloudflare，Workers AI 只在线上可用；测试里用桩函数代替。

## 多用户

每个人的航班和设置互相隔离。用户身份取自 Cloudflare Access 登录凭证里的 `sub`（换邮箱也不变），第一次访问时自动建用户。

- **加人**：在 Access 应用的策略里加上对方邮箱即可，对方登录后看到的是自己的空数据。
- **去重规则**：“航司 + 航班号 + 日期 + 出发机场”只在同一用户内唯一，两个人坐同一班飞机可以各记各的。
- **旧数据**：迁移 `0002_multi_user` 之前的数据先归到占位用户 `legacy`，由第一个登录的用户认领（见 `src/worker/users.ts`）。

## 航班信息补全

按航班号 + 起飞当地日期查航线、计划 / 实际时间、机型和机尾号，数据来自 [AeroDataBox](https://aerodatabox.com/)（RapidAPI）。

- **在哪里用**：添加 / 编辑航班页的“查询航班信息”按钮；邮件导入时自动补机型、机尾号和邮件里缺的时刻（查不到或额度用完时照常导入）。
- **范围**：免费 Basic 套餐只能查前后 365 天内的航班，超出范围的直接提示、不调接口；每月 400 个 API 单位。
- **缓存**：`lookup_cache` 表，所有用户共用。按 AeroDataBox 的使用条款最多保留 7 天，过期的在写新缓存时删除；起飞两天以前的航班在保留期内一直用缓存，最近和未来的有结果缓存 6 小时、查不到缓存 1 小时。
- **署名**：条款要求注明数据来源，查询按钮旁写有“航班数据来自 AeroDataBox”。
- **配置**：在 [RapidAPI 的 AeroDataBox 页面](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) 订阅免费的 Basic 套餐，把 key 存成 GitHub 仓库的 secret `AERODATABOX_API_KEY`，重新部署即可（本地开发写进 `.dev.vars`）。没配置时查询按钮不显示，其他功能不受影响。

## 航司徽标与机型

- **徽标**：`/api/logos/:code` 由 Worker 取图并做边缘缓存，先用 Duffel 的矢量徽标，没有再用 Aviasales 的位图，都没有时前端显示航司代码方块。徽标是各航司的商标，只在运行时取用，不放进仓库。
- **机型侧视图**：`src/web/aircraft/` 按真实尺寸参数化绘制（机身长短粗细、发动机位置、T 尾、驼峰等），涂装是简化的：垂尾主色 + 尾翼徽标 + 机身标题，常见航司的颜色在 `livery.ts` 里，其余从徽标取色。机型参数和系列在 `src/shared/aircraft.ts`。
- **机型介绍**：`/api/aircraft-info/:type` 代理维基百科摘要（先中文再英文），缓存 7 天；页面上注明来源和 CC BY-SA 许可。

## 约定

- **时间**：数据库一律存 UTC；表单输入和页面显示用起降机场各自的当地时间（IANA 时区），到达跨日显示 `+1`。
- **距离**：起降机场间大圆距离（公里，可切换英里），写入时由服务端计算。
- **时长**：实际轮挡时间优先，没有实际数据时用计划时间，写入时计算。
- **去重**：航司 + 航班号 + 起飞日期 + 出发机场唯一。
- **统计**：前端从航班列表实时计算；国家按起降机场所在国家计数；年份按起飞当地日期归属。
- **CSV**：导入在浏览器里解析并预览（`src/shared/flightCsv.ts`，自动识别 Flighty 导出和本应用导出），确认后 `POST /api/import` 逐条服务端校验，按去重键跳过已有航班；`GET /api/export/csv` 导出已确认航班，时间为机场当地时间，可原样导入。Flighty 的航司 ICAO 码按参考数据转成 IATA，机型名称转成 ICAO 机型代码，识别不了的写进备注；已取消的航班跳过，备降按实际降落机场记录。
- **海报**：`/poster` 页面，四个模板（年度海报 4:5、生涯总览 16:9、航班卡片 1:1、手机壁纸 9:19.5）× 三套配色，d3-geo 自绘 SVG（平面用 Equal Earth，地球用正射投影），导出时只把用到字符所在的字体分片（Inter + Noto Sans SC，按 unicode-range 切片）以 base64 内嵌，再按 3 倍像素画到 canvas 输出 PNG。航线可按年份（单色相顺序色阶）或航司（前 3 家分类色，其余“其他”）着色，配色都用 dataviz 校验脚本对各自底色验证过。
- **设置**：距离单位、地图起始机场等偏好存在 D1 的 `settings` 表（每项一行，值为 JSON），经 `GET/PUT /api/settings` 读写，不放在浏览器本地。
