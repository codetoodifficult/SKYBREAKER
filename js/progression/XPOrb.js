import { ObjectPool } from '../core/ObjectPool.js';
import { CONFIG } from '../data/config.js';
import { rand, TAU, rotateTowards, distSegPoint2 } from '../core/utils.js';

/**
 * XP 光球
 * 阶段：
 *   漂浮（随机漂动，速度衰减）
 *   → 距离炮塔 < pickupRadius 时磁吸
 *   → 或被【主武器】的攻击命中（hitByBullet / hitByBeam / activateInCircle）
 *     → 像导弹一样追踪炮塔飞回
 *   → 撞击炮塔后回收 + 加 XP
 *
 * 【只有主武器能与经验交互】
 * 副武器（自动槽）的子弹 / 导弹 / 光束一律穿过光球，不做任何判定。
 * 光球也不会自己飞回炮塔 —— 玩家想吃到就得用主武器把光球打回来，
 * 或者把炮塔开进磁吸范围。这是刻意的设计，别再加"超时自动回家"。
 */

function makeOrb() {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, alive: false,
    value: 1,
    pulse: 0,           // 视觉脉冲相位
    homing: false,      // 追踪炮塔状态（被子弹击中 或 超时自动触发）
    angle: 0,           // homing 转向角
    speed: 0,           // homing 当前速度
  };
}
function resetOrb(o) {
  o.alive = false; o.life = 0; o.pulse = 0;
  o.homing = false; o.angle = 0; o.speed = 0;
}

export class XPOrb {
  constructor() {
    this.pool = new ObjectPool(makeOrb, resetOrb, 60);
    this.list = [];
    this.magnetRadius = 200;   // 由 XPSystem 每帧更新
  }

  spawn(x, y, value) {
    if (this.list.length >= CONFIG.PERF.maxOrbs) return null;
    const o = this.pool.get();
    o.x = x; o.y = y;
    const a = rand(0, TAU);
    const sp = rand(40, 90);
    o.vx = Math.cos(a) * sp;
    o.vy = Math.sin(a) * sp;
    o.life = 12;             // 12 秒后自然消失
    o.value = value;
    o.pulse = rand(0, TAU);
    o.homing = false;
    o.angle = 0;
    o.speed = 0;
    o.alive = true;
    this.list.push(o);
    return o;
  }

  /**
   * 激活：进入追踪炮塔状态（像导弹一样飞回）。
   * 只应由【主武器】的攻击调用。
   * @param {object} o 光球
   * @param {number} dirX,dirY 击飞方向（不需要归一化）
   * @returns {boolean} 是否成功激活
   */
  activate(o, dirX, dirY) {
    if (!o || !o.alive || o.homing) return false;
    const len = Math.hypot(dirX, dirY);
    o.homing = true;
    o.angle = len > 1e-4 ? Math.atan2(dirY, dirX) : rand(0, TAU);
    o.speed = 300;                      // 初速度，随后转向炮塔并加速
    o.vx = Math.cos(o.angle) * o.speed;
    o.vy = Math.sin(o.angle) * o.speed;
    return true;
  }

  /**
   * 被主武器子弹命中。
   * @param {object} o 光球
   * @param {object} b 子弹（取其速度方向作为初始冲量方向）
   */
  hitByBullet(o, b) {
    return this.activate(o, b ? b.vx : 0, b ? b.vy : 0);
  }

