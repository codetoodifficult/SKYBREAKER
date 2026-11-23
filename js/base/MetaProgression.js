import { META_UPGRADES, metaDef } from '../data/meta.js';

/**
 * MetaProgression —— 局外永久成长管理器
 * 职责：
 *   - 记录每项升级的等级（localStorage 由 Game 统一存/取）
 *   - 计算当前等级的花费（baseCost * costMul^level）
 *   - buy(id) 升级并返回花费
 *   - summary() 汇总所有永久加成，供 startRun 应用
 */
export class MetaProgression {
  constructor() {
    this.levels = {};   // id -> level
  }

  /** 从存档恢复（Game._loadMeta 时调用） */
  load(saved) {
    this.levels = (saved && saved.metaLevels) ? Object.assign({}, saved.metaLevels) : {};
  }

  /** 导出可持久化的等级表 */
  dump() {
    return Object.assign({}, this.levels);
  }

  def(id) { return metaDef(id); }
  levelOf(id) { return this.levels[id] || 0; }
  maxed(id) { const d = this.def(id); return !!d && this.levelOf(id) >= d.maxLevel; }

  /** 升到下一级所需钢材（取整） */
  cost(id) {
    const d = this.def(id);
    if (!d) return Infinity;
    const l = this.levelOf(id);
    if (l >= d.maxLevel) return Infinity;
    return Math.round(d.baseCost * Math.pow(d.costMul, l));
  }

  /** 是否可购买（未满级 且 钢材足够） */
  canAfford(id, steel) {
    const d = this.def(id);
    if (!d || this.maxed(id)) return false;
    return steel >= this.cost(id);
  }

  /** 购买一级；成功返回花费，失败返回 -1 */
  buy(id, steel) {
    if (!this.canAfford(id, steel)) return -1;
    const c = this.cost(id);
    this.levels[id] = (this.levels[id] || 0) + 1;
    return c;
  }

  /** 汇总所有永久加成（乘法项默认 1，加法项默认 0） */
  summary() {
    const s = {
      gunDamageMul: 1,
      baseHpMul: 1,
      radarRangeMul: 1,
      missileDamageMul: 1,
      startXp: 0,
    };
    for (const d of META_UPGRADES) {
      const l = this.levelOf(d.id);
      if (!l) continue;
      switch (d.stat) {
        case 'gunDamageMul':     s.gunDamageMul     = 1 + d.perLevel * l; break;
        case 'baseHpMul':        s.baseHpMul        = 1 + d.perLevel * l; break;
        case 'radarRangeMul':    s.radarRangeMul    = 1 + d.perLevel * l; break;
        case 'missileDamageMul': s.missileDamageMul = 1 + d.perLevel * l; break;
        case 'startXp':          s.startXp          += d.perLevel * l;    break;
      }
    }
    return s;
  }

  /** 总投入钢材（用于界面展示"已投入"） */
  totalInvested() {
    let total = 0;
    for (const d of META_UPGRADES) {
      const l = this.levelOf(d.id);
      for (let i = 0; i < l; i++) total += Math.round(d.baseCost * Math.pow(d.costMul, i));
    }
    return total;
  }
}

export default MetaProgression;
