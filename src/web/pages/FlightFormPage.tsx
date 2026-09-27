import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCreateFlight, useDeleteFlight, useFlights, useUpdateFlight } from "../lib/api";
import { useRefData, type RefData } from "../lib/refdata";
import {
  emptyForm,
  flightToForm,
  formToInput,
  splitFlightCode,
  type FlightFormState,
} from "../lib/flightForm";
import { ErrorBox, Loading } from "../components/Status";
import { CABINS, PURPOSES, type Flight } from "../../shared/types";
import { flightDistanceKm, flightDurationMin } from "../../shared/derive";
import { formatDuration } from "../../shared/time";

const CABIN_LABEL: Record<string, string> = {
  economy: "经济舱",
  premium: "超级经济舱",
  business: "商务舱",
  first: "头等舱",
};
const PURPOSE_LABEL: Record<string, string> = { leisure: "休闲", business: "商务", other: "其他" };
const OFFSETS = [-1, 0, 1, 2];

export function AddFlightPage() {
  const ref = useRefData();
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data) return <Loading />;
  return <FlightForm refData={ref.data} />;
}

export function EditFlightPage() {
  const { id } = useParams();
  const flights = useFlights("all");
  const ref = useRefData();
  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || flights.isPending) return <Loading />;
  const flight = flights.data.find((f) => f.id === id);
  if (!flight) return <ErrorBox error="航班不存在或已删除" />;
  return <FlightForm refData={ref.data} flight={flight} key={flight.id} />;
}

