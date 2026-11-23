/**
 * 装备数值配置（Phase 14 Equipment System，设计文档 §12）
 *
 * A 主武器（已有）  B 自动武器（已有 Missile/Flak/Rail/Pulse，新增 InterceptorDrone）
 * C Tactical 主动（自动施放，最多 2）  D Passive 被动（最多 6）
 *
 * Tactical 之所以"自动施放"：本作只有"按住开火"一个操作，
 * 再塞主动按键会破坏移动端手感，因此战术技能按冷却自动触发（有明确的视觉与音效反馈）。
 *
 * 等级成长统一走 LevelTable（与武器同构的累计乘算表），见 EQUIP_LEVELS。
 */

/* ---------------- B. 自动武器 ---------------- */
export const AUTO_EQUIPMENT = {
  interceptorDrone: {
    id: 'interceptorDrone',
    name: '拦截无人机',
    slot: 'auto',
    maxLevel: 6,
    desc: '绕塔巡逻，自动点名近距离目标',

    damage: 22,
    fireRate: 1.6,        // 每架每秒发数
    bulletSpeed: 900,
    bulletRadius: 3,
    bulletLife: 1.2,
    spread: 0.03,
    penetration: 0,
    range: 420,           // 索敌半径
    orbitRadius: 92,      // 绕塔半径
    orbitSpeed: 1.5,      // rad/s
    droneCount: 2,        // 无人机数量
  },
};

/* ---------------- C. Tactical ---------------- */
export const TACTICAL_EQUIPMENT = {
  empBurst: {
    id: 'empBurst',
    name: 'EMP 脉冲',
    slot: 'tactical',
    maxLevel: 6,
    desc: '大范围瘫痪并灼伤敌机',

    cooldown: 12.0,
    damage: 90,
    radius: 300,
    freeze: 1.6,          // 瘫痪时长 s
  },

  airstrike: {
    id: 'airstrike',
    name: '空袭呼叫',
    slot: 'tactical',
    maxLevel: 6,
    desc: '对敌机密集处连番轰炸',

    cooldown: 16.0,
    strikes: 3,           // 轰炸点数
    gap: 0.45,            // 每点间隔 s
    damage: 160,
    radius: 110,
  },

  emergencyShield: {
    id: 'emergencyShield',
    name: '应急护盾',
    slot: 'tactical',
    maxLevel: 6,
    desc: '周期性补充护盾并修复基地',

    cooldown: 14.0,
    shield: 1,            // 每次补充层数
    shieldCap: 3,
    healPct: 0.04,        // 每次修复基地比例
  },
};

/* ---------------- D. Passive ---------------- */
/** 被动每级为**增量**（每次升级各叠加一次），与武器/战术的累计乘算表不同 */
export const PASSIVE_EQUIPMENT = {
  targetingAI: {
    id: 'targetingAI',
    name: '火控 AI',
    slot: 'passive',
    maxLevel: 6,
    desc: '暴击率与雷达范围提升',
    perLevel: { critChance: 0.04, radarRangeMul: 1.06 },
  },

  reactiveArmor: {
    id: 'reactiveArmor',
    name: '反应装甲',
    slot: 'passive',
    maxLevel: 6,
    desc: '减伤与基地生命上限提升',
    perLevel: { armor: 0.06, maxHpMul: 1.05 },
  },

  highExplosive: {
    id: 'highExplosive',
    name: '高爆弹药',
    slot: 'passive',
    maxLevel: 6,
    desc: '全武器伤害与导弹威力提升',
    perLevel: { damageMul: 1.10, missileDamageMul: 1.12 },
  },

  /** Phase 16：THUNDER RAIL 的配方模块（设计文档 §30 的 High Voltage） */
  powerCapacitor: {
    id: 'powerCapacitor',
    name: '高压电容',
    slot: 'passive',
    maxLevel: 6,
    desc: '技能充能加快、EMP 与特殊武器威力提升',
    perLevel: { skillCdMul: 0.93, empDamageMul: 1.10 },
  },

  /* ---------------- Phase F：新增被动模块（真实效果，复用已接线属性） ---------------- */
  radarBeacon: {
    id: 'radarBeacon', name: '雷达信标', slot: 'passive', maxLevel: 6,
    desc: '每级：雷达范围 +6%，锁定时间 -4%',
    perLevel: { radarRangeMul: 1.06, lockTimeMul: 0.96 },
  },
  thermalRegulator: {
    id: 'thermalRegulator', name: '热控模块', slot: 'passive', maxLevel: 6,
    desc: '每级：热量上限 +8%，散热 +6%',
    perLevel: { maxHeatMul: 1.08, coolRateMul: 1.06 },
  },
  phaseShield: {
    id: 'phaseShield', name: '相位护盾', slot: 'passive', maxLevel: 6,
    desc: '每级：基地生命 +5%，受到伤害 -3%',
    perLevel: { maxHpMul: 1.05, damageTakenMul: 0.97 },
  },
  salvageBot: {
    id: 'salvageBot', name: '回收机器人', slot: 'passive', maxLevel: 6,
    desc: '每级：XP +4%，拾取范围 +5%',
    perLevel: { xpMul: 1.04, pickupRadiusMul: 1.05 },
  },
};

