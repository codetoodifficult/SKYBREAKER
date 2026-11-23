/**
 * Evolution —— 武器进化配方（Phase 16，设计文档 §26~§30）
 *
 * 逻辑：
 *   主武器 Lv6 + 指定模块 Lv3 = Evolution
 * 进化的意义不是"伤害 ×2"，而是**改变攻击形态**（§26）。
 *
 * module 指向 js/data/equipment.js 里的装备 id（战术或被动）。
 */
export const EVOLUTIONS = [
  {
    id: 'vulcanBurst',
    name: '火山爆发 · VULCAN BURST',
    weapon: 'machineGun', weaponName: '机炮',
    module: 'highExplosive', moduleName: '高爆弹药',
    desc: '每发命中都炸开，机枪变成小范围连锁火力',
    lines: ['机炮弹命中：爆炸半径 32', '爆炸伤害 40%'],
    mods: { boomRadius: 32, boomPct: 0.40 },
  },
  {
    id: 'skybreaker',
    name: '破天 · SKYBREAKER',
    weapon: 'flakCannon', weaponName: '高射炮',
    module: 'targetingAI', moduleName: '火控 AI',
    desc: '空爆覆盖范围与威力大幅强化',
    lines: ['爆炸半径 +35%', '爆炸伤害 +40%', '远距离目标优先锁定'],
    mods: { explosionRadiusMul: 1.35, explosionDamageMul: 1.40 },
  },
  {
    id: 'stormHunter',
    name: '风暴猎手 · STORM HUNTER',
    weapon: 'missile', weaponName: '防空导弹',
    module: 'empBurst', moduleName: 'EMP 脉冲',
    desc: '导弹对瘫痪目标造成毁灭打击并引发电弧',
    lines: ['命中 EMP 目标：伤害 +100%', '额外产生 1 次电弧', '最多跳跃 2 个目标'],
    mods: { frozenDamageMul: 2.0, chainDamage: 0.6, chainJumps: 2, chainRange: 220 },
  },
  {
    id: 'thunderRail',
    name: '雷霆磁轨 · THUNDER RAIL',
    weapon: 'railCannon', weaponName: '磁轨炮',
    module: 'powerCapacitor', moduleName: '高压电容',
    desc: '暴击在命中点召唤闪电链',
    lines: ['暴击时产生闪电', '闪电伤害 60', '最多跳跃 3 次'],
    mods: { lightningDamage: 60, lightningJumps: 3, lightningRange: 260 },
  },
];

/** 配方文字提示（UI 用） */
export function recipeText(ev) {
  return `${ev.weaponName} Lv6 + ${ev.moduleName} Lv3`;
}

export default EVOLUTIONS;
