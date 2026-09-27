import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BarChart3, Earth, Inbox, Plus, Settings, TicketsPlane } from "lucide-react";
import { FlightsPage } from "./pages/FlightsPage";
import { AddFlightPage, EditFlightPage } from "./pages/FlightFormPage";
import { PendingPage } from "./pages/PendingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ImportPage } from "./pages/ImportPage";
import { useFlights } from "./lib/api";
import { Loading } from "./components/Status";
import { Logo } from "./ui/Logo";

// 地图（MapLibre）和统计页体积较大，按需加载
const MapPage = lazy(() => import("./pages/MapPage").then((m) => ({ default: m.MapPage })));
const StatsPage = lazy(() => import("./pages/StatsPage").then((m) => ({ default: m.StatsPage })));
// 海报页带着中文字体和导出逻辑，单独按需加载
const PosterPage = lazy(() => import("./pages/PosterPage").then((m) => ({ default: m.PosterPage })));
const AnimationPage = lazy(() => import("./pages/AnimationPage").then((m) => ({ default: m.AnimationPage })));

export function App() {
  const pending = useFlights("pending");
  const pendingCount = pending.data?.length ?? 0;
  const location = useLocation();
  const isMap = location.pathname === "/";

  return (
    <div className={`shell${isMap ? " shell-map" : ""}`}>
      <nav className="rail" aria-label="主导航">
        <NavLink to="/" className="rail-brand" aria-label="航迹">
          <Logo size={36} />
        </NavLink>
        <NavLink to="/add" className="rail-add" aria-label="添加航班" title="添加航班">
          <Plus size={22} strokeWidth={2.4} />
        </NavLink>
        <div className="rail-links">
          <RailLink to="/" end icon={<Earth size={20} />} label="地图" />
          <RailLink to="/flights" icon={<TicketsPlane size={20} />} label="航班" />
          <RailLink to="/pending" icon={<Inbox size={20} />} label="待确认" badge={pendingCount} />
          <RailLink to="/stats" icon={<BarChart3 size={20} />} label="统计" />
        </div>
        <div className="rail-bottom">
          <RailLink to="/settings" icon={<Settings size={20} />} label="设置" />
        </div>
      </nav>

      <main className="main">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/flights" element={<FlightsPage />} />
            <Route path="/flights/:id" element={<EditFlightPage />} />
            <Route path="/add" element={<AddFlightPage />} />
            <Route path="/pending" element={<PendingPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/poster" element={<PosterPage />} />
            <Route path="/animation" element={<AnimationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <nav className="dock" aria-label="主导航">
        <DockLink to="/" end icon={<Earth size={22} />} label="地图" />
        <DockLink to="/flights" icon={<TicketsPlane size={22} />} label="航班" badge={pendingCount} />
        <NavLink to="/add" className="dock-add" aria-label="添加航班">
          <Plus size={26} strokeWidth={2.4} />
        </NavLink>
        <DockLink to="/stats" icon={<BarChart3 size={22} />} label="统计" />
        <DockLink to="/settings" icon={<Settings size={22} />} label="设置" />
      </nav>
    </div>
  );
}

function RailLink(props: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink to={props.to} end={props.end} className="rail-link">
      <span className="rail-icon">
        {props.icon}
        {!!props.badge && <span className="badge">{props.badge}</span>}
      </span>
      <span className="rail-label">{props.label}</span>
    </NavLink>
  );
}

function DockLink(props: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink to={props.to} end={props.end} className="dock-link">
      <span className="dock-icon">
        {props.icon}
        {!!props.badge && <span className="badge">{props.badge}</span>}
      </span>
      <span className="dock-label">{props.label}</span>
    </NavLink>
  );
}
