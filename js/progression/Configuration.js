import {
  CORES, WEAPON_CORES, POWERS, DEFAULT_LOADOUT, UNLOCK_RULES, findBonus,
  CORE_ORDER, WEAPON_ORDER, POWER_ORDER, BP_COST, unlockKey, BUILD_CORE_SLOT,
  SOON_TEXT, isSoon,
} from '../data/configuration.js';
import { BUILD_CORES, BUILD_CORE_ORDER, buildCoreById } from '../data/buildCores.js';

/** 槽位 → 表 / 顺序 的统一映射（Phase 18 加入 build 槽） */
const SLOT_TABLE = { core: CORES, weapon: WEAPON_CORES, power: POWERS, build: BUILD_CORES };
const SLOT_ORDER = { core: CORE_ORDER, weapon: WEAPON_ORDER, power: POWER_ORDER, build: BUILD_CORE_ORDER };
export const LOADOUT_SLOTS = ['core', 'weapon', 'power', 'build'];

/**
 * Loadout —— 出击前构型 CORE + WEAPON + POWER（Phase 15，设计文档 §13~§17）
 *
 * 职责：
 *   1. 保存玩家选择（持久化在 meta 存档里，兼容旧档：缺省回落到 DEFAULT_LOADOUT）
 *   2. 解锁判定（§55：新玩家只有 Standard / Machine Gun / Stable）
 *   3. 把构型的"静态乘区"一次性写进 PlayerStats（§70：结算集中在 apply，不散落各 class）
 *   4. 每帧结算"条件加成"（过热增伤、OVERDRIVE 高热量超载），开关式切换、不累积漂移
 */
export class Loadout {
  constructor(meta) {
    this.meta = meta || {};
    this.sel = { ...DEFAULT_LOADOUT };
    this.bonus = null;
    this.bonusActive = false;      // 条件型 bonus 当前是否生效（供 HUD 展示）
    this._overheatOn = false;
    this._bonusOn = false;
    this._sanitize();
  }

  /* ---------------- 存档 ---------------- */

  /** 从 meta 存档恢复；老存档没有 loadout 字段时回落默认构型 */
  load() {
    const s = this.meta.loadout;
    if (s && typeof s === 'object') {
      this.sel = {
        core: s.core || DEFAULT_LOADOUT.core,
        weapon: s.weapon || DEFAULT_LOADOUT.weapon,
        power: s.power || DEFAULT_LOADOUT.power,
        build: s.build !== undefined ? s.build : null,   // Phase 18：BUILD CORE（可为空）
      };
    }
    this._sanitize();
    this.bonus = findBonus(this.sel);
    return this;
  }

  save() {
    this.meta.loadout = { ...this.sel };
    return this.meta.loadout;
  }

  /** 选择项若未解锁（或 id 非法）则回落到默认项 */
  _sanitize() {
    if (!CORES[this.sel.core] || !this.isUnlocked('core', this.sel.core)) this.sel.core = DEFAULT_LOADOUT.core;
    // 比赛版：主武器恒为机炮，忽略存档里的旧选择 / 非法 id
    this.sel.weapon = DEFAULT_LOADOUT.weapon;
    if (!POWERS[this.sel.power] || !this.isUnlocked('power', this.sel.power)) this.sel.power = DEFAULT_LOADOUT.power;
    // Phase 18：build 槽可以为空；非法或未解锁的 id 一律清空
    if (this.sel.build && (!BUILD_CORES[this.sel.build] || !this.isUnlocked('build', this.sel.build))) {
      this.sel.build = null;
    }
  }

  /* ---------------- 解锁 ---------------- */

  /** 是否用蓝图买断过（Phase 16 §54） */
  isPurchased(slot, id) {
    return !!(this.meta.unlocked && this.meta.unlocked[unlockKey(slot, id)]);
  }

  /** 蓝图价格 */
  cost(slot, id) { return (BP_COST[slot] && BP_COST[slot][id]) || 0; }

  /** "待更新"项（isSoon）：数据保留但在构型里不可选 */
  isSoon(slot, id) { return isSoon(slot, id); }

