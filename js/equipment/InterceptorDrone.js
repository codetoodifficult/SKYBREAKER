import { AUTO_EQUIPMENT } from '../data/equipment.js';
import { computeEffFrom } from '../weapons/WeaponLevel.js';
import { EQUIP_LEVELS } from '../data/equipment.js';
import { rand } from '../core/utils.js';

/**
 * Interceptor Drone 拦截无人机（Phase 14，设计文档 §12-B）
 * 自动武器：N 架无人机绕塔巡逻，各自锁定最近目标点射。
 * 与炮塔共用一个"自动武器"槽（最多 3 个）。
 */
export class InterceptorDrone {
  constructor() {
    this.cfg = AUTO_EQUIPMENT.interceptorDrone;
    this.id = this.cfg.id;
    this.name = this.cfg.name;
    this.slot = this.cfg.slot;
    this.maxLevel = this.cfg.maxLevel;
    this.level = 1;
    this.acquired = false;
    this.eff = computeEffFrom(EQUIP_LEVELS, this.cfg, 1);
    this.orbit = 0;
    this.timers = [];
    this.reset();
  }

  /**
   * 装备走自己的等级表（EQUIP_LEVELS），不是武器表。
   * WeaponManager._pushEff 会优先调用 applyLevel，这里必须实现，
   * 否则会被 computeEff(WEAPON_LEVELS) 覆盖回基础值。
   */
  applyLevel() {
    this.eff = computeEffFrom(EQUIP_LEVELS, this.cfg, this.level);
    return this.eff;
  }

  setLevel(lv) {
    this.level = Math.max(1, Math.min(this.maxLevel, lv | 0));
    this.applyLevel();
  }
  get isMaxLevel() { return this.level >= this.maxLevel; }
  syncStats() {}

  reset() {
    this.orbit = 0;
    this.timers = [];
    const n = this.eff.droneCount || this.cfg.droneCount;
    for (let i = 0; i < n; i++) this.timers.push(rand(0, 0.5));
  }

  /** 第 i 架无人机的位置 */
  _pos(i, gun) {
    const n = Math.max(1, this.eff.droneCount || this.cfg.droneCount);
    const a = this.orbit + (i / n) * Math.PI * 2;
    const R = this.cfg.orbitRadius;
    return { x: gun.x + Math.cos(a) * R, y: gun.y - 26 + Math.sin(a) * R * 0.55 };
  }

  _nearest(pos, world, range) {
    const list = world.enemies && world.enemies.list;
    if (!list) return null;
    let best = null, bd = range * range;
    for (const e of list) {
      if (!e.alive) continue;
      const dx = e.x - pos.x, dy = e.y - pos.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  autoUpdate(dt, gun, world) {
    if (!this.acquired) return;
    this.orbit += this.cfg.orbitSpeed * dt;

    const n = this.eff.droneCount || this.cfg.droneCount;
    while (this.timers.length < n) this.timers.push(rand(0, 0.5));

    for (let i = 0; i < n; i++) {
      this.timers[i] -= dt;
      if (this.timers[i] > 0) continue;
      const p = this._pos(i, gun);
      const t = this._nearest(p, world, this.eff.range);
      if (!t) continue;
      this.timers[i] = 1 / this.eff.fireRate;

      const a = Math.atan2(t.y - p.y, t.x - p.x) + rand(-this.eff.spread, this.eff.spread);
      world.bullets.spawn({
        x: p.x, y: p.y,
        angle: a,
        speed: this.eff.bulletSpeed,
        damage: Math.round(this.eff.damage),
        r: this.cfg.bulletRadius,
        life: this.cfg.bulletLife,
        penetration: this.eff.penetration,
        color: [180, 240, 255],
      });
      world.particles.hit(p.x, p.y, a, [150, 230, 255]);
    }
  }

  draw(ctx, gun) {
    if (!this.acquired || !gun) return;
    const n = this.eff.droneCount || this.cfg.droneCount;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const p = this._pos(i, gun);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
      g.addColorStop(0, 'rgba(150,235,255,.85)');
      g.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#9fe8ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#123';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export default InterceptorDrone;
