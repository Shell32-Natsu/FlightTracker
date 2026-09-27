import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftRight, ChevronLeft, Trash2 } from "lucide-react";
import { useCreateFlight, useDeleteFlight, useFlights, useUpdateFlight } from "../lib/api";
import { useRefData, useWorldTopo, type RefData } from "../lib/refdata";
import {
  emptyForm,
  flightToForm,
  formToInput,
  splitFlightCode,
  type FlightFormState,
} from "../lib/flightForm";
import { ErrorBox, Loading } from "../components/Status";
import { RouteGlobe } from "../components/RouteGlobe";
import { FlightTicket, type TicketData } from "../ticket/FlightTicket";
import { Segmented } from "../ui/Segmented";
import { ConfirmButton } from "../ui/ConfirmButton";
import { CABINS, PURPOSES, type Flight } from "../../shared/types";
import { flightDistanceKm, flightDurationMin } from "../../shared/derive";
import { formatDuration } from "../../shared/time";
import { CABIN_LABEL, PURPOSE_LABEL, cityName } from "../lib/format";
import { useUnit } from "../lib/useUnit";

const OFFSETS = [-1, 0, 1, 2];
const CABIN_SHORT: Record<string, string> = { economy: "经济", premium: "超经", business: "商务", first: "头等" };

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
  const location = useLocation();
  // 从应用内进来就回到上一页；直接打开链接进来（没有上一页）就回航班列表
  const back = () =>
    location.key !== "default" ? navigate(-1) : navigate(flight?.status === "pending" ? "/pending" : "/flights");
  const create = useCreateFlight();
  const update = useUpdateFlight();
  const del = useDeleteFlight();
  const world = useWorldTopo("110m");
  const [unit] = useUnit();
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

  const depCode = form.depAirport.trim().toUpperCase();
  const arrCode = form.arrAirport.trim().toUpperCase();
  const dep = refData.airports[depCode];
  const arr = refData.airports[arrCode];

  const preview = useMemo(() => {
    let min: number | null = null;
    try {
      min = flightDurationMin(formToInput(form, refData.airports));
    } catch {
      // 机场未填完整时忽略
    }
    return { km: flightDistanceKm(dep, arr), min };
  }, [form, refData.airports, dep, arr]);

  const ticket: TicketData = {
    airline: form.airline,
    flightNumber: form.flightNumber,
    flightDate: form.flightDate || new Date().toISOString().slice(0, 10),
    depAirport: dep ? depCode : "",
    arrAirport: arr ? arrCode : "",
    depTime: form.actualDep || form.schedDep || null,
    arrTime: form.actualArr || form.schedArr || null,
    arrOffset: offsetLabel(form.actualArr ? form.actualArrOffset : form.schedArrOffset),
    durationMin: preview.min,
    distanceKm: preview.km,
    aircraftType: form.aircraftType || null,
    seat: form.seat || null,
    cabin: form.cabin || null,
  };

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
    if (!flight) return;
    await del.mutateAsync(flight.id);
    back();
  };

  const swap = () => setForm((f) => ({ ...f, depAirport: f.arrAirport, arrAirport: f.depAirport }));

  return (
    <form className="page" onSubmit={submit}>
      <button type="button" className="back-link" onClick={back}>
        <ChevronLeft size={18} /> {flight?.status === "pending" ? "待确认" : "航班"}
      </button>
      <header className="page-head">
        <div>
          <h1 className="page-title">{flight ? "编辑航班" : "添加航班"}</h1>
          <p className="page-sub">时间按机场当地时间填写，保存时自动换算并算好距离和时长。</p>
        </div>
      </header>

      <div className="form-layout">
        <aside className="form-preview">
          <FlightTicket data={ticket} refData={refData} unit={unit} />
          <div className={`preview-globe${dep && arr ? " has-route" : ""}`}>
            <RouteGlobe
              world={world.data}
              dep={dep ? { ...dep, code: depCode } : undefined}
              arr={arr ? { ...arr, code: arrCode } : undefined}
            />
            {dep && arr && (
              <div className="caption">
                <b>{cityName(depCode, refData)}</b> → <b>{cityName(arrCode, refData)}</b>
                {preview.km != null && <> · {preview.km.toLocaleString()} km</>}
              </div>
            )}
          </div>
        </aside>

        <div className="form-sections">
          <section className="card form-section">
            <h2>
              <span className="step">1</span> 航班
            </h2>
            <div className="fields">
              <Field className="wide-mobile" label="航班号" hint={form.airline ? refData.airlines[form.airline]?.name : "如 MU5101、UA 857"} ok={!!form.airline}>
                <input
                  className="input big"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="MU5101"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={!flight}
                />
              </Field>
              <Field label="起飞日期（当地）" className="wide-mobile">
                <input
                  className="input big date"
                  type="date"
                  required
                  value={form.flightDate}
                  onChange={(e) => set("flightDate", e.target.value)}
                />
              </Field>
              <div className="route-inputs">
                <Field label="出发" hint={airportHint(depCode, dep)} ok={!!dep} bad={depCode.length === 3 && !dep}>
                  <input
                    className="input big"
                    required
                    value={form.depAirport}
                    onChange={(e) => set("depAirport", e.target.value.toUpperCase())}
                    placeholder="PVG"
                    maxLength={3}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <button type="button" className="swap" onClick={swap} aria-label="交换出发和到达" title="交换出发和到达">
                  <ArrowLeftRight size={15} />
                </button>
                <Field label="到达" hint={airportHint(arrCode, arr)} ok={!!arr} bad={arrCode.length === 3 && !arr}>
                  <input
                    className="input big"
                    required
                    value={form.arrAirport}
                    onChange={(e) => set("arrAirport", e.target.value.toUpperCase())}
                    placeholder="SFO"
                    maxLength={3}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="card form-section">
            <h2>
              <span className="step">2</span> 时间
              <span className="hint">
                {preview.min != null
                  ? preview.min > 0
                    ? `飞行 ${formatDuration(preview.min)}`
                    : "⚠ 到达早于起飞"
                  : "可只填计划时间"}
              </span>
            </h2>
            <div className="fields times">
              <Field label="计划起飞">
                <input className="input" type="time" value={form.schedDep} onChange={(e) => set("schedDep", e.target.value)} />
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
          </section>

          <section className="card form-section">
            <h2>
              <span className="step">3</span> 飞机与座位
            </h2>
            <div className="fields cols-3">
              <Field label="机型（ICAO）" hint={refData.aircraft[form.aircraftType.toUpperCase()]} ok>
                <input
                  className="input"
                  list="aircraft-types"
                  value={form.aircraftType}
                  onChange={(e) => set("aircraftType", e.target.value.toUpperCase())}
                  placeholder="B77W"
                  maxLength={4}
                />
              </Field>
              <Field label="机尾号">
                <input
                  className="input"
                  value={form.registration}
                  onChange={(e) => set("registration", e.target.value)}
                  placeholder="B-1234"
                />
              </Field>
              <Field label="座位">
                <input className="input" value={form.seat} onChange={(e) => set("seat", e.target.value)} placeholder="32K" />
              </Field>
              <Field label="舱位" full>
                <Segmented
                  value={form.cabin || "none"}
                  onChange={(v) => set("cabin", v === "none" ? "" : (v as FlightFormState["cabin"]))}
                  ariaLabel="舱位"
                  options={[
                    { value: "none", label: "未填" },
                    ...CABINS.map((c) => ({ value: c, label: <span title={CABIN_LABEL[c]}>{CABIN_SHORT[c]}</span> })),
                  ]}
                />
              </Field>
              <Field label="出行目的" full>
                <Segmented
                  value={form.purpose || "none"}
                  onChange={(v) => set("purpose", v === "none" ? "" : (v as FlightFormState["purpose"]))}
                  ariaLabel="出行目的"
                  options={[
                    { value: "none", label: "未填" },
                    ...PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABEL[p] })),
                  ]}
                />
              </Field>
              <Field label="实际承运航司" hint={refData.airlines[form.operatingAirline.toUpperCase()]?.name ?? "代码共享时填写"} ok>
                <input
                  className="input"
                  value={form.operatingAirline}
                  onChange={(e) => set("operatingAirline", e.target.value.toUpperCase())}
                  placeholder="如 NH"
                  maxLength={2}
                />
              </Field>
              <Field label="订座记录编号">
                <input
                  className="input"
                  value={form.confirmationCode}
                  onChange={(e) => set("confirmationCode", e.target.value)}
                  placeholder="ABC123"
                />
              </Field>
              <Field label="备注" full>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </div>
          </section>

          <datalist id="aircraft-types">
            {Object.entries(refData.aircraft).map(([c, name]) => (
              <option key={c} value={c}>
                {name}
              </option>
            ))}
          </datalist>

          {error && <div className="error-box">{error}</div>}

          <div className="form-actions">
            {flight && (
              <ConfirmButton onConfirm={remove} disabled={busy} confirmLabel={<>再点一次删除</>}>
                <Trash2 size={16} /> 删除
              </ConfirmButton>
            )}
            <span className="spacer" />
            <button type="button" className="button ghost" onClick={back} disabled={busy}>
              取消
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "保存中…" : flight ? "保存修改" : "保存航班"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function offsetLabel(o: number): string {
  return o === 0 ? "" : o > 0 ? `+${o}` : `−${-o}`;
}

function airportHint(code: string, a: RefData["airports"][string] | undefined): string {
  if (!code) return "三字码，如 PVG";
  if (!a) return code.length === 3 ? "机场表里没有这个三字码" : "三字码，如 PVG";
  return a.city && !a.name.includes(a.city) ? `${a.city} · ${a.name}` : a.name;
}

function Field({
  label,
  hint,
  children,
  ok,
  bad,
  full,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  ok?: boolean;
  bad?: boolean;
  full?: boolean;
  className?: string;
}) {
  return (
    <label className={`field${full ? " full" : ""} ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint !== undefined && <span className={`field-hint${bad ? " bad" : ok ? " ok" : ""}`}>{hint}</span>}
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
      <input className="input" type="time" value={props.time} onChange={(e) => props.onTime(e.target.value)} />
      <select
        className="select"
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
