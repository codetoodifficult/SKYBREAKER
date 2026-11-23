/**
 * 内容解锁树（Phase 19，设计文档 §35 / §48 / §49 / §50 / §51 / §60~§62）
 *
 * 三条解锁路径（§49）：
 *   ① 通关 / 里程碑（主路径，免费）
 *   ② Blueprint 买断（兜底路径，分 Common / Rare / Legendary 三级）
 *   ③ 广告解锁（Phase 19，玩家主动选择的免费替代路径 —— 后期内容可看广告直接解锁）
 *
 * 原则：解锁不是"攒钱买东西"，广告解锁是"跳过等待"而不是"绕过内容"。
 */

/** ─────────────── 首通奖励（§35 First Clear Reward） ─────────────── */
export const FIRST_CLEAR_REWARDS = {
  1: { blueprint: 2, text: '蓝图 ×2' },
  2: { blueprint: 2, text: '构筑核心图纸（THERMAL OVERDRIVE 已同步解锁）' },
  3: { blueprint: 3, text: '构筑核心图纸（SWARM PROTOCOL 已同步解锁）' },
  4: { blueprint: 3, text: '要塞教义图纸 + FORTRESS DOCTRINE 解锁' },
  5: { blueprint: 4, text: '猎手协议图纸 + HUNTER PROTOCOL 解锁' },
  6: { blueprintRare: 1, text: '稀有蓝图 ×1' },
  7: { blueprintRare: 1, text: '稀有蓝图 ×1' },
  8: { blueprintRare: 2, text: '稀有蓝图 ×2' },
  9: { blueprintLegendary: 1, text: '传说蓝图 ×1' },
  10: { blueprintLegendary: 2, text: 'SKYBREAKER CORE 解锁 + 传说蓝图 ×2' },
};

/** ─────────────── 蓝图分级（§60 / §61） ─────────────── */
export const BP_TIER = {
  common: { key: 'blueprint', name: '蓝图' },
  rare: { key: 'blueprintRare', name: '稀有蓝图' },
  legendary: { key: 'blueprintLegendary', name: '传说蓝图' },
};

/** 取某槽位某件内容解锁消耗的蓝图等级（默认 common） */
export function bpTierOf(slot, id) {
  if (id === 'skybreakerCore') return 'legendary';
  if (id === 'hunterProtocol' || id === 'swarmProtocol') return 'rare';
  return 'common';
}

/** 读取对应等级蓝图的数量 */
export function bpCountOf(meta, tier) {
  const def = BP_TIER[tier] || BP_TIER.common;
  return meta[def.key] || 0;
}

/** 扣除对应等级蓝图 */
export function bpSpend(meta, tier, n) {
  const def = BP_TIER[tier] || BP_TIER.common;
  meta[def.key] = Math.max(0, (meta[def.key] || 0) - n);
}

/** 蓝图汇总（UI 展示） */
export function bpSummary(meta) {
  return `蓝图 ${meta.blueprint || 0} · 稀有 ${meta.blueprintRare || 0} · 传说 ${meta.blueprintLegendary || 0}`;
}

/** ─────────────── 广告解锁规则（Phase 19） ───────────────
 * 只允许"往后看一格"，不允许一键全解锁：
 *   - 难度：只能解锁「最高已解锁 +1」那一档，且每档只解锁一次
 *   - 内容：任何未解锁的构型件 / Build Core 都可以，但同一件只解锁一次
 * 频控由 AdManager 的 dailyCap（UNLOCK_CONTENT = 5/天）兜底。
 */
export const AD_UNLOCK = {
  slotId: 'UNLOCK_CONTENT',
  /** 难度最多能"跳"到哪一档 */
  maxDifficultyStep: 1,
  /** 每件内容只允许广告解锁一次 */
  once: true,
};

/** ─────────────── Weapon Mastery（§50 / §51） ───────────────
 * 精通提供"内容"而不是数值（§51）：等级解锁蓝图，永久属性提升为 0。
 * points = 使用次数×2 + 进化次数×10
 */
export const MASTERY = {
  /** 等级上限 */
  maxLevel: 15,
  /** points → level（平滑曲线，前几级快、后期慢） */
  levelOf(points) {
    return Math.max(0, Math.min(15, Math.floor(Math.sqrt(Math.max(0, points) / 5))));
  },
  /** 各等级一次性奖励（蓝图） */
  rewards: { 2: 1, 5: 1, 8: 2, 12: 3, 15: 5 },
  /** 展示用的里程碑文案（§51） */
  labels: { 2: '新图纸', 5: '专属涂装', 8: '稀有蓝图', 12: '进化图纸', 15: '精通徽章' },
};

export function masteryPoints(rec) {
  if (!rec) return 0;
  return (rec.uses || 0) * 2 + (rec.kills || 0) * 0.1 + (rec.evolutions || 0) * 10;
}

/** 武器收集页顺序（§48 内容树） */
export const WEAPON_COLLECTION = [
  { id: 'machineGun', name: '机炮', desc: '初始主武器，弹幕流核心' },
  { id: 'flakCannon', name: '高射炮', desc: '范围爆炸，清场核心' },
  { id: 'missile', name: '防空导弹', desc: '自动索敌，导弹网络核心' },
  { id: 'railCannon', name: '磁轨炮', desc: '单发重击，Boss 克星' },
  { id: 'pulseLaser', name: '脉冲激光', desc: '持续灼烧，压制流核心' },
  { id: 'interceptorDrone', name: '拦截无人机', desc: '自动防御，无人机指挥核心' },
];

export default { FIRST_CLEAR_REWARDS, BP_TIER, AD_UNLOCK, MASTERY, WEAPON_COLLECTION };
