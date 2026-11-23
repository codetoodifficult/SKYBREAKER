/**
 * WeaponProgression —— 武器研发等级 / 部署状态解耦（Phase B，GDD 第 2 章）
 *
 * 现状（Phase A 审计）：武器等级挂在实例 this.level 上，reset() 每局清零，
 *   且强化卡只对 slots.list()（已部署武器）生成 —— 未持有武器无法积累成长。
 *
 * 本模块把「研发等级」提升为**武器类型级**数据（run.weaponProgress），
 *   与「是否已部署」(owned) 分离：
 *   - unlocked  局外是否解锁（比赛版默认全部解锁）
 *   - owned     本局是否已部署（决定武器实体是否生效 / 是否计入件数）
 *   - level     本局研发等级（未部署也能升高；部署时继承，不重置）
 *   - mods      预研改装（Phase D 使用，本阶段仅占位）
 *   - evolutionId / masteryXP  预留字段
 *
 * 重要：本模块**不创建任何武器实体**，不触发开火，也不写 PlayerStats。
 *   它只保存状态；WeaponManager 负责把 level 同步到实例 eff。
 */
import { MAX_WEAPON_LEVEL, levelOf } from '../weapons/WeaponLevel.js';
import { WEAPONS } from '../data/weapons.js';
import { WEAPON_MODS, MOD_SLOT_CAP } from '../data/weaponMods.js';

/** 五把主战武器（可生成研发 / 强化 / 部署卡）+ 无人机（仅实体升级，不进抽卡池） */
export const RESEARCH_WEAPON_IDS = ['machineGun', 'flakCannon', 'missile', 'railCannon', 'pulseLaser'];
export const ALL_PROGRESS_IDS = [...RESEARCH_WEAPON_IDS, 'interceptorDrone'];

function blankEntry(id, unlocked, owned) {
  return {
    id,
    unlocked: !!unlocked,
    owned: !!owned,
    level: 1,
    evolutionId: null,
    mods: [],
    masteryXP: 0,
  };
}

export class WeaponProgression {
  constructor() {
    this.progress = {};
    this.reset();
  }

  /**
   * 每局初始化：所有已解锁武器 Lv1；仅起手武器 owned=true。
   * @param {string} startingId 起手武器 id
   * @param {string[]|null} unlockedIds 局外解锁列表（null = 全部）
   */
  reset(startingId = 'machineGun', unlockedIds = null) {
    const unlockedSet = unlockedIds ? new Set(unlockedIds) : null;
    this.progress = {};
    for (const id of ALL_PROGRESS_IDS) {
      const unlocked = unlockedSet ? unlockedSet.has(id) : true;
      this.progress[id] = blankEntry(id, unlocked, id === startingId);
    }
    return this.progress;
  }

  /** 兼容 Game.run.weaponProgress 引用 */
  get data() { return this.progress; }

  get(id) { return this.progress[id] || null; }
  levelOf(id) { const p = this.progress[id]; return p ? p.level : 1; }
  isOwned(id) { const p = this.progress[id]; return !!(p && p.owned); }
  isUnlocked(id) { const p = this.progress[id]; return !!(p && p.unlocked); }
  isMaxLevel(id) { return this.levelOf(id) >= MAX_WEAPON_LEVEL; }

  /** 能否研发：已解锁 + 未满级（与是否拥有无关） */
  canResearch(id) {
    const p = this.progress[id];
    return !!(p && p.unlocked && p.level < MAX_WEAPON_LEVEL);
  }

  /** 研发一级：只改类型级数据，绝不创建实体 */
  research(id) {
    if (!this.canResearch(id)) return 0;
    const p = this.progress[id];
    p.level += 1;
    return p.level;
  }

  /** 部署：标记 owned=true，返回当前研发等级供实体继承 */
  setOwned(id) {
    const p = this.progress[id];
    if (!p || !p.unlocked) return 0;
    p.owned = true;
    return p.level;
  }

  /** 下一级卡面描述 */
  nextDesc(id) {
    const p = this.progress[id];
    if (!p) return '';
    const row = levelOf(id, p.level + 1);
    return (row && row.short) || '属性提升';
  }

  /**
   * Phase D：登记预研改装（槽位上限 + 互斥校验）。
   * @param {string} id 武器 id
   * @param {string} modId 改装 id
   * @param {object} [modDef] WEAPON_MODS[modId]，提供 exclusive / weaponId
   * @param {number} [cap] 槽位上限
   */
  addMod(id, modId, modDef = null, cap = MOD_SLOT_CAP) {
    const p = this.progress[id];
    const def = modDef || WEAPON_MODS[modId];
    if (!p || !p.unlocked || !def || p.mods.includes(modId)) return false;
    if (def.weaponId !== id) return false;
    if (p.mods.length >= cap) return false;
    if (def.exclusive) {
      for (const have of p.mods) {
        const d = WEAPON_MODS[have];
        if (d && d.exclusive === def.exclusive) return false;
      }
    }
    p.mods.push(modId);
    return true;
  }

  /** 卸下改装（用于替换 / 出售） */
  removeMod(id, modId) {
    const p = this.progress[id];
    if (!p) return false;
    const i = p.mods.indexOf(modId);
    if (i < 0) return false;
    p.mods.splice(i, 1);
    return true;
  }

  modsOf(id) { const p = this.progress[id]; return p ? [...p.mods] : []; }

  /** 调试 / 测试快照（深拷贝，避免外部改写内部状态） */
  snapshot() {
    const out = {};
    for (const id in this.progress) {
      const p = this.progress[id];
      out[id] = { ...p, mods: [...p.mods] };
    }
    return out;
  }
}

export default WeaponProgression;
