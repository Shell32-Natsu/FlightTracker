export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Access 团队域名，如 myteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 应用的 Application Audience (AUD) Tag */
  ACCESS_AUD?: string;
  /** 邮件导入的收件域名，如 in.example.com；每个用户的地址是 <inbox_token>@这个域名。为空表示未启用 */
  INBOUND_DOMAIN?: string;
  /** 用 Claude 识别没有结构化数据的邮件（wrangler secret） */
  ANTHROPIC_API_KEY?: string;
  /** 本地开发时设为 "true" 跳过 Access 校验（只写在 .dev.vars 里） */
  DEV_SKIP_AUTH?: string;
}

export interface CurrentUser {
  /** Access 凭证里的 sub，稳定的用户 ID */
  id: string;
  email: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: CurrentUser } };
