/**
 * Build Core（Phase 18，设计文档 §22 / §23 / §37）
 *
 * Build Core 与普通 Passive 不同：它决定"这一局怎么玩"（每局只能装 1 个）。
 * 开局构型变成 4 件套（§24）：
 *   CORE（炮塔核心） + MAIN WEAPON + POWER + BUILD CORE
 *
 * 获取（§23）：由难度首通解锁 —— D2/D3/D4/D5 各解锁一个；SKYBREAKER CORE 由 D10 首通解锁（§37）。
 * 解锁是"并集"：里程碑 OR 蓝图买断（沿用 Phase 16 的双路径，另加 Phase 19 的广告解锁）。
 *
 * 条件型核心的结算规则（沿用 Phase 15 的经验）：
 *   进入条件时乘上 / 离开时除回，绝不逐帧累积，避免数值漂移。
 */

export const BUILD_CORES = {
  thermalOverdrive: {
    id: 'thermalOverdrive',
    name: '过载核心 · THERMAL OVERDRIVE',
    short: '过载核心',
    rarity: 'rare',
    tags: ['heat', 'fireRate', 'crit'],
    desc: '热量 > 65% 时进入过载：伤害与射速大幅提升',
    lines: ['热量 > 65% → 伤害 +30%', '热量 > 65% → 射速 +20%'],
    cond: { type: 'heat', value: 0.65 },
    mods: { damageMul: 1.30, fireRateMul: 1.20 },
    unlock: { difficulty: 2, text: '通关 D2 解锁' },
  },

  swarmProtocol: {
    id: 'swarmProtocol',
    name: '蜂群协议 · SWARM PROTOCOL',
    short: '蜂群协议',
    rarity: 'rare',
    tags: ['drone', 'tracking', 'radar'],
    desc: '每拥有 1 个自动武器，所有自动武器冷却 -5%',
    lines: ['自动武器数 × 5% → 自动武器效率提升', '无人机流的核心发动机'],
    dynamic: 'swarm',
    unlock: { difficulty: 3, text: '通关 D3 解锁' },
  },

  fortressDoctrine: {
    id: 'fortressDoctrine',
    name: '要塞教义 · FORTRESS DOCTRINE',
    short: '要塞教义',
    rarity: 'rare',
    tags: ['shield', 'armor', 'explosion'],
    desc: '护盾存在时进入防御反击：全武器伤害提升',
    lines: ['护盾 > 0 → 伤害 +25%', '用生存换输出的核心发动机'],
    cond: { type: 'shield' },
    mods: { damageMul: 1.25 },
    unlock: { difficulty: 4, text: '通关 D4 解锁' },
  },

  hunterProtocol: {
    id: 'hunterProtocol',
    name: '猎手协议 · HUNTER PROTOCOL',
    short: '猎手协议',
    rarity: 'rare',
    tags: ['radar', 'lock', 'crit'],
    desc: '雷达锁定目标时：暴击率大幅提升',
    lines: ['雷达标记目标 → 暴击率 +10%', '远程/高价值目标猎杀'],
    cond: { type: 'locked' },
    mods: { critChance: 0.10 },
    unlock: { difficulty: 5, text: '通关 D5 解锁' },
  },

  skybreakerCore: {
    id: 'skybreakerCore',
    name: '破天核心 · SKYBREAKER CORE',
    short: '破天核心',
    rarity: 'legendary',
    tags: ['bullet', 'drone', 'fireRate'],
    desc: '终局构型：武器槽 +1 / 自动武器 +1，但空袭强度 +15%',
    lines: ['最大武器槽 +1', '最大自动武器槽 +1', '代价：敌人刷怪 +15%（高风险高回报）'],
    dynamic: 'skybreaker',
    unlock: { difficulty: 10, text: '通关 D10 解锁' },
  },
};

export const BUILD_CORE_ORDER = ['thermalOverdrive', 'swarmProtocol', 'fortressDoctrine', 'hunterProtocol', 'skybreakerCore'];

/** 默认 Build Core（不占格：null = 未装备） */
export const DEFAULT_BUILD_CORE = null;

export function buildCoreById(id) { return BUILD_CORES[id] || null; }

export default BUILD_CORES;
