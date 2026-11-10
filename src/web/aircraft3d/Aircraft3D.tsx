import { useEffect, useRef } from "react";
import { Rotate3d } from "lucide-react";
import {
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
  type WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RefData } from "../lib/refdata";
import { buildAircraft, type AircraftModel } from "./model";
import { spec3DFor } from "./families";
import { fitDistance, outerPoints } from "./framing";
import { createRenderer, createStage, releaseRenderer, type Stage } from "./stage";
import { usePaint } from "./usePaint";

interface Props {
  type: string;
  airline: string | null;
  refData: RefData;
  label: string;
  /** 这台设备画不了（没有 WebGL），外层换回侧视图 */
  onFail: () => void;
}

/** 可以拖着转的 3D 飞机。只在看得见的时候渲染；静止不动时停帧。 */
export default function Aircraft3D({ type, airline, refData, label, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const model = useRef<AircraftModel | null>(null);
  const wake = useRef<() => void>(() => {});

  const { paint } = usePaint(airline, refData);
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
      renderer = createRenderer();
    } catch {
      onFail();
      return;
    }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.append(renderer.domElement);

    let m: AircraftModel;
    let stage: Stage;
    try {
      m = buildAircraft(spec, latest.current, coarse ? 2048 : 4096);
      stage = createStage(renderer, m, coarse ? 1024 : 2048);
    } catch (err) {
      console.error(err);
      releaseRenderer(renderer);
      renderer.domElement.remove();
      onFail();
      return;
    }
    model.current = m;
    painted.current = latest.current;
    const { scene, box, R } = stage;

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
    const io = new IntersectionObserver((entries) => {
      // 一次可能来好几条，最后一条才是现在的状态
      visible = entries[entries.length - 1].isIntersecting;
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
      stage.dispose();
      releaseRenderer(renderer);
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
  }, [paint]);

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
