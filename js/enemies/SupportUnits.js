import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { rand, clamp, rotateTowards, dist } from '../core/utils.js';

/**
 * 战略支援单位（Phase 20，设计文档 §43~§46 / §47 开发顺序）
 *
 * 这些单位本身威胁不高，但会放大其他敌人的价值 —— 强制建立"目标优先级"（§43）：
 *   Support Drone  每 3 秒治疗附近敌人 5% HP（先杀，否则白打）
 *   Shield Carrier 每 5 秒给附近敌人套 150 护盾（先杀，否则打不动）
 *   Hunter Drone   高速绕后攻击炮塔（迫使玩家转火）
 */

const W = CONFIG.WORLD.WIDTH;

/* ------------------------------------------------------------------ */
/** Support Drone —— 战地维修机（§44） */
export class SupportDrone extends Enemy {
  constructor() {
    super();
    this.type = 'supportDrone';
    this.healTimer = 3;
    this.wobble = Math.random() * Math.PI * 2;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.supportDrone, x, y);
    this.healTimer = 3;
    this.wobble = Math.random() * Math.PI * 2;
    const fromLeft = x < W / 2;
    this.vx = fromLeft ? this.cfg.speed : -this.cfg.speed;
    this.vy = rand(-6, 6);
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;

    // 慢速横移 + 上下浮动（全程在场，直到被击落或超时撤离）
    this.x += this.vx * dt;
    this.wobble += dt * 2.2;
    this.y += Math.sin(this.wobble) * 14 * dt;
    if (this.x < 40 || this.x > W - 40) this.vx *= -1;
    if (this.y < 60) this.y = 60;
    if (this.y > 260) this.y = 260;
    this._updateFacing();

    // 每 3 秒治疗附近敌人 5% HP（§44）
    this.healTimer -= dt;
    if (this.healTimer <= 0) {
      this.healTimer = 3;
      const R = 200, R2 = R * R;
      let healed = 0;
      for (const e of world.enemies ? world.enemies.list : []) {
        if (!e.alive || e === this || e.isBoss) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx * dx + dy * dy > R2) continue;
        if (e.hp >= e.maxHp) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05);
        healed++;
        if (world.particles) world.particles.hit(e.x, e.y, 0, [77, 255, 166]);
      }
      if (healed && world.audio && world.audio.ui) world.audio.ui();
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.age * 1.4);
    // 十字旋翼
    ctx.strokeStyle = '#4dffa6';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.rotate(Math.PI / 2);
      ctx.moveTo(-this.radius, 0);
      ctx.lineTo(this.radius, 0);
      ctx.stroke();
    }
    ctx.rotate(-Math.PI);
    ctx.fillStyle = '#123326';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4dffa6';
    ctx.stroke();
    // 医疗标记
    ctx.fillStyle = '#4dffa6';
    ctx.fillRect(-2, -6, 4, 12);
    ctx.fillRect(-6, -2, 12, 4);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/** Shield Carrier —— 护盾母机（§45） */
export class ShieldCarrier extends Enemy {
  constructor() {
    super();
    this.type = 'shieldCarrier';
    this.shieldTimer = 2.5;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.shieldCarrier, x, y);
    this.shieldTimer = 2.5;
    const fromLeft = x < W / 2;
    this.vx = fromLeft ? this.cfg.speed : -this.cfg.speed;
    this.vy = 10;
    return this;
  }

  takeDamage(dmg, world) {
    if (this.shieldUp && this.affixShield > 0) {
      // 护盾母机自身护盾由 affixShield 表达（复用血条渲染）
    }
    return super.takeDamage(dmg, world);
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;
    this.x += this.vx * dt;
    this.y += Math.sin(this.age * 1.1) * 10 * dt;
    if (this.x < 60 || this.x > W - 60) this.vx *= -1;
    this._updateFacing();

    // 每 5 秒给附近敌人套 150 HP 护盾（§45）
    this.shieldTimer -= dt;
    if (this.shieldTimer <= 0) {
      this.shieldTimer = 5;
      const R = 240, R2 = R * R;
      for (const e of world.enemies ? world.enemies.list : []) {
        if (!e.alive || e === this || e.isBoss) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx * dx + dy * dy > R2) continue;
        e.affixShield = Math.max(e.affixShield || 0, 150);
        if (world.particles) world.particles.hit(e.x, e.y, 0, [127, 209, 255]);
      }
      if (world.audio && world.audio.ui) world.audio.ui();
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // 机身
    ctx.fillStyle = '#1d2a44';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius, this.radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7fd1ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 护盾发生环
    ctx.strokeStyle = `rgba(127,209,255,${0.35 + 0.25 * Math.sin(this.age * 4)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/** Hunter Drone —— 猎杀无人机（§46）：高速绕到玩家瞄准方向之外，迫使转火 */
export class HunterDrone extends Enemy {
  constructor() {
    super();
    this.type = 'hunterDrone';
    this.state = 'approach';
    this.speed = 0;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.hunterDrone, x, y);
    this.state = 'approach';
    this.speed = this.cfg.speed;
    const fromLeft = x < W / 2;
    this.vx = fromLeft ? this.speed : -this.speed;
    this.vy = rand(-20, 20);
    return this;
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;

    const gun = world.gun;
    if (this.state === 'approach') {
      // 优先绕到"玩家当前瞄准方向之外"（§46）
      const aim = world.aimAngle != null ? world.aimAngle : gun.angle;
      const side = Math.sin(aim) >= 0 ? -1 : 1;    // 从准星的另一侧切入
      const targetX = gun.x + side * rand(180, 300);
      const targetY = gun.y - rand(40, 120);
      const want = Math.atan2(targetY - this.y, targetX - this.x);
      this.angle = rotateTowards(this.angle, want, 3.0 * dt);
      this.speed = Math.min(this.cfg.speed * 1.25, this.speed + 260 * dt);
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (dist(this.x, this.y, gun.x, gun.y) < 150) this.state = 'strike';
    } else {
      // 直扑炮塔
      const want = Math.atan2(gun.y - this.y, gun.x - this.x);
      this.angle = rotateTowards(this.angle, want, 4.0 * dt);
      this.vx = Math.cos(this.angle) * this.cfg.diveSpeed;
      this.vy = Math.sin(this.angle) * this.cfg.diveSpeed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // 撞击炮塔自毁
    if (dist(this.x, this.y, gun.x, gun.y) < gun.radius + this.radius) {
      this.alive = false;
      if (world.onBaseDamage) world.onBaseDamage(this.cfg.damage);
      this.die(world, false);
      return;
    }
    // 越界撤离
    if (this.y > CONFIG.WORLD_GROUND_Y || this.x < -140 || this.x > W + 140 || this.y < -160) {
      this.alive = false;
      if (world.onEnemyEscape) world.onEnemyEscape(this);
    }
    this._updateFacing();
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // 箭头形机体
    ctx.fillStyle = '#3a1020';
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.radius * 1.3, 0);
    ctx.lineTo(-this.radius * 0.8, -this.radius * 0.85);
    ctx.lineTo(-this.radius * 0.35, 0);
    ctx.lineTo(-this.radius * 0.8, this.radius * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 尾焰
    ctx.fillStyle = `rgba(255,90,110,${0.5 + 0.4 * Math.sin(this.age * 22)})`;
    ctx.fillRect(-this.radius * 1.5, -2, 8, 4);
    ctx.restore();
  }
}
