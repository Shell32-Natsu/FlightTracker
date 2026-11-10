import { useEffect, useRef, useState } from "react";
import { Rotate3d } from "lucide-react";
import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { RefData } from "../lib/refdata";
import { useAirlineLogo } from "../lib/logos";
import { airlineAccent, liveryFor, type Livery } from "../aircraft/livery";
import { buildAircraft, type AircraftModel } from "./model";
import { spec3DFor } from "./families";
import { fitDistance, outerPoints } from "./framing";

interface Props {
  type: string;
  airline: string | null;
  refData: RefData;
  label: string;
  /** 这台设备画不了（没有 WebGL），外层换回侧视图 */
  onFail: () => void;
}

const PLAIN: Livery = { tail: "#e8ecf2", logo: "color", titles: "", titleColor: "#000" };

/** 可以拖着转的 3D 飞机。只在看得见的时候渲染；静止不动时停帧。 */
export default function Aircraft3D({ type, airline, refData, label, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const logo = useAirlineLogo(airline);
  const [decoded, setDecoded] = useState<HTMLImageElement | null>(null);
  const model = useRef<AircraftModel | null>(null);
  const wake = useRef<() => void>(() => {});

  // 徽标是 data URL，解码成图片才能画进贴图
  useEffect(() => {
    if (!logo.data) return;
    let live = true;
    const img = new Image();
    img.src = logo.data.src;
    img.decode().then(
      () => live && setDecoded(img),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [logo.data]);

  // 换航司的那一刻，解码好的还是上一家的徽标，不能画上去
  const image = decoded && decoded.src === logo.data?.src ? decoded : null;
  const livery = airline ? liveryFor(airline, logo.data?.color, refData) : PLAIN;
  const paint = { livery, accent: airline ? airlineAccent(airline) : null, logo: image };
  const latest = useRef(paint);
  latest.current = paint;
  const painted = useRef<typeof paint | null>(null);

  // 场景：机型变了才重建
  useEffect(() => {
    const el = host.current!;
    const spec = spec3DFor(type);
    if (!spec) return onFail();
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail();
      return;
    }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    el.append(renderer.domElement);

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.03);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.42;
    scene.add(new HemisphereLight("#dce8ff", "#48546e", 0.32));
    const sun = new DirectionalLight("#fff1dc", 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.normalBias = 0.06;
    scene.add(sun, sun.target);
    const rim = new DirectionalLight("#a9c8ff", 0.9);
    scene.add(rim);

    let m: AircraftModel;
    try {
      m = buildAircraft(spec, latest.current, coarse ? 2048 : 4096);
    } catch (err) {
      console.error(err);
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      onFail();
      return;
    }
    model.current = m;
    painted.current = latest.current;
    scene.add(m.root);

    const box = new Box3().setFromObject(m.root);
    const ball = box.getBoundingSphere(new Sphere());
    const R = ball.radius;
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

    // 脚下垫一团柔和的影子
    const shadow = new Mesh(
      new PlaneGeometry(spec.length * 1.25, box.max.z * 2.3),
      new MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false, color: new Color("#020817"), opacity: 0.42 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = box.min.y - R * 0.16;
    scene.add(shadow);

    const camera = new PerspectiveCamera(24, 1, 1, R * 20);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.75;
    controls.target.set(0, (box.max.y + box.min.y) / 2 - R * 0.03, 0);
    controls.autoRotate = !still;
    controls.autoRotateSpeed = 0.75;
    // 手机上竖着滑是滚页面，横着滑才是转飞机
    renderer.domElement.style.touchAction = "pan-y";

    // 镜头距离随视角变：转到哪个角度都刚好放得下，不裁机头、翼尖
    const outer = outerPoints(m.root);
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const offset = new Vector3();
    const place = () => {
      // 窄屏上给底部的涂装按钮多让一点
      const mx = half * camera.aspect * (el.clientWidth < 760 ? 0.88 : 0.94);
      offset.subVectors(camera.position, controls.target).normalize();
      const d = fitDistance(outer, controls.target, offset, mx, half * 0.8);
      camera.position.copy(controls.target).addScaledVector(offset, d);
    };
    // 初始：机头朝左前方的四分之三视角
    camera.position.set(-0.6, 0.3, 0.8).add(controls.target);
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // 标题在左上角，飞机往下放一点
      camera.setViewOffset(w, h, 0, -h * 0.045, w, h);
      place();
      camera.updateProjectionMatrix();
      wake.current();
    };

    let raf = 0;
    let visible = true;
    let idleFrames = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      controls.update(dt);
      place();
      if (!still) for (const f of m.fans) f.rotation.x += dt * 5;
      renderer.render(scene, camera);
      idleFrames++;
      // 不自转时，静止一会儿就停
      raf = visible && (!still || idleFrames < 40) ? requestAnimationFrame(frame) : 0;
    };
    wake.current = () => {
      idleFrames = 0;
      if (!raf && visible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    let resume = 0;
    const onStart = () => {
      clearTimeout(resume);
      controls.autoRotate = false;
      el.classList.add("dragging");
      wake.current();
    };
    const onEnd = () => {
      el.classList.remove("dragging");
      if (!still) resume = window.setTimeout(() => (controls.autoRotate = true), 3500);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    controls.addEventListener("change", () => wake.current());
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) wake.current();
    });
    io.observe(el);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const lost = (e: Event) => {
      e.preventDefault();
      onFail();
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resume);
      io.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.dispose();
      m.dispose();
      shadow.geometry.dispose();
      shadow.material.map?.dispose();
      shadow.material.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      // 浏览器限制同时存在的 WebGL 上下文数，离开时立即还回去
      renderer.forceContextLoss();
      renderer.domElement.remove();
      model.current = null;
      wake.current = () => {};
    };
    // onFail 只在出错时调用，不参与重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // 换涂装
  useEffect(() => {
    // 刚建好的模型已经是这身涂装
    if (painted.current === latest.current) return;
    painted.current = latest.current;
    try {
      model.current?.setLivery(latest.current);
    } catch (err) {
      console.error(err);
      onFail();
    }
    wake.current();
    // onFail 只在出错时调用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airline, image, logo.data?.color]);

  return (
    <>
      <div ref={host} className="aircraft-3d" role="img" aria-label={label} />
      <span className="aircraft-3d-hint" aria-hidden>
        <Rotate3d size={15} /> 拖动旋转
      </span>
    </>
  );
}

function blob() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.45, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new CanvasTexture(c);
}
