import { ObjectPool } from '../core/ObjectPool.js';
import { CONFIG } from '../data/config.js';
import { rand, randInt, TAU } from '../core/utils.js';

/**
 * 粒子系统（自研，不使用第三方库 · 全部走对象池）
 * 支持：火花 / 烟雾 / 碎片 / 光晕 / 尾焰 / 冲击波环
 */

const TYPE = {
  SPARK: 0,
  SMOKE: 1,
  DEBRIS: 2,
  GLOW: 3,
  RING: 4,     // 冲击波圆环（仅绘制，不参与物理）
};

function makeParticle() {
  return {
    type: TYPE.SPARK,
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1,
    size: 2, endSize: 0,
    r: 255, g: 200, b: 120,
    alpha: 1,
    rot: 0, vrot: 0,
    drag: 0.9,
    gravity: 0,
    alive: false,
  };
}

function resetParticle(p) {
  p.alive = false;
  p.life = 0;
  p.rot = 0;
  p.vrot = 0;
  p.gravity = 0;
  p.drag = 0.9;
}

export class ParticleSystem {
  constructor() {
    this.pool = new ObjectPool(makeParticle, resetParticle, 400);
  }

  get count() { return this.pool.activeCount; }

  _spawn(type, x, y, opts) {
    if (this.pool.activeCount >= CONFIG.PERF.maxParticles) return null;
    const p = this.pool.get();
    p.type = type;
    p.x = x; p.y = y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.maxLife = opts.life || 0.5;
    p.life = p.maxLife;
    p.size = opts.size || 2;
    p.endSize = opts.endSize !== undefined ? opts.endSize : 0;
    p.r = opts.r; p.g = opts.g; p.b = opts.b;
    p.alpha = opts.alpha !== undefined ? opts.alpha : 1;
    p.rot = opts.rot || 0;
    p.vrot = opts.vrot || 0;
    p.drag = opts.drag !== undefined ? opts.drag : 0.92;
    p.gravity = opts.gravity || 0;
    p.alive = true;
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* 发射器                                                              */
  /* ------------------------------------------------------------------ */

  /** 爆炸：火花 + 火球 + 烟雾 + 冲击波 + 碎片 */
  explosion(x, y, scale = 1, color = [255, 170, 70]) {
    const n = Math.round(16 * scale);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(60, 300) * scale;
      this._spawn(TYPE.SPARK, x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6) * (0.7 + scale * 0.3),
        size: rand(2, 4.5) * Math.min(2, scale), endSize: 0,
        r: color[0], g: color[1], b: color[2],
        drag: 0.90, gravity: 120,
      });
    }
    // 火球
    for (let i = 0; i < Math.round(4 * scale); i++) {
      this._spawn(TYPE.GLOW, x + rand(-6, 6) * scale, y + rand(-6, 6) * scale, {
        life: rand(0.18, 0.34), size: rand(14, 26) * scale, endSize: 2,
        r: 255, g: 210, b: 130, drag: 0.86,
      });
    }
    // 烟雾
    for (let i = 0; i < Math.round(6 * scale); i++) {
      const a = rand(0, TAU);
      this._spawn(TYPE.SMOKE, x, y, {
        vx: Math.cos(a) * rand(10, 70), vy: Math.sin(a) * rand(10, 70) - 14,
        life: rand(0.6, 1.3), size: rand(8, 16) * scale, endSize: rand(24, 44) * scale,
        r: 90, g: 96, b: 108, alpha: 0.34, drag: 0.94, gravity: -8,
      });
    }
    // 冲击波
    this._spawn(TYPE.RING, x, y, {
      life: 0.28 + scale * 0.12, size: 6 * scale, endSize: 74 * scale,
      r: 255, g: 220, b: 170, alpha: 0.75,
    });
    // 碎片
    for (let i = 0; i < Math.round(5 * scale); i++) {
      const a = rand(0, TAU);
      this._spawn(TYPE.DEBRIS, x, y, {
        vx: Math.cos(a) * rand(40, 190), vy: Math.sin(a) * rand(40, 190) - 40,
        life: rand(0.7, 1.5), size: rand(2.5, 6) * scale, endSize: 0,
        r: 170, g: 185, b: 205, rot: rand(0, TAU), vrot: rand(-9, 9),
        drag: 0.985, gravity: 420,
      });
    }
  }

  /** 炮口火焰 */
  muzzle(x, y, angle) {
    for (let i = 0; i < 4; i++) {
      const a = angle + rand(-0.24, 0.24);
      const sp = rand(180, 460);
      this._spawn(TYPE.SPARK, x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.06, 0.15), size: rand(2, 4), endSize: 0,
        r: 255, g: 226, b: 150, drag: 0.86,
      });
    }
    this._spawn(TYPE.GLOW, x, y, {
      life: 0.07, size: 16, endSize: 4, r: 255, g: 210, b: 140,
    });
  }

  /** 命中火花 */
  hit(x, y, angle, color = [180, 230, 255]) {
    for (let i = 0; i < 6; i++) {
      const a = angle + rand(-1.0, 1.0);
      const sp = rand(70, 260);
      this._spawn(TYPE.SPARK, x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.08, 0.24), size: rand(1.4, 2.8), endSize: 0,
        r: color[0], g: color[1], b: color[2], drag: 0.88, gravity: 60,
      });
    }
  }

  /** 导弹/子弹尾迹 */
  trail(x, y, color = [255, 150, 60]) {
    this._spawn(TYPE.GLOW, x, y, {
      life: 0.18, size: 5, endSize: 0, r: color[0], g: color[1], b: color[2],
    });
  }

  /** 烟雾（持续，用于坠机拖尾） */
  smokePuff(x, y) {
    this._spawn(TYPE.SMOKE, x, y, {
      vx: rand(-16, 16), vy: rand(-30, -8),
      life: rand(0.5, 1.0), size: 5, endSize: 20,
      r: 80, g: 86, b: 98, alpha: 0.3, drag: 0.95, gravity: -6,
    });
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    const act = this.pool.active;
    for (let i = act.length - 1; i >= 0; i--) {
      const p = act[i];
      p.life -= dt;
      if (p.life <= 0) { this.pool.releaseAt(i); continue; }
      if (p.type !== TYPE.RING) {
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d;
        p.vy = p.vy * d + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      }
    }
  }

  render(ctx) {
    const act = this.pool.active;
    // 叠加发光层
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < act.length; i++) {
      const p = act[i];
      const t = p.life / p.maxLife;            // 1 → 0
      const size = p.endSize + (p.size - p.endSize) * t;
      const a = p.alpha * (p.type === TYPE.RING ? t : Math.min(1, t * 1.6));
      if (a <= 0.01 || size <= 0.1) continue;

      if (p.type === TYPE.RING) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.lineWidth = Math.max(1, 4 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.stroke();
        continue;
      }

      if (p.type === TYPE.GLOW) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
        g.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${a})`);
        g.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
        continue;
      }

      if (p.type === TYPE.SPARK) {
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
        continue;
      }
    }
    ctx.restore();

    // 非叠加层（烟雾 / 碎片）
    ctx.save();
    for (let i = 0; i < act.length; i++) {
      const p = act[i];
      const t = p.life / p.maxLife;
      const size = p.endSize + (p.size - p.endSize) * t;
      const a = p.alpha * Math.min(1, t * 1.8);
      if (a <= 0.01 || size <= 0.1) continue;

      if (p.type === TYPE.SMOKE) {
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      } else if (p.type === TYPE.DEBRIS) {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(-size * 0.5, -size * 0.22, size, size * 0.44);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  clear() { this.pool.releaseAll(); }

  stats() { return this.pool.stats(); }
}

export { TYPE as PARTICLE_TYPE };
export default ParticleSystem;