function FlightForm({ refData, flight }: { refData: RefData; flight?: Flight }) {
  const navigate = useNavigate();
  const create = useCreateFlight();
  const update = useUpdateFlight();
  const del = useDeleteFlight();
  const [form, setForm] = useState<FlightFormState>(() =>
    flight ? flightToForm(flight, refData.airports) : emptyForm(),
  );
  const [code, setCode] = useState(flight ? `${flight.airline}${flight.flightNumber}` : "");
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FlightFormState>(k: K, v: FlightFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // 航班号输入框拆成航司 + 数字
  useEffect(() => {
    const parts = splitFlightCode(code);
    setForm((f) =>
      parts ? { ...f, airline: parts[0], flightNumber: parts[1] } : { ...f, airline: "", flightNumber: "" },
    );
  }, [code]);

  const dep = refData.airports[form.depAirport.toUpperCase()];
  const arr = refData.airports[form.arrAirport.toUpperCase()];
  const preview = (() => {
    try {
      const input = formToInput(form, refData.airports);
      return { km: flightDistanceKm(dep, arr), min: flightDurationMin(input) };
    } catch {
      return null;
    }
  })();

  const busy = create.isPending || update.isPending || del.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (!form.airline) throw new Error("请填写航班号，如 UA857");
      const input = { ...formToInput(form, refData.airports), source: flight?.source ?? "manual" } as const;
      if (flight) await update.mutateAsync({ id: flight.id, input });
      else await create.mutateAsync(input);
      navigate(flight?.status === "pending" ? "/pending" : "/flights");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    if (!flight || !confirm(`删除 ${flight.airline}${flight.flightNumber}（${flight.flightDate}）？`)) return;
    await del.mutateAsync(flight.id);
    navigate(-1);
  };

  return (
    <form className="page flight-form" onSubmit={submit}>
      <div className="page-head">
        <h1>{flight ? "编辑航班" : "添加航班"}</h1>
      </div>

      <fieldset>
        <legend>航班</legend>
        <div className="grid">
          <Field label="航班号" hint={form.airline ? refData.airlines[form.airline]?.name : "如 UA857"}>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="UA857"
              autoCapitalize="characters"
              autoFocus={!flight}
            />
          </Field>
          <Field label="起飞日期（当地）">
            <input type="date" required value={form.flightDate} onChange={(e) => set("flightDate", e.target.value)} />
          </Field>
          <Field label="出发机场" hint={airportHint(dep)}>
            <input
              required
              value={form.depAirport}
              onChange={(e) => set("depAirport", e.target.value.toUpperCase())}
              placeholder="SFO"
              maxLength={3}
              autoCapitalize="characters"
            />
          </Field>
          <Field label="到达机场" hint={airportHint(arr)}>
            <input
              required
              value={form.arrAirport}
              onChange={(e) => set("arrAirport", e.target.value.toUpperCase())}
              placeholder="NRT"
              maxLength={3}
              autoCapitalize="characters"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>时间（机场当地时间）</legend>
        <div className="grid">
          <Field label="计划起飞">
            <input type="time" value={form.schedDep} onChange={(e) => set("schedDep", e.target.value)} />
          </Field>
          <Field label="计划到达">
            <TimeWithOffset
              time={form.schedArr}
              offset={form.schedArrOffset}
              onTime={(v) => set("schedArr", v)}
              onOffset={(v) => set("schedArrOffset", v)}
            />
          </Field>
          <Field label="实际起飞">
            <TimeWithOffset
              time={form.actualDep}
              offset={form.actualDepOffset}
              onTime={(v) => set("actualDep", v)}
              onOffset={(v) => set("actualDepOffset", v)}
            />
          </Field>
          <Field label="实际到达">
            <TimeWithOffset
              time={form.actualArr}
              offset={form.actualArrOffset}
              onTime={(v) => set("actualArr", v)}
              onOffset={(v) => set("actualArrOffset", v)}
            />
          </Field>
        </div>
        {preview && (preview.km != null || preview.min != null) && (
          <p className="muted small">
            {preview.km != null && `大圆距离 ${preview.km.toLocaleString()} km`}
            {preview.min != null && ` · 时长 ${preview.min > 0 ? formatDuration(preview.min) : "⚠ 到达早于起飞"}`}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>飞机与座位</legend>
        <div className="grid">
          <Field label="机型（ICAO）" hint={refData.aircraft[form.aircraftType.toUpperCase()]}>
            <input
              list="aircraft-types"
              value={form.aircraftType}
              onChange={(e) => set("aircraftType", e.target.value.toUpperCase())}
              placeholder="B77W"
              maxLength={4}
            />
          </Field>
          <Field label="机尾号">
            <input value={form.registration} onChange={(e) => set("registration", e.target.value)} placeholder="N2749U" />
          </Field>
          <Field label="实际承运航司" hint={refData.airlines[form.operatingAirline.toUpperCase()]?.name}>
            <input
              value={form.operatingAirline}
              onChange={(e) => set("operatingAirline", e.target.value.toUpperCase())}
              placeholder="代码共享时填写"
              maxLength={2}
            />
          </Field>
          <Field label="座位">
            <input value={form.seat} onChange={(e) => set("seat", e.target.value)} placeholder="32A" />
          </Field>
          <Field label="舱位">
            <select value={form.cabin} onChange={(e) => set("cabin", e.target.value as FlightFormState["cabin"])}>
              <option value="">—</option>
              {CABINS.map((c) => (
                <option key={c} value={c}>
                  {CABIN_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="目的">
            <select
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value as FlightFormState["purpose"])}
            >
              <option value="">—</option>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="订座记录编号">
            <input
              value={form.confirmationCode}
              onChange={(e) => set("confirmationCode", e.target.value)}
              placeholder="ABC123"
            />
          </Field>
        </div>
        <Field label="备注">
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </fieldset>

      <datalist id="aircraft-types">
        {Object.entries(refData.aircraft).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </datalist>

      {error && <div className="status error">{error}</div>}

      <div className="actions">
        {flight && (
          <button type="button" className="button danger" onClick={remove} disabled={busy}>
            删除
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="button" onClick={() => navigate(-1)} disabled={busy}>
          取消
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}

function airportHint(a: RefData["airports"][string] | undefined): string | undefined {
  if (!a) return undefined;
  return a.city && !a.name.includes(a.city) ? `${a.city} · ${a.name}` : a.name;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function TimeWithOffset(props: {
  time: string;
  offset: number;
  onTime: (v: string) => void;
  onOffset: (v: number) => void;
}) {
  return (
    <div className="time-offset">
      <input type="time" value={props.time} onChange={(e) => props.onTime(e.target.value)} />
      <select
        aria-label="相对起飞日期"
        value={props.offset}
        onChange={(e) => props.onOffset(Number(e.target.value))}
      >
        {OFFSETS.map((o) => (
          <option key={o} value={o}>
            {o === 0 ? "当天" : o > 0 ? `+${o} 天` : `${o} 天`}
          </option>
        ))}
      </select>
    </div>
  );
}
