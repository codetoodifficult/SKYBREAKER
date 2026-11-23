/**
 * Challenge Modifier（Phase 20，设计文档 §38 / §39 / §53）
 *
 * 高难度的"自定义挑战空间"：玩家主动勾选，换取更高奖励。
 *   D0–D4 不开放；D5 每局 1 个；D7 最多 2 个；D9 最多 3 个；D10 可以主动堆叠。
 *
 * 实现走"乘区注入"（沿用 Phase 17 经验）：挑战不改写敌人 / 玩家类，
 * 只在 Game.startRun 里把修正值注入 run / stats / EnemyManager。
 */

export const CHALLENGES = {
  blackout: {
    id: 'blackout', name: '电磁黑障', sub: 'BLACKOUT',
    desc: '雷达范围 -50%',
    rewardText: '钢材 +50%',
    steelMul: 1.5,
    radarMul: 0.5,
  },
  ironSky: {
    id: 'ironSky', name: '铁幕', sub: 'IRON SKY',
    desc: '敌人生命 +25%',
    rewardText: '蓝图 +50%',
    blueprintMul: 1.5,
    enemyHpMul: 1.25,
  },
  noRepair: {
    id: 'noRepair', name: '断补给', sub: 'NO REPAIR',
    desc: '修理效果禁用',
    rewardText: '稀有卡出现率 +10%',
    rareChanceAdd: 0.10,
  },
};

export const CHALLENGE_ORDER = ['blackout', 'ironSky', 'noRepair'];

/** 当前难度最多可勾选数量（§39） */
export function challengeSlotsFor(difficultyDef) {
  return difficultyDef.challengeSlots || 0;
}

export function challengeById(id) { return CHALLENGES[id] || null; }

export default CHALLENGES;
