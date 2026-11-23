import { EVOLUTIONS } from '../data/evolution.js';

/**
 * EvolutionSystem —— 武器进化（Phase 16，设计文档 §26~§30）
 *
 * 触发条件：主武器 Lv6 + 配方模块 Lv3
 * 触发后把 flag 写进 this.flags，并把同一份引用挂到 world.evolutionFlags，
 * 各武器在开火/命中处读 flag 决定攻击形态（不做集中式伤害分发，避免行为耦合）。
 */
export class EvolutionSystem {
  constructor(game) {
    this.game = game;
    this.flags = {};
    this.done = [];
  }

  reset() {
    this.flags = {};
    this.done = [];
  }

  has(id) { return !!this.flags[id]; }

  /** 某武器是否满足配方（用于 UI 提示进度） */
  progress(ev) {
    const g = this.game;
    const w = g.weapons ? g.weapons.all[ev.weapon] : null;
    const m = g.equipment ? g.equipment.get(ev.module) : null;
    return {
      weaponLevel: w ? (w.level || 1) : 0,
      moduleLevel: m ? (m.level || 1) : 0,
      needWeapon: ev.weaponLevel || 6,
      needModule: ev.moduleLevel || 3,
      owned: !!(w && g.weapons.slots.has(ev.weapon)),
    };
  }

  /**
   * 检查所有配方，返回本帧新解锁的进化（幂等：同一配方只触发一次）
   * @returns {Array} 新解锁的 EVOLUTIONS 项
   */
  check() {
    const g = this.game;
    if (!g.weapons || !g.equipment) return [];
    const fresh = [];
    for (const ev of EVOLUTIONS) {
      if (this.flags[ev.id]) continue;
      const w = g.weapons.all[ev.weapon];
      const m = g.equipment.get(ev.module);
      if (!w || !m) continue;
      if (!g.weapons.slots.has(ev.weapon)) continue;          // 没拿到武器不算
      if ((w.level || 1) < (ev.weaponLevel || 6)) continue;
      if ((m.level || 1) < (ev.moduleLevel || 3)) continue;
      this.flags[ev.id] = true;
      this.done.push(ev.id);
      fresh.push(ev);
    }
    if (fresh.length && g.world) g.world.evolutionFlags = this.flags;
    return fresh;
  }
}

export { EVOLUTIONS };
export default EvolutionSystem;
