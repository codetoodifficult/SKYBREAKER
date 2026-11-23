/**
 * 升级库
 *
 * 设计原则：
 *   - 已实现的能力 = 立即生效（damage、fireRate、crit、heat、radar、survival、xpGain、multishot）
 *   - 涉及 Phase 7+ 的子系统（弹匣、导弹、多锁定）= 锁定，不出现在三选一里，避免"假按钮"
 *   - 每个升级在卡片上展示 名称 / 描述 / 分类颜色（与 Kenney UI 配色一致）
 *
 * 分类颜色映射（Kenney UI Pack）：
 *   火力 fire   → Red
 *   弹药 ammo   → Blue
 *   雷达 radar  → Yellow
 *   生存 surv   → Green
 *   导弹 msl    → Red（同 fire 配色，避免引入新色）
 *   其他 misc   → Grey
 */

export const CATEGORY_COLOR = {
  fire:  'Red',
  ammo:  'Blue',
  radar: 'Yellow',
  surv:  'Green',
  msl:   'Red',
  misc:  'Grey',
  wpn:    'Blue',   // Phase 13：武器（获得 / 强化）
};

/** Phase C：稀有度框架（颜色 / 权重 / 等级门槛）——统一由 rarityWeight() 计算 */
export const RARITY = {
  common:    { color: '#d8dee9', weight: 100, minLevel: 1, name: '普通' },
  uncommon:  { color: '#7bd88f', weight: 35,  minLevel: 3, name: '优秀' },
  rare:      { color: '#69a9ff', weight: 12,  minLevel: 6, name: '稀有' },
  epic:      { color: '#c08bff', weight: 4,   minLevel: 10, name: '史诗' },
  legendary: { color: '#ffcf5c', weight: 1,   minLevel: 15, name: '传说' },
};

/**
 * 稀有度权重统一函数（GDD §3.3）：
 *   rarityWeight = base × 难度稀有率 × luck × 等级门槛
 * luck 采用递减收益：1 + min(luck,100)*0.003（Luck 100 → ×1.30）
 */
export function rarityWeight(upgrade, ctx = {}) {
  const rarity = upgrade.rarity || 'common';
  const r = RARITY[rarity] || RARITY.common;
  const level = ctx.playerLevel || 1;
  const luckMul = 1 + Math.min(ctx.luck || 0, 100) * 0.003;
  const gate = level >= r.minLevel ? 1 : 0;
  return r.weight * (ctx.difficultyRarityMul || 1) * luckMul * gate;
}

export const CATEGORY_NAME = {
  fire:  '火力',
  ammo:  '弹药',
  radar: '雷达',
  surv:  '生存',
  msl:   '导弹',
  misc:  '通用',
  wpn:    '武器',
};