export const EQUIPMENT = {
  ...AUTO_EQUIPMENT, ...TACTICAL_EQUIPMENT, ...PASSIVE_EQUIPMENT,
};

/* ---------------- 等级成长表（累计乘算，与 WeaponLevel 同构） ---------------- */
export const EQUIP_LEVELS = {
  interceptorDrone: [
    { short: '2 架 / 22 伤害' },
    { short: '伤害 ×1.18', damageMul: 1.18 },
    { short: '+1 架无人机', damageMul: 1.18, droneCountAdd: 1 },
    { short: '射速 ×1.20', damageMul: 1.18, droneCountAdd: 1, fireRateMul: 1.20 },
    { short: '伤害 ×1.20', damageMul: 1.416, droneCountAdd: 1, fireRateMul: 1.20 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.77, droneCountAdd: 1, fireRateMul: 1.20, evolutionReady: true },
  ],

  empBurst: [
    { short: '冷却 12s / 90 伤害 / 300 范围' },
    { short: '伤害 ×1.20', damageMul: 1.20 },
    { short: '范围 ×1.15', damageMul: 1.20, radiusMul: 1.15 },
    { short: '冷却 ×0.85', damageMul: 1.20, radiusMul: 1.15, cooldownMul: 0.85 },
    { short: '瘫痪 +0.4s', damageMul: 1.20, radiusMul: 1.15, cooldownMul: 0.85, freezeAdd: 0.4 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.50, radiusMul: 1.15, cooldownMul: 0.85, freezeAdd: 0.4, evolutionReady: true },
  ],

  airstrike: [
    { short: '冷却 16s / 3 波 / 160 伤害' },
    { short: '伤害 ×1.20', damageMul: 1.20 },
    { short: '+1 波轰炸', damageMul: 1.20, strikesAdd: 1 },
    { short: '冷却 ×0.85', damageMul: 1.20, strikesAdd: 1, cooldownMul: 0.85 },
    { short: '范围 ×1.15', damageMul: 1.20, strikesAdd: 1, cooldownMul: 0.85, radiusMul: 1.15 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.50, strikesAdd: 1, cooldownMul: 0.85, radiusMul: 1.15, evolutionReady: true },
  ],

  emergencyShield: [
    { short: '冷却 14s / +1 护盾 / 修复 4%' },
    { short: '冷却 ×0.85', cooldownMul: 0.85 },
    { short: '修复 +2%', cooldownMul: 0.85, healAdd: 0.02 },
    { short: '护盾上限 +1', cooldownMul: 0.85, healAdd: 0.02, shieldCapAdd: 1 },
    { short: '冷却再 ×0.85', cooldownMul: 0.7225, healAdd: 0.02, shieldCapAdd: 1 },
    { short: '修复 +3% · 解锁进化槽', cooldownMul: 0.7225, healAdd: 0.05, shieldCapAdd: 1, evolutionReady: true },
  ],
};

export default EQUIPMENT;
