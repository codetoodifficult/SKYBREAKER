import { CONFIG } from '../data/config.js';
import { rand, randInt, TAU, clamp } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;
const H = CONFIG.WORLD.HEIGHT;

/**
 * 地平线（建筑与炮塔的落地点），取自 CONFIG.GROUND_Y。
 * 必须与炮塔基座底边、Base 三座建筑的脚底一致，否则会出现"浮空"的错层感。
 */
const GROUND_Y = CONFIG.GROUND_Y;

/**
 * 雷达/探照灯扫描扇形
 * 只在「向上的半圆」内往返：右地平线(0) → 头顶(-π/2) → 左地平线(-π)，不扫向地面。
 * 画布坐标系 y 轴向下，故"向上"= 角度落在 (-π, 0)。
 */
const SWEEP_ARC = 0.22;                  // 扇形张角（rad）
const SWEEP_MAX = 0;                     // 右地平线
const SWEEP_MIN = -Math.PI + SWEEP_ARC;  // 左地平线：留出张角余量，保证整段扇形都不越过地平线
const SWEEP_SPEED = 0.55;                // rad/s

/**
 * 背景：多层视差夜空
 * Layer1 星空（离屏预渲染）→ Layer2 云 → Layer3 城市剪影+灯光 → 雷达扫描线 → 远处闪电
 * 预渲染静态图层到离屏 canvas，每帧只做 drawImage，移动端开销极低。
 */
