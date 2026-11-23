/**
 * Configuration System —— 构型数据（Phase 15，设计文档 §13~§17、§55、§57）
 *
 * Luftrausers 式的三段构型：
 *   CORE（炮塔核心，= BODY）  ×  WEAPON（主武器）  ×  POWER（供能系统，= PROPULSION）
 * 4 × 4 × 4 = 64 种理论构型；特定组合再触发 Configuration Bonus。
 *
 * 数值约定：
 *   - 大型构型一律"乘算"（§72），且集中在 Loadout.apply 一处结算，不散落各 class（§70）
 *   - 所有字段都是"倍率/增量"，缺省即无修正
 */
export const CORES = {
  standard: {
    id: 'standard', name: '标准核心 · STANDARD CORE', short: '标准', tag: '均衡',
    desc: '无修正的基准核心',
    lines: ['基础生命 1000 · 转速 7.0 · 雷达 900', '无任何额外修正'],
    mods: {},
  },
  assault: {
    id: 'assault', name: '突击核心 · ASSAULT CORE', short: '突击', tag: '火力',
    desc: '纯火力，牺牲基地耐久',
    lines: ['主武器伤害 +12%', '射速 +10%', '基地生命 −10%'],
    mods: { damageMul: 1.12, fireRateMul: 1.10, baseHpMul: 0.90 },
  },
  fortress: {
    id: 'fortress', name: '要塞核心 · FORTRESS CORE', short: '要塞', tag: '防守',
    desc: '牺牲输出换生存',
    lines: ['基地生命 +30%', '受到伤害 −10%', '主武器伤害 −10%'],
    mods: { baseHpMul: 1.30, damageTakenMul: 0.90, damageMul: 0.90 },
  },
  hunter: {
    id: 'hunter', name: '猎手核心 · HUNTER CORE', short: '猎手', tag: '精准',
    desc: '强化索敌与辅助瞄准，弱化导弹锁定',
    lines: ['雷达范围 +20%', '辅助瞄准 +15%', '导弹锁定 −15%', '基础生命 −10%'],
    mods: { radarRangeMul: 1.20, aimAssistMul: 1.15, lockTimeMul: 1.15, baseHpMul: 0.90 },
  },
};

/** 主武器构型（起手武器，§15）：4 种，各有独立基础参数与 6 级成长 */
export const WEAPON_CORES = {
  machineGun: {
    id: 'machineGun', name: '机炮 · MACHINE GUN', short: '机炮', tag: '持续输出',
    desc: '高射速低单发，靠弹幕压制',
    lines: ['单发 8 · 射速 9/s · 散布小', '热量低，适合长时间压制'],
  },
  flakCannon: {
    id: 'flakCannon', name: '高射炮 · FLAK CANNON', short: '高炮', tag: '范围',
    desc: '空爆弹幕，清群能力最强',
    lines: ['爆炸伤害 50 · 范围 105', '对密集编队收益最高'],
  },
  railCannon: {
    id: 'railCannon', name: '电磁轨道炮 · RAIL CANNON', short: '磁轨', tag: '穿透',
    desc: '贯穿光束，一条线串起多个目标',
    lines: ['伤害 120 · 穿透多个目标', '射速慢，考验预瞄'],
  },
  pulseLaser: {
    id: 'pulseLaser', name: '脉冲激光 · PULSE LASER', short: '脉冲', tag: '灼烧',
    desc: '持续照射，附加燃烧伤害',
    lines: ['即时伤害 + 燃烧 DoT', '对高血量目标效率极高'],
  },
};

/** 供能系统（§16）：改变的是"资源与火力循环"，不是单纯加攻击 */
export const POWERS = {
  thermal: {
    id: 'thermal', name: '散热核心 · THERMAL CORE', short: '散热', tag: '危险',
    desc: '热量池更大但更难退热，过热反而更强',
    lines: ['热量上限 +35%', '散热速度 −10%', '过热时伤害 +25%'],
    mods: { maxHeatMul: 1.35, coolRateMul: 0.90 },
    /** 运行时条件加成：主武器处于过热状态时伤害 ×1.25 */
    overheatDamageMul: 1.25,
  },
  capacitor: {
    id: 'capacitor', name: '电容核心 · CAPACITOR CORE', short: '电容', tag: '技能',
    desc: '把输出交给战术技能',
    lines: ['技能充能速度 +25%', 'EMP / 特殊武器伤害 +15%', '主武器伤害 −5%'],
    mods: { skillCdMul: 1 / 1.25, empDamageMul: 1.15, damageMul: 0.95 },
  },
  highVoltage: {
    id: 'highVoltage', name: '高压核心 · HIGH VOLTAGE CORE', short: '高压', tag: '爆发',
    desc: '高风险高收益的暴击流',
    lines: ['暴击率 +8%', '暴击伤害 +25%', '过热速度 +20%'],
    mods: { critChance: 0.08, critDamage: 0.25, heatPerShotMul: 1.20 },
  },
  stable: {
    id: 'stable', name: '稳定核心 · STABLE CORE', short: '稳定', tag: '泛用',
    desc: '全冷却缩短，代价是输出略低',
    lines: ['所有武器冷却 −8%', '所有伤害 −5%', '受到伤害 −10%'],
    mods: { weaponCdMul: 0.92, damageMul: 0.95, damageTakenMul: 0.90 },
  },
};

/**
 * Configuration Bonus（§17）：特定 Core+Weapon+Power 组合才触发，
 * 因此构型不是"三个乘区相加"，而是"组合产生新玩法"。
 * cond：运行时条件（null = 永久生效）
 */
