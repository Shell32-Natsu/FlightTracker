import { DEFAULT_SETTINGS } from "../../shared/settings";
import { useSettings, useUpdateSettings } from "./api";
import type { DistanceUnit } from "./format";

/** 距离单位偏好（公里 / 英里），保存在服务端设置里。 */
export function useUnit(): [DistanceUnit, (u: DistanceUnit) => void] {
  const settings = useSettings();
  const update = useUpdateSettings();
  return [settings.data?.distanceUnit ?? DEFAULT_SETTINGS.distanceUnit, (u) => update.mutate({ distanceUnit: u })];
}
