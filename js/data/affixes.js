/**
 * 敌人词缀（Phase 17 框架 / Phase 20 完整版，设计文档 §14 / §15 / §68）
 *
 * 词缀是高难度真正应该增加的内容：它改变"这一只要怎么打"，而不是把血条拉长。
 * 每个词缀必须能被至少一个 Build 明确应付（§68 精英 = Build 检查器）：
 *   Armored     → 要求高持续输出（Bullet Storm / Rail）
 *   Swift       → 要求追踪或预判（Missile / Flak）
 *   Shielded    → 要求爆发破盾（Rail / Flak 爆发）
 *   Regenerator → 要求爆发（Rail / 高单发）
 *   Splitter    → 要求二次清场（Flak / Drone）
 *   Berserk     → 要求控场（EMP / 快速击杀）
 *   Jammer      → 逼近后必须手动瞄准
 *   Warhead     → 不能贴脸打（Missile / Rail 远程）
 *   Escort      → 要求 AoE
 *   Veteran     → 要求高射速覆盖
 *
 * 出现规则（§15）：
 *   D0–D2 不出现；D3–D4 只 1 个；D5–D7 精英有概率 2 个；D8–D10 Boss 援军也可带。
 *   禁止普通敌人无限获得词缀 —— 只有 elite 标记 / 被强化的单位可以带。
 */

export const AFFIXES = {
  armored: {
    id: 'armored', name: '装甲', short: 'ARM', color: '#9fb4c7',
    desc: '生命 +40%',
    hpMul: 1.40,
  },
  swift: {
    id: 'swift', name: '疾速', short: 'SPD', color: '#6be3ff',
    desc: '移动速度 +25%',
    speedMul: 1.25,
  },
  shielded: {
    id: 'shielded', name: '护盾', short: 'SHD', color: '#7fd1ff',
    desc: '首次受到伤害时展开护盾',
    onDamaged: 'shield',
    shieldHp: 90,
  },
  regenerator: {
    id: 'regenerator', name: '再生', short: 'REG', color: '#4dffa6',
    desc: '每秒恢复 15 点生命',
    regenPerSec: 15,
  },
  splitter: {
    id: 'splitter', name: '分裂', short: 'SPL', color: '#ff8a5c',
    desc: '死亡时分裂出 2 架无人机',
    onDeath: 'split',
    splitType: 'drone', splitCount: 2,
  },
  berserk: {
    id: 'berserk', name: '狂暴', short: 'BSK', color: '#ff3b5c',
    desc: '生命低于 30% 时：速度 +50% / 伤害 +40%',
    berserkBelow: 0.30, berserkSpeedMul: 1.50, berserkDamageMul: 1.40,
  },
  jammer: {
    id: 'jammer', name: '干扰', short: 'JAM', color: '#7fe3c0',
    desc: '在场时雷达范围 -15%',
    radarJam: 0.15,
  },
  warhead: {
    id: 'warhead', name: '弹头', short: 'WHD', color: '#ffb03d',
    desc: '死亡时产生爆炸',
    onDeath: 'explode',
    boomRadius: 110, boomDamage: 26,
  },
  escort: {
    id: 'escort', name: '护航', short: 'ESC', color: '#c8b6ff',
    desc: '生成时附带 2 架战斗机',
    onSpawn: 'escort',
    escortType: 'fighter', escortCount: 2,
  },
  veteran: {
    id: 'veteran', name: '老练', short: 'VET', color: '#ffd166',
    desc: '拥有一次闪避',
    onDamaged: 'dodge',
    dodgeChance: 0.5,
  },
};

export const AFFIX_ORDER = [
  'armored', 'swift', 'shielded', 'regenerator', 'splitter',
  'berserk', 'jammer', 'warhead', 'escort', 'veteran',
];

/** 只能出现在精英身上的词缀（避免出现"小飞机满身词缀"导致新手看不懂） */
export const ELITE_ONLY_AFFIXES = new Set(['splitter', 'escort', 'shielded', 'veteran']);

export function affixById(id) { return AFFIXES[id] || null; }

/**
 * 词缀出现规则（§15）
 * @param {number} d 难度
 * @param {boolean} isElite 是否精英单位
 * @returns {{enabled:boolean, maxCount:number, chance:number}}
 */
export function affixRule(d, isElite) {
  if (d < 3) return { enabled: false, maxCount: 0, chance: 0 };
  if (d <= 4) return { enabled: true, maxCount: 1, chance: isElite ? 0.55 : 0.18 };
  if (d <= 7) return { enabled: true, maxCount: isElite ? 2 : 1, chance: isElite ? 0.75 : 0.25 };
  return { enabled: true, maxCount: isElite ? 2 : 1, chance: isElite ? 0.9 : 0.35 };
}

export default AFFIXES;