export class Background {
  constructor() {
    this.t = 0;
    this.starCanvas = this._buildStars();
    this.cityCanvas = this._buildCity();
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: rand(-200, W + 200),
        y: rand(40, 300),
        w: rand(180, 420),
        h: rand(26, 62),
        sp: rand(4, 13),
        a: rand(0.04, 0.11),
      });
    }
    this.lightning = { t: 0, next: rand(4, 11), x: 0 };
    this.radarAngle = 0;
    this.radarDir = -1;      // -1 向左扫 / +1 向右扫（半圆内往返）
  }

  _buildStars() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    for (let i = 0; i < 230; i++) {
      const x = Math.random() * W;
      const y = Math.random() * (H * 0.72);
      const r = Math.random() < 0.9 ? rand(0.5, 1.1) : rand(1.2, 1.9);
      const a = rand(0.25, 0.95);
      g.fillStyle = `rgba(200,226,255,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // 几颗亮星带十字光
    for (let i = 0; i < 8; i++) {
      const x = rand(0, W), y = rand(0, H * 0.5), s = rand(5, 11);
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, 'rgba(180,220,255,.55)');
      grd.addColorStop(1, 'rgba(180,220,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
    return c;
  }

  _buildCity() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const G = GROUND_Y;

    // 远景楼群（更暗）
    this._drawSkyline(g, G + 4, 120, '#080d18', 0.55, 7);
    // 近景楼群
    this._drawSkyline(g, G + 12, 78, '#0b1220', 1.0, 11);

    // ---- 地面：上缘略亮的渐变，让建筑"踩"得到实地 ----
    const gg = g.createLinearGradient(0, G, 0, H);
    gg.addColorStop(0, '#0c1422');
    gg.addColorStop(0.18, '#080e18');
    gg.addColorStop(1, '#04070c');
    g.fillStyle = gg;
    g.fillRect(0, G, W, H - G);

    // 地面横向纹理（远处密而淡、近处疏而清晰）
    for (let i = 0; i < 28; i++) {
      const p = i / 27;
      const y = G + 2 + p * p * (H - G - 3);
      g.strokeStyle = `rgba(125,175,220,${0.018 + 0.055 * p})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.random() * 60 - 30, y);
      g.lineTo(W - Math.random() * 60 + 30, y);
      g.stroke();
    }

    // 地平线：辉光 + 亮线
    const hz = g.createLinearGradient(0, G - 7, 0, G + 5);
    hz.addColorStop(0, 'rgba(57,215,255,0)');
    hz.addColorStop(0.6, 'rgba(57,215,255,.10)');
    hz.addColorStop(1, 'rgba(57,215,255,0)');
    g.fillStyle = hz;
    g.fillRect(0, G - 7, W, 12);
    g.strokeStyle = 'rgba(57,215,255,.22)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, G + 0.5);
    g.lineTo(W, G + 0.5);
    g.stroke();

    return c;
  }

  _drawSkyline(g, baseY, maxH, color, windowAlpha, seedCount) {
    let x = -20;
    let seed = seedCount;
    while (x < W + 40) {
      const bw = 26 + ((seed *= 7) % 5) * 12 + Math.random() * 26;
      const bh = 24 + Math.random() * maxH;
      const by = baseY - bh;
      g.fillStyle = color;
      g.fillRect(x, by, bw, bh + 30);

      // 窗户灯光
      const cols = Math.max(1, Math.floor(bw / 9));
      const rows = Math.max(1, Math.floor(bh / 12));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.24) continue;
          const wx = x + 4 + c * 9;
          const wy = by + 5 + r * 12;
          if (wx > x + bw - 4) continue;
          const warm = Math.random();
          g.fillStyle = warm > 0.72
            ? `rgba(255,190,110,${windowAlpha * rand(0.35, 0.8)})`
            : `rgba(120,200,255,${windowAlpha * rand(0.2, 0.55)})`;
          g.fillRect(wx, wy, 3, 4);
        }
      }
      x += bw + rand(2, 10);
    }
  }

  update(dt) {
    this.t += dt;
    for (const c of this.clouds) {
      c.x += c.sp * dt;
      if (c.x - c.w > W) { c.x = -c.w - rand(40, 240); c.y = rand(40, 300); }
    }

    // 远处闪电
    this.lightning.next -= dt;
    if (this.lightning.next <= 0) {
      this.lightning.t = 0.18;
      this.lightning.x = rand(80, W - 80);
      this.lightning.next = rand(5, 14);
    }
    if (this.lightning.t > 0) this.lightning.t -= dt;

    // 探照灯：在向上半圆内往返扫描（碰边界即掉头），不再 360° 转圈
    this.radarAngle += this.radarDir * dt * SWEEP_SPEED;
    if (this.radarAngle >= SWEEP_MAX) {
      this.radarAngle = SWEEP_MAX;
      this.radarDir = -1;
    } else if (this.radarAngle <= SWEEP_MIN) {
      this.radarAngle = SWEEP_MIN;
      this.radarDir = 1;
    }
  }

  render(ctx) {
    // 渐变夜空
    const sky = ctx.createLinearGradient(0, 0, 0, CONFIG.WORLD_GROUND_Y);
    sky.addColorStop(0, '#070c1a');
    sky.addColorStop(0.55, '#0a1424');
    sky.addColorStop(1, '#131f33');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y + 1);

    // L1 星空
    ctx.drawImage(this.starCanvas, 0, Math.sin(this.t * 0.05) * 2);

    // 闪电（在最远的云之后）
    if (this.lightning.t > 0) {
      const a = clamp(this.lightning.t / 0.18, 0, 1) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(150,205,255,${a * 0.22})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // L2 云
    ctx.save();
    for (const c of this.clouds) {
      const grd = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y);
      grd.addColorStop(0, 'rgba(120,150,190,0)');
      grd.addColorStop(0.5, `rgba(120,150,190,${c.a})`);
      grd.addColorStop(1, 'rgba(120,150,190,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 2, c.y, c.w / 2, c.h / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // L3 城市剪影
    ctx.drawImage(this.cityCanvas, 0, 0);

    // 雷达扫描扇形（很淡，纯氛围）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = CONFIG.TURRET.x, cy = CONFIG.TURRET.y;
    const rr = 620;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grd.addColorStop(0, 'rgba(57,215,255,0.055)');
    grd.addColorStop(1, 'rgba(57,215,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rr, this.radarAngle - SWEEP_ARC, this.radarAngle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export default Background;
