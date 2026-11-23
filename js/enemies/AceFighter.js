import { Fighter } from './Fighter.js';
import { ENEMIES } from '../data/enemies.js';

/**
 * Ace Fighter 王牌战机（设计文档 §33）
 * Fighter 的精英版本：
 *   - 巡航时周期性「短距突进」（速度 × dashSpeedMul，持续 dashDuration）
 *   - 被击中后有概率侧向「闪避」一段位移（dodgeChance / dodgeCooldown）
 * 视觉：金色涂装 + 强化尾焰 + 精英标识环
 */
export class AceFighter extends Fighter {
  constructor() {
    super();
    this.type = 'aceFighter';
    this.dashTimer = 0;
    this.dashLeft = 0;
    this.dodgeCd = 0;
    this.dodgeLeft = 0;
    this.dodgeDir = 1;
    this.trailT = 0;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.aceFighter, x, y);
    this.type = 'aceFighter';            // super.init 会写 cfg.id，这里冗余保证一致
    this.dashTimer = this.cfg.dashInterval * (0.4 + Math.random() * 0.6);
    this.dashLeft = 0;
    this.dodgeCd = 0;
    this.dodgeLeft = 0;
    this.dodgeDir = Math.random() < 0.5 ? -1 : 1;
    this.trailT = 0;
    return this;
  }

  /** 被击中 → 概率闪避（侧向瞬时位移，制造"打空"的精英压迫感） */
  takeDamage(dmg, world) {
    if (this.alive && this.dodgeCd <= 0 && Math.random() < this.cfg.dodgeChance) {
      this.dodgeCd = this.cfg.dodgeCooldown;
      this.dodgeLeft = this.cfg.dodgeDuration;
      this.dodgeDir = Math.random() < 0.5 ? -1 : 1;
      if (world && world.particles) world.particles.smokePuff(this.x, this.y);
    }
    return super.takeDamage(dmg, world);
  }

  update(dt, world) {
    // 冷却计时
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.dashLeft > 0) this.dashLeft -= dt;
    else if (this.state === 'cruise') {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashTimer = this.cfg.dashInterval;
        this.dashLeft = this.cfg.dashDuration;
      }
    }

    // 闪避位移：在基类移动之上叠加一段快速横移
    if (this.dodgeLeft > 0) {
      this.dodgeLeft -= dt;
      const step = this.cfg.dodgeOffset * (dt / this.cfg.dodgeDuration);
      this.x += this.dodgeDir * step;
    }

    super.update(dt, world);
    if (!this.alive) return;

    // 突进期加速（基类已按 speed 移动，这里额外补一段）
    if (this.dashLeft > 0) {
      const boost = this.speed * (this.cfg.dashSpeedMul - 1) * dt;
      this.x += Math.cos(this.angle) * boost;
      this.y += Math.sin(this.angle) * boost;
    }

    // 突进尾迹
    this.trailT -= dt;
    if (this.trailT <= 0 && (this.dashLeft > 0 || this.state === 'dive')) {
      this.trailT = 0.05;
      world.particles.smokePuff(this.x, this.y);
    }
  }

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);

    // 精英标识环（不随机身翻转，保证始终可见）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.dodgeLeft > 0 ? 'rgba(255,209,102,.95)' : 'rgba(255,209,102,.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 22 + (this.dashLeft > 0 ? 5 : 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);

    const c = this.cfg;
    const flashing = this.hitFlash > 0;

    // 强化尾焰（突进时更长）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const len = this.dashLeft > 0 ? 26 : 14;
    const eg = ctx.createRadialGradient(-18, 0, 0, -18, 0, len);
    eg.addColorStop(0, 'rgba(255,230,150,.95)');
    eg.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(-18, 0, len, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 机翼（金色描边）
    ctx.fillStyle = flashing ? '#ffffff' : '#5a4a1e';
    ctx.strokeStyle = flashing ? '#ffffff' : 'rgba(255,209,102,.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(-11, -15);
    ctx.lineTo(-19, -14);
    ctx.lineTo(-9, -2);
    ctx.lineTo(-9, 2);
    ctx.lineTo(-19, 14);
    ctx.lineTo(-11, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 机身
    ctx.fillStyle = flashing ? '#ffffff' : c.color;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(3, -5.5);
    ctx.lineTo(-17, -4.5);
    ctx.lineTo(-19, 0);
    ctx.lineTo(-17, 4.5);
    ctx.lineTo(3, 5.5);
    ctx.closePath();
    ctx.fill();

    // 垂尾
    ctx.fillStyle = flashing ? '#ffffff' : '#3d3110';
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(-22, -9);
    ctx.lineTo(-19, 0);
    ctx.closePath();
    ctx.fill();

    // 座舱
    ctx.fillStyle = flashing ? '#ffffff' : c.accent;
    ctx.beginPath();
    ctx.ellipse(7, 0, 4.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export default AceFighter;
