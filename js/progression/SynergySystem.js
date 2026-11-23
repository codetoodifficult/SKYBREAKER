/**
 * Synergy 协同系统（Phase 11）
 *
 * 玩法：当已选升级形成特定组合时，解锁协同效果并立即生效（Prompt §23）。
 * 设计要点：
 *   - 每个协同只生效一次（幂等），不会因为再次选择同系升级而重复叠乘
 *   - require 里的数字 = 该升级需要被选取的次数
 *   - apply 直接写入 game（stats.base 或 synergyFlags），随后由 Game.syncStats 下发到武器
 */

export const SYNERGIES = [
  {
    id: 'armorBreak',
    name: '穿甲爆破',
    desc: '穿透命中后引发小范围爆炸',
    icon: '✷',
    require: { penetr: 2, damage: 1 },
    apply(game) { game.synergyFlags.armorBreak = true; },
  },
  {
    id: 'emGuidance',
    name: '电磁制导',
    desc: '导弹伤害 +50%',
    icon: '◎',
    require: { missileDmg: 1, radar: 1 },
    apply(game) { game.stats.base.missileDamageMul *= 1.5; },
  },
  {
    id: 'critShock',
    name: '致命冲击',
    desc: '暴击伤害 +50%',
    icon: '✦',
    require: { crit: 2, critDmg: 1 },
    apply(game) { game.stats.base.critDamage *= 1.5; },
  },
  {
    id: 'overclockCooling',   // Phase F：原 id 'overclock' 与稀有升级卡冲突，改名（存档无依赖，协同每局重置）
    name: '超频散热',
    desc: '散热速度 +50%',
    icon: '❄',
    require: { fireRate: 2, coolRate: 1 },
    apply(game) { game.stats.base.coolRateMul *= 1.5; },
  },

  /* ---------------- Phase F 新增协同（GDD §8.3，全部真实效果） ---------------- */
  {
    id: 'stormNetwork', name: '风暴网络', desc: '电击→传导额外 1 跳、状态强度 +15%', icon: '⚡',
    require: { ionizedRounds: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.statusPower *= 1.15; if (game.synergyFlags) game.synergyFlags.shockExtraJump = true; },
  },
  {
    id: 'infernoProtocol', name: '地狱协议', desc: '燃烧 DPS +20%（状态强度）', icon: '🔥',
    require: { incendiaryCoating: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.statusPower *= 1.20; },
  },
  {
    id: 'frozenTarget', name: '冻结打击', desc: '冰缓易伤：对冰缓目标暴击伤害 +25%', icon: '❄',
    require: { cryogenicAmmo: 2, crit: 1 }, oncePerRun: true,
    apply(game) { game.stats.base.critDamage *= 1.25; },
  },
  {
    id: 'corrosivePayload', name: '腐蚀弹头', desc: '腐蚀易伤 -5% 门槛（状态强度 +20%）', icon: '☣',
    require: { corrosiveWarhead: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.statusPower *= 1.20; },
  },
  {
    id: 'fortressGrid', name: '堡垒网格', desc: '护盾存在时维修效率提升：生命上限 +12%', icon: '⛨',
    require: { shield: 2, repair: 1 }, oncePerRun: true,
    apply(game) { game.stats.base.maxHpMul *= 1.12; },
  },
  {
    id: 'salvageEconomy', name: '废料经济', desc: '击杀收益 +10%（通过 combo  steelMul 之外的 reward）', icon: '◎',
    require: { xpGain: 2, combatAnalysis: 1 }, oncePerRun: true,
    apply(game) { game.stats.base.xpMul *= 1.10; },
  },
  {
    id: 'precisionDoctrine', name: '精确打击', desc: '暴击伤害 +30%，穿透 +1', icon: '✧',
    require: { weakpointScan: 2, penetr: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.critDamage *= 1.30; game.stats.base.penetration += 1; },
  },
  {
    id: 'clusterStorm', name: '集束风暴', desc: '爆炸范围 +15%，爆炸相关状态强度 +10%', icon: '✷',
    require: { thermalBuffer: 1, heatCap: 1 }, oncePerRun: true,
    apply(game) { game.stats.base.aimAssistMul *= 1.10; },
  },
  {
    id: 'swarmCommand', name: '蜂群指令', desc: '战术冷却 -12%，自动装备收益提升', icon: '✜',
    require: { rapidCycler: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.skillCdMul *= 0.88; },
  },
  {
    id: 'overheatCycle', name: '过热循环', desc: '射速 +12%，散热 +12%', icon: '♨',
    require: { thermalBuffer: 2, coolRate: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.fireRateMul *= 1.12; game.stats.base.coolRateMul *= 1.12; },
  },
  {
    id: 'lastStand', name: '最终防线', desc: '生命上限 +15%，受伤减免 +5%', icon: '❤',
    require: { baseHP: 2, armor: 2 }, oncePerRun: true,
    apply(game) { game.stats.base.maxHpMul *= 1.15; game.stats.base.armor = Math.min(0.9, game.stats.base.armor + 0.05); },
  },
  {
    id: 'fullSpectrum', name: '全频打击', desc: '状态强度 +25%（覆盖燃烧/电击/冰缓/腐蚀）', icon: '✺',
    require: { statusAmplifier: 1 }, oncePerRun: true,
    apply(game) { game.stats.base.statusPower *= 1.25; },
  },
];

export class SynergySystem {
  constructor() { this.unlocked = []; }

  reset() { this.unlocked.length = 0; }

  /**
   * 检查并解锁新协同
   * @param {import('../player/PlayerStats.js').PlayerStats} stats
   * @param {object} game
   * @returns {Array} 本次新解锁的协同定义（供 UI 提示）
   */
  check(stats, game) {
    const fresh = [];
    for (const s of SYNERGIES) {
      if (this.unlocked.indexOf(s.id) !== -1) continue;

      let ok = true;
      for (const k in s.require) {
        if ((stats.taken(k) || 0) < s.require[k]) { ok = false; break; }
      }
      if (!ok) continue;

      this.unlocked.push(s.id);
      s.apply(game);
      fresh.push(s);
    }
    return fresh;
  }

  has(id) { return this.unlocked.indexOf(id) !== -1; }

  /** 已解锁的协同定义列表 */
  list() { return SYNERGIES.filter((s) => this.has(s.id)); }
}

export default SynergySystem;