export const CONFIG_BONUSES = [
  {
    id: 'overdrive', name: '超载 · OVERDRIVE', short: '超载',
    need: { core: 'assault', weapon: 'machineGun', power: 'highVoltage' },
    desc: '高热量时进入超载',
    lines: ['热量 > 75% 时：射速 +30%', '暴击率 +10%'],
    cond: { type: 'heat', value: 0.75 },
    mods: { fireRateMul: 1.30, critChance: 0.10 },
  },
  {
    id: 'bastion', name: '壁垒 · BASTION', short: '壁垒',
    need: { core: 'fortress', weapon: 'flakCannon', power: 'thermal' },
    desc: '空爆范围与生存同时强化',
    lines: ['爆炸范围 +25%', '受到伤害 −5%'],
    cond: null,
    mods: { explosionRadiusMul: 1.25, damageTakenMul: 0.95 },
  },
  {
    id: 'interceptorNetwork', name: 'INTERCEPTOR NETWORK', short: '拦截网',
    need: { core: 'hunter', weapon: 'pulseLaser', power: 'capacitor' },
    desc: '索敌网覆盖全场',
    lines: ['导弹 / 无人机伤害 +20%', '同时锁定目标 +1'],
    cond: null,
    mods: { missileDamageMul: 1.20, targeting: 1 },
  },
];

/**
 * 暂未开放（"待更新"）的构型项。
 * 数据全部保留，只是 UI 置灰、不可选、也不能花蓝图/看广告解锁。
 *
 * 目前：高射炮 / 磁轨炮作为【起手主武器】的手动开火手感还在重做，先不开放选择。
 * 注意：这只挡"出击构型里的起手武器"，局内作为副武器拿到高射炮/磁轨炮不受影响
 * （那是 ACQUIRABLE_WEAPONS 另一条路径），进化、精通等也照常。
 */
export const SOON_ITEMS = { weapon: ['flakCannon', 'railCannon'] };
/** UI 上显示的置灰文案 */
export const SOON_TEXT = '待更新';

/** 该项是否为"待更新"（不可选） */
export function isSoon(slot, id) {
  const list = SOON_ITEMS[slot];
  return !!(list && list.indexOf(id) >= 0);
}

/** 默认构型（新玩家，§55） */
export const DEFAULT_LOADOUT = { core: 'standard', weapon: 'machineGun', power: 'stable' };

/**
 * 解锁规则（§55：不要一开始就给玩家几十个选项）
 * 以"累计出击次数 / 历史最高波次"为门槛，轻量版解锁（Phase 16 的 Blueprint 会做得更细）。
 */
export const UNLOCK_RULES = {
  core: {
    standard: null,
    assault: { runs: 1 },
    fortress: { bestWave: 3 },
    hunter: { bestWave: 5 },
  },
  weapon: {
    machineGun: null,
    flakCannon: { runs: 1 },
    railCannon: { bestWave: 3 },
    pulseLaser: { bestWave: 5 },
  },
  power: {
    stable: null,
    thermal: { runs: 1 },
    capacitor: { bestWave: 3 },
    highVoltage: { bestWave: 5 },
  },
};

/**
 * Phase 16 §54：Blueprint 解锁价（另一条解锁路径，与游玩里程碑并存）
 * 蓝图来自：每波清除 +2、胜利 +10。
 * Phase 18：新增 BUILD CORE 槽（§23 主要靠难度首通解锁，蓝图是兜底路径）。
 */
export const BP_COST = {
  core:   { standard: 0, assault: 40, fortress: 80, hunter: 120 },
  weapon: { machineGun: 0, flakCannon: 40, railCannon: 80, pulseLaser: 120 },
  power:  { stable: 0, thermal: 40, capacitor: 80, highVoltage: 120 },
  build:  { thermalOverdrive: 60, swarmProtocol: 80, fortressDoctrine: 80, hunterProtocol: 100, skybreakerCore: 200 },
};

/** 存档 key：解锁状态 / 使用次数 */
export function unlockKey(slot, id) { return slot + ':' + id; }

/** 展示顺序 */
export const CORE_ORDER = ['standard', 'assault', 'fortress', 'hunter'];
/**
 * 比赛版：主武器固定为机炮。
 * WEAPON_CORES / UNLOCK_RULES.weapon / BP_COST.weapon 数据保留供图鉴与历史存档兼容，
 * 但 WEAPON_ORDER 只暴露机炮 —— 构型 UI 不再出现其它起手武器。
 */
export const WEAPON_ORDER = ['machineGun'];
export const POWER_ORDER = ['stable', 'thermal', 'capacitor', 'highVoltage'];
/** Phase 18 §24：BUILD CORE 是第 4 个槽位（每局只能装 1 个） */
export const BUILD_CORE_SLOT = 'build';
/** 出击构型 = CORE + MAIN WEAPON + POWER + BUILD CORE（§24 出击构型四件套） */
export const LOADOUT_SLOTS = ['core', 'weapon', 'power', 'build'];

/** 查某个槽位当前组合命中的 bonus */
export function findBonus(sel) {
  for (const b of CONFIG_BONUSES) {
    const n = b.need;
    if (n.core === sel.core && n.weapon === sel.weapon && n.power === sel.power) return b;
  }
  return null;
}

export default {
  CORES, WEAPON_CORES, POWERS, CONFIG_BONUSES, DEFAULT_LOADOUT, UNLOCK_RULES, findBonus, BP_COST, unlockKey,
  SOON_ITEMS, SOON_TEXT, isSoon,
};
