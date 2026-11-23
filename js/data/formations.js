/**
 * 敌人编队（Phase 17，设计文档 §8）
 *
 * 编队是"内容"而不是"数值"：同样的威胁预算，不同编队给玩家的解题压力完全不同。
 *   Arrowhead     三角队   —— 需要预瞄
 *   Squadron      中队     —— 排队送死，考验持续输出
 *   Bomber Escort 轰炸机护航 —— 必须先杀护航再打轰炸机（目标优先级）
 *   Drone Swarm   无人机群  —— 考验清场
 *   Split Attack  分进合击  —— 考验转火
 *   Saturation    饱和攻击  —— 多方向同时，考验 Build 完整度
 *
 * 单位坐标说明：
 *   back  = 相对队长的"后方"距离（沿入场方向的反向，即更靠屏幕外）
 *   vert  = 垂直偏移（px）
 *   delay = 相对编队第一只的出场延迟（s）
 * sides: 'random' 单边随机 / 'both' 左右同时（分进合击、饱和攻击）
 */
import { THREAT_COST } from './difficulties.js';

const F = 'fighter', D = 'drone', B = 'bomber';

export const FORMATIONS = [
  {
    id: 'arrowhead',
    name: '三角队',
    desc: '三机 V 字突进，需要预瞄',
    minD: 0, weight: 3.0, sides: 'random',
    tags: ['light'],
    units: [
      { type: F, back: 0,  vert: 0,   delay: 0 },
      { type: F, back: 58, vert: -46, delay: 0.22 },
      { type: F, back: 58, vert: 46,  delay: 0.22 },
    ],
  },
  {
    id: 'squadron',
    name: '中队',
    desc: '四机纵队，考验持续输出',
    minD: 0, weight: 2.2, sides: 'random',
    tags: ['light'],
    units: [
      { type: F, back: 0,   vert: 0,   delay: 0 },
      { type: F, back: 62,  vert: -18, delay: 0.34 },
      { type: F, back: 124, vert: 18,  delay: 0.68 },
      { type: F, back: 186, vert: 0,   delay: 1.02 },
    ],
  },
  {
    id: 'droneSwarm',
    name: '无人机群',
    desc: '高速自杀集群，考验清场',
    minD: 1, weight: 2.0, sides: 'random',
    tags: ['swarm'],
    units: [
      { type: D, back: 0,   vert: -34, delay: 0 },
      { type: D, back: 26,  vert: 0,   delay: 0.10 },
      { type: D, back: 26,  vert: 34,  delay: 0.10 },
      { type: D, back: 62,  vert: -18, delay: 0.22 },
      { type: D, back: 62,  vert: 18,  delay: 0.22 },
      { type: D, back: 98,  vert: 0,   delay: 0.34 },
    ],
  },
  {
    id: 'bomberEscort',
    name: '轰炸机护航',
    desc: '护航机必须优先清除',
    minD: 0, weight: 2.0, sides: 'random',
    tags: ['heavy'],
    units: [
      { type: B, back: 0,  vert: 0,   delay: 0 },
      { type: F, back: 76, vert: -58, delay: 0.35 },
      { type: F, back: 76, vert: 58,  delay: 0.35 },
    ],
  },
  {
    id: 'splitAttack',
    name: '分进合击',
    desc: '左右同时来袭，考验转火',
    minD: 2, weight: 1.6, sides: 'both',
    tags: ['light', 'split'],
    units: [
      { type: F, back: 0,  vert: -30, delay: 0, side: -1 },
      { type: F, back: 0,  vert: -30, delay: 0, side: 1 },
      { type: F, back: 70, vert: 30,  delay: 0.5, side: -1 },
      { type: F, back: 70, vert: 30,  delay: 0.5, side: 1 },
    ],
  },
  {
    id: 'saturation',
    name: '饱和攻击',
    desc: '多方向、多兵种同时压上',
    minD: 5, weight: 1.4, sides: 'both',
    tags: ['mixed', 'split'],
    units: [
      { type: D, back: 0,  vert: -40, delay: 0,    side: -1 },
      { type: D, back: 0,  vert: 40,  delay: 0,    side: 1 },
      { type: F, back: 60, vert: 0,   delay: 0.3,  side: -1 },
      { type: F, back: 60, vert: 0,   delay: 0.3,  side: 1 },
      { type: B, back: 130, vert: -60, delay: 0.9, side: 1 },
    ],
  },
  {
    id: 'hunterPack',
    name: '猎杀小队',
    desc: '王牌带队的高速突击',
    minD: 4, weight: 1.2, sides: 'random',
    tags: ['elite'],
    units: [
      { type: 'aceFighter', back: 0,  vert: 0,   delay: 0 },
      { type: F, back: 66, vert: -50, delay: 0.28 },
      { type: F, back: 66, vert: 50,  delay: 0.28 },
    ],
  },
  {
    id: 'eliteSpearhead',
    name: '精英矛头',
    desc: '精英与护卫混编推进',
    minD: 9, weight: 1.0, sides: 'both',
    tags: ['elite', 'mixed'],
    units: [
      { type: 'aceFighter',   back: 0,  vert: -50, delay: 0,   side: -1 },
      { type: 'heavyBomber',  back: 0,  vert: 40,  delay: 0,   side: 1 },
      { type: F, back: 80, vert: 0,   delay: 0.4, side: -1 },
      { type: F, back: 80, vert: 0,   delay: 0.4, side: 1 },
    ],
  },
];

/** 预计算威胁成本（§9） */
for (const f of FORMATIONS) {
  f.cost = f.units.reduce((s, u) => s + (THREAT_COST[u.type] || 1), 0);
}

/** 按 id 取编队 */
export function formationById(id) { return FORMATIONS.find((f) => f.id === id) || null; }

/**
 * 取当前难度可用的编队（minD 门槛）。
 * 双编队规则（§13 D5）：doubleFormation 时 split 类编队权重更高。
 */
export function availableFormations(difficulty, doubleFormation) {
  const d = difficulty;
  return FORMATIONS
    .filter((f) => d >= f.minD)
    .map((f) => ({
      f,
      w: f.weight * (doubleFormation && f.tags.includes('split') ? 2.2 : 1),
    }));
}

/** 单只投放（编队放不下时的兜底，也用于特殊目标 Boss / EW / Transport） */
export const SINGLE_FORMATION = {
  id: 'single',
  name: '单机',
  cost: 1,
  units: [{ type: F, back: 0, vert: 0, delay: 0 }],
};

export default FORMATIONS;
