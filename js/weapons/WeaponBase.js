/**
 * WeaponBase —— 武器基类（Phase 13 Weapon Framework）
 *
 * 在旧 Weapon 之上新增：
 *   - level / maxLevel / slot：等级与槽位（§11）
 *   - applyLevel()：把 WeaponLevel 的成长条目的累计乘算写进 effective（只读快照）
 *   - upgrade()：升一级并立即重算；满级返回 false
 *   - Evolution 槽：Lv6 时 evolutionReady = true（Phase 16 接 Evolution）
 *
 * 子类读属性一律走 `this.eff`（effective 快照），不要直接读 this.cfg 的数值字段，
 * 否则等级成长会失效。
 */
import { levelOf, MAX_WEAPON_LEVEL, computeEff } from './WeaponLevel.js';

export class WeaponBase {
  constructor(cfg) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.name = cfg.name;
    this.slot = cfg.slot || 'auto';
    this.maxLevel = cfg.maxLevel || MAX_WEAPON_LEVEL;

    this.level = 1;
    this.acquired = false;     // §10：是否已被玩家获得（开局武器为 true）
    this.enabled = true;

    this.cooldown = 0;      // 距离下一发的时间
    this.heat = 0;          // 当前热量
    this.overheated = false;

    /** 等级成长后的只读快照 */
    this.eff = {};
    this.applyLevel();
  }

  /* ---------------- 等级 ---------------- */

  get isMaxLevel() { return this.level >= this.maxLevel; }
  get evolutionReady() { return !!this.eff.evolutionReady; }

  /** 下一级的卡面描述（满级返回 null） */
  get nextLevelDesc() {
    if (this.isMaxLevel) return null;
    return levelOf(this.id, this.level + 1).short || '';
  }

  /** 当前等级的成长条目 */
  get curLevelDef() { return levelOf(this.id, this.level); }

  /**
   * 把 WeaponLevel 的累计乘算应用到 eff。
   * 每次调用都从 cfg 基础值整体重算，避免逐级叠乘产生漂移。
   */
  applyLevel() {
    this.eff = computeEff(this.cfg, this.level);
    return this.eff;
  }

  /** 升一级。已满级返回 false */
  upgrade() {
    if (this.isMaxLevel) return false;
    this.level += 1;
    this.applyLevel();
    if (this.onLevelUp) this.onLevelUp(this.level);
    return true;
  }

  /** 降级（调试 / 测试用） */
  setLevel(lv) {
    this.level = Math.max(1, Math.min(this.maxLevel, lv | 0));
    this.applyLevel();
  }

  /* ---------------- 通用状态 ---------------- */

  get maxHeat() { return this.cfg.maxHeat; }

  /** 每发热量（含构型修正：高压核心 ×1.20） */
  get heatPerShot() { return this.cfg.heatPerShot * (this._effectiveHeatMul || 1); }

  /** 冷却时长（含构型修正：稳定核心 ×0.92） */
  _cdOf(fireRate) { return (1 / fireRate) * (this._effectiveCdMul || 1); }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;

    const cool = this._effectiveCoolRate || this.cfg.coolRate;
    if (this.heat > 0) this.heat = Math.max(0, this.heat - cool * dt);

    const max = this._effectiveMaxHeat || this.cfg.maxHeat;
    if (this.overheated && this.heat <= max * this.cfg.overheatResumeRatio) {
      this.overheated = false;
    }
  }

  canFire() { return this.enabled && this.acquired && !this.overheated && this.cooldown <= 0; }

  consume() {
    this.cooldown = this._cdOf(this.eff.fireRate);
    this.heat += this.heatPerShot;
    if (this.heat >= this.cfg.maxHeat) {
      this.heat = this.cfg.maxHeat;
      this.overheated = true;
      return true;
    }
    return false;
  }

  /** 带当前有效射速的消耗（射速受升级 / 事件影响时用） */
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

  reset() {
    this.cooldown = 0;
    this.heat = 0;
    this.overheated = false;
  }

  /** 由 WeaponManager 在 stats 变更 / 升级时调用 */
  syncStats(stats) {
    const c = this.cfg;
    const s = stats ? stats.base : null;
    this._effectiveMaxHeat = c.maxHeat * (s ? s.maxHeatMul : 1);
    this._effectiveCoolRate = c.coolRate * (s ? s.coolRateMul : 1);
    this._effectiveHeatMul = s ? (s.heatPerShotMul || 1) : 1;
    this._effectiveCdMul = s ? (s.weaponCdMul || 1) : 1;
  }

  /** 子类实现 */
  fire(/* gun, world */) { throw new Error('WeaponBase.fire() 未实现'); }
  /** 自动武器实现 */
  autoUpdate(/* dt, gun, world */) {}
}

export default WeaponBase;
