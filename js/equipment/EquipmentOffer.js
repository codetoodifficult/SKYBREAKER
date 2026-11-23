import { TACTICAL_EQUIPMENT, PASSIVE_EQUIPMENT, EQUIP_LEVELS } from '../data/equipment.js';
import { SLOT_CAP } from '../weapons/WeaponSlot.js';

/**
 * EquipmentOffer —— 装备三选一卡生成器（Phase 14，§12）
 * 与武器卡同构（kind = 'equip' / 'equipLevel'），由 UpgradeManager 与武器卡混合抽取。
 *
 * 权重：战术与被动都是"锦上添花"，权重低于武器本体，
 * 但被动槽 6 格很宽，给稍高权重让后期不至于只剩数值卡。
 */
const ACQ_TACTICAL = 2.4;
const ACQ_PASSIVE = 2.0;
const LVL_WEIGHT = 1.6;

export function buildEquipmentOffers(equipment) {
  if (!equipment) return [];
  const out = [];

  for (const id in TACTICAL_EQUIPMENT) {
    if (equipment.has(id)) continue;
    if (equipment.tacticalCount >= SLOT_CAP.tactical) continue;
    const d = TACTICAL_EQUIPMENT[id];
    out.push({
      kind: 'equip', equipId: id, id: 'eq_' + id, cat: 'wpn',
      name: d.name, desc: d.desc, weight: ACQ_TACTICAL,
    });
  }

  for (const id in PASSIVE_EQUIPMENT) {
    if (equipment.has(id)) continue;
    if (equipment.passiveCount >= SLOT_CAP.passive) continue;
    const d = PASSIVE_EQUIPMENT[id];
    out.push({
      kind: 'equip', equipId: id, id: 'eq_' + id, cat: 'wpn',
      name: d.name, desc: d.desc, weight: ACQ_PASSIVE,
    });
  }

  for (const item of equipment.list()) {
    if (item.level >= item.maxLevel) continue;
    const tbl = EQUIP_LEVELS[item.id];
    const nd = tbl ? tbl[Math.min(tbl.length - 1, item.level)] : null;
    out.push({
      kind: 'equipLevel', equipId: item.id, id: 'eqlvl_' + item.id, cat: 'wpn',
      name: `${item.name} Lv${item.level + 1}`,
      desc: (nd && nd.short) || '属性提升',
      weight: LVL_WEIGHT,
    });
  }

  return out;
}

export default buildEquipmentOffers;
