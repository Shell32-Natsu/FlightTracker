import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Flight, FlightInput, FlightStatus } from "../../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const req = {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  };
  // 条件直接写 import.meta.env，生产构建能把演示分支整个删掉
  const res =
    import.meta.env.MODE === "demo"
      ? await (await import("./demoApi")).demoFetch(path, req)
      : await fetch(`/api${path}`, req);
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
