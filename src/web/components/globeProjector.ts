import type { Map as MapLibreMap } from "maplibre-gl";

const RAD = Math.PI / 180;

export type Vec3 = readonly [number, number, number];

/** 地球固定坐标系里的单位向量 */
export function toVec([lng, lat]: readonly number[]): Vec3 {
  const c = Math.cos(lat * RAD);
  return [c * Math.cos(lng * RAD), c * Math.sin(lng * RAD), Math.sin(lat * RAD)];
}

export interface GlobeCamera {
  lng: number;
  lat: number;
  /** 地图旋转角（度，顺时针），手机双指可以转 */
  bearing: number;
  /** 视野中心的屏幕坐标 */
  x: number;
  y: number;
  /** 球半径、相机到球面的距离（像素） */
  R: number;
  D: number;
}

/**
 * MapLibre 地球投影的相机，只用公开接口（俯仰角恒为 0）。
 * 缩放级别 z 时赤道周长 512·2^z，中心纬度越高放得越大；D 由视口高度和视场角决定。
 */
export function globeCamera(map: MapLibreMap): GlobeCamera {
  const { lng, lat } = map.getCenter();
  const { x, y } = map.project([lng, lat]);
  return {
    lng,
    lat,
    bearing: map.getBearing(),
    x,
    y,
    R: (512 * 2 ** map.getZoom()) / (2 * Math.PI) / Math.cos(lat * RAD),
    D: (0.5 * map.getContainer().clientHeight) / Math.tan((map.getVerticalFieldOfView() * RAD) / 2),
  };
}

/** 球的轮廓在屏幕上的半径：过相机的切锥 */
export function discRadius(D: number, R: number): number {
  return (D * R) / Math.sqrt((D + R) ** 2 - R ** 2);
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** 把球面上（或离地 altitude 个球半径）的点投到屏幕上，并判断有没有被地球挡住。 */
export class GlobeProjector {
  private readonly m: readonly [Vec3, Vec3, Vec3];
  /** 相机离球心的距离，单位是球半径 */
  private readonly eye: number;

  constructor(private readonly cam: GlobeCamera) {
    const lng = cam.lng * RAD;
    const lat = cam.lat * RAD;
    const [sl, cl, sp, cp] = [Math.sin(lng), Math.cos(lng), Math.sin(lat), Math.cos(lat)];
    // 视野中心处的 东、北、上
    const east: Vec3 = [-sl, cl, 0];
    const north: Vec3 = [-sp * cl, -sp * sl, cp];
    const up: Vec3 = [cp * cl, cp * sl, sp];
    const b = cam.bearing * RAD;
    const [sb, cb] = [Math.sin(b), Math.cos(b)];
    const right: Vec3 = [0, 1, 2].map((i) => east[i] * cb - north[i] * sb) as unknown as Vec3;
    const top: Vec3 = [0, 1, 2].map((i) => east[i] * sb + north[i] * cb) as unknown as Vec3;
    this.m = [right, top, up];
    this.eye = 1 + cam.D / cam.R;
  }

  project(v: Vec3, altitude = 0): ScreenPoint {
    const k = 1 + altitude;
    const [r, t, u] = this.m;
    const x = k * (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
    const y = k * (t[0] * v[0] + t[1] * v[1] + t[2] * v[2]);
    const z = k * (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
    const depth = this.eye - z;
    // 比相机还高（或贴着相机）：投影没有意义
    if (depth < 0.04) return { x: 0, y: 0, visible: false };
    const s = this.cam.D / depth;
    // 从相机到这个点的视线，有没有先穿过地球
    const len2 = x * x + y * y + depth * depth;
    const along = (this.eye * depth) / len2;
    let visible = true;
    if (along < 1) {
      const cx = x * along;
      const cy = y * along;
      const cz = this.eye - depth * along;
      visible = cx * cx + cy * cy + cz * cz > 0.9985;
    }
    return { x: this.cam.x + x * s, y: this.cam.y - y * s, visible };
  }
}
