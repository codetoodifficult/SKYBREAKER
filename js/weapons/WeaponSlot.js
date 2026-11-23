/**
 * WeaponSlot —— 装备槽（Phase 13，设计文档 §11）
 *
 * 每局最多：主武器 ×1 / 自动武器 ×3 / 战术技能 ×2 / 被动装备 ×6，共 12 个有效单位。
 * Phase 13 只落地 primary + auto（战术与被动留给 Phase 14）。
 *
 * 目标不是让玩家一次拥有 12 件，而是随等级逐步铺开：
 *   Lv 1–5    1–2 件
 *   Lv 6–10   2–3 件
 *   Lv 11–15  3–4 件
 *   Lv 16+    4–5 件
 */
export const SLOT_CAP = {
  primary: 1,
  auto: 3,
  tactical: 2,
  passive: 6,
};

export class WeaponSlots {
  constructor() {
    this.bySlot = { primary: [], auto: [], tactical: [], passive: [] };
    this.byId = new Map();
    // Phase 20 §37：SKYBREAKER CORE 的槽位扩展（每局由 Game 重置）
    this.capBonus = {};
  }

  reset() {
    this.bySlot = { primary: [], auto: [], tactical: [], passive: [] };
    this.byId.clear();
    this.capBonus = {};
  }

  /** 该槽位是否还有空位 */
  isFull(slot) {
    const arr = this.bySlot[slot];
    return !!arr && arr.length >= ((SLOT_CAP[slot] ?? 0) + (this.capBonus[slot] || 0));
  }

  /** 槽位上限（含 CORE 扩展） */
  capOf(slot) {
    return (SLOT_CAP[slot] ?? 0) + (this.capBonus[slot] || 0);
  }

  has(id) { return this.byId.has(id); }
  get(id) { return this.byId.get(id) || null; }

  /**
   * 放入一件武器
   * @param {object} weapon
   * @param {string} [forceSlot] 强制放入指定槽位。
   *   用于"起手武器"：玩家在出击构型里选了导弹/电磁炮等非机炮主武器时，
   *   必须进 primary 槽由玩家手动开火，否则它会落到 auto 槽自动开火，玩家只能干看着。
   * @returns {boolean} 是否成功（槽位已满 / 已拥有 / id 重复 均返回 false）
   */
  add(weapon, forceSlot) {
    const slot = forceSlot || weapon.slot || 'auto';
    if (this.has(weapon.id)) return false;
    if (this.isFull(slot)) return false;
    this.bySlot[slot].push(weapon);
    this.byId.set(weapon.id, weapon);
    weapon.acquired = true;
    // 实际装备槽（可能与 cfg.slot 不同）：主武器槽 = 玩家手动开火
    weapon.equippedSlot = slot;
    weapon.manual = slot === 'primary';
    return true;
  }

  /** 已装备数量（不含战术/被动，Phase 14 启用） */
  get weaponCount() {
    return this.bySlot.primary.length + this.bySlot.auto.length;
  }

  /** 所有已获得的武器（primary 在前） */
  list() {
    return [...this.bySlot.primary, ...this.bySlot.auto, ...this.bySlot.tactical, ...this.bySlot.passive];
  }

  /** 主武器（唯一） */
  get primary() { return this.bySlot.primary[0] || null; }
  /** 自动武器数组 */
  get autos() { return this.bySlot.auto; }
}

export default WeaponSlots;
