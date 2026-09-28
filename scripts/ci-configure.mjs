/**
 * 部署前（CI 里）补全 wrangler.jsonc：
 *  1. 找到名为 flighttracker 的 D1 数据库，不存在就创建，把 id 写进配置
 *  2. 把 Access 的团队域名和 AUD、邮件导入地址模板（可选）从环境变量写进 vars
 *
 * 只改 CI 工作目录里的文件，不提交回仓库。
 * 需要环境变量：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID、ACCESS_TEAM_DOMAIN、ACCESS_AUD
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DB_NAME = "flighttracker";
const CONFIG = "wrangler.jsonc";

for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD"]) {
  if (!process.env[key]) {
    console.error(`缺少环境变量 ${key}。请按 README“部署”在 GitHub 仓库里配置 secrets / variables。`);
    process.exit(1);
  }
}

const wrangler = (...args) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

function findDatabaseId() {
  const out = wrangler("d1", "list", "--json");
  const list = JSON.parse(out.slice(out.indexOf("[")));
  const db = list.find((d) => d.name === DB_NAME);
  return db?.uuid ?? db?.id ?? null;
}

let id = findDatabaseId();
if (!id) {
  console.log(`D1 数据库 ${DB_NAME} 不存在，正在创建…`);
  wrangler("d1", "create", DB_NAME);
  id = findDatabaseId();
}
if (!id) throw new Error(`创建后仍找不到 D1 数据库 ${DB_NAME}`);
console.log(`D1 数据库 ${DB_NAME}: ${id}`);

let config = readFileSync(CONFIG, "utf8");
const set = (key, value) => {
  const re = new RegExp(`"${key}":\\s*"[^"]*"`);
  if (!re.test(config)) throw new Error(`${CONFIG} 里找不到 ${key}`);
  config = config.replace(re, `"${key}": ${JSON.stringify(value)}`);
};
set("database_id", id);
set("ACCESS_TEAM_DOMAIN", process.env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, ""));
set("ACCESS_AUD", process.env.ACCESS_AUD.trim());
set("INBOUND_EMAIL", (process.env.INBOUND_EMAIL ?? "").trim());
writeFileSync(CONFIG, config);
console.log(`已写入 ${CONFIG}`);
