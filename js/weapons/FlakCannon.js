import { WEAPONS } from '../data/weapons.js';
import { pickTarget, pickTargetAlong, assistAngle } from '../core/targeting.js';

/** 软辅助锥半角：高射炮弹道飞行慢，锥放宽一点才跟手 */
const ASSIST_CONE = 0.38;   // ≈22°

/**
 * 高射炮（副武器，自动开火）
 * 攻速慢 / 单发范围爆炸 / 更适合打机群
 * 炮弹直线飞到目标点附近 → 引爆 → AoE 伤害
 */
export class FlakCannon {
  constructor() {
    this.cfg = WEAPONS.flakCannon;
    this.id = this.cfg.id;
    this.name = this.cfg.name;
    this.slot = this.cfg.slot;
    this.maxLevel = this.cfg.maxLevel;
    this.level = 1;
    this.acquired = false;      // §10：未获得前不生效
    this.eff = null;            // 由 WeaponManager 下发等级快照
    this.timer = 0;
    this.assistCone = ASSIST_CONE;
  }

  setLevel(lv) { this.level = Math.max(1, Math.min(this.maxLevel, lv | 0)); }
  get isMaxLevel() { return this.level >= this.maxLevel; }

  /**
   * 就绪进度 0~1（1 = 可以开火）。
   * 非机炮武器不过热，装在主武器槽时 HUD 用这个画"冷却条"给玩家反馈。
   */
  get readyRatio() {
    const E = this.eff || this.cfg;
    const cd = 1 / (E.fireRate || 1);
    if (!(this.timer > 0)) return 1;
    return Math.max(0, Math.min(1, 1 - this.timer / cd));
  }

  syncStats(/* stats */) { /* 高射炮暂不受成长影响（Phase 9 可加 flakDamage 系） */ }
  reset() { this.timer = 0; }

  /**
   * 每帧：只推进冷却。
   * 手动模式（本武器被装在主武器槽）时，冷却照走但不开火，等玩家按下。
   * 自动模式（装在自动槽）时，冷却结束后立刻自动索敌开火。
   */
  autoUpdate(dt, gun, world) {
    if (this.timer > 0) this.timer -= dt;
    if (this.manual) return;
    if (!this.acquired) return;
    this.fire(gun, world);
  }

  /**
   * 开火。
   * - 手动（装在主武器槽）：朝玩家准星方向（gun.angle）发射 —— 和机炮一样"指哪打哪"；
   *   炮弹在射线上第一个目标处引爆，没有目标就飞满射程空爆。
   * - 自动（装在自动槽）：保持原行为，自动索敌后朝目标发射。
   */
  fire(gun, world) {
    if (!this.acquired) return false;
    if (this.timer > 0) return false;

    const E = this.eff || this.cfg;
    const maxRange = E.range || 760;
    let a, shotRange;

    if (this.manual) {
      // 软辅助：复用「作为副武器自动开火时」的选敌结果，目标大致在准星方向就自动对准
      const muzzle = { x: gun.x, y: gun.y - 12 };
      const auto = this._nearest(gun, world);
      const aAim = assistAngle(muzzle, gun, auto, this.assistCone);
      if (aAim !== null) {
        a = aAim;
        shotRange = Math.hypot(auto.x - muzzle.x, auto.y - muzzle.y) + 24;
      } else {
        a = gun.angle;
        const hit = pickTargetAlong(muzzle, world, maxRange, a, 26);
        shotRange = hit ? hit.along + 24 : maxRange;
      }
    } else {
      const t = this._nearest(gun, world);
      if (!t) return false;                       // 自动模式没目标不消耗冷却
      a = Math.atan2(t.y - gun.y, t.x - gun.x);
      shotRange = Math.hypot(t.x - gun.x, t.y - gun.y) + 24;
    }

    this.timer = 1 / E.fireRate;
    world.bullets.spawn({
      x: gun.x, y: gun.y - 12,
      angle: a,
      weaponId: this.id,   // Phase E：来源归属
      speed: E.bulletSpeed,
      damage: E.damage,
      r: this.cfg.bulletRadius,
      life: this.cfg.bulletLife,
      flak: true,
      // Phase 16：SKYBREAKER（高炮 Lv6 + 火控 AI Lv3）—— 爆炸范围/伤害强化
      boom: (world.evolutionFlags && world.evolutionFlags.skybreaker)
        ? { radius: E.explosionRadius * 1.35, damage: E.explosionDamage * 1.40 }
        : { radius: E.explosionRadius, damage: E.explosionDamage },
      range: shotRange,
      // 近炸引信：飞到敌人附近就提前炸（不必等飞满 shotRange），
      // 半径取爆炸半径的一半，保证近炸时目标仍在 AoE 内。
      //
      // 【只对主武器（手动）生效】作为副武器自动开火时保持改动前的行为：
      // 飞到选定目标点再引爆。副武器的手感/平衡是调过的，别顺手改了。
      prox: this.manual ? (E.explosionRadius || 105) * 0.5 : 0,
      color: [255, 180, 90],
      // 只有主武器（手动槽）的炮弹爆炸能掀动 XP 光球
      primary: !!this.manual,
    });
    if (world.audio && world.audio.flak) world.audio.flak();
    world.shake && world.shake.shake(this.cfg.muzzleShake.mag, this.cfg.muzzleShake.dur);
    return true;
  }

  /**
   * 索敌：cfg.range 半径内 + 已进画面的最近目标
   * （Phase 21：不再打画面外的敌人，否则敌人还没露脸就被清了）
   */
  _nearest(gun, world) {
    const E = this.eff || this.cfg;
    const t = pickTarget(gun, world, E.range || 760);
    return t ? t.e : null;
  }
}

export default FlakCannon;
