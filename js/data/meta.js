/**
 * MetaProgression 永久成长（局外，localStorage 持久化）
 *
 * Phase 9 第一版只做 5 项，全部用「钢材 Steel」这一种货币购买：
 *   - gunDamage   机炮攻击力   → gun.damageMul
 *   - baseHP      基地生命     → base.maxHp
 *   - radarRange  雷达范围     → 雷达有效距离（影响辅助瞄准 / 导弹索敌）
 *   - missileDmg  导弹伤害     → stats.base.missileDamageMul
 *   - startRes    初始资源     → 开局额外经验（更快拿到首个强化）
 *
 * 数值全部数据驱动；MetaProgression 只负责购买 / 等级 / 花费 / 加成汇总。
 */

export const META_CURRENCY = { name: '钢材', id: 'steel' };

export const META_UPGRADES = [
  {
    id: 'gunDamage',
    name: '机炮攻击力',
    icon: '⚔',
    desc: '每级机炮伤害 +8%',
    maxLevel: 10,
    baseCost: 50,
    costMul: 1.4,
    stat: 'gunDamageMul',
    perLevel: 0.08,
  },
  {
    id: 'baseHP',
    name: '基地生命',
    icon: '❤',
    desc: '每级基地生命上限 +10%',
    maxLevel: 10,
    baseCost: 40,
    costMul: 1.4,
    stat: 'baseHpMul',
    perLevel: 0.10,
  },
  {
    id: 'radarRange',
    name: '雷达范围',
    icon: '◎',
    desc: '每级雷达范围 +8%',
    maxLevel: 10,
    baseCost: 35,
    costMul: 1.4,
    stat: 'radarRangeMul',
    perLevel: 0.08,
  },
  {
    id: 'missileDmg',
    name: '导弹伤害',
    icon: '➤',
    desc: '每级导弹伤害 +10%',
    maxLevel: 10,
    baseCost: 45,
    costMul: 1.4,
    stat: 'missileDamageMul',
    perLevel: 0.10,
  },
  {
    id: 'startRes',
    name: '初始资源',
    icon: '✯',
    desc: '每级开局额外经验 +10（更快升级）',
    maxLevel: 10,
    baseCost: 60,
    costMul: 1.5,
    stat: 'startXp',
    perLevel: 10,
  },
];

/** 按 id 取定义 */
export function metaDef(id) {
  return META_UPGRADES.find(u => u.id === id) || null;
}

export default META_UPGRADES;
