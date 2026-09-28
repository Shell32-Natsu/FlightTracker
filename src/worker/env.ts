export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Access 团队域名，如 myteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 应用的 Application Audience (AUD) Tag */
  ACCESS_AUD?: string;
  /**
   * 邮件导入收件地址模板，{token} 会替换成每个用户的随机串，
   * 如 "flights+{token}@in.example.com"（一个固定地址 + Email Routing 的子地址功能）。
   * 也支持 "{token}@example.com" 形式（需要 catch-all）。为空表示未启用邮件导入。
   */
  INBOUND_EMAIL?: string;
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
