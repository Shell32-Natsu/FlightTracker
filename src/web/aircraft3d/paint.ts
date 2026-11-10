import type { Livery } from "../aircraft/livery";
import { isLight } from "../aircraft/livery";
import type { Aircraft3DSpec } from "./specs";
import { finBounds, type Pane } from "./geometry";

export interface PaintInput {
  spec: Aircraft3DSpec;
  livery: Livery;
  /** 航司强调色，取不到徽标时画在白色垂尾上 */
  accent: string | null;
  logo: HTMLImageElement | null;
}

const FONT = "'Inter Variable', 'Noto Sans SC', system-ui, sans-serif";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

/**
 * 机身贴图：横向是机身 x，纵向是绕机身一圈（下半张是 +z 侧，上半张是 −z 侧倒过来的）。
 */
export function paintFuselage({ spec: s, livery: l }: PaintInput, W = 4096) {
  const H = W / 4;
  const { c, ctx } = canvas(W, H);

  const sx = W / s.length;
  const sy = H / (2 * Math.PI * ((s.rw + s.rh) / 2));
  /** 机身坐标（x 米、φ 度：0 在水平面、90 在机背）→ 画布 */
  const py = (phi: number, side: 1 | -1) => (side === 1 ? H - ((phi + 90) / 360) * H : ((phi + 90) / 360) * H);
  /** 在某一侧的某个位置画，局部坐标是米，文字方向正确 */
  const at = (x: number, phi: number, side: 1 | -1, fn: () => void) => {
    ctx.save();
    ctx.translate(x * sx, py(phi, side));
    if (side === -1) ctx.rotate(Math.PI);
    ctx.scale(sx, sy);
    fn();
    ctx.restore();
  };
  const band = (lo: number, hi: number, color: string) => {
    ctx.fillStyle = color;
    for (const side of [1, -1] as const) {
      const [a, b] = [py(lo, side), py(hi, side)];
      ctx.fillRect(0, Math.min(a, b), W, Math.abs(a - b));
    }
  };

  ctx.fillStyle = "#f7f9fb";
  ctx.fillRect(0, 0, W, H);
  if (l.upper) band(16, 90, l.upper);
  if (l.stripe) band(17, 20.5, l.stripe);
  band(-90, s.bellyPhi, l.belly ?? "#e2e7ec");

  for (const side of [1, -1] as const) {
    // 蒙皮接缝
    ctx.strokeStyle = "rgba(40,55,80,0.1)";
    ctx.lineWidth = 1.2;
    for (let x = s.length * 0.14; x < s.length - 3; x += s.length / 13) {
      ctx.beginPath();
      ctx.moveTo(x * sx, py(-90, side));
      ctx.lineTo(x * sx, py(90, side));
      ctx.stroke();
    }

    // 雷达罩接缝
    ctx.strokeStyle = "rgba(40,55,80,0.2)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(s.radome * sx, py(-90, side));
    ctx.lineTo(s.radome * sx, py(90, side));
    ctx.stroke();

    // 舷窗
    const [ww, wh] = s.windowSize;
    for (const row of s.windows) {
      for (let x = row.from; x < row.to; x += 0.53) {
        if (row.gaps.some((q) => Math.abs(q - x) < 0.95)) continue;
        const shape = (grow: number) => {
          ctx.beginPath();
          ctx.roundRect(-ww / 2 - grow, -wh / 2 - grow, ww + grow * 2, wh + grow * 2, ww * 0.44);
        };
        at(x, row.phi, side, () => {
          ctx.fillStyle = "rgba(60,75,100,0.22)";
          shape(0.035);
          ctx.fill();
          ctx.fillStyle = "#1a2231";
          shape(0);
          ctx.fill();
        });
      }
    }
    // 舱门
    for (const d of s.doors)
      at(d.x, d.phi, side, () => {
        ctx.strokeStyle = "rgba(50,62,84,0.62)";
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.roundRect(-d.w / 2, -d.h / 2, d.w, d.h, 0.18);
        ctx.stroke();
        ctx.fillStyle = "#1a2231";
        ctx.beginPath();
        ctx.roundRect(-0.1, -d.h * 0.24, 0.2, 0.26, 0.08);
        ctx.fill();
      });

    // 航司标题
    if (l.titles)
      at(s.titles.x, s.titles.phi, side, () => {
        const size = s.titles.size;
        ctx.font = `800 ${100}px ${FONT}`;
        ctx.scale(size / 100, size / 100);
        ctx.fillStyle = l.titleColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "5px";
        const max = (s.length * 0.3) / (size / 100);
        ctx.fillText(l.titles, 0, 0, max);
      });
  }
  return c;
}

