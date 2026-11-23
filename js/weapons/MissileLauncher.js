import { WEAPONS } from '../data/weapons.js';
import { pickTarget, pickTargetAlong, inView } from '../core/targeting.js';

/**
 * 防空导弹发射器（副武器，自动开火）
 * 弹匣 → 锁定 → 齐射 → 装填 循环
 * 数值实时读 PlayerStats：missileDmg / missileCnt / missileCD / missileSpd / lockTime / maxAmmo / reloadTime
 */
export class MissileLauncher {
  constructor() {
    this.cfg = WEAPONS.missile;
    this.id = this.cfg.id;
    this.name = this.cfg.name;
    this.slot = this.cfg.slot;
    this.maxLevel = this.cfg.maxLevel;
    this.level = 1;
    this.acquired = false;      // §10：未获得前不生效
    this.eff = null;            // 由 WeaponManager 下发等级快照
    this._stats = null;
    this._maxAmmo = this.cfg.maxAmmo;
    this._reloadTime = this.cfg.reloadTime;
    this._cooldown = 1 / this.cfg.fireRate;
    this._lockTime = this.cfg.lockTime;
    this.reset();
  }

  setLevel(lv) { this.level = Math.max(1, Math.min(this.maxLevel, lv | 0)); }
  get isMaxLevel() { return this.level >= this.maxLevel; }

  /**
   * 就绪进度 0~1（1 = 可以开火）。
   * 导弹有装填 + 锁定两段，装填时显示装填进度，否则取"锁定 / 冷却"里更靠后的那段。
   */
  get readyRatio() {
    if (this._reloading) {
      const t = this._reloadTime || 1;
      return Math.max(0, Math.min(1, 1 - Math.max(0, this.reloadTimer) / t));
    }
    // 手动模式不需要等锁定，直接看射击冷却
    if (this.manual) {
      const cd = this._cooldown || 1;
      if (!(this.fireTimer > 0)) return 1;
      return Math.max(0, Math.min(1, 1 - this.fireTimer / cd));
    }
    if (this.lockTimer < this._lockTime) {
      return Math.max(0, Math.min(1, this.lockTimer / (this._lockTime || 1))) * 0.99;
    }
    const cd = this._cooldown || 1;
    if (!(this.fireTimer > 0)) return 1;
    return Math.max(0, Math.min(1, 1 - this.fireTimer / cd));
  }

  get ammoRatio() { return this._maxAmmo > 0 ? this.ammo / this._maxAmmo : 0; }
  get reloading() { return this._reloading; }

  syncStats(stats) {
    const b = stats ? stats.base : null;
    if (!b) return;
    this._stats = b;
    const E = this.eff || this.cfg;
    this._maxAmmo = Math.max(2, Math.round(E.maxAmmo * b.maxAmmoMul));
    this._reloadTime = E.reloadTime * b.reloadTimeMul;
    this._cooldown = (1 / E.fireRate) * b.missileCooldownMul * (b.weaponCdMul || 1);
    this._lockTime = this.cfg.lockTime * b.lockTimeMul;
  }

  reset() {
    this.ammo = this._maxAmmo;
    this._reloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.lockTimer = 0;
    this.target = null;
  }

  /**
   * 每帧：推进装填 / 锁定 / 射击冷却。
   * 手动模式（装在主武器槽）时这些状态照常推进（锁定条会涨），但开火等玩家按下。
   */
  autoUpdate(dt, gun, world) {
    if (!this.acquired) return;
    // 装填
    if (this._reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this._reloading = false; this.ammo = this._maxAmmo; }
      return;
    }

    // 目标：优先辅助瞄准目标，其次最近敌机
    // Phase 21：辅助瞄准目标也必须"已进画面"，否则导弹会追着画面外的敌人飞出去
    let t = (world.aimTarget && world.aimTarget.alive && inView(world.aimTarget)) ? world.aimTarget : null;
    if (!t) t = this._nearest(gun, world);

    if (t) { this.lockTimer += dt; this.target = t; }
    else { this.lockTimer = 0; this.target = null; }

    if (this.fireTimer > 0) this.fireTimer -= dt;

    if (this.manual) return;      // 主武器槽：交给玩家决定何时发射
    this.fire(gun, world);
  }

  /**
   * 开火。
   * - 手动（主武器槽）：朝玩家准星方向（gun.angle）齐射，不需要等锁定 ——
   *   否则玩家按住还得干等锁定条，手感很差。导弹飞出后仍会自己追踪。
   * - 自动（自动槽）：保持原行为 —— 锁定完成后才发射。
   */
  fire(gun, world) {
    if (!this.acquired) return false;
    if (this._reloading) return false;

    const b = this._stats;
    const dmgMul = b ? b.missileDamageMul : 1;
    const speedMul = b ? b.missileSpeedMul : 1;
    const E = this.eff || this.cfg;
    const cnt = Math.max(1, b ? b.missileCount : 1) + ((E.missileCount || 1) - 1);

    let target = null;
    if (this.manual) {
      if (this.fireTimer > 0 || this.ammo <= 0) return false;
      // 优先打辅助瞄准锁住的，其次打准星方向上的；都没有就空射（导弹会自己找目标）
      const cap = E.range || 820;
      const along = pickTargetAlong(gun, world, Math.min(world.radarRange || cap, cap), gun.angle, 70);
      target = (world.aimTarget && world.aimTarget.alive && inView(world.aimTarget))
        ? world.aimTarget
        : (along ? along.e : null);
    } else {
      if (!(this.target && this.lockTimer >= this._lockTime && this.fireTimer <= 0 && this.ammo > 0)) return false;
      target = this.target;
    }

    this.fireTimer = this._cooldown;
    const m = gun.muzzle();
    const n = cnt;
    const spread = 0.24;
    const baseAngle = this.manual ? gun.angle : gun.angle;   // 手动/自动都从炮口朝向发散
    for (let i = 0; i < n; i++) {
      const a = baseAngle + (i - (n - 1) / 2) * spread;
      world.spawnMissile(m.x, m.y, target, {
        damage: Math.round(E.damage * dmgMul),
        radius: E.explosionRadius,
        speed: this.cfg.bulletSpeed * speedMul,
        turnRate: this.cfg.turnRate,
        angle: a,
        life: this.cfg.bulletLife,
        // 只有主武器（手动槽）发射的导弹爆炸能掀动 XP 光球
        primary: !!this.manual,
      });
    }
    this.ammo -= n;
    if (world.audio && world.audio.missile) world.audio.missile();
    if (this.ammo <= 0) { this._reloading = true; this.reloadTimer = this._reloadTime; }
    return true;
  }

  /**
   * 索敌半径 = min(雷达范围, 武器自身射程上限)
   * 雷达是成长属性（永久强化 / 构型 / 局内升级都会放大），若不封顶，后期导弹会重新打回画面外。
   * 且目标必须已进画面（Phase 21）。
   */
  _nearest(gun, world) {
    const E = this.eff || this.cfg;
    const cap = E.range || 820;
    const R = Math.min(world.radarRange || cap, cap);
    const t = pickTarget(gun, world, R);
    return t ? t.e : null;
  }
}

export default MissileLauncher;
