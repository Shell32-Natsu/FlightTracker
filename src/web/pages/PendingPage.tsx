import { Link } from "react-router-dom";
import { useConfirmFlight, useDeleteFlight, useFlights } from "../lib/api";
import { useRefData } from "../lib/refdata";
import { FlightRow } from "../components/FlightRow";
import { Empty, ErrorBox, Loading } from "../components/Status";

export function PendingPage() {
  const flights = useFlights("pending");
  const ref = useRefData();
  const confirmFlight = useConfirmFlight();
  const del = useDeleteFlight();

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (flights.isPending) return <Loading />;

  return (
    <div className="page">
      <div className="page-head">
        <h1>待确认</h1>
      </div>
      <p className="muted small">邮件导入的航段会先出现在这里，逐条确认、修改或丢弃。</p>
      {flights.data.length === 0 ? (
        <Empty>没有待确认的航段。</Empty>
      ) : (
        <div className="flight-list">
          {flights.data.map((f) => (
            <div key={f.id} className="pending-item">
              <FlightRow flight={f} refData={ref.data} />
              <div className="actions">
                <button
                  className="button danger"
                  disabled={del.isPending}
                  onClick={() => confirm("丢弃这条航段？") && del.mutate(f.id)}
                >
                  丢弃
                </button>
                <span className="spacer" />
                <Link className="button" to={`/flights/${f.id}`}>
                  修改
                </Link>
                <button
                  className="button primary"
                  disabled={confirmFlight.isPending}
                  onClick={() => confirmFlight.mutate(f.id)}
                >
                  确认
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
