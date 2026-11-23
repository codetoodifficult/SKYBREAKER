import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { rand, TAU, dist } from '../core/utils.js';
import { CONFIG } from '../data/config.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * Bomber 轰炸机
 * 行为：低空飞过基地上空 → 投放炸弹（每 0.45s 一枚，伤害城市）→ 飞离
 * 目标：city（基地旁边的次要目标）
 */
export class Bomber extends Enemy {
  constructor() {
    super();
    this.type = 'bomber';
    this.state = 'cruise';
    this.bombTimer = 0;
    this.overBase = false;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.bomber, x, y);
    this.state = 'cruise';
    this.bombTimer = 1.0;
    const fromLeft = x < W / 2;
    this.vx = fromLeft ? this.cfg.speed : -this.cfg.speed;
    this.vy = 14;
    this.angle = fromLeft ? 0 : Math.PI;
    this.overBase = false;
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;
    const base = world.gun;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const overX = Math.abs(this.x - base.x) < 200;
    if (overX && !this.overBase) { this.overBase = true; this.bombTimer = 0; }
    if (!overX && this.overBase) { this.overBase = false; }

    if (this.overBase) {
      this.bombTimer -= dt;
      if (this.bombTimer <= 0) {
        this.bombTimer = 0.45;
        if (world.onCityDamage) world.onCityDamage(this.cfg.damage, this);
        world.particles.explosion(this.x, this.y + 30, 0.55, [255, 150, 60]);
        world.audio.explosion(0.6);
        world.shake.shake(3, 80);
      }
    }

    // 飞离
    if (this.x < -80 || this.x > W + 80) {
      this.alive = false;
      if (world.onEnemyEscape) world.onEnemyEscape(this);
      return;
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
    const flashing = this.hitFlash > 0;

    // 机身（大三角）
    ctx.fillStyle = flashing ? '#fff' : c.color;
    ctx.strokeStyle = flashing ? '#fff' : 'rgba(140,200,255,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(6, -11);
    ctx.lineTo(-22, -8);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-22, 8);
    ctx.lineTo(6, 11);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 宽机翼
    ctx.fillStyle = flashing ? '#fff' : '#3a4366';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-18, -22);
    ctx.lineTo(-26, -20);
    ctx.lineTo(-14, -2);
    ctx.lineTo(-14, 2);
    ctx.lineTo(-26, 20);
    ctx.lineTo(-18, 22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 投弹仓灯
    if (this.overBase) {
      ctx.fillStyle = '#ff3b5c';
      ctx.beginPath(); ctx.arc(-6, 0, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

export default Bomber;