/** 一块驾驶舱玻璃：透明底，只有窗框、密封条、玻璃，按实际尺寸等比画。 */
export function paintPane({ outline, w, h }: Pane, radius: number, wiper: boolean, mask = false) {
  const k = 640 / Math.max(w, h);
  const { c, ctx } = canvas(Math.round(w * k), Math.round(h * k));
  const q = outline.map(([x, y]) => [x * k, (h - y) * k] as const);
  const n = q.length;
  const mid = (a: readonly [number, number], b: readonly [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  ctx.beginPath();
  ctx.moveTo(...mid(q[n - 1], q[0]));
  for (let i = 0; i < n; i++) ctx.arcTo(...q[i], ...mid(q[i], q[(i + 1) % n]), radius * k);
  ctx.closePath();
  ctx.lineJoin = "round";
  // 黑色窗罩：相邻玻璃的粗黑边连成一片
  ctx.strokeStyle = mask ? "#10141b" : "#aeb6c1";
  ctx.lineWidth = radius * (mask ? 2.9 : 0.95) * k;
  ctx.stroke();
  ctx.strokeStyle = "#262c36";
  ctx.lineWidth = radius * 0.45 * k;
  ctx.stroke();
  // 上沿深，下沿透出一点仪表台的灰
  const g = ctx.createLinearGradient(0, 0, 0, h * k);
  g.addColorStop(0.1, "#0b1018");
  g.addColorStop(0.6, "#162030");
  g.addColorStop(0.95, "#2f3b4a");
  ctx.fillStyle = g;
  ctx.fill();
  if (wiper) {
    ctx.clip();
    ctx.strokeStyle = "#05070a";
    ctx.lineCap = "round";
    ctx.lineWidth = radius * 0.3 * k;
    ctx.beginPath();
    const at = (u: number, v: number) => [w * k * u, h * k * v] as const;
    ctx.moveTo(...at(0.3, 0.98));
    ctx.lineTo(...at(0.62, 0.44));
    ctx.stroke();
  }
  return c;
}

/** 垂尾贴图：左半张 +z 侧，右半张 −z 侧（镜像过，徽标在两侧都是正的）。 */
export function paintFin({ spec, livery: l, accent, logo }: PaintInput, size = 1024) {
  const b = finBounds(spec);
  const W = size * 2;
  const H = Math.round(size * ((b.y1 - b.y0) / (b.x1 - b.x0)));
  const { c, ctx } = canvas(W, H);
  const light = isLight(l.tail);
  const half = W / 2;
  const f = spec.fin;
  const toX = (x: number) => ((x - b.x0) / (b.x1 - b.x0)) * half;
  const toY = (y: number) => H - ((y - b.y0) / (b.y1 - b.y0)) * H;
  const tip = f.sections.at(-1)!;
  const tan = Math.tan((f.sweep * Math.PI) / 180);

  const side = () => {
    ctx.fillStyle = l.tail;
    ctx.fillRect(0, 0, half, H);
    if (light && accent && !logo) {
      // 白尾翼又没有徽标：一大一小两道斜带
      ctx.save();
      ctx.translate(toX(f.x + tan * tip.at * 0.55 + tip.chord), toY(b.y0 + tip.at * 0.52));
      ctx.rotate(-0.62);
      ctx.fillStyle = accent;
      ctx.fillRect(-half, -H * 0.17, half * 2, H * 0.34);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(-half, H * 0.21, half * 2, H * 0.07);
      ctx.restore();
    }
    // 方向舵
    ctx.strokeStyle = light ? "rgba(20,34,60,0.28)" : "rgba(255,255,255,0.24)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const hinge = (t: number) => {
      const chord = f.sections[0].chord + (tip.chord - f.sections[0].chord) * t;
      return [toX(f.x + tan * tip.at * t + chord * 0.69), toY(b.y0 + tip.at * t)] as const;
    };
    ctx.moveTo(...hinge(0.14));
    ctx.lineTo(...hinge(0.97));
    ctx.moveTo(...hinge(0.55));
    ctx.lineTo(half, hinge(0.55)[1]);
    ctx.stroke();
  };
  const art = (flip: boolean) => {
    if (!logo) return;
    const h = tip.at * 0.46;
    const cx = toX(f.x + tan * tip.at * 0.5 + (f.sections[0].chord + tip.chord) * 0.27);
    const cy = toY(b.y0 + tip.at * 0.52);
    const px = (h / (b.x1 - b.x0)) * half;
    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    // 徽标不一定是方的，按比例放进 px × px
    const ratio = logo.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 1;
    const [w, h2] = ratio > 1 ? [px, px / ratio] : [px * ratio, px];
    let mark: CanvasImageSource = logo;
    if (l.logo === "white") {
      // 用徽标的形状填白
      const t = canvas(512, Math.max(1, Math.round(512 / ratio)));
      t.ctx.drawImage(logo, 0, 0, t.c.width, t.c.height);
      t.ctx.globalCompositeOperation = "source-in";
      t.ctx.fillStyle = "#fff";
      t.ctx.fillRect(0, 0, t.c.width, t.c.height);
      mark = t.c;
    }
    ctx.drawImage(mark, -w / 2, -h2 / 2, w, h2);
    ctx.restore();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, half, H);
  ctx.clip();
  side();
  art(false);
  ctx.restore();
  // 右半张整体镜像；徽标再翻一次，在 −z 侧看才是正的
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.rect(0, 0, half, H);
  ctx.clip();
  side();
  art(true);
  ctx.restore();
  return c;
}

/** 机翼贴图：上半是下表面、下半是上表面（v 从上表面后缘到前缘再到下表面后缘）。 */
export function paintWing(kind: "wing" | "stab") {
  const W = 2048;
  const H = 1024;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = "#c3cad3";
  ctx.fillRect(0, 0, W, H);
  // v → 画布 y（贴图默认上下翻转）；前缘在正中
  const y = (chord: number, upper: boolean) => (upper ? H - ((1 - chord) / 2) * H : H / 2 - (chord / 2) * H);
  // 前缘缝翼：抛光金属
  const lead = kind === "wing" ? 0.1 : 0.06;
  ctx.fillStyle = "#e6eaee";
  ctx.fillRect(0, y(lead, false), W, y(lead, true) - y(lead, false));
  for (const upper of [true, false]) {
    const line = (x0: number, c0: number, x1: number, c1: number, w = 2.5, color = "rgba(40,52,74,0.42)") => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0 * W, y(c0, upper));
      ctx.lineTo(x1 * W, y(c1, upper));
      ctx.stroke();
    };
    line(0, lead, 1, lead);
    if (kind === "stab") {
      line(0.12, 0.7, 0.98, 0.7);
      continue;
    }
    // 后缘襟翼、副翼
    line(0.1, 0.72, 0.94, 0.72);
    for (const u of [0.1, 0.36, 0.72, 0.94]) line(u, 0.72, u, 1);
    for (const u of [0.22, 0.38, 0.52, 0.66, 0.8]) line(u, 0, u, lead);
    if (upper) {
      // 扰流板颜色略深
      ctx.fillStyle = "rgba(70,84,108,0.16)";
      for (const [a, b] of [[0.14, 0.34], [0.38, 0.46], [0.47, 0.55], [0.56, 0.64], [0.65, 0.71]])
        ctx.fillRect(a * W, Math.min(y(0.58, true), y(0.71, true)), (b - a) * W, Math.abs(y(0.71, true) - y(0.58, true)));
    }
  }
  return c;
}
