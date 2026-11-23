import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { TAU } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * Transport 运输机
 * 行为：缓慢飞过战场 → 周期性在身后投放 Fighter → 飞离
 * 不直接攻击；价值是制造持续的子目标压力
 */
export class Transport extends Enemy {
  constructor() { super(); this.type = 'transport'; this.spawnT = 1.0; }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.transport, x, y);
    this.spawnT = this.cfg.spawnInterval || 1.6;
    const fromLeft = x < W / 2;
    this.vx = fromLeft ? this.cfg.speed : -this.cfg.speed;
    this.vy = 0;
    this.angle = fromLeft ? 0 : Math.PI;
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.x > 60 && this.x < W - 60) {
      this.spawnT = (this.cfg.spawnInterval || 1.6) * (0.9 + Math.random() * 0.3);
      if (world.spawnEnemy) {
        // 在身后投放一架 Fighter
        const sx = this.x - Math.sign(this.vx) * 36;
        const sy = this.y + 24;
        world.spawnEnemy('fighter', sx, sy);
      }
    }
    if (this.x < -90 || this.x > W + 90) {
      this.alive = false;
      if (world.onEnemyEscape) world.onEnemyEscape(this);
    }
    this._updateFacing();
  }

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);
    const c = this.cfg;
    const f = this.hitFlash > 0;
    // 大长机身
    ctx.fillStyle = f ? '#fff' : c.color;
    ctx.strokeStyle = f ? '#fff' : 'rgba(140,200,255,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(20, -10);
    ctx.lineTo(-30, -8);
    ctx.lineTo(-36, 0);
    ctx.lineTo(-30, 8);
    ctx.lineTo(20, 10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 机翼
    ctx.fillStyle = f ? '#fff' : '#2f5b4a';
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-4, -22);
    ctx.lineTo(-14, -20);
    ctx.lineTo(0, -2);
    ctx.lineTo(0, 2);
    ctx.lineTo(-14, 20);
    ctx.lineTo(-4, 22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 投放口
    if (this.spawnT < 0.4) {
      ctx.fillStyle = '#ff9a3d';
      ctx.beginPath(); ctx.arc(-26, 0, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

export default Transport;