  isUnlocked(slot, id) {
    if (isSoon(slot, id)) return false;                       // 待更新：任何途径都不解锁
    if (this.isPurchased(slot, id)) return true;              // 蓝图买断

    // Phase 18：BUILD CORE —— 主要解锁路径是"难度首通"（§23），存在 meta.difficulty.cleared
    if (slot === 'build') {
      const core = BUILD_CORES[id];
      if (!core) return false;
      const cleared = (this.meta.difficulty && this.meta.difficulty.cleared) || {};
      return !!cleared[core.unlock.difficulty];
    }

    const rule = UNLOCK_RULES[slot] ? UNLOCK_RULES[slot][id] : undefined;
    if (rule === undefined && !UNLOCK_RULES[slot]) return false;
    if (!rule) return true;                                   // null = 默认解锁
    const runs = this.meta.runs || 0;
    const bestWave = this.meta.bestWave || 0;
    if (rule.runs != null && runs < rule.runs) return false;
    if (rule.bestWave != null && bestWave < rule.bestWave) return false;
    return true;
  }

  /** 某槽位的可选项（含解锁状态），供 UI 直接渲染 */
  options(slot) {
    const order = SLOT_ORDER[slot];
    const table = SLOT_TABLE[slot];
    return order.map((id) => {
      const def = table[id];
      const soon = isSoon(slot, id);
      const unlocked = this.isUnlocked(slot, id);
      const purchased = this.isPurchased(slot, id);
      let reqText = '';
      if (soon) reqText = SOON_TEXT;
      else if (!unlocked) {
        if (slot === 'build') reqText = BUILD_CORES[id].unlock.text;
        else {
          const rule = UNLOCK_RULES[slot][id];
          reqText = rule ? `出击 ${rule.runs || 0} 次 / 最高 WAVE ${rule.bestWave || 0}` : '';
        }
      }
      return {
        id, def, unlocked, soon,
        selected: this.sel[slot] === id,
        purchased,
        cost: this.cost(slot, id),
        reqText,
      };
    });
  }

  /** 切换选择；未解锁返回 false（build 槽允许再次点击取消装备） */
  select(slot, id) {
    if (!LOADOUT_SLOTS.includes(slot)) return false;
    // 比赛版：主武器不可更换（只允许"再次确认机炮"，兼容旧工具调用）
    if (slot === 'weapon') return id === this.sel.weapon;
    if (slot === 'build') {
      // 点击已装备的 Build Core = 卸下（build 可以为空）
      if (this.sel.build === id) { this.sel.build = null; this.save(); return true; }
      if (!this.isUnlocked(slot, id)) return false;
      this.sel.build = id;
      this.save();
      return true;
    }
    if (!this.isUnlocked(slot, id)) return false;
    this.sel[slot] = id;
    this.bonus = findBonus(this.sel);
    this.save();
    return true;
  }

  /* ---------------- 数值 ---------------- */

  get core() { return CORES[this.sel.core]; }
  get weapon() { return WEAPON_CORES[this.sel.weapon]; }
  get power() { return POWERS[this.sel.power]; }
  /** Phase 18：BUILD CORE（可为 null = 未装备） */
  get buildCore() { return this.sel.build ? buildCoreById(this.sel.build) : null; }

  /** 三槽静态 mods 合并（core × power），供展示与 apply 共用 */
  staticMods() {
    const m = {};
    const merge = (src) => {
      if (!src) return;
      for (const k in src) {
        if (k === 'overheatDamageMul') continue;     // 运行时条件加成，不走静态
        if (typeof src[k] !== 'number') continue;
        if (k === 'critChance' || k === 'critDamage' || k === 'targeting') m[k] = (m[k] || 0) + src[k];
        else m[k] = (m[k] || 1) * src[k];
      }
    };
    merge(this.core.mods);
    merge(this.power.mods);
    if (this.bonus && !this.bonus.cond) merge(this.bonus.mods);   // 永久型 bonus 直接并入
    return m;
  }

