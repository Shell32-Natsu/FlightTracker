export function Loading() {
  return <div className="status">加载中…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div className="status error">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="status">{children}</div>;
}
