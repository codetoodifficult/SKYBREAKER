import { Bomber } from './Bomber.js';
import { ENEMIES } from '../data/enemies.js';
import { rand, TAU } from '../core/utils.js';
import { CONFIG } from '../data/config.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * Heavy Bomber 重装轰炸机（设计文档 §34）
 * Bomber 的精英版本：
 *   - HP 480，优先级极高（是最该被集火的目标之一）
 *   - 飞临基地上空时周期性释放「3 枚高威力炸弹」齐射（salvoCount / salvoGap）
 * 视觉：紫色宽机身 + 弹舱指示灯 + 精英标识环
 */
export class HeavyBomber extends Bomber {
  constructor() {
    super();
    this.type = 'heavyBomber';
    this.salvoTimer = 0;
    this.salvoLeft = 0;
    this.salvoGapLeft = 0;
    this.bayGlow = 0;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.heavyBomber, x, y);
    this.type = 'heavyBomber';
    this.salvoTimer = this.cfg.salvoInterval * 0.6;
    this.salvoLeft = 0;
    this.salvoGapLeft = 0;
    this.bayGlow = 0;
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;

    // 齐射节奏：先等 salvoInterval，再连投 salvoCount 枚（间隔 salvoGap）
    if (this.salvoLeft > 0) {
      this.salvoGapLeft -= dt;
      if (this.salvoGapLeft <= 0) {
        this.salvoLeft -= 1;
        this.salvoGapLeft = this.cfg.salvoGap;
        this._dropBomb(world);
        if (this.salvoLeft <= 0) this.salvoTimer = this.cfg.salvoInterval;
      }
      this.bayGlow = 1;
    } else if (this.overBase) {
      this.salvoTimer -= dt;
      if (this.salvoTimer <= 0) {
        this.salvoLeft = this.cfg.salvoCount;
        this.salvoGapLeft = 0;
      }
      this.bayGlow = Math.max(0, this.bayGlow - dt * 2);
    } else {
      this.bayGlow = Math.max(0, this.bayGlow - dt * 2);
    }
  }

  _dropBomb(world) {
    const dmg = Math.round(this.cfg.damage * this.cfg.salvoDamageMul);
    if (world.onCityDamage) world.onCityDamage(dmg, this);
    const ox = rand(-16, 16);
    world.particles.explosion(this.x + ox, this.y + 34, 0.85, [255, 130, 70]);
    world.audio.explosion(0.8);
    world.shake.shake(5, 110);
  }

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);

    // 精英标识环
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(176,107,255,${0.3 + this.bayGlow * 0.6})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);
    const c = this.cfg;
    const flashing = this.hitFlash > 0;

    // 机身（比 Bomber 更宽更长）
    ctx.fillStyle = flashing ? '#fff' : c.color;
    ctx.strokeStyle = flashing ? '#fff' : 'rgba(200,160,255,.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(42, 0);
    ctx.lineTo(10, -15);
    ctx.lineTo(-28, -11);
    ctx.lineTo(-33, 0);
    ctx.lineTo(-28, 11);
    ctx.lineTo(10, 15);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 宽机翼
    ctx.fillStyle = flashing ? '#fff' : '#4a2a70';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-22, -30);
    ctx.lineTo(-34, -27);
    ctx.lineTo(-16, -2);
    ctx.lineTo(-16, 2);
    ctx.lineTo(-34, 27);
    ctx.lineTo(-22, 30);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 双引擎光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ex of [-14, 14]) {
      const g = ctx.createRadialGradient(-26, ex, 0, -26, ex, 9);
      g.addColorStop(0, 'rgba(220,160,255,.9)');
      g.addColorStop(1, 'rgba(140,60,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(-26, ex, 9, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // 弹舱灯：齐射中高频闪烁
    const on = this.salvoLeft > 0 ? (Math.sin(this.bayGlow * 40) > 0) : this.overBase;
    if (on) {
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-10 + i * 8, 0, 3.2, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

export default HeavyBomber;
