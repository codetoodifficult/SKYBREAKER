import { Weapon } from './Weapon.js';
import { WEAPONS } from '../data/weapons.js';
import { rand } from '../core/utils.js';

/**
 * 机炮 Machine Gun
 * 高射速 / 低单发伤害 / 子弹快 / 过热机制
 * 每次开火都基于 gun.stats（PlayerStats）实时换算：伤害、射速、弹速、暴击、穿透、弹丸数、热量、散热
 */
export class MachineGun extends Weapon {
  constructor() {
    super(WEAPONS.machineGun);
    this.multiShot = 1;     // 由 gun.stats.base.multiShot 覆盖
  }

  /**
   * @param {object} gun AntiAircraftGun
   * @param {object} world
   */
  fire(gun, world) {
    if (!this.canFire()) return false;

    const s = gun.stats ? gun.stats.base : null;
    const c = this.cfg;
    const E = this.eff || c;               // Phase 13：等级成长后的属性快照
    // 射速 = 基础 × 等级 × 局内升级 × 随机事件修正（Phase 11：弹药危机 ×0.7）
    const fireRate = E.fireRate * (s ? s.fireRateMul : 1) * (gun.eventFireRateMul ?? 1);
    const sp = E.bulletSpeed * (s ? s.bulletSpeedMul : 1);
    const pen = E.penetration + (s ? s.penetration : 0);
    // 等级给的额外弹丸（Lv3 +1）与局内"双联机炮"叠加
    const multishot = Math.max(1, s ? s.multiShot : 1) + ((E.multiShot || 1) - 1);
    const critChance = s ? s.critChance : 0;
    const critMul = s ? s.critDamage : 1;
    const armorPierceBonus = s ? s.penetration : 0;   // 穿透也用于减甲

    // 暴击判定（每发）
    const isCrit = Math.random() < critChance;
    let dmg = E.damage * (gun.damageMul ?? 1) * (s ? s.damageMul : 1);
    if (isCrit) dmg *= critMul;
    dmg = Math.round(dmg);

    // 消耗热量 + 冷却
    const overheat = this.consumeWith(fireRate);
    const m = gun.muzzle();
    const baseAngle = gun.angle;

    const spreadStep = 0.052;
    const startOffset = -(multishot - 1) / 2;

    for (let i = 0; i < multishot; i++) {
      const a = baseAngle + rand(-E.spread, E.spread) + startOffset * spreadStep + i * spreadStep;
      // Phase 16：VULCAN BURST（机炮 Lv6 + 高爆弹药 Lv3）
      const vb = world.evolutionFlags && world.evolutionFlags.vulcanBurst
        ? { radius: 32, pct: 0.40 } : null;
      world.bullets.spawn({
        x: m.x, y: m.y,
        angle: a,
        weaponId: this.id,   // Phase E：击杀/状态来源归属
        speed: sp,
        damage: dmg,
        boomOnHit: vb,
        r: c.bulletRadius,
        life: c.bulletLife,
        penetration: pen,
        color: isCrit ? [255, 255, 180] : [255, 226, 150],
        // 只有主武器（手动槽）的子弹能打中 XP 光球，副武器子弹直接穿过
        primary: !!this.manual,
      });
    }

    // 表现
    world.particles.muzzle(m.x, m.y, baseAngle);
    if (isCrit) {
      world.particles.explosion(m.x + Math.cos(baseAngle) * 18, m.y + Math.sin(baseAngle) * 18, 0.5, [255, 230, 120]);
    }
    gun.kick(2.2 + (isCrit ? 1.2 : 0));
    world.shake.shake(c.muzzleShake.mag, c.muzzleShake.dur);
    world.audio.shoot();

    if (overheat) {
      world.audio.overheat();
      if (world.onOverheat) world.onOverheat();
    }
    return true;
  }

  /** 带当前 stats 的消耗（override 父类行为，使射速/热量上限随升级） */
  consumeWith(effectiveFireRate) {
    this.cooldown = this._cdOf(effectiveFireRate);
    this.heat += this.heatPerShot;
    if (this.heat >= this._effectiveMaxHeat) {
      this.heat = this._effectiveMaxHeat;
      this.overheated = true;
      return true;
    }
    return false;
  }

  /** 由 Game 在 stats 变更时调用，重算上限/散热 */
  syncStats(stats) {
    const c = this.cfg;
    const s = stats ? stats.base : null;
    this._effectiveMaxHeat = c.maxHeat * (s ? s.maxHeatMul : 1);
    this._effectiveCoolRate = c.coolRate * (s ? s.coolRateMul : 1);
    this._effectiveHeatMul = s ? (s.heatPerShotMul || 1) : 1;
    this._effectiveCdMul = s ? (s.weaponCdMul || 1) : 1;
  }
}

export default MachineGun;
