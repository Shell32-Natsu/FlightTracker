import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmailRecord, Flight, FlightInput, FlightStatus, InboxInfo } from "../../shared/types";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/settings";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

/** 发请求：正式版走 /api，演示版走浏览器内的模拟实现。 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const req = {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  };
  // 条件直接写 import.meta.env，生产构建能把演示分支整个删掉
  return import.meta.env.MODE === "demo"
    ? (await import("./demoApi")).demoFetch(path, req)
    : fetch(`/api${path}`, req);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const issues = body?.issues;
    const detail = issues?.length ? `：${issues.map((i: { message: string }) => i.message).join("；")}` : "";
    throw new ApiError(`${body?.error ?? `请求失败（${res.status}）`}${detail}`, res.status, issues);
  }
  return body as T;
}

/** status 为 "all" 时返回全部（含待确认），编辑页用。 */
export function useFlights(status: FlightStatus | "all" = "confirmed") {
  return useQuery({
    queryKey: ["flights", status],
    queryFn: () => request<Flight[]>(status === "all" ? "/flights" : `/flights?status=${status}`),
  });
}

function useInvalidateFlights() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flights"] });
}

export function useCreateFlight() {
  const invalidate = useInvalidateFlights();
  return useMutation({
    mutationFn: (input: FlightInput) =>
      request<Flight>("/flights", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useUpdateFlight() {
  const invalidate = useInvalidateFlights();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FlightInput }) =>
      request<Flight>(`/flights/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useDeleteFlight() {
  const invalidate = useInvalidateFlights();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/flights/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useConfirmFlight() {
  const invalidate = useInvalidateFlights();
  return useMutation({
    mutationFn: (id: string) => request<Flight>(`/flights/${id}/confirm`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

const settingsKey = ["settings"] as const;

/** 用户设置（存在服务端 D1）。加载失败时调用方用默认值兜底。 */
export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => request<Settings>("/settings"),
    staleTime: Infinity,
  });
}

/** 部分更新设置；先乐观更新界面，失败时回滚。 */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      request<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      const prev = qc.getQueryData<Settings>(settingsKey);
      qc.setQueryData<Settings>(settingsKey, { ...DEFAULT_SETTINGS, ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => qc.setQueryData(settingsKey, ctx?.prev),
    onSuccess: (saved) => qc.setQueryData(settingsKey, saved),
  });
}

export interface ImportResult {
  inserted: number;
  duplicates: number;
  invalid: { index: number; message: string }[];
}

/** 批量导入（CSV 已在浏览器里解析好）。 */
export function useImportFlights() {
  const invalidate = useInvalidateFlights();
  return useMutation({
    mutationFn: (flights: FlightInput[]) =>
      request<ImportResult>("/import", { method: "POST", body: JSON.stringify({ flights }) }),
    onSuccess: invalidate,
  });
}

/** 下载全部已确认航班的 CSV。 */
export async function downloadExportCsv(): Promise<void> {
  const res = await apiFetch("/export/csv");
  if (!res.ok) throw new ApiError(`导出失败（${res.status}）`, res.status);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "flights.csv";
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 邮件导入：专属收件地址和允许的发件人。 */
export interface AircraftInfo {
  lang: "zh" | "en";
  title: string;
  extract: string;
  url: string;
  thumbnail: string | null;
}

/** 机型的维基百科简介（Worker 代理并缓存） */
export function useAircraftInfo(type: string | undefined) {
  return useQuery({
    queryKey: ["aircraft-info", type],
    queryFn: () => request<AircraftInfo>(`/aircraft-info/${encodeURIComponent(type!)}`),
    enabled: !!type,
    staleTime: Infinity,
    retry: false,
  });
}

export function useInbox() {
  return useQuery({ queryKey: ["inbox"], queryFn: () => request<InboxInfo>("/inbox") });
}

export function useRotateInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ address: string }>("/inbox/rotate", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

/** 最近收到的邮件和处理结果。 */
export function useEmails() {
  return useQuery({ queryKey: ["emails"], queryFn: () => request<EmailRecord[]>("/emails") });
}

export function useReparseEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<EmailRecord>(`/emails/${id}/reparse`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["flights"] });
    },
  });
}
