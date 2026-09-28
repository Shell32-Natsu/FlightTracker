/**
 * 邮件导入集成测试：真实 MIME 邮件 → receiveEmail → 本地 D1 → 通过 API 查看结果。
 * LLM 调用用桩函数替代。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiAs, migrate, MIGRATIONS, startDb } from "./testing";
import { processEmail, receiveEmail, type Deps } from "./email/ingest";
import { JSONLD_HTML } from "./email/fixtures";
import type { ExtractedSegment } from "./email/segments";
import type { Env } from "./env";

let proxy: Awaited<ReturnType<typeof startDb>>;
let env: Env;
let api: ReturnType<typeof apiAs>;
let aliceInbox: string;

const DOMAIN = "in.test";
const TEMPLATE = `{token}@${DOMAIN}`;
/** Cloudflare Email Routing 写入的验证结果（本人 gmail 手动转发的情形） */
const PASS =
  "mx.cloudflare.net; dkim=pass header.d=gmail.com; spf=pass smtp.mailfrom=alice@gmail.com; dmarc=pass header.from=gmail.com";

function mime(opts: {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  auth?: string;
}) {
  const lines = [
    ...(opts.auth ? [`Authentication-Results: ${opts.auth}`] : []),
    `From: Alice <${opts.from}>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
  ];
  if (opts.html) {
    lines.push(
      'Content-Type: multipart/alternative; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/plain; charset=utf-8",
      "",
    );
    lines.push(
      opts.text ?? "(plain)",
      "--b1",
      "Content-Type: text/html; charset=utf-8",
      "",
      opts.html,
      "--b1--",
    );
  } else {
    lines.push("Content-Type: text/plain; charset=utf-8", "", opts.text ?? "");
  }
  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer;
}

/** 以真实 Worker 的方式收信（开启发件人校验）。 */
function deliver(to: string, raw: ArrayBuffer, envelopeFrom = "alice@gmail.com", deps: Deps = {}) {
  return receiveEmail({ ...env, DEV_SKIP_AUTH: "false" }, { from: envelopeFrom, to, raw }, deps);
}

const stub = (segments: ExtractedSegment[]): Deps => ({ extractWithLlm: async () => segments });
const seg = (over: Partial<ExtractedSegment> = {}): ExtractedSegment => ({
  airline: "MU",
  flightNumber: "5101",
  depAirport: "PVG",
  arrAirport: "PEK",
  depDate: "2026-11-02",
  depTime: "08:00",
  arrDate: null,
  arrTime: "10:15",
  confirmationCode: "ABC123",
  seat: "31A",
  cabin: "economy",
  cancelled: false,
  ...over,
});

type Row = {
  id: string;
  status: string;
  airline: string;
  flightNumber: string;
  notes: string | null;
  emailId: string | null;
  schedDepUtc: string | null;
  schedArrUtc: string | null;
  seat: string | null;
};
const pending = async (user = "alice") =>
  (await (await api(user, "/flights?status=pending")).json()) as Row[];
const emailLog = async (user = "alice") =>
  (await (await api(user, "/emails")).json()) as {
    id: string;
    parseStatus: string;
    parseMethod: string | null;
    error: string | null;
    flightCount: number;
    subject: string;
  }[];

beforeAll(async () => {
  proxy = await startDb();
  env = { DB: proxy.env.DB, ASSETS: undefined as never, INBOUND_EMAIL: TEMPLATE };
  api = apiAs(env);
  for (const m of MIGRATIONS) await migrate(env.DB, m);
  // alice 的登录邮箱是 alice@localhost；允许的发件地址再加上她的 gmail
  await api("alice", "/settings", {
    method: "PUT",
    body: JSON.stringify({ importSenders: ["Alice@Gmail.com"] }),
  });
  const inbox = (await (await api("alice", "/inbox")).json()) as { address: string; senders: string[] };
  aliceInbox = inbox.address;
  expect(inbox.senders).toEqual(["alice@localhost", "alice@gmail.com"]);
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

describe("收件地址", () => {
  it("每人一个随机地址，第二次请求不变", async () => {
    expect(aliceInbox).toMatch(/^f-[a-z0-9]{10}@in\.test$/);
    const again = (await (await api("alice", "/inbox")).json()) as { address: string };
    expect(again.address).toBe(aliceInbox);
    const bob = (await (await api("bob", "/inbox")).json()) as { address: string };
    expect(bob.address).not.toBe(aliceInbox);
  });

  it("认不出的收件地址直接丢弃，不入库", async () => {
    const r = await deliver(
      `f-nobody0000@${DOMAIN}`,
      mime({ from: "alice@gmail.com", to: "x", subject: "s", html: JSONLD_HTML, auth: PASS }),
    );
    expect(r.status).toBe("unknown-recipient");
    const n = await env.DB.prepare("SELECT count(*) n FROM emails").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

describe("JSON-LD 邮件", () => {
  it("识别航段并写成待确认；时间按机场时区换成 UTC", async () => {
    const r = await deliver(
      aliceInbox,
      mime({
        from: "alice@gmail.com",
        to: aliceInbox,
        subject: "Fwd: Your United trip",
        html: JSONLD_HTML,
        auth: PASS,
      }),
    );
    expect(r.status).toBe("parsed");
    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      airline: "UA",
      flightNumber: "110",
      emailId: r.status === "parsed" ? r.emailId : "",
      // SFO 20:15 PST（UTC−8）→ 次日 04:15Z；JFK 06:30 EST（UTC−5）→ 11:30Z
      schedDepUtc: "2027-03-05T04:15:00Z",
      schedArrUtc: "2027-03-05T11:30:00Z",
      seat: "9A",
    });
    const [log] = await emailLog();
    expect(log).toMatchObject({
      parseStatus: "parsed",
      parseMethod: "jsonld",
      flightCount: 1,
      subject: "Fwd: Your United trip",
    });
  });

  it("同一封邮件再发一次：不重复新增", async () => {
    await deliver(
      aliceInbox,
      mime({ from: "alice@gmail.com", to: aliceInbox, subject: "again", html: JSONLD_HTML, auth: PASS }),
    );
    expect(await pending()).toHaveLength(1);
    expect((await emailLog())[0]).toMatchObject({ parseStatus: "parsed", flightCount: 0 });
  });
});

describe("发件人校验", () => {
  it("伪造的发件人：记录为 ignored，不存正文，不能重新解析", async () => {
    const r = await deliver(
      aliceInbox,
      mime({
        from: "alice@gmail.com",
        to: aliceInbox,
        subject: "spoof",
        html: JSONLD_HTML,
        auth: "mx.cloudflare.net; dkim=none; spf=fail smtp.mailfrom=x@evil.example; dmarc=fail header.from=gmail.com",
      }),
      "x@evil.example",
    );
    expect(r.status).toBe("ignored");
    const [log] = await emailLog();
    expect(log).toMatchObject({
      subject: "spoof",
      parseStatus: "ignored",
      error: expect.stringContaining("验证"),
    });
    const body = await env.DB.prepare("SELECT body_html FROM emails WHERE id = ?")
      .bind(log.id)
      .first<{ body_html: string | null }>();
    expect(body?.body_html).toBeNull();
    expect((await api("alice", `/emails/${log.id}/reparse`, { method: "POST" })).status).toBe(409);
  });

  it("不在允许列表里的发件人", async () => {
    const r = await deliver(
      aliceInbox,
      mime({
        from: "carol@gmail.com",
        to: aliceInbox,
        subject: "stranger",
        text: "hi",
        auth: PASS.replaceAll("alice", "carol"),
      }),
      "carol@gmail.com",
    );
    expect(r.status).toBe("ignored");
    expect((await emailLog())[0].error).toContain("不在");
  });
});

describe("正文识别（LLM）", () => {
  it("没有结构化数据时交给 LLM；没配 key 时失败并说明原因", async () => {
    const raw = mime({
      from: "alice@gmail.com",
      to: aliceInbox,
      subject: "东航行程单",
      text: "MU5101 上海浦东-北京首都 11月2日 08:00-10:15",
      auth: PASS,
    });
    expect((await deliver(aliceInbox, raw)).status).toBe("failed");
    expect((await emailLog())[0].error).toContain("没有可用的 AI 模型");

    const r = await deliver(aliceInbox, raw, "alice@gmail.com", stub([seg()]));
    expect(r.status).toBe("parsed");
    expect((await emailLog())[0]).toMatchObject({ parseMethod: "llm", flightCount: 1 });
    const mu = (await pending()).find((f) => f.flightNumber === "5101");
    // 上海 08:00（UTC+8）→ 00:00Z
    expect(mu).toMatchObject({ schedDepUtc: "2026-11-02T00:00:00Z", schedArrUtc: "2026-11-02T02:15:00Z" });
  });

  it("改签：已有航段的信息变了就更新并加备注", async () => {
    await deliver(
      aliceInbox,
      mime({ from: "alice@gmail.com", to: aliceInbox, subject: "改签", text: "x", auth: PASS }),
      "alice@gmail.com",
      stub([seg({ depTime: "09:30", arrTime: "11:45", seat: "12C" })]),
    );
    const rows = (await pending()).filter((f) => f.flightNumber === "5101");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      schedDepUtc: "2026-11-02T01:30:00Z",
      seat: "12C",
      notes: expect.stringContaining("更新"),
    });
  });

  it("取消：已有的航段转为待确认并加备注", async () => {
    // 先把它确认掉，模拟用户已经确认过
    const [row] = (await pending()).filter((f) => f.flightNumber === "5101");
    await api("alice", `/flights/${row.id}/confirm`, { method: "POST" });
    await deliver(
      aliceInbox,
      mime({ from: "alice@gmail.com", to: aliceInbox, subject: "取消", text: "x", auth: PASS }),
      "alice@gmail.com",
      stub([seg({ cancelled: true })]),
    );
    const again = (await pending()).find((f) => f.id === row.id);
    expect(again?.notes).toContain("取消");
  });

  it("机场三字码不对：整封失败，不写入任何航段", async () => {
    const before = (await pending()).length;
    const r = await deliver(
      aliceInbox,
      mime({ from: "alice@gmail.com", to: aliceInbox, subject: "bad", text: "x", auth: PASS }),
      "alice@gmail.com",
      stub([seg({ flightNumber: "777" }), seg({ flightNumber: "778", arrAirport: "ZZZ" })]),
    );
    expect(r.status).toBe("failed");
    expect((await emailLog())[0].error).toContain("ZZZ");
    expect((await pending()).length).toBe(before);
  });

  it("不是航班邮件：标记 ignored", async () => {
    const r = await deliver(
      aliceInbox,
      mime({ from: "alice@gmail.com", to: aliceInbox, subject: "newsletter", text: "sale!", auth: PASS }),
      "alice@gmail.com",
      stub([]),
    );
    expect(r.status).toBe("ignored");
  });
});

describe("重新解析与隔离", () => {
  it("重新解析：用存下来的正文再跑一遍", async () => {
    const log = await emailLog();
    const failed = log.find((l) => l.subject === "东航行程单" && l.parseStatus === "failed")!;
    const status = await processEmail(
      env,
      "dev:alice",
      { id: failed.id, subject: failed.subject, html: null, text: "MU5101" },
      stub([seg()]),
    );
    expect(status).toBe("parsed");
    const res = await api(
      "alice",
      `/emails/${log.find((l) => l.subject === "Fwd: Your United trip")!.id}/reparse`,
      { method: "POST" },
    );
    expect(await res.json()).toMatchObject({ parseStatus: "parsed", parseMethod: "jsonld" });
  });

  it("别人看不到、也不能重新解析我的邮件", async () => {
    expect(await emailLog("bob")).toEqual([]);
    const [mine] = await emailLog();
    expect((await api("bob", `/emails/${mine.id}/reparse`, { method: "POST" })).status).toBe(404);
    expect(await pending("bob")).toEqual([]);
  });

  it("重新生成地址后，旧地址失效", async () => {
    const res = (await (await api("alice", "/inbox/rotate", { method: "POST" })).json()) as {
      address: string;
    };
    expect(res.address).not.toBe(aliceInbox);
    const r = await deliver(
      aliceInbox,
      mime({ from: "alice@gmail.com", to: aliceInbox, subject: "old", html: JSONLD_HTML, auth: PASS }),
    );
    expect(r.status).toBe("unknown-recipient");
    expect(
      (
        await deliver(
          res.address,
          mime({ from: "alice@gmail.com", to: res.address, subject: "new", html: JSONLD_HTML, auth: PASS }),
        )
      ).status,
    ).toBe("parsed");
  });
});

describe("收件地址模板", () => {
  it("子地址形式：flights+{token}@example.com，信封收件人带显示名也能认出", async () => {
    const { inboxAddress, tokenFromRecipient, inboundTemplate } = await import("./email/ingest");
    const t = inboundTemplate({ INBOUND_EMAIL: "Flights+{token}@Example.com" });
    expect(t).toBe("flights+{token}@example.com");
    const addr = inboxAddress("f-abc", t);
    expect(addr).toBe("flights+f-abc@example.com");
    expect(tokenFromRecipient(`Flights <${addr!.toUpperCase()}>`)).toBe("f-abc");
    expect(tokenFromRecipient("f-abc@in.test")).toBe("f-abc");
    expect(inboundTemplate({ INBOUND_EMAIL: "in.example.com" })).toBeNull();
  });
});
