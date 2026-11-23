/**
 * 难度配置 D0–D10（Phase 17，设计文档 §3~§13 / §34 / §66 / §67）
 *
 * 设计原则（§1 / §86）：
 *   难度不是"HP ×3"。难度改变的是：数量 / 编成 / 速度 / 行为 / 精英比例 / 事件强度 / 经济风险。
 *   基础 Difficulty 绝不直接削弱玩家属性（不允许 D10 → 玩家伤害 -60%）。
 *
 * 统一结算顺序（§85）：Difficulty 只作用于【敌人侧】
 *   EnemyFinalStats = EnemyBase × Difficulty × Wave × Affix
 *
 * 数值标注为"首测基线（§5）"，后续按运行时数据平衡。
 */

/**
 * 比赛版平衡覆盖（对所有难度统一生效）：
 *   刷新频率 = 原值 × SPAWN_RATE_SCALE
 *   敌人血量 = 原值 × ENEMY_HP_SCALE（普通 / 精英 / Boss 一并生效）
 * 只改这两个常量即可整体回调，不改 D0–D10 各自的相对曲线。
 */
export const SPAWN_RATE_SCALE = 3;
export const ENEMY_HP_SCALE = 0.8;

/** 敌人威胁预算单价（§9 ThreatBudget） */
export const THREAT_COST = {
  fighter: 1,
  drone: 1,
  bomber: 3,
  ewPlane: 4,
  transport: 5,
  aceFighter: 6,
  heavyBomber: 9,
  boss: 20,
  supportDrone: 4,
  shieldCarrier: 7,
  hunterDrone: 2,
};

/** 每级难度新增规则（§13"土豆兄弟式"难度） */
function waveRules(d) {
  return {
    /** D3：精英刷新明显增加 */
    eliteBoost: d >= 3,
    /** D4：部分敌人获得特殊词缀 */
    affix: d >= 4,
    /** D5：双编队攻击（同一时刻两个方向） */
    doubleFormation: d >= 5,
    /** D6：随机事件出现强化版本 */
    hardEvents: d >= 6,
    /** D7：精英有机会出现双词缀（§15） */
    eliteDoubleAffix: d >= 7,
    /** D8：Boss 获得核心护盾（§42） */
    bossCoreShield: d >= 8,
    /** D9：强化敌人与精英组成编队 */
    eliteFormation: d >= 9,
    /** D10：SKYBREAKER MODE —— 全部系统满压 */
    skybreaker: d >= 10,
    /** Phase 20 §44：战地维修机（治疗附近敌人） */
    supportUnits: d >= 5,
    /** Phase 20 §45：护盾母机（给附近敌人上盾） */
    shieldCarrier: d >= 6,
    /** Phase 20 §46：猎杀无人机（绕后攻击炮塔） */
    hunterDrone: d >= 7,
  };
}

/** 精英预算（§67）：每波可投放的精英数量有节奏，不是一直刷 */
function eliteBudget(d) {
  const base = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5];      // W1 起（index 0 = W1）
  if (d <= 2) return base.map((v, i) => (i >= 4 ? Math.max(1, v - 1) : 0));
  if (d >= 8) return base.map((v, i) => v + (i >= 3 ? 1 : 1));
  if (d >= 5) return base.map((v, i) => v + (i >= 4 ? 1 : 0));
  return base;
}

/**
 * 解锁条件（§4）：难度靠"通关"推进，而不是钢材。
 * 从 D3 起追加 Clear Requirement。
 * req.type 由 DifficultyManager 解释；text 直接给 UI 展示。
 */
const UNLOCKS = {
  0: { clear: null, req: null },
  1: { clear: 0, req: null },
  2: { clear: 1, req: null },
  3: { clear: 2, req: { type: 'evolution', n: 1, text: '通关时至少达成 1 次武器进化' } },
  4: { clear: 3, req: { type: 'eliteKills', n: 15, text: '累计击落 15 架精英敌机' } },
  5: { clear: 4, req: { type: 'weaponClear', weapon: 'flakCannon', text: '使用高射炮（Flak）完成一次通关' } },
  6: { clear: 5, req: { type: 'challenges', n: 2, text: '累计完成 2 项局内挑战' } },
  7: { clear: 6, req: { type: 'buildScore', n: 60, text: '单局 Build 完整度达到 60' } },
  8: { clear: 7, req: { type: 'hardEventClear', n: 1, text: '在强化随机事件生效下完成一次通关' } },
  9: { clear: 8, req: { type: 'noReviveClear', n: 1, text: '不使用复活通关一次' } },
  10: { clear: 9, req: { type: 'evolution', n: 1, text: '通关时至少达成 1 次武器进化' } },
};

/** 难度名的中文副标题 */
const SUB = [
  '新手教学 · 完整战役体验',
  '空袭警报 · 常规编队',
  '威胁升级 · 混合兵种',
  '突袭 · 精英开始活跃',
  '围城 · 词缀登场',
  '强攻 · 双编队夹击',
  '压倒 · 强化事件',
  '临界 · 精英双词缀',
  '噩梦 · Boss 核心护盾',
  '末日 · 精英编队',
  'SKYBREAKER · 终局形态',
];

/**
 * 主表。字段与 §84 建议保持一致，另补 Phase 17 新增项。
 * enemyCountMul：波次总预算倍率（§11：D0≈200 / D5≈320 / D10≈520）
 * budgetPerSec ：每秒威胁预算（§9：D0=10 → D10=27）
 * spawnCap     ：同屏上限（§10）
 * xpMul        ：§66 —— 增长速度必须低于 spawnRate，否则高难度被"更快升级"抵消
 */
