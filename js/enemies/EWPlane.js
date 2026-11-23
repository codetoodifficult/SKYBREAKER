import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { TAU } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * EW Plane 电子战机
 * 行为：在战场顶部做"巡逻"往返（水平 + 轻微正弦起伏）
 * 存活时全局雷达范围 -30%（即 base.radarJam 标志，aim + assist 距离缩短）
 * 目标：radar（间接）
 */
export class EWPlane extends Enemy {
  constructor() { super(); this.type = 'ewPlane'; this.baseX = 0; this.phase = 0; this.dir = 1; this.patrolLeft = 0; this.leaving = false; }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.ewPlane, x, y);
    this.baseX = x;
    this.phase = 0;
    this.dir = 1;
    this.vx = this.cfg.speed;
    this.vy = 0;
    this.leaving = false;
    // Bugfix：巡逻限时。原版无限巡逻会让「全部投放完且场上无敌」永远不成立，
    // 波次只能等 maxSec 超时靠"残余敌机撤离"收尾（表现为长时间不刷怪 + 波拖到残敌逃走）。
    this.patrolLeft = 10 + Math.random() * 4;   // 巡逻 10~14s 后离场
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;
    this.x += this.vx * dt;
    // 来回巡逻（限时内；超时后保持当前方向飞出边界）
    this.patrolLeft -= dt;
    if (this.patrolLeft <= 0) this.leaving = true;
    if (!this.leaving) {
      if (this.x > 1200) this.dir = -1;
      if (this.x < 80) this.dir = 1;
    }
    // 离场时加速撤离，缩短占用波次的时间
    this.vx = this.dir * this.cfg.speed * (this.leaving ? 1.8 : 1);
    this.phase += dt * 1.4;
    this.y = 90 + Math.sin(this.phase) * 18;
    this.angle = this.dir > 0 ? 0 : Math.PI;

    // 离场模式飞出边界 → 逃逸，不再阻塞波次清场；极端出界同样处理
    if (this.x < -120 || this.x > W + 120) {
      if (!this.leaving) { this.leaving = true; return; }   // 原版兜底：先弹回
      this.alive = false;
      if (world.onEnemyEscape) world.onEnemyEscape(this);
    }
  }

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);
    const c = this.cfg;
    const f = this.hitFlash > 0;
    // 机身
    ctx.fillStyle = f ? '#fff' : c.color;
    ctx.strokeStyle = f ? '#fff' : 'rgba(57,215,255,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(4, -7); ctx.lineTo(-18, -5); ctx.lineTo(-22, 0);
    ctx.lineTo(-18, 5); ctx.lineTo(4, 7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 大碟天线
    ctx.fillStyle = f ? '#fff' : '#1f4f44';
    ctx.beginPath();
    ctx.ellipse(0, -3, 18, 5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#39d7ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -3, 18, 5, 0, 0, TAU);
    ctx.stroke();
    // 干扰波
    ctx.strokeStyle = 'rgba(57,215,255,.55)';
    ctx.lineWidth = 1.2;
    const t = (this.phase * 0.8) % (Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      const r = 22 + i * 6 + (Math.sin(t + i) + 1) * 4;
      ctx.beginPath();
      ctx.arc(0, -3, r, Math.PI + 0.2, Math.PI * 2 - 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export default EWPlane;
