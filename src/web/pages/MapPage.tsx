import { useMemo, useRef, useState } from "react";
import { Globe, LocateFixed, Map as MapIcon, Minus, Plus, X } from "lucide-react";
import { useFlights, useSettings } from "../lib/api";
import { useRefData, useWorldTopo } from "../lib/refdata";
import { useFilter } from "../lib/useFilter";
import { useUnit } from "../lib/useUnit";
import { computeStats, filterFlights, routeKey } from "../../shared/stats";
import { FlightMap, type FlightMapHandle, type MapProjection, type RouteHover } from "../components/FlightMap";
import { Starfield } from "../components/Starfield";
import { FlightTicket, ticketFromFlight } from "../ticket/FlightTicket";
import { YearFilter } from "../ui/YearFilter";
import { cityName, distanceParts } from "../lib/format";
import { ErrorBox, Loading } from "../components/Status";
import { DEMO } from "../lib/env";

export function MapPage() {
  const flights = useFlights();
  const ref = useRefData();
  const world = useWorldTopo();
  // 设置决定起始视角，先等它加载完（失败时用自动选择）
  const settings = useSettings();
  const [filter, setFilter] = useFilter();
  const [unit] = useUnit();
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<RouteHover | null>(null);
  const [projection, setProjection] = useState<MapProjection>("globe");
  const mapHandle = useRef<FlightMapHandle>(null);

  const all = flights.data ?? [];
  const shown = useMemo(() => filterFlights(all, filter), [all, filter]);
  const stats = useMemo(() => (ref.data ? computeStats(shown, ref.data.airports) : null), [shown, ref.data]);
  const byRoute = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const f of shown) {
      const k = routeKey(f.depAirport, f.arrAirport);
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return m;
  }, [shown]);
  const selectedFlights = selected ? (byRoute.get(selected) ?? []) : [];

  if (flights.error) return <ErrorBox error={flights.error} />;
  if (ref.error) return <ErrorBox error={ref.error} />;
  if (!ref.data || flights.isPending || settings.isPending) return <Loading label="正在准备地图" />;

  const dist = distanceParts(stats?.distanceKm ?? 0, unit);
  const hovered = hover ? byRoute.get(hover.key) : undefined;
  const [ha, hb] = selected?.split("-") ?? [];

  return (
    <div className="map-page">
      <Starfield />
      <FlightMap
        ref={mapHandle}
        flights={shown}
        refData={ref.data}
        world={world.data}
        projection={projection}
        homeAirport={settings.data?.homeAirport ?? null}
        selectedRoute={selected}
        onSelectRoute={setSelected}
        onHoverRoute={setHover}
      />

      <div className="hud">
        <div className="hud-card glass">
          <div className="eyebrow">
            {filter.year ? `${filter.year} 年飞行` : "飞行足迹"}
            {DEMO && <span className="demo-pill">演示数据</span>}
          </div>
          <div className="hud-hero">
            <span className="value">{dist.value}</span>
            <span className="unit">{dist.unit}</span>
          </div>
          <div className="hud-stats">
            <HudStat v={stats?.flights ?? 0} l="航段" />
            <HudStat v={stats?.airports.length ?? 0} l="机场" />
            <HudStat v={stats?.countries.length ?? 0} l="国家/地区" />
            <HudStat v={Math.round((stats?.durationMin ?? 0) / 60)} l="小时" />
          </div>
        </div>
        {all.length > 0 && (
          <div className="hud-filters">
            <YearFilter
              flights={all}
              filter={filter}
              onChange={(f) => {
                setSelected(null);
                setFilter(f);
              }}
              refData={ref.data}
            />
          </div>
        )}
      </div>

      <div className="map-controls glass">
        <button
          aria-label={projection === "globe" ? "切换为平面地图" : "切换为地球"}
          title={projection === "globe" ? "平面地图" : "地球"}
          onClick={() => setProjection(projection === "globe" ? "mercator" : "globe")}
        >
          {projection === "globe" ? <MapIcon size={18} /> : <Globe size={18} />}
        </button>
        <button aria-label="回到初始视角" title="回到初始视角" onClick={() => mapHandle.current?.resetView()}>
          <LocateFixed size={18} />
        </button>
        <button className="zoom" aria-label="放大" onClick={() => mapHandle.current?.zoomBy(1)}>
          <Plus size={18} />
        </button>
        <button className="zoom" aria-label="缩小" onClick={() => mapHandle.current?.zoomBy(-1)}>
          <Minus size={18} />
        </button>
      </div>

      {hover && hovered && hover.key !== selected && (
        <div className="map-tooltip glass" style={{ left: hover.x, top: hover.y }}>
          <b>{hover.key.replace("-", " ⇄ ")}</b>
          <span className="faint">
            {hovered.length} 次 · {distanceParts(hovered[0].distanceKm ?? 0, unit).value} {unit}
          </span>
        </div>
      )}

      {selected && selectedFlights.length > 0 && (
        <aside className="route-panel glass" aria-label="航线详情">
          <div className="route-panel-head">
            <div>
              <div className="route-title">
                {ha} ⇄ {hb}
              </div>
              <div className="route-sub">
                {cityName(ha, ref.data)} – {cityName(hb, ref.data)} · 飞过 {selectedFlights.length} 次
              </div>
            </div>
            <button className="button ghost icon" aria-label="关闭" onClick={() => setSelected(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="route-panel-body">
            {selectedFlights.map((f) => (
              <FlightTicket
                key={f.id}
                data={ticketFromFlight(f, ref.data)}
                refData={ref.data}
                unit={unit}
                to={`/flights/${f.id}`}
                compact
              />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function HudStat({ v, l }: { v: number; l: string }) {
  return (
    <div className="hud-stat">
      <div className="v">{v.toLocaleString()}</div>
      <div className="l">{l}</div>
    </div>
  );
}
