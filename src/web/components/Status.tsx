import { Plane } from "lucide-react";

export function Loading({ label = "加载中" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading-orbit">
        <Plane size={16} />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="error-box" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <svg className="empty-art" viewBox="0 0 200 90" aria-hidden>
        <path d="M20 75 Q100 -5 180 75" className="empty-arc" />
        <circle cx="20" cy="75" r="4" className="empty-dot" />
        <circle cx="180" cy="75" r="4" className="empty-dot" />
      </svg>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
