import { Link } from "react-router-dom";
import { useMemo } from "react";
import { AlertTriangle, Check, Mail, Pencil, Trash2 } from "lucide-react";
import { useConfirmFlight, useDeleteFlight, useEmails, useFlights } from "../lib/api";
import { useRefData } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { FlightTicket, ticketFromFlight } from "../ticket/FlightTicket";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Empty, ErrorBox, Loading } from "../components/Status";

export function PendingPage() {
  const flights = useFlights("pending");
  const ref = useRefData();
  const [unit] = useUnit();
  const confirmFlight = useConfirmFlight();
  const del = useDeleteFlight();
  const emails = useEmails();
  const subjects = useMemo(() => new Map((emails.data ?? []).map((e) => [e.id, e.subject])), [emails.data]);

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (flights.isPending) return <Loading />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">待确认</h1>
          <p className="page-sub">邮件导入的航段先放在这里，逐条确认、修改或丢弃。</p>
        </div>
      </header>

      {flights.data.length === 0 ? (
        <Empty title="没有待确认的航段">
          把航司或 OTA 的确认邮件转发到你的专属地址（见<Link to="/settings">设置 · 邮件导入</Link>
          ），识别出的航段会出现在这里。
        </Empty>
      ) : (
        <div className="ticket-grid">
          {flights.data.map((f) => (
            <FlightTicket
              key={f.id}
              data={ticketFromFlight(f, ref.data)}
              refData={ref.data}
              unit={unit}
              footer={
                <>
                  {f.notes && (
                    <div className="ticket-note">
                      <AlertTriangle size={14} /> {f.notes}
                    </div>
                  )}
                  {(f.confirmationCode || (f.emailId && subjects.get(f.emailId))) && (
                    <div className="ticket-source">
                      <Mail size={14} />
                      <span className="ticket-source-text">
                        {f.emailId && subjects.get(f.emailId)
                          ? `来自邮件“${subjects.get(f.emailId)}”`
                          : "邮件导入"}
                        {f.confirmationCode && ` · 订座记录 ${f.confirmationCode}`}
                      </span>
                    </div>
                  )}
                  <div className="ticket-actions">
                    <ConfirmButton
                      className="button danger icon-or-text"
                      ariaLabel="丢弃"
                      disabled={del.isPending}
                      onConfirm={() => del.mutate(f.id)}
                      confirmLabel="确认丢弃"
                    >
                      <Trash2 size={17} />
                    </ConfirmButton>
                    <span className="spacer" />
                    <Link className="button" to={`/flights/${f.id}`}>
                      <Pencil size={16} /> 修改
                    </Link>
                    <button
                      className="button primary"
                      disabled={confirmFlight.isPending}
                      onClick={() => confirmFlight.mutate(f.id)}
                    >
                      <Check size={17} /> 确认
                    </button>
                  </div>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