export const DIFFICULTIES = {
  0: mk(0, '训练',   { hp: 1.00, dmg: 1.00, spd: 1.00, rate: 1.00, elite: 0.03, boss: 1.00, cap: 35, budget: 10, count: 1.00, xp: 1.00, reward: 1.00, rare: 0.05, event: 1.00 }),
  1: mk(1, '戒备',      { hp: 1.10, dmg: 1.05, spd: 1.02, rate: 1.15, elite: 0.05, boss: 1.15, cap: 40, budget: 12, count: 1.08, xp: 1.05, reward: 1.10, rare: 0.06, event: 1.05 }),
  2: mk(2, '威胁',     { hp: 1.20, dmg: 1.10, spd: 1.04, rate: 1.30, elite: 0.08, boss: 1.30, cap: 45, budget: 13, count: 1.18, xp: 1.10, reward: 1.20, rare: 0.07, event: 1.10 }),
  3: mk(3, '突袭',       { hp: 1.32, dmg: 1.16, spd: 1.06, rate: 1.45, elite: 0.12, boss: 1.50, cap: 50, budget: 15, count: 1.30, xp: 1.15, reward: 1.35, rare: 0.08, event: 1.20 }),
  4: mk(4, '围城',      { hp: 1.45, dmg: 1.22, spd: 1.08, rate: 1.60, elite: 0.15, boss: 1.70, cap: 55, budget: 16, count: 1.45, xp: 1.20, reward: 1.50, rare: 0.10, event: 1.30 }),
  5: mk(5, '强攻',    { hp: 1.60, dmg: 1.30, spd: 1.10, rate: 1.75, elite: 0.18, boss: 1.95, cap: 60, budget: 17, count: 1.60, xp: 1.25, reward: 1.70, rare: 0.12, event: 1.40 }),
  6: mk(6, '压倒',  { hp: 1.75, dmg: 1.38, spd: 1.14, rate: 1.95, elite: 0.22, boss: 2.20, cap: 65, budget: 19, count: 1.78, xp: 1.30, reward: 1.90, rare: 0.14, event: 1.50 }),
  7: mk(7, '临界',   { hp: 1.90, dmg: 1.46, spd: 1.18, rate: 2.15, elite: 0.26, boss: 2.45, cap: 70, budget: 21, count: 1.95, xp: 1.35, reward: 2.10, rare: 0.16, event: 1.60 }),
  8: mk(8, '噩梦',  { hp: 2.05, dmg: 1.58, spd: 1.22, rate: 2.35, elite: 0.30, boss: 2.75, cap: 75, budget: 23, count: 2.15, xp: 1.40, reward: 2.35, rare: 0.18, event: 1.70 }),
  9: mk(9, '末日', { hp: 2.18, dmg: 1.72, spd: 1.26, rate: 2.55, elite: 0.34, boss: 3.15, cap: 80, budget: 25, count: 2.35, xp: 1.45, reward: 2.60, rare: 0.20, event: 1.80 }),
  10: mk(10, '破天', { hp: 2.30, dmg: 1.90, spd: 1.30, rate: 2.70, elite: 0.38, boss: 3.50, cap: 90, budget: 27, count: 2.60, xp: 1.50, reward: 3.00, rare: 0.25, event: 1.90 }),
};

function mk(id, name, v) {
  return {
    id,
    name,
    sub: SUB[id],
    label: `D${id}`,
    fullName: `D${id} · ${name}`,

    // 比赛版：刷新 ×3 / 血量 ×0.8（精英 HP 是派生值，随 enemyHpMul 一起降）
    enemyHpMul: v.hp * ENEMY_HP_SCALE,
    enemyDamageMul: v.dmg,
    enemySpeedMul: v.spd,
    spawnRateMul: v.rate * SPAWN_RATE_SCALE,
    enemyCountMul: v.count,
    eliteChance: v.elite,
    eliteHpMul: 1 + (v.hp - 1) * 0.5,      // 精英额外再吃一半的 HP 成长，保持"精英=检查器"
    // Boss 的 ×0.8 已由 scaleCfg 经 enemyHpMul 应用；此处保持原值避免重复打折
    // （computeBossHpMul 里还有 Math.max(1,…) 下限，重复乘会把 D0 钳回原血量）
    bossHpMul: v.boss,
    bossDamageMul: 1 + (v.dmg - 1) * 0.6,
    spawnCap: v.cap,
    threatBudgetPerSec: v.budget * SPAWN_RATE_SCALE,
    xpMul: v.xp,
    rewardMul: v.reward,          // 钢材 / 蓝图
    rareChance: v.rare,
    eventIntensityMul: v.event,

    rules: waveRules(id),
    eliteBudget: eliteBudget(id),
    unlock: UNLOCKS[id],

    /** §39：Challenge Modifier 开放数量（D0–D4 不开放） */
    challengeSlots: id >= 9 ? 3 : id >= 7 ? 2 : id >= 5 ? 1 : 0,
    /** D10 允许主动堆叠（不受槽位硬限） */
    challengeStack: id >= 10,
  };
}

export const DIFFICULTY_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const MAX_DIFFICULTY = 10;

/** 取一个难度定义（越界回落 D0） */
export function difficultyOf(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[0];
}

/** 精英单位（可能带词缀的兵种） */
export const ELITE_TYPES = ['aceFighter', 'heavyBomber'];

export default DIFFICULTIES;
