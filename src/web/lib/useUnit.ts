import { useSyncExternalStore } from "react";
import type { DistanceUnit } from "./format";

const KEY = "flighttracker.unit";
const listeners = new Set<() => void>();

function read(): DistanceUnit {
  try {
    return localStorage.getItem(KEY) === "mi" ? "mi" : "km";
  } catch {
    return "km";
  }
}

/** 距离单位偏好（公里 / 英里），存在浏览器本地。 */
export function useUnit(): [DistanceUnit, (u: DistanceUnit) => void] {
  const unit = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "km" as const,
  );
  const set = (u: DistanceUnit) => {
    try {
      localStorage.setItem(KEY, u);
    } catch {
      // 隐私模式下忽略
    }
    listeners.forEach((l) => l());
  };
  return [unit, set];
}