  /**
   * 被主武器的光束 / 射线命中（脉冲激光、电磁炮）。
   * 线段 (x1,y1)→(x2,y2) 附近 width 内的光球都会被激活。
   */
  hitByBeam(x1, y1, x2, y2, width) {
    if (!this.list.length) return 0;
    const w = Math.max(8, width || 14);
    let n = 0;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      if (!o.alive || o.homing) continue;
      const rr = w + 11;                              // 光球半径 ~11
      if (distSegPoint2(x1, y1, x2, y2, o.x, o.y) > rr * rr) continue;
      if (this.activate(o, x2 - x1, y2 - y1)) n++;
    }
    return n;
  }

  /**
   * 被主武器的范围爆炸命中（导弹 / 高炮空爆）。
   * 圆内光球都会被激活，方向取"爆心 → 光球"，看起来像被冲击波推开再吸回来。
   */
  activateInCircle(cx, cy, radius, dirX, dirY) {
    if (!this.list.length || !(radius > 0)) return 0;
    let n = 0;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      if (!o.alive || o.homing) continue;
      const dx = o.x - cx, dy = o.y - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const fx = (dirX || 0) || dx, fy = (dirY || 0) || dy;
      if (this.activate(o, fx, fy)) n++;
    }
    return n;
  }

  update(dt, gun, pickupMul, onCollect) {
    const baseR = 200 * pickupMul;
    const attractR = baseR * 1.3;
    const act = this.pool.active;

    for (let i = act.length - 1; i >= 0; i--) {
      const o = act[i];
      if (!o.alive) { this.pool.releaseAt(i); continue; }
      o.life -= dt;
      o.pulse += dt * 6;
      if (o.life <= 0) { o.alive = false; this.pool.releaseAt(i); continue; }

      const dx = gun.x - o.x, dy = gun.y - o.y;
      const d = Math.hypot(dx, dy);

      if (o.homing) {
        // 被子弹击中后：像导弹一样追踪炮塔（转向 + 加速）
        const want = Math.atan2(dy, dx);
        if (d < 60) {
          // 接近炮塔：直接对齐方向，保证进入吸收范围（避免高速绕圈）
          o.angle = want;
        } else {
          o.angle = rotateTowards(o.angle, want, 12 * dt);
        }
        o.speed = Math.min(o.speed + 1400 * dt, 900);
        o.vx = Math.cos(o.angle) * o.speed;
        o.vy = Math.sin(o.angle) * o.speed;
      } else if (d < baseR) {
        // 磁吸：朝炮塔加速
        const ax = (dx / Math.max(1, d)) * 900;
        const ay = (dy / Math.max(1, d)) * 900;
        o.vx = o.vx * 0.9 + ax * dt;
        o.vy = o.vy * 0.9 + ay * dt;
      } else if (d < attractR) {
        // 软牵引
        const ax = (dx / Math.max(1, d)) * 200;
        const ay = (dy / Math.max(1, d)) * 200;
        o.vx = o.vx * 0.96 + ax * dt;
        o.vy = o.vy * 0.96 + ay * dt;
      } else {
        // 漂浮阻尼
        o.vx *= Math.pow(0.94, dt * 60);
        o.vy *= Math.pow(0.94, dt * 60);
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      // 拾取（用移动后的距离，高速 homing 也不会穿模）
      if (Math.hypot(gun.x - o.x, gun.y - o.y) < 26) {
        o.alive = false;
        this.pool.releaseAt(i);
        if (onCollect) onCollect(o.value, o);
      }
    }
    // rebuild list 视图
    this.list.length = 0;
    for (let i = 0; i < act.length; i++) if (act[i].alive) this.list.push(act[i]);
  }

  render(ctx) {
    const act = this.pool.active;
    ctx.save();
    for (let i = 0; i < act.length; i++) {
      const o = act[i];
      if (!o.alive) continue;
      const s = 0.85 + 0.15 * Math.sin(o.pulse);
      const r = 8 * s;

      // 追踪态：像导弹一样拖尾
      if (o.homing) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,205,95,.6)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(o.x - o.vx * 0.03, o.y - o.vy * 0.03);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
      }

      // 外发光
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.4);
      g.addColorStop(0, 'rgba(255,225,120,.9)');
      g.addColorStop(0.5, 'rgba(255,180,80,.45)');
      g.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.4, 0, TAU); ctx.fill();
      // 核心菱形
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff3a8';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - r);
      ctx.lineTo(o.x + r * 0.75, o.y);
      ctx.lineTo(o.x, o.y + r);
      ctx.lineTo(o.x - r * 0.75, o.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  clear() { this.pool.releaseAll(); this.list.length = 0; }
  stats() { return this.pool.stats(); }
}

export default XPOrb;
