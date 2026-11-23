import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { rotateTowards } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * Suicide Drone 自杀无人机
 * 行为：高速直冲基地，撞击自毁
 * 目标：base
 */
export class SuicideDrone extends Enemy {
  constructor() { super(); this.type = 'drone'; this.state = 'dive'; }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.suicideDrone, x, y);
    this.state = 'dive';
    this.speed = this.cfg.diveSpeed;
    this.angle = 0;
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;
    const want = Math.atan2(world.gun.y - this.y, world.gun.x - this.x);
    this.angle = rotateTowards(this.angle, want, this.cfg.turnRate * dt);
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // 撞基地/出界
    if (this.y > CONFIG.WORLD_GROUND_Y - 4) { this.crash(world); return; }
    if (this.x < -100 || this.x > W + 100) {
      this.alive = false;
      if (world.onEnemyEscape) world.onEnemyEscape(this);
    }
  }

  crash(world) {
    this.alive = false;
    this.die(world, false);
    if (world.onBaseDamage) world.onBaseDamage(this.cfg.damage, this);
  }

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);
    const c = this.cfg;
    const f = this.hitFlash > 0;
    // 尾焰
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(-10, 0, 0, -10, 0, 10);
    eg.addColorStop(0, 'rgba(255,180,80,.95)');
    eg.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(-10, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 三角机身
    ctx.fillStyle = f ? '#fff' : c.color;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-10, -7); ctx.lineTo(-14, 0); ctx.lineTo(-10, 7);
    ctx.closePath(); ctx.fill();
    // 翼
    ctx.fillStyle = f ? '#fff' : '#2a3344';
    ctx.beginPath();
    ctx.moveTo(2, 0); ctx.lineTo(-8, -10); ctx.lineTo(-14, -8); ctx.lineTo(-4, 0);
    ctx.lineTo(-14, 8); ctx.lineTo(-8, 10);
    ctx.closePath(); ctx.fill();
    // 红灯
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(4, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

export default SuicideDrone;
