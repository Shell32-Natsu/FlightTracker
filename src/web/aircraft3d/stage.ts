import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  Scene,
  Sphere,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { AircraftModel } from "./model";

/** 没有 WebGL 时抛错 */
export function createRenderer(): WebGLRenderer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  return renderer;
}

/** 同一个渲染器的环境光照只生成一次 */
const environments = new WeakMap<WebGLRenderer, WebGLRenderTarget>();

function environmentFor(renderer: WebGLRenderer): WebGLRenderTarget {
  let env = environments.get(renderer);
  if (!env) {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    env = pmrem.fromScene(room, 0.03);
    room.dispose();
    pmrem.dispose();
    environments.set(renderer, env);
  }
  return env;
}

/** 用完归还：浏览器限制同时存在的 WebGL 上下文数 */
export function releaseRenderer(renderer: WebGLRenderer) {
  environments.get(renderer)?.dispose();
  environments.delete(renderer);
  renderer.dispose();
  renderer.forceContextLoss();
}

/** 把模型放进打好光的场景（机型页和机库的静态图共用） */
export function createStage(renderer: WebGLRenderer, m: AircraftModel, shadowSize: number) {
  const scene = new Scene();
  scene.environment = environmentFor(renderer).texture;
  scene.environmentIntensity = 0.42;
  scene.add(new HemisphereLight("#dce8ff", "#48546e", 0.32));
  const sun = new DirectionalLight("#fff1dc", 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.normalBias = 0.06;
  const rim = new DirectionalLight("#a9c8ff", 0.9);
  scene.add(sun, sun.target, rim, m.root);

  const box = new Box3().setFromObject(m.root);
  const R = box.getBoundingSphere(new Sphere()).radius;
  sun.position.set(-R * 0.55, R * 1.5, R * 0.42);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -R;
  sc.right = sc.top = R;
  sc.near = 1;
  sc.far = R * 4;
  rim.position.set(R, R * 0.4, -R);
  // 光和飞机都不动（转的是镜头），阴影只算一次
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;

  return {
    scene,
    box,
    R,
    dispose() {
      sun.shadow.dispose();
    },
  };
}

export type Stage = ReturnType<typeof createStage>;