export const UPGRADES = [
  /* ---------------- 火力（7） ---------------- */
  { id:'damage',   cat:'fire', name:'火力强化',  desc:'机炮伤害 +20%',          damageMul: 1.20 },
  { id:'fireRate', cat:'fire', name:'连射模式',  desc:'射速 +20%',              fireRateMul: 1.20 },
  { id:'bulletSpd',cat:'fire', name:'高速弹',    desc:'弹速 +20%（更易命中）',   bulletSpeedMul: 1.20 },
  { id:'crit',     cat:'fire', name:'精准打击',  desc:'暴击率 +5%',             critChance: 0.05 },
  { id:'critDmg',  cat:'fire', name:'致命一击',  desc:'暴击伤害 +25%',          critDamageMul: 1.25 },
  { id:'penetr',   cat:'fire', name:'穿甲弹',    desc:'穿透 +1（穿透敌机数）',  penetration: 1 },
  { id:'multishot',cat:'fire', name:'双联机炮',  desc:'每次开火多射 1 发',       multiShot: 1 },

  /* ---------------- 弹药（2 + 2 锁） ---------------- */
  { id:'heatCap',  cat:'ammo', name:'强化炮管',  desc:'热量上限 +25%（开火更久）', maxHeatMul: 1.25 },
  { id:'coolRate', cat:'ammo', name:'散热系统',  desc:'散热速度 +25%',            coolRateMul: 1.25 },
  { id:'maxAmmo',  cat:'ammo', name:'扩充弹匣',  desc:'导弹弹匣容量 +20%',       maxAmmoMul: 1.2 },
  { id:'reload',   cat:'ammo', name:'快速装填',  desc:'导弹装填速度 +20%',       reloadTimeMul: 0.83 },

  /* ---------------- 雷达（2 + 2 锁） ---------------- */
  { id:'radar',    cat:'radar', name:'雷达强化',  desc:'雷达范围 +20%',          radarRangeMul: 1.20 },
  { id:'pickup',   cat:'radar', name:'磁吸强化',  desc:'XP 吸取范围 +25%',       pickupRadiusMul: 1.25 },
  { id:'lockSpd',  cat:'radar', name:'快速锁定',  desc:'导弹锁定速度 +20%',      lockTimeMul: 0.8 },
  { id:'targeting',cat:'radar', name:'多重锁定',  desc:'导弹同时锁定 +1',        targeting: 1 },

  /* ---------------- 生存（4） ---------------- */
  { id:'baseHP',   cat:'surv', name:'加固基地',  desc:'基地生命上限 +20%',      maxHpMul: 1.20 },
  { id:'shield',   cat:'surv', name:'能量护盾',  desc:'+1 护盾（抵挡一次突防）', shield: 1 },
  { id:'repair',   cat:'surv', name:'维护保养',  desc:'立即修复 5% 基地生命',    repairPct: 0.05 },
  { id:'armor',    cat:'surv', name:'复合装甲',  desc:'受到伤害 -10%',          armor: 0.10 },

  /* ---------------- 通用（1） ---------------- */
  { id:'xpGain',   cat:'misc', name:'高效训练',  desc:'获得 XP +15%',            xpMul: 1.15 },

  /* ---------------- 导弹（4） ---------------- */
  { id:'missileDmg', cat:'msl', name:'导弹威力', desc:'导弹伤害 +25%',   missileDamageMul: 1.25 },
  { id:'missileCnt', cat:'msl', name:'导弹齐射', desc:'导弹数量 +1',      missileCount: 1 },
  { id:'missileCD',  cat:'msl', name:'快速装弹', desc:'导弹冷却 -20%',    missileCooldownMul: 0.8 },
  { id:'missileSpd', cat:'msl', name:'高速导弹', desc:'导弹速度 +20%',    missileSpeedMul: 1.2 },

  /* ---------------- Phase C 新增通用被动（真实生效，仅用已接线属性） ----------------
   * 规则：不碰新战斗机制（状态/经济/商店留到后续阶段），只用 PlayerStats.apply 已支持的键，
   *       避免"卡片显示但没效果"的假升级。
   * 字段：maxStacks / rarity / tags / requires / excludes —— 供 canApply 与 UI 使用。
   */
  { id:'calibratedCore', cat:'fire', name:'校准核心', desc:'全局伤害 +6%（低幅稳定成长）', damageMul: 1.06, maxStacks: 5, rarity:'common', tags:['bullet'] },
  { id:'velocityField',  cat:'fire', name:'高压推进', desc:'弹速 +15%', bulletSpeedMul: 1.15, maxStacks: 4, rarity:'common', tags:['bullet'] },
  { id:'weakpointScan',  cat:'fire', name:'弱点扫描', desc:'暴击率 +3%，暴击伤害 +10%', critChance: 0.03, critDamageMul: 1.10, maxStacks: 4, rarity:'uncommon', tags:['crit'] },
  { id:'rapidCycler',    cat:'misc', name:'快速循环', desc:'战术技能冷却 -6%', skillCdMul: 0.94, maxStacks: 5, rarity:'common', tags:['control'] },
  { id:'extendedLock',   cat:'radar', name:'延伸锁定', desc:'导弹锁定时间 -8%', lockTimeMul: 0.92, maxStacks: 5, rarity:'common', tags:['lock','missile'] },
  { id:'combatAnalysis', cat:'misc', name:'战场分析', desc:'获得 XP +5%', xpMul: 1.05, maxStacks: 5, rarity:'common', tags:[] },
  { id:'reinforcedHull', cat:'surv', name:'强化外壳', desc:'基地受到的伤害 -5%', damageTakenMul: 0.95, maxStacks: 5, rarity:'common', tags:['armor'] },
  { id:'aimCalibrator',  cat:'radar', name:'瞄准校准', desc:'辅助瞄准强度 +12%', aimAssistMul: 1.12, maxStacks: 4, rarity:'common', tags:['tracking'] },
  { id:'empAmplifier',   cat:'radar', name:'EMP 增幅', desc:'EMP / 特殊武器伤害 +20%', empDamageMul: 1.20, maxStacks: 4, rarity:'common', tags:['electric'] },
  { id:'thermalBuffer',  cat:'ammo', name:'热缓冲仓', desc:'热量上限 +12%，散热 +10%', maxHeatMul: 1.12, coolRateMul: 1.10, maxStacks: 4, rarity:'uncommon', tags:['heat'] },

  /* ---------------- Phase E 元素状态卡（真实接入 StatusEffects） ---------------- */
  { id:'incendiaryCoating', cat:'fire', name:'燃烧涂层', desc:'命中 8% 概率施加燃烧（12 DPS/层）', burnChance: 0.08, maxStacks: 5, rarity:'common', tags:['bullet','heat'] },
  { id:'ionizedRounds',     cat:'radar', name:'离子弹头', desc:'命中 7% 概率电击并传导（2 跳）', shockChance: 0.07, maxStacks: 5, rarity:'common', tags:['electric'] },
  { id:'cryogenicAmmo',     cat:'ammo', name:'低温弹药', desc:'命中 7% 概率冰缓减速', chillChance: 0.07, maxStacks: 5, rarity:'common', tags:['ice','control'] },
  { id:'corrosiveWarhead',  cat:'fire', name:'腐蚀弹头', desc:'命中 6% 概率施加腐蚀易伤', corrosionChance: 0.06, maxStacks: 5, rarity:'common', tags:['corrosion'] },
  { id:'statusAmplifier',   cat:'misc', name:'状态增幅', desc:'状态强度 +20%（易伤/减速/灼烧）', statusPower: 1.20, maxStacks: 3, rarity:'uncommon', tags:['control'] },

  /* ---------------- Phase C 收尾：luck 接入（§3.3 稀有度权重联动） ---------------- */
  { id:'fortune', cat:'misc', name:'幸运校准', desc:'幸运 +12：高稀有卡出现权重提升、稀有卡出现率微增', luckAdd: 12, maxStacks: 5, rarity:'uncommon', tags:['luck'] },
];


