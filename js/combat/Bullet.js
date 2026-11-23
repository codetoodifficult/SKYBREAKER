import { ObjectPool } from '../core/ObjectPool.js';
import { CONFIG } from '../data/config.js';

/**
 * 子弹系统（对象池）
 * - 普通子弹：线段扫掠碰撞（防穿透）
 * - Flak 炮弹：flak=true，直线飞行到 range 后引爆（AoE），不参与直接碰撞
 *   引爆时调用 this.onBoom(x, y, boom, bullet) —— Game 提供范围伤害
 */
function makeBullet() {
  return {
    x: 0, y: 0, px: 0, py: 0,
    vx: 0, vy: 0,
    r: 3,
    damage: 10,
    life: 0,
    penetration: 0,
    hitIds: [],
    crit: false,
    color: [255, 226, 150],
    flak: false,          // 高射炮弹
    boomOnHit: null,      // Phase 16：命中即爆（VULCAN BURST）
    boom: null,           // { radius, damage }
    range: 0,
    prox: 0,              // 近炸引信半径 px（>0 时飞到敌人附近即引爆，不必等 range）
    dist: 0,
    primary: false,       // 是否由【主武器】发射（只有主武器能与 XP 光球交互）
    weaponId: null,       // Phase E：来源武器（击杀/状态归属）
    active: false,
  };
}
function resetBullet(b) {
  b.active = false;
  b.hitIds.length = 0;
  b.life = 0;
  b.crit = false;
  b.flak = false;
  b.boom = null;
  b.boomOnHit = null;
  b.range = 0;
  b.prox = 0;
  b.dist = 0;
  b.primary = false;
  b.weaponId = null;
}

export class BulletSystem {
  constructor() {
    this.pool = new ObjectPool(makeBullet, resetBullet, 200);
    this.onBoom = null;    // (x, y, boom) => void
  }
  get list() { return this.pool.active; }
  get count() { return this.pool.activeCount; }

  spawn(o) {
    if (this.pool.activeCount >= CONFIG.PERF.maxBullets) return null;
    const b = this.pool.get();
    b.x = b.px = o.x;
    b.y = b.py = o.y;
    b.vx = Math.cos(o.angle) * o.speed;
    b.vy = Math.sin(o.angle) * o.speed;
    b.r = o.r;
    b.damage = o.damage;
    b.life = o.life;
    b.penetration = o.penetration || 0;
    b.crit = !!o.crit;
    b.color = o.color || [255, 226, 150];
    b.flak = !!o.flak;
    b.boom = o.boom || null;
    b.boomOnHit = o.boomOnHit || null;   // Phase 16：VULCAN BURST
    b.range = o.range || 0;
    b.prox = o.prox || 0;      // 近炸引信（高射炮）
    b.dist = 0;
    b.primary = !!o.primary;   // 主武器（手动槽）发射
    b.weaponId = o.weaponId || null;   // Phase E：来源归属
    b.active = true;
    return b;
  }

  releaseAt(i) { this.pool.releaseAt(i); }

  /**
   * 近炸判定：炮弹本帧扫过的线段 (px,py)→(x,y) 与敌人的最短距离 ≤ 引信半径即引爆。
   * 用线段而不是点，避免高速炮弹一帧跨过敌人却不触发。
   */
  _proxHit(b, world) {
    if (!(b.prox > 0) || !world) return false;
    const list = world.enemies && world.enemies.list;
    if (!list || !list.length) return false;
    const sx = b.x - b.px, sy = b.y - b.py;
    const len2 = sx * sx + sy * sy;
    for (const e of list) {
      if (!e.alive) continue;
      let t = 0;
      if (len2 > 1e-6) {
        t = ((e.x - b.px) * sx + (e.y - b.py) * sy) / len2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
      }
      const cx = b.px + sx * t, cy = b.py + sy * t;
      const dx = e.x - cx, dy = e.y - cy;
      const rad = b.prox + (e.radius || 0);
      if (dx * dx + dy * dy <= rad * rad) return true;
    }
    return false;
  }

  /** @param {object} [world] 传入后才启用近炸引信（需要敌人列表） */
  update(dt, world) {
    const act = this.pool.active;
    for (let i = act.length - 1; i >= 0; i--) {
      const b = act[i];
      b.life -= dt;
      b.px = b.x; b.py = b.y;
      const step = Math.hypot(b.vx, b.vy) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.dist += step;

      const out = b.x < -60 || b.x > CONFIG.WORLD.WIDTH + 60 ||
                  b.y < -160 || b.y > CONFIG.WORLD.HEIGHT + 60;

      if (b.flak) {
        const arrived = b.range > 0 && b.dist >= b.range;
        // 近炸引信：飞到敌人附近就提前炸，不必等飞满设定距离
        const prox = this._proxHit(b, world);
        if (prox || arrived || b.life <= 0 || out) {
          if (b.boom && this.onBoom) this.onBoom(b.x, b.y, b.boom, b);
          this.releaseAt(i);
        }
        continue;
      }

      if (b.life <= 0 || out) this.releaseAt(i);
    }
  }

  render(ctx) {
    const act = this.pool.active;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < act.length; i++) {
      const b = act[i];
      const c = b.color;

      // 高射炮弹：更大的发光弹体 + 尾迹
      if (b.flak) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.95)`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.6)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y);
        ctx.stroke();
        continue;
      }

      const tx = b.x - b.vx * 0.016;
      const ty = b.y - b.vy * 0.016;
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.55)`;
      ctx.lineWidth = b.r * 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = b.r * 0.7;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.006, b.y - b.vy * 0.006);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3.4);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.9)`);
      g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear() { this.pool.releaseAll(); }
  stats() { return this.pool.stats(); }
}

export default BulletSystem;
