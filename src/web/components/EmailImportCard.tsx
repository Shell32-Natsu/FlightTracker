import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Mail, Plus, RefreshCw, RotateCw, X } from "lucide-react";
import {
  useEmails,
  useInbox,
  useReparseEmail,
  useRotateInbox,
  useSettings,
  useUpdateSettings,
} from "../lib/api";
import type { EmailRecord } from "../../shared/types";
import { ConfirmButton } from "../ui/ConfirmButton";

const STATUS: Record<EmailRecord["parseStatus"], { label: string; tone: string }> = {
  parsed: { label: "已识别", tone: "ok" },
  failed: { label: "失败", tone: "bad" },
  ignored: { label: "已忽略", tone: "muted" },
  pending: { label: "处理中", tone: "muted" },
};

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 设置页：每人一个专属收件地址，转发确认邮件后航段进入“待确认”。 */
export function EmailImportCard() {
  const inbox = useInbox();
  const emails = useEmails();
  const rotate = useRotateInbox();
  const reparse = useReparseEmail();
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const address = inbox.data?.address;
  const copy = async () => {
    if (!address) return;
    await navigator.clipboard?.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const list = emails.data ?? [];
  const shown = showAll ? list : list.slice(0, 5);

  return (
    <section className="card email-card">
      <div className="setting-row">
        <div>
          <h2 className="section-title">
            <Mail size={18} className="faint" /> 邮件导入
          </h2>
          <p>把航司或旅行平台的确认邮件转发到你的专属地址，几秒后航段出现在“待确认”里，确认后才会记入</p>
        </div>
      </div>

      {inbox.isPending ? (
        <p className="faint small-note">加载中…</p>
      ) : inbox.error ? (
        <p className="bad small-note">{inbox.error.message}</p>
      ) : !address ? (
        <p className="faint small-note">
          服务端还没有配置收件地址（INBOUND_EMAIL），配置方法见 README“邮件导入”。
        </p>
      ) : (
        <>
          <div className="inbox-row">
            <code className="inbox-address">{address}</code>
            <button className="button" onClick={() => void copy()}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "已复制" : "复制"}
            </button>
            <ConfirmButton
              className="button ghost"
              ariaLabel="重新生成地址"
              confirmLabel="旧地址将失效，确认？"
              disabled={rotate.isPending}
              onConfirm={() => rotate.mutate()}
            >
              <RotateCw size={16} /> 换一个
            </ConfirmButton>
          </div>
          {!inbox.data.llm && (
            <p className="faint small-note">
              服务端没有可用的 AI 模型，目前只能识别带结构化数据的邮件（多数航司和旅行平台都有）。
            </p>
          )}
          <SenderList loginEmail={inbox.data.loginEmail} />
        </>
      )}

      {list.length > 0 && (
        <div className="email-log">
          <span className="field-label">最近收到</span>
          <ul>
            {shown.map((e) => {
              const st = STATUS[e.parseStatus];
              return (
                <li key={e.id}>
                  <span className={`email-status ${st.tone}`}>
                    {st.label}
                    {e.parseStatus === "parsed" && ` ${e.flightCount} 段`}
                  </span>
                  <span className="email-main">
                    <b title={e.subject ?? ""}>{e.subject || "(无主题)"}</b>
                    <small>
                      {timeFmt.format(new Date(e.receivedAt))} · {e.fromAddr}
                      {e.parseMethod === "llm" && " · AI 识别"}
                    </small>
                    {e.error && (
                      <small className={e.parseStatus === "failed" ? "bad" : "faint"}>
                        {e.parseStatus === "failed" && <AlertTriangle size={12} />} {e.error}
                      </small>
                    )}
                  </span>
                  <span className="email-actions">
                    {e.parseStatus === "parsed" && e.flightCount > 0 && (
                      <Link to="/pending" className="link">
                        去确认
                      </Link>
                    )}
                    {(e.parseStatus === "failed" || e.parseStatus === "parsed") && (
                      <button
                        className="icon-button"
                        title="重新解析"
                        aria-label="重新解析"
                        disabled={reparse.isPending && reparse.variables === e.id}
                        onClick={() => reparse.mutate(e.id)}
                      >
                        <RefreshCw
                          size={15}
                          className={reparse.isPending && reparse.variables === e.id ? "spin" : ""}
                        />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {list.length > 5 && (
            <button className="link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "收起" : `显示全部 ${list.length} 封`}
            </button>
          )}
          {reparse.isError && <p className="bad small-note">{reparse.error.message}</p>}
        </div>
      )}
    </section>
  );
}

/** 允许转发的发件地址：登录邮箱固定在列，另外可加几个自己的邮箱。 */
function SenderList({ loginEmail }: { loginEmail: string }) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const extra = settings.data?.importSenders ?? [];

  const save = (next: string[]) =>
    update.mutate(
      { importSenders: next },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }) },
    );
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (!v || v === loginEmail.toLowerCase() || extra.includes(v)) return setDraft("");
    save([...extra, v]);
    setDraft("");
  };

  return (
    <div className="sender-list">
      <span className="field-label">只接受从这些邮箱转发的邮件</span>
      <div className="sender-chips">
        <span className="sender-chip locked" title="登录邮箱">
          {loginEmail}
        </span>
        {extra.map((s) => (
          <span key={s} className="sender-chip">
            {s}
            <button aria-label={`移除 ${s}`} onClick={() => save(extra.filter((x) => x !== s))}>
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="sender-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          type="email"
          placeholder="再加一个邮箱，如 me@gmail.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
        />
        <button className="button" type="submit" disabled={!draft.trim() || update.isPending}>
          <Plus size={16} /> 添加
        </button>
      </form>
      {update.isError && <p className="bad small-note">{update.error.message}</p>}
    </div>
  );
}