/**
 * Phase C：老卡的默认元数据（maxStacks / rarity / tags / requires / excludes）。
 * 用映射而非逐行改写，保持既有卡定义零改动、旧存档/测试兼容。
 * maxStacks:null 表示理论上可无限叠加（由权重 1/(1+taken) 软抑制）。
 */
export const UPGRADE_META = {
  // 火力
  damage:     { maxStacks: 8, rarity: 'common', tags: ['bullet'] },
  fireRate:   { maxStacks: 6, rarity: 'common', tags: ['fireRate'] },
  bulletSpd:  { maxStacks: 5, rarity: 'common', tags: ['bullet'] },
  crit:       { maxStacks: 6, rarity: 'common', tags: ['crit'] },
  critDmg:    { maxStacks: 5, rarity: 'common', tags: ['crit'] },
  penetr:     { maxStacks: 4, rarity: 'common', tags: ['penetration'] },
  multishot:  { maxStacks: 4, rarity: 'common', tags: ['bullet', 'fireRate'] },
  // 弹药
  heatCap:    { maxStacks: 5, rarity: 'common', tags: ['heat'] },
  coolRate:   { maxStacks: 5, rarity: 'common', tags: ['heat'] },
  maxAmmo:    { maxStacks: 4, rarity: 'common', tags: ['missile'] },
  reload:     { maxStacks: 4, rarity: 'common', tags: ['missile'] },
  // 雷达
  radar:      { maxStacks: 5, rarity: 'common', tags: ['radar'] },
  pickup:     { maxStacks: 4, rarity: 'common', tags: ['radar'] },
  lockSpd:    { maxStacks: 4, rarity: 'common', tags: ['lock'] },
  targeting:  { maxStacks: 3, rarity: 'common', tags: ['lock', 'missile'] },
  // 生存
  baseHP:     { maxStacks: 6, rarity: 'common', tags: ['armor'] },
  shield:     { maxStacks: 5, rarity: 'common', tags: ['shield'] },
  repair:     { maxStacks: null, rarity: 'common', tags: ['repair'] }, // 即时修复，可重复
  armor:      { maxStacks: 5, rarity: 'common', tags: ['armor'] },
  xpGain:     { maxStacks: 5, rarity: 'common', tags: [] },
  // 导弹
  missileDmg: { maxStacks: 6, rarity: 'common', tags: ['missile'] },
  missileCnt: { maxStacks: 3, rarity: 'common', tags: ['missile'] },
  missileCD:  { maxStacks: 4, rarity: 'common', tags: ['missile'] },
  missileSpd: { maxStacks: 4, rarity: 'common', tags: ['missile', 'tracking'] },
  // Rare（旧 8 张）
  chainReaction: { maxStacks: 1, rarity: 'rare', tags: ['explosion', 'area'] },
  splitMissile:  { maxStacks: 1, rarity: 'rare', tags: ['missile'] },
  bouncingShell: { maxStacks: 1, rarity: 'rare', tags: ['penetration', 'bullet'] },
  incendiary:    { maxStacks: 1, rarity: 'rare', tags: ['bullet', 'heat'] },
  shockCore:     { maxStacks: 1, rarity: 'rare', tags: ['heat'] },
  heavyPayload:  { maxStacks: 1, rarity: 'rare', tags: ['missile', 'heavy'] },
  smartAmmo:     { maxStacks: 1, rarity: 'rare', tags: ['radar', 'lock'] },
  overclock:     { maxStacks: 1, rarity: 'rare', tags: ['fireRate', 'heat'] },
};

