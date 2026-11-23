import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { rand, rotateTowards, dist, TAU } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * Fighter 战斗机
 * 行为：高速横向巡航 → 到达投弹点后俯冲攻击防空炮 → 撞击自毁
 * 目标：gun（Phase 6 会把 Bomber/Drone 等分流到 city/base/radar）
 */
export class Fighter extends Enemy {
  constructor() {
    super();
    this.type = 'fighter';
    this.state = 'cruise';
    this.diveTargetX = 0;
    this.speed = 0;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.fighter, x, y);
    this.state = 'cruise';
    this.speed = this.cfg.speed;
    // 从左侧进场 → 在右半场俯冲；反之亦然
    const fromLeft = x < W / 2;
    this.diveTargetX = fromLeft ? rand(W * 0.45, W * 0.9) : rand(W * 0.1, W * 0.55);
    this.vx = fromLeft ? this.speed : -this.speed;
    this.vy = rand(-4, 10);
    this.angle = fromLeft ? 0 : Math.PI;
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;

    const gun = world.gun;

    if (this.state === 'cruise') {
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const passed = this.vx > 0 ? (this.x >= this.diveTargetX) : (this.x <= this.diveTargetX);
      if (passed || this.y > CONFIG.WORLD_GROUND_Y - 120) {
        this.state = 'dive';
      }
      // 飞出屏幕（未俯冲就逃逸）
      if (this.x < -120 || this.x > W + 120) {
        this.alive = false;
        if (world.onEnemyEscape) world.onEnemyEscape(this);
        return;
      }
    } else {
      // 俯冲：朝炮塔转向并加速
      this.speed = Math.min(this.cfg.diveSpeed, this.speed + 190 * dt);
      const want = Math.atan2(gun.y - this.y, gun.x - this.x);
      this.angle = rotateTowards(this.angle, want, this.cfg.turnRate * dt);
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // 命中炮塔
      if (dist(this.x, this.y, gun.x, gun.y) < 34) {
        this.crash(world);
        return;
      }
      // 撞地
      if (this.y > CONFIG.WORLD_GROUND_Y - 6) {
        this.crash(world);
        return;
      }
    }

    this._updateFacing();
  }

  crash(world) {
    this.alive = false;
    this.die(world, false);              // 撞击自毁：不给击杀奖励
    if (world.onBaseDamage) world.onBaseDamage(this.cfg.damage, this);
  }

  /* ------------------------------------------------------------------ */

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);

    const c = this.cfg;
    const flashing = this.hitFlash > 0;

    // 尾焰
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(-16, 0, 0, -16, 0, 12);
    eg.addColorStop(0, 'rgba(255,200,120,.9)');
    eg.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(-16, 0, 12, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 机翼
    ctx.fillStyle = flashing ? '#ffffff' : '#38506a';
    ctx.strokeStyle = flashing ? '#ffffff' : 'rgba(140,200,255,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-17, -13);
    ctx.lineTo(-8, -2);
    ctx.lineTo(-8, 2);
    ctx.lineTo(-17, 13);
    ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 机身
    ctx.fillStyle = flashing ? '#ffffff' : c.color;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(2, -5);
    ctx.lineTo(-16, -4);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-16, 4);
    ctx.lineTo(2, 5);
    ctx.closePath();
    ctx.fill();

    // 垂尾
    ctx.fillStyle = flashing ? '#ffffff' : '#2b3f56';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-20, -8);
    ctx.lineTo(-17, 0);
    ctx.closePath();
    ctx.fill();

    // 座舱
    ctx.fillStyle = flashing ? '#ffffff' : c.accent;
    ctx.beginPath();
    ctx.ellipse(6, 0, 4.5, 2.6, 0, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

export default Fighter;