  /**
   * 把构型写进 PlayerStats（每局 startRun 调用一次，stats 已 reset）
   * 顺序遵循 §71：Base → Equipment → Meta → Temporary → Event → Crit
   * 构型属于与 Meta 同级的大型乘区，故在 Meta 之后、临时增益之前结算。
   */
  apply(stats) {
    const b = stats.base;
    const m = this.staticMods();
    if (m.damageMul) b.damageMul *= m.damageMul;
    if (m.fireRateMul) b.fireRateMul *= m.fireRateMul;
    if (m.critChance) b.critChance = Math.min(0.95, b.critChance + m.critChance);
    if (m.critDamage) b.critDamage += m.critDamage;
    if (m.maxHeatMul) b.maxHeatMul *= m.maxHeatMul;
    if (m.coolRateMul) b.coolRateMul *= m.coolRateMul;
    if (m.heatPerShotMul) b.heatPerShotMul *= m.heatPerShotMul;
    if (m.weaponCdMul) b.weaponCdMul *= m.weaponCdMul;
    if (m.skillCdMul) b.skillCdMul *= m.skillCdMul;
    if (m.radarRangeMul) b.radarRangeMul *= m.radarRangeMul;
    if (m.aimAssistMul) b.aimAssistMul *= m.aimAssistMul;
    if (m.lockTimeMul) b.lockTimeMul *= m.lockTimeMul;
    if (m.damageTakenMul) b.damageTakenMul *= m.damageTakenMul;
    if (m.baseHpMul) b.maxHpMul *= m.baseHpMul;
    if (m.missileDamageMul) b.missileDamageMul *= m.missileDamageMul;
    if (m.empDamageMul) b.empDamageMul *= m.empDamageMul;
    if (m.explosionRadiusMul) b.explosionRadiusMul *= m.explosionRadiusMul;
    if (m.targeting) b.targeting += m.targeting;
    this._overheatOn = false;
    this._bonusOn = false;
    this.bonusActive = false;
    return stats;
  }

  /**
   * 每帧结算条件加成（开关式：进入时乘上、离开时除回，避免逐帧累积）
   * @param {object} game
   */
  update(game) {
    const stats = game.stats;
    const w = game.weapons ? game.weapons.primary : null;

    // 1) Thermal Core：过热中伤害 +25%
    const od = this.power.overheatDamageMul || 1;
    const wantOverheat = !!(w && w.overheated) && od !== 1;
    if (wantOverheat !== this._overheatOn) {
      stats.base.damageMul = wantOverheat ? stats.base.damageMul * od : stats.base.damageMul / od;
      this._overheatOn = wantOverheat;
    }

    // 2) 条件型 Configuration Bonus（如 OVERDRIVE：热量 > 75%）
    const b = this.bonus;
    let wantBonus = false;
    if (b && b.cond) {
      if (b.cond.type === 'heat' && w) {
        const max = w._effectiveMaxHeat || w.cfg.maxHeat;
        wantBonus = max > 0 && (w.heat / max) > b.cond.value;
      }
    }
    if (wantBonus !== this._bonusOn) {
      const m = b ? b.mods : {};
      if (m.fireRateMul) stats.base.fireRateMul = wantBonus ? stats.base.fireRateMul * m.fireRateMul : stats.base.fireRateMul / m.fireRateMul;
      if (m.critChance) stats.base.critChance = wantBonus ? stats.base.critChance + m.critChance : stats.base.critChance - m.critChance;
      this._bonusOn = wantBonus;
      if (wantBonus && game.screens) game.screens.toast(b.name + ' 启动', 'good');
    }
    this.bonusActive = this._bonusOn || (!!b && !b.cond);
  }

  /** 供 UI / HUD 展示的一行摘要 */
  summary() {
    return {
      core: this.core.id, weapon: this.weapon.id, power: this.power.id,
      build: this.sel.build,
      name: `${this.core.short} × ${this.weapon.short} × ${this.power.short}${this.buildCore ? ' × ' + this.buildCore.short : ''}`,
      bonus: this.bonus ? this.bonus.name : null,
    };
  }
}

export default Loadout;
