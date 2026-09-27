const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_MILE = 1.609344;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 两点之间的大圆距离（haversine），单位公里。 */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}
