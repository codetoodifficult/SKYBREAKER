/**
 * 无尽模式（Endless Mode）
 *
 * 设计要点：
 *   1. 解锁：难度 D5 解锁后开放（unlockDifficulty = 5）
 *   2. 难度固定：不读玩家所选难度，永远用 D5 基线（ENDLESS_DEF），避免"选 D0 刷无尽"
 *   3. 递增：数量线性增长、血量复利增长（成倍递增），同屏上限 / 单波时长 / 精英率同步抬升
 *   4. 波次无限：前 10 波沿用原表，第 11 波起由 endlessWaveDef() 合成（每 5 波一个 Boss）
 *   5. 排行榜：分数走 EndlessLeaderboard（本地榜 + 远端 provider 预留接口）
 */

import { DIFFICULTIES } from './difficulties.js';
import { WAVES } from './waves.js';

/** 固定基线：取 D5 的参数（难度不再随玩家选择变化） */
const BASE = DIFFICULTIES[5];

/** 无尽模式使用的"难度定义"（字段与 DIFFICULTIES[n] 对齐，供 EnemyManager / SpawnDirector 直接读） */
export const ENDLESS_DEF = {
  ...BASE,
  id: 'endless',
  label: 'ENDLESS',
  name: '无尽',
  sub: '固定强度 · 逐波递增',
  fullName: '无尽模式',
  challengeSlots: 0,        // 无尽模式不接受 Challenge Modifier（难度已由波次递增决定）
};

export const ENDLESS = {
  id: 'endless',
  name: '无尽模式',
  sub: 'ENDLESS',
  desc: '难度固定（D5 基线），敌人数量与血量逐波递增，打到防线失守为止',
  /** 解锁门槛：难度 D5 解锁后开放 */
  unlockDifficulty: 5,
  unlockText: '解锁难度 D5 后开放',

  /** 递增曲线 */
  growth: {
    /** 数量：每波 +25%（线性） */
    countPerWave: 0.25,
    /** 血量：每波 ×1.16（复利 —— "成倍递增"） */
    hpPerWave: 1.16,
    /** 同屏上限：每波 +2，封顶 120 */
    capPerWave: 2,
    capMax: 120,
    /** 单波最长时长：每波 +2s，封顶 150s（后期敌人多，给足清场时间） */
    maxSecPerWave: 2,
    maxSecMax: 150,
    /** 精英率：每波 +1%，封顶 45% */
    eliteChancePerWave: 0.01,
    eliteChanceMax: 0.45,
    /** 每 5 波一个 Boss */
    bossEvery: 5,
  },

  /** 结算奖励：每清一波额外给分（冲榜分数的主要来源） */
  score: {
    perWave: 100,
  },

  /** 排行榜：本地榜容量 + 远端接入开关 */
  leaderboard: {
    localSize: 20,
    storageKey: 'skybreaker.endless.board.v1',
    nicknameKey: 'skybreaker.endless.nick.v1',
    // 比赛版：无在线排行榜，仅本地榜（remoteEnabled=false）。
    remoteEnabled: false,
  },
};

/**
 * 第 n 波（n 从 1 开始）的成长系数
 */
export function endlessGrowth(n) {
  const G = ENDLESS.growth;
  const k = Math.max(0, n - 1);
  return {
    wave: n,
    /** 敌人数量倍率（线性） */
    countMul: 1 + G.countPerWave * k,
    /** 敌人血量倍率（复利） */
    hpMul: Math.pow(G.hpPerWave, k),
    /** 同屏上限 */
    spawnCap: Math.min(G.capMax, BASE.spawnCap + Math.round(G.capPerWave * k)),
    /** 本波最长时长 */
    maxSec: Math.min(G.maxSecMax, 90 + Math.round(G.maxSecPerWave * k)),
    /** 精英出现率 */
    eliteChance: Math.min(G.eliteChanceMax, BASE.eliteChance + G.eliteChancePerWave * k),
    /** 本波是否为 Boss 波 */
    boss: n % G.bossEvery === 0,
  };
}

/**
 * 合成第 index（0 基）波的波次定义 —— 供 WaveManager.endlessWaveFor 使用。
 * 模板循环前 9 波（第 10 波是 Boss 专用模板），每 5 波强制走 Boss 模板。
 * 数量缩放交给 SpawnDirector（读 run.endlessCountMul），这里只定"编成 + 时长"。
 */
export function endlessWaveDef(index) {
  const n = index + 1;
  const g = endlessGrowth(n);
  const bossTpl = WAVES[WAVES.length - 1];                 // W10 = Boss 波模板
  const normalTpl = WAVES[(n - 1) % (WAVES.length - 1)];   // 循环 W1–W9
  const tpl = g.boss ? bossTpl : normalTpl;
  return {
    id: n,
    maxSec: g.maxSec,
    comp: tpl.comp.map((grp) => ({ ...grp })),
  };
}

/** 该玩家是否已解锁无尽模式（难度 D5 解锁即可） */
export function endlessUnlocked(difficultyManager) {
  if (!difficultyManager) return false;
  return difficultyManager.isUnlocked(ENDLESS.unlockDifficulty);
}

export default ENDLESS;
