export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Access 团队域名，如 myteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 应用的 Application Audience (AUD) Tag */
  ACCESS_AUD?: string;
  /** 本地开发时设为 "true" 跳过 Access 校验（只写在 .dev.vars 里） */
  DEV_SKIP_AUTH?: string;
}

export interface CurrentUser {
  /** Access 凭证里的 sub，稳定的用户 ID */
  id: string;
  email: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: CurrentUser } };
