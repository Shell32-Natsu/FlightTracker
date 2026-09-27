# FlightTracker · 个人航班记录

只给自己用的航班记录网站：手动记录历史航班，查看航线地图和飞行统计。全部运行在 Cloudflare 上（一个 Worker 同时托管前端和 API，数据存 D1，登录交给 Cloudflare Access）。

设计文档：个人航班记录网站 · 设计文档（Claude Docs）。

## 当前进度

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 基础骨架 | Worker + Access 校验、D1 建表、手动添加航班、航班列表 | ✅ |
| M2 地图统计 | 参考数据脚本、航线地图、统计页、时区测试 | ✅ |
| M3 自动补全 | AeroDataBox 查询 + 缓存、CSV 导入导出 | — |
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

```bash
npm run build:demo    # 输出 dist-demo/：纯静态，无需 Worker 和 D1
```

演示版把 `/api` 换成浏览器内的模拟实现（`src/web/lib/demoApi.ts`），带 50 段虚构航班；
资源用相对路径、路由放在内存里，可以放在任意静态托管的子路径下。改动只保存在当前页面，刷新后恢复。
生产构建不会包含演示代码和数据。

## 部署

1. 创建 D1 数据库，把返回的 `database_id` 填进 `wrangler.jsonc`：
   ```bash
   npx wrangler d1 create flighttracker
   ```
2. 对线上库执行迁移：`npm run db:migrate:remote`
3. 部署：`npm run deploy`
4. 在 Cloudflare Zero Trust 里为这个 Worker 建一个 **Access 应用**，覆盖全部入口（自定义域名、`*.workers.dev`、预览地址），策略只放行你自己的邮箱。
5. 把 Access 的团队域名（如 `myteam.cloudflareaccess.com`）和应用的 **AUD Tag** 填进 `wrangler.jsonc` 的 `vars`（`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`），重新部署。Worker 会用它们再次校验 `Cf-Access-Jwt-Assertion`，防止绕过 Access 直接访问 API。

## 约定

- **时间**：数据库一律存 UTC；表单输入和页面显示用起降机场各自的当地时间（IANA 时区），到达跨日显示 `+1`。
- **距离**：起降机场间大圆距离（公里，可切换英里），写入时由服务端计算。
- **时长**：实际轮挡时间优先，没有实际数据时用计划时间，写入时计算。
- **去重**：航司 + 航班号 + 起飞日期 + 出发机场唯一。
- **统计**：前端从航班列表实时计算；国家按起降机场所在国家计数；年份按起飞当地日期归属。
