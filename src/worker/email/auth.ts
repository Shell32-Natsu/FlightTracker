/**
 * 判断转发来的邮件是不是真的来自用户自己的邮箱。依据收信服务器（Cloudflare Email Routing）
 * 写入的 Authentication-Results，两种转发方式都支持：
 *
 * 1. 手动转发：信头 From 是用户自己的地址，要求 DMARC 通过（或 DKIM 通过且签名域与 From 对齐）。
 * 2. 自动转发（如 Gmail 过滤器）：信头 From 保留航司的地址，信封发件人是用户邮箱
 *    （Gmail 会加上 +caf_… 之类的标签），要求 SPF 通过且与信封域名对齐。
 *
 * 只有 SPF 或只看信封都可以伪造信头，所以两条路径各自要求对应的那个身份通过验证。
 */

/** 小写并去掉本地部分的 +标签：a.b+caf_=x@gmail.com → a.b@gmail.com */
export function normalizeAddress(addr: string): string {
  const a = addr
    .trim()
    .toLowerCase()
    .replace(/^.*<([^>]+)>.*$/, "$1");
  const at = a.lastIndexOf("@");
  if (at < 0) return a;
  return `${a.slice(0, at).replace(/\+.*$/, "")}@${a.slice(at + 1)}`;
}

const domainOf = (addr: string) => addr.slice(addr.lastIndexOf("@") + 1);

/** d 与 domain 相同或互为父子域（DMARC 的宽松对齐）。 */
const aligned = (d: string, domain: string) =>
  d === domain || domain.endsWith(`.${d}`) || d.endsWith(`.${domain}`);

function headerFromAuthenticated(results: string[], from: string): boolean {
  const domain = domainOf(from);
  for (const h of results) {
    for (const m of h.matchAll(/\bdmarc=pass\b[^;]*?header\.from=([a-z0-9.-]+)/g)) {
      if (aligned(m[1], domain)) return true;
    }
    for (const m of h.matchAll(/\bdkim=pass\b[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/g)) {
      if (aligned(m[1], domain)) return true;
    }
  }
  return false;
}

function envelopeAuthenticated(results: string[], envelope: string): boolean {
  const domain = domainOf(envelope);
  for (const h of results) {
    for (const m of h.matchAll(/\bspf=pass\b[^;]*?smtp\.mailfrom=(?:[^@\s;]*@)?([a-z0-9.-]+)/g)) {
      if (aligned(m[1], domain)) return true;
    }
  }
  return false;
}

export interface SenderCheck {
  envelopeFrom: string;
  headerFrom: string | null;
  authResults: string[];
  /** 用户允许的发件地址（已规范化） */
  allowed: string[];
}

export type SenderVerdict = { ok: true; via: "header" | "envelope" } | { ok: false; reason: string };

export function checkSender({ envelopeFrom, headerFrom, authResults, allowed }: SenderCheck): SenderVerdict {
  const results = authResults.map((h) => h.toLowerCase());
  const header = headerFrom ? normalizeAddress(headerFrom) : null;
  const envelope = normalizeAddress(envelopeFrom);
  if (header && allowed.includes(header) && headerFromAuthenticated(results, header))
    return { ok: true, via: "header" };
  if (allowed.includes(envelope) && envelopeAuthenticated(results, envelope))
    return { ok: true, via: "envelope" };
  if (!(header && allowed.includes(header)) && !allowed.includes(envelope)) {
    return { ok: false, reason: `发件人 ${header ?? envelope} 不在你允许的发件地址里` };
  }
  return { ok: false, reason: "发件人没有通过 DMARC / DKIM / SPF 验证，可能是伪造的" };
}
