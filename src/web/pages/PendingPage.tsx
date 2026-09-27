import { Link } from "react-router-dom";
import { Check, Mail, Pencil, Trash2 } from "lucide-react";
import { useConfirmFlight, useDeleteFlight, useFlights } from "../lib/api";
import { useRefData } from "../lib/refdata";
import { useUnit } from "../lib/useUnit";
import { FlightTicket, ticketFromFlight } from "../ticket/FlightTicket";
import { Empty, ErrorBox, Loading } from "../components/Status";

export function PendingPage() {
  const flights = useFlights("pending");
  const ref = useRefData();
  const [unit] = useUnit();
  const confirmFlight = useConfirmFlight();
  const del = useDeleteFlight();

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
        <Empty title="没有待确认的航段">把航司或 OTA 的确认邮件转发到专用地址，识别出的航段会出现在这里。</Empty>
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
                  {f.confirmationCode && (
                    <div className="ticket-source">
                      <Mail size={14} /> 订座记录 {f.confirmationCode}
                    </div>
                  )}
                  <div className="ticket-actions">
                    <button
                      className="button danger icon"
                      aria-label="丢弃"
                      title="丢弃"
                      disabled={del.isPending}
                      onClick={() => confirm("丢弃这条航段？") && del.mutate(f.id)}
                    >
                      <Trash2 size={17} />
                    </button>
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