/** 给卡片补齐元数据字段（不修改原对象） */
export function withMeta(u) {
  const m = UPGRADE_META[u.id] || {};
  return {
    ...u,
    maxStacks: u.maxStacks !== undefined ? u.maxStacks : (m.maxStacks !== undefined ? m.maxStacks : null),
    rarity: u.rarity || m.rarity || 'common',
    tags: u.tags || m.tags || [],
    requires: u.requires || [],
    excludes: u.excludes || [],
  };
}

/** 当前阶段可出现的升级（不含 locked，也不含 Rare —— Rare 由 UpgradeManager 单独投放） */
export function getUnlockedUpgrades() {
  return UPGRADES.filter(u => !u.locked && !u.rare).map(withMeta);
}

/**
 * Phase 16 §64：Rare Upgrade 只做 8 个，且都是"改变行为"而非纯数值。
 * 投放规则（UpgradeManager.pickThree）：玩家等级 ≥ 6 后，每次三选一有 22% 概率出现 1 张，
 * 且同一局内已拿过的 Rare 不再出现。
 */
export const RARE_UPGRADES = [
  { id: 'chainReaction', cat: 'fire', rare: true, name: '连锁反应', desc: '★ 爆炸范围 +30%，爆炸伤害 +25%', explosionRadiusMul: 1.30, damageMul: 1.25 },
  { id: 'splitMissile', cat: 'msl', rare: true, name: '分裂弹头', desc: '★ 导弹齐射 +1，导弹伤害 +15%', missileCount: 1, missileDamageMul: 1.15 },
  { id: 'bouncingShell', cat: 'ammo', rare: true, name: '跳弹', desc: '★ 全武器穿透 +2', penetration: 2 },
  { id: 'incendiary', cat: 'fire', rare: true, name: '燃烧弹药', desc: '★ 全武器伤害 +30%', damageMul: 1.30 },
  { id: 'shockCore', cat: 'surv', rare: true, name: '冲击核心', desc: '★ 热量上限 +40%，散热速度 +30%', maxHeatMul: 1.40, coolRateMul: 1.30 },
  { id: 'heavyPayload', cat: 'msl', rare: true, name: '重装弹头', desc: '★ 导弹伤害 +60%', missileDamageMul: 1.60 },
  { id: 'smartAmmo', cat: 'radar', rare: true, name: '智能弹药', desc: '★ 锁定目标 +1，雷达 +25%', targeting: 1, radarRangeMul: 1.25 },
  { id: 'overclock', cat: 'fire', rare: true, name: '超频', desc: '★ 射速 +35%，积热 +30%', fireRateMul: 1.35, heatPerShotMul: 1.30 },
];

/** 玩家等级达到该值后才会出现 Rare */
export const RARE_MIN_LEVEL = 6;
/** 每次三选一出现 Rare 的概率 */
export const RARE_CHANCE = 0.22;

export default UPGRADES;
