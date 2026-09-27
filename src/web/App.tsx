import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { FlightsPage } from "./pages/FlightsPage";
import { AddFlightPage, EditFlightPage } from "./pages/FlightFormPage";
import { PendingPage } from "./pages/PendingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useFlights } from "./lib/api";
import { Loading } from "./components/Status";

// 地图（MapLibre）和统计（Recharts）体积较大，按需加载
const MapPage = lazy(() => import("./pages/MapPage").then((m) => ({ default: m.MapPage })));
const StatsPage = lazy(() => import("./pages/StatsPage").then((m) => ({ default: m.StatsPage })));

export function App() {
  const pending = useFlights("pending");
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="app">
      <main>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/flights" element={<FlightsPage />} />
          <Route path="/flights/:id" element={<EditFlightPage />} />
          <Route path="/add" element={<AddFlightPage />} />
          <Route path="/pending" element={<PendingPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      <nav className="tabbar">
        <Tab to="/" icon="◎" label="地图" end />
        <Tab to="/flights" icon="☰" label="航班" />
        <Tab to="/add" icon="＋" label="添加" />
        <Tab to="/pending" icon="✉" label="待确认" badge={pendingCount} />
        <Tab to="/stats" icon="▥" label="统计" />
        <Tab to="/settings" icon="⚙" label="设置" />
      </nav>
    </div>
  );
}

function Tab(props: { to: string; icon: string; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink to={props.to} end={props.end} className="tab">
      <span className="tab-icon" aria-hidden>
        {props.icon}
        {!!props.badge && <span className="badge">{props.badge}</span>}
      </span>
      <span className="tab-label">{props.label}</span>
    </NavLink>
  );
}
