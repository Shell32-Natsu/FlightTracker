import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  Vector2,
} from "three";
import {
  bodySection,
  bodyTop,
  finGeometry,
  fuselageGeometry,
  liftingGeometry,
  paneGeometry,
  stabSections,
  tipBlades,
  wingAt,
  wingSections,
} from "./geometry";
import { paintFin, paintFuselage, paintPane, paintWing, type PaintInput } from "./paint";
import type { Aircraft3DSpec } from "./specs";

export interface AircraftModel {
  root: Group;
  /** 风扇，转起来用 */
  fans: Group[];
  /** 换涂装：只重画贴图、换材质颜色 */
  setLivery: (p: Omit<PaintInput, "spec">) => void;
  dispose: () => void;
}

const texture = (c: HTMLCanvasElement): Texture => {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** 按参数拼出一架飞机。长度单位是米，原点移到机身中部。 */
export function buildAircraft(spec: Aircraft3DSpec, paint: Omit<PaintInput, "spec">, textureSize = 4096): AircraftModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  body.position.set(-spec.length / 2, 0, 0);
  const materials: Material[] = [];
  const keep = <M extends Material>(m: M): M => {
    materials.push(m);
    return m;
  };
  const textures: Texture[] = [];
  const add = (mesh: Mesh) => {
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };

  const skin = keep(new MeshPhysicalMaterial({ roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.16 }));
  const finSkin = keep(new MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.16 }));
  const wingSkin = keep(new MeshStandardMaterial({ roughness: 0.42, metalness: 0.28, side: DoubleSide }));
  const stabSkin = keep(new MeshStandardMaterial({ roughness: 0.42, metalness: 0.28, side: DoubleSide }));
  const cowl = keep(new MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, side: DoubleSide }));
  const belly = keep(new MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 0.4 }));
  const chrome = keep(new MeshStandardMaterial({ color: "#dfe4ea", roughness: 0.16, metalness: 0.95, side: DoubleSide }));
  const titanium = keep(new MeshStandardMaterial({ color: "#8a8f98", roughness: 0.38, metalness: 0.85, side: DoubleSide }));
  const dark = keep(new MeshStandardMaterial({ color: "#14181f", roughness: 0.75, side: DoubleSide }));
  const blade = keep(new MeshStandardMaterial({ color: "#aab3bf", roughness: 0.4, metalness: 0.45, side: DoubleSide }));
  const grey = keep(new MeshStandardMaterial({ color: "#c6ccd4", roughness: 0.45, metalness: 0.2 }));

  wingSkin.map = texture(paintWing("wing"));
  stabSkin.map = texture(paintWing("stab"));
  textures.push(wingSkin.map, stabSkin.map);

  // —— 机身、垂尾
  add(new Mesh(fuselageGeometry(spec), skin));
  for (const side of [1, -1] as const) add(new Mesh(finGeometry(spec, side), finSkin));

  // —— 驾驶舱玻璃
  spec.cockpit.panes.forEach((corners, i) => {
    const pane = paneGeometry(spec, corners);
    const map = texture(paintPane(pane, spec.cockpit.radius, i === 0, spec.cockpit.mask));
    textures.push(map);
    const glass = keep(
      new MeshPhysicalMaterial({
        map,
        transparent: true,
        roughness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.4,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    for (const side of [1, -1] as const) {
      const m = new Mesh(pane.geometry, glass);
      m.scale.z = side;
      body.add(m);
    }
  });

  // —— 机翼、平尾
  const wing = wingSections(spec);
  const stab = stabSections(spec.stab);
  for (const side of [1, -1] as const) {
    add(new Mesh(liftingGeometry(wing, side), wingSkin));
    add(new Mesh(liftingGeometry(stab, side, -0.006), stabSkin));
    for (const b of tipBlades(spec)) add(new Mesh(liftingGeometry(b, side, 0), stabSkin));
  }
  if (spec.bullet) {
    const m = add(new Mesh(new SphereGeometry(1, 24, 16), grey));
    const chord = spec.stab.sections[0].chord;
    m.scale.set(chord * 0.66, spec.rw * 0.15, spec.rw * 0.15);
    m.position.set(spec.stab.x + chord * 0.5, spec.stab.y, 0);
  }

  // —— 翼身整流罩
  const rootChord = wing[0].chord;
  const fairing = add(new Mesh(new SphereGeometry(1, 48, 32), belly));
  if (spec.highWing) {
    // 上单翼：机背的翼根整流罩，和机腹两侧的起落架舱
    fairing.scale.set(rootChord * 0.95, spec.rh * 0.17, spec.rw * 0.66);
    fairing.position.set(wing[0].x + rootChord * 0.5, spec.rh * 0.93, 0);
    const pod = add(new Mesh(new SphereGeometry(1, 32, 20), belly));
    pod.scale.set(rootChord * 1.15, spec.rh * 0.36, spec.rw * 1.16);
    pod.position.set(wing[0].x + rootChord * 0.7, -spec.rh * 0.72, 0);
  } else {
    fairing.scale.set(rootChord * 0.74, spec.rh * 0.46, spec.rw * 0.97);
    fairing.position.set(wing[0].x + rootChord * 0.52, -spec.rh * 0.66, 0);
  }

  // —— 发动机
  const fans: Group[] = [];
  const mats = { cowl, chrome, titanium, dark, blade };
  for (const e of spec.engines)
    for (const side of [1, -1] as const) {
      const w = wingAt(wing, e.z);
      if (e.mount === "fin") {
        if (side === -1) continue;
        const { group, fan } = buildEngine(e.length, e.diameter / 2, mats);
        group.position.set(e.x!, e.y!, 0);
        body.add(group);
        fans.push(fan);
      } else if (e.mount === "rear") {
        const { group, fan } = buildEngine(e.length, e.diameter / 2, mats);
        group.position.set(e.x!, e.y!, side * e.z);
        group.rotation.y = side * 0.02;
        body.add(group);
        fans.push(fan);
        // 短而厚的横向挂架
        const strut = (z: number, k: number) => ({ x: e.x! + e.length * (0.2 + (1 - k) * 0.04), y: e.y!, z, chord: e.length * 0.62 * k, thick: 0.16, twist: 0, cant: 0 });
        add(new Mesh(liftingGeometry([strut(spec.rw * 0.2, 1.15), strut(e.z, 0.9)], side, 0), cowl));
      } else if (e.mount === "prop") {
        const { group, fan } = buildTurboprop(e.length, e.diameter / 2, e.prop!, e.blades!, mats);
        group.position.set(w.x - e.ahead, w.y - e.diameter * 0.16, side * e.z);
        body.add(group);
        fans.push(fan);
      } else {
        const { group, fan } = buildEngine(e.length, e.diameter / 2, mats);
        group.position.set(w.x - e.ahead, w.y - e.drop, side * e.z);
        group.rotation.z = -0.02;
        body.add(group);
        fans.push(fan);
        add(pylon(w, e, cowl, side));
      }
    }

  // —— 襟翼滑轨整流罩
  const span = spec.wing.sections.at(-1)!.at;
  for (const t of spec.highWing ? [0.5, 0.75] : [0.24, 0.42, 0.58, 0.74]) {
    const z = span * t;
    const w = wingAt(wing, z);
    const len = Math.min(w.chord * 0.95, Math.max(w.chord * 0.52, spec.rw * 0.9));
    for (const side of [1, -1] as const) {
      const m = add(new Mesh(new SphereGeometry(1, 20, 14), grey));
      m.scale.set(len / 2, spec.rw * 0.115, spec.rw * 0.1);
      m.position.set(w.x + w.chord * 0.86, w.y - spec.rw * 0.1, side * z);
      m.rotation.z = -0.07;
    }
  }

  // —— 天线、尾锥排气口、航行灯
  for (const [x, up] of [[0.22, 1], [0.46, 1], [0.3, -1], [0.62, -1]] as const) {
    const px = spec.length * x;
    const q = bodySection(spec, px);
    if (up === 1 && spec.highWing && px > wing[0].x - 2) continue;
    const fin = new Shape();
    const s = spec.rw * 0.2;
    fin.moveTo(0, 0).lineTo(s * 1.3, 0).lineTo(s * 1.5, s).lineTo(s * 0.9, s);
    const m = add(new Mesh(new ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false }), grey));
    m.position.set(px, up === 1 ? bodyTop(spec, px) - 0.03 : q.bottom + 0.03, -0.025);
    if (up === -1) m.scale.y = -1;
  }
  const end = wing.at(-1)!;
  for (const side of [1, -1] as const) {
    const lamp = keep(
      new MeshStandardMaterial({ color: side === 1 ? "#ff3b30" : "#22c55e", emissive: side === 1 ? "#ff3b30" : "#22c55e", emissiveIntensity: 1.6 }),
    );
    const m = new Mesh(new SphereGeometry(spec.rw * 0.05, 12, 10), lamp);
    const tipBase = wingAt(wing, span);
    if (spec.tip.kind === "raked") m.position.set(end.x + 0.05, end.y, side * end.z);
    else m.position.set(tipBase.x + 0.1, tipBase.y, side * span);
    body.add(m);
  }

  // —— 涂装
  const setLivery = (p: Omit<PaintInput, "spec">) => {
    const livery = p.livery;
    skin.map?.dispose();
    finSkin.map?.dispose();
    skin.map = texture(paintFuselage({ spec, ...p }, textureSize));
    finSkin.map = texture(paintFin({ spec, ...p }, textureSize / 4));
    // 发动机默认跟机腹同色；加航的机腹是黑的，发动机仍是白的
    cowl.color.set(livery.engine ?? (livery.belly && livery.belly !== "#1a1a1a" ? livery.belly : "#f2f5f8"));
    belly.color.set(livery.belly ?? "#e2e7ec");
    for (const m of [skin, finSkin, cowl, belly]) m.needsUpdate = true;
  };
  setLivery(paint);

  return {
    root,
    fans,
    setLivery,
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      for (const t of [...textures, skin.map, finSkin.map]) t?.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

interface EngineMaterials {
  cowl: Material;
  chrome: Material;
  titanium: Material;
  dark: Material;
  blade: Material;
}

/** 一台涡扇发动机：轴线沿 x，进气口在原点。 */
function buildEngine(len: number, r: number, m: EngineMaterials): { group: Group; fan: Group } {
  const group = new Group();
  const lathe = (pts: [number, number][], mat: Material) => {
    // LatheGeometry 绕 y 轴转，这里把轴线放倒到 x
    const mesh = new Mesh(
      new LatheGeometry(
        pts.map(([x, rr]) => new Vector2(rr * r, x * len)),
        64,
      ),
      mat,
    );
    mesh.rotation.z = -Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  // 外罩
  lathe([[0.045, 0.94], [0.1, 0.975], [0.2, 1], [0.34, 1], [0.5, 0.97], [0.62, 0.91], [0.72, 0.82], [0.72, 0.79]], m.cowl);
  // 唇口：抛光金属
  lathe([[0.045, 0.94], [0.018, 0.915], [0.002, 0.885], [0, 0.86], [0.006, 0.835], [0.03, 0.815], [0.06, 0.81]], m.chrome);
  // 进气道
  lathe([[0.06, 0.81], [0.12, 0.83], [0.2, 0.845]], m.titanium);
  lathe([[0.2, 0.845], [0.5, 0.82], [0.71, 0.79]], m.dark);
  // 核心机罩、喷口、尾锥
  lathe([[0.45, 0.56], [0.62, 0.6], [0.78, 0.52], [0.94, 0.4], [0.94, 0.37]], m.titanium);
  lathe([[0.8, 0.26], [0.94, 0.24], [1.04, 0.14], [1.12, 0.015]], m.titanium);

  // 风扇：整流锥 + 叶片
  const fan = new Group();
  fan.position.x = 0.2 * len;
  const cone = new Mesh(new CylinderGeometry(0.012 * r, 0.27 * r, 0.42 * r, 40, 1, false), m.dark);
  cone.rotation.z = Math.PI / 2;
  cone.position.x = -0.21 * r;
  fan.add(cone);
  const swirl = new Mesh(new SphereGeometry(0.035 * r, 10, 8), m.chrome);
  swirl.position.set(-0.17 * r, 0.12 * r, 0);
  fan.add(swirl);
  const n = 22;
  const bladeGeo = new PlaneGeometry(0.17 * r, 0.6 * r, 2, 6);
  // 叶片从根到尖逐渐扭转
  const p = bladeGeo.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / (0.6 * r) + 0.5;
    const a = 0.45 + h * 0.75;
    const w = p.getX(i) * (0.75 + h * 0.5);
    p.setXYZ(i, w * Math.cos(a) - h * h * 0.05 * r, p.getY(i) + 0.545 * r, w * Math.sin(a));
  }
  bladeGeo.computeVertexNormals();
  const blades = new InstancedMesh(bladeGeo, m.blade, n);
  const mat = new Matrix4();
  for (let i = 0; i < n; i++) blades.setMatrixAt(i, mat.makeRotationX((i / n) * Math.PI * 2));
  fan.add(blades);
  group.add(fan);
  const back = new Mesh(new CircleGeometry(0.85 * r, 48), m.dark);
  back.rotation.y = -Math.PI / 2;
  back.position.x = 0.24 * len;
  group.add(back);
  return { group, fan };
}

/** 涡桨：细长短舱、整流锥和桨叶，轴线沿 x。 */
function buildTurboprop(len: number, r: number, prop: number, n: number, m: EngineMaterials): { group: Group; fan: Group } {
  const group = new Group();
  const shape: [number, number][] = [[0, 0.5], [0.03, 0.66], [0.1, 0.85], [0.22, 0.98], [0.4, 1], [0.62, 0.86], [0.82, 0.52], [0.96, 0.18], [1, 0.02]];
  const nacelle = new Mesh(new LatheGeometry(shape.map(([x, k]) => new Vector2(k * r, x * len)), 40), m.cowl);
  nacelle.rotation.z = -Math.PI / 2;
  nacelle.castShadow = nacelle.receiveShadow = true;
  group.add(nacelle);
  // 下颌进气口
  const scoop = new Mesh(new SphereGeometry(1, 24, 16), m.cowl);
  scoop.scale.set(len * 0.2, r * 0.42, r * 0.5);
  scoop.position.set(len * 0.17, -r * 0.72, 0);
  group.add(scoop);
  const mouth = new Mesh(new CircleGeometry(r * 0.26, 24), m.dark);
  mouth.rotation.y = -Math.PI / 2;
  mouth.scale.set(1.2, 0.8, 1);
  mouth.position.set(-len * 0.015, -r * 0.6, 0);
  group.add(mouth);

  const fan = new Group();
  fan.position.x = -len * 0.02;
  const cone = new Mesh(new LatheGeometry([[0, 0.5], [0.3, 0.48], [0.62, 0.36], [0.85, 0.2], [0.95, 0.01]].map(([x, k]) => new Vector2(k * r, x * r)), 32), m.titanium);
  cone.rotation.z = Math.PI / 2;
  fan.add(cone);
  const R = prop / 2;
  const geo = new PlaneGeometry(1, R * 0.86, 3, 14);
  const p = geo.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / (R * 0.86) + 0.5;
    // 桨叶：根部窄、中段宽、尖端收圆，从根到尖扭转
    const chord = R * (0.07 + 0.11 * Math.sin(Math.PI * Math.min(1, h * 0.8 + 0.12))) * (h > 0.9 ? Math.sqrt(Math.max(0.04, (1 - h) / 0.1)) : 1);
    const a = 0.35 + h * 0.75;
    const w = p.getX(i) * chord;
    p.setXYZ(i, w * Math.cos(a), R * 0.14 + h * R * 0.86, w * Math.sin(a));
  }
  geo.computeVertexNormals();
  const blades = new InstancedMesh(geo, m.dark, n);
  const mat = new Matrix4();
  for (let i = 0; i < n; i++) blades.setMatrixAt(i, mat.makeRotationX((i / n) * Math.PI * 2 + 0.3));
  blades.position.x = -r * 0.25;
  // 阴影只算一次，转动的桨叶不投影
  fan.add(blades);
  group.add(fan);
  return { group, fan };
}

/** 挂架：连着短舱顶部和机翼下表面的一片 */
function pylon(
  w: ReturnType<typeof wingAt>,
  e: Aircraft3DSpec["engines"][number],
  material: Material,
  side: 1 | -1,
): Mesh {
  const r = e.diameter / 2;
  const x0 = w.x - e.ahead;
  const cy = w.y - e.drop;
  const width = r * 0.2;
  const q = new Shape();
  q.moveTo(x0 + e.length * 0.24, cy + r * 0.93);
  q.quadraticCurveTo(x0 + e.length * 0.36, cy + r * 1.16, w.x + w.chord * 0.03, w.y + w.chord * 0.012);
  q.lineTo(w.x + w.chord * 0.62, w.y - w.chord * 0.03);
  q.quadraticCurveTo(x0 + e.length * 1.12, cy + r * 0.62, x0 + e.length * 0.94, cy + r * 0.34);
  q.lineTo(x0 + e.length * 0.66, cy + r * 0.5);
  q.lineTo(x0 + e.length * 0.5, cy + r * 0.85);
  q.closePath();
  const g = new ExtrudeGeometry(q, {
    depth: width * 0.5,
    bevelEnabled: true,
    bevelThickness: width * 0.25,
    bevelSize: width * 0.2,
    bevelSegments: 3,
  });
  const m = new Mesh(g, material);
  m.position.z = side * e.z - width * 0.25;
  return m;
}
