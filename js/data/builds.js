/**
 * Build 2.0（Phase 18，设计文档 §16~§21 / §26 / §31~§33 / §70~§73）
 *
 * 核心思想（§16）：真正的流派必须"有发动机"——
 *   核心机制 + 触发条件 + 放大器 + 补缺点 + 终局 Evolution。
 *
 * 实现方式（§83 第二条：不推翻现有系统）：
 *   - 不改任何 Weapon / Equipment / Upgrade 类，只在数据层给它们打 `buildTags`（§17）
 *   - BuildSystem 实时统计 Tag → 得到 BuildScore / 流派进度 / Milestone / Discovery
 *
 * Tag 目录（§17）：bullet fireRate heat explosion area heavy missile tracking lock
 *                 electric control pulse crit penetration radar shield repair drone armor
 */

/** ─────────────── Tag 中文目录（HUD / 图鉴展示） ─────────────── */
export const TAG_NAMES = {
  bullet: '弹幕', fireRate: '射速', heat: '热量', explosion: '爆炸', area: '范围',
  heavy: '重锤', missile: '导弹', tracking: '追踪', lock: '锁定', electric: '电弧',
  control: '控制', pulse: '脉冲', crit: '暴击', penetration: '穿透', radar: '雷达',
  shield: '护盾', repair: '维修', drone: '无人机', armor: '装甲',
};

/** ─────────────── 装备 / 升级的 Tag 表（§17，数据驱动，不改原文件） ─────────────── */
export const BUILD_TAGS = {
  /* 主武器 */
  machineGun:    ['bullet', 'fireRate', 'heat'],
  flakCannon:    ['explosion', 'area', 'heavy'],
  missile:       ['missile', 'tracking', 'lock'],
  railCannon:    ['heavy', 'penetration', 'crit'],
  pulseLaser:    ['pulse', 'heat', 'fireRate'],

  /* 自动武器 / 战术 / 被动 */
  interceptorDrone: ['drone', 'tracking'],
  empBurst:         ['electric', 'control', 'area'],
  airstrike:        ['explosion', 'area', 'heavy'],
  emergencyShield:  ['shield', 'repair', 'armor'],
  targetingAI:      ['radar', 'crit', 'lock'],
  reactiveArmor:    ['armor', 'shield'],
  highExplosive:    ['explosion', 'missile'],
  powerCapacitor:   ['electric', 'crit', 'control'],
  /* Phase F：新增被动模块 */
  radarBeacon:      ['radar', 'lock'],
  thermalRegulator: ['heat'],
  phaseShield:      ['shield', 'armor'],
  salvageBot:       ['drone', 'radar'],

  /* 普通升级 */
  damage: ['bullet'], fireRate: ['fireRate'], bulletSpd: ['bullet', 'tracking'],
  crit: ['crit'], critDmg: ['crit'], penetr: ['penetration'], multishot: ['bullet', 'fireRate'],
  heatCap: ['heat'], coolRate: ['heat'], maxAmmo: ['missile', 'lock'], reload: ['missile'],
  radar: ['radar'], pickup: ['radar'], lockSpd: ['lock', 'tracking'], targeting: ['lock', 'missile'],
  baseHP: ['armor'], shield: ['shield'], repair: ['repair'], armor: ['armor'],
  xpGain: [], missileDmg: ['missile'], missileCnt: ['missile'], missileCD: ['missile'], missileSpd: ['missile', 'tracking'],

  /* Phase C 新增通用被动 */
  calibratedCore: ['bullet'], velocityField: ['bullet'], weakpointScan: ['crit', 'penetration'],
  rapidCycler: ['control'], extendedLock: ['lock', 'missile'], combatAnalysis: [],
  reinforcedHull: ['armor', 'shield'], aimCalibrator: ['tracking', 'radar'],
  empAmplifier: ['electric', 'control'], thermalBuffer: ['heat'],
  incendiaryCoating: ['heat', 'bullet'], ionizedRounds: ['electric', 'control'],
  cryogenicAmmo: ['control'], corrosiveWarhead: ['control'], statusAmplifier: ['control'],
  fortune: ['luck'],

  /* Rare（§21 RARE CARD） */
  chainReaction: ['explosion', 'area'], splitMissile: ['missile'], bouncingShell: ['penetration', 'bullet'],
  incendiary: ['bullet', 'heat'], shockCore: ['heat'], heavyPayload: ['missile', 'heavy'],
  smartAmmo: ['radar', 'lock'], overclock: ['fireRate', 'heat'],
};

/** ─────────────── 8 大基础流派（§19） ─────────────── */
export const ARCHETYPES = [
  {
    id: 'bulletStorm', name: '弹幕风暴', sub: 'BULLET STORM',
    desc: '弹数 × 射速 × 穿透，用子弹 volume 淹没天空',
    req: { bullet: 3, fireRate: 2 },
    evolution: 'VULCAN BURST',
    strong: '清理大量轻型敌机', weak: '热量 / 高血量目标',
  },
  {
    id: 'flakBastion', name: '高炮堡垒', sub: 'FLAK BASTION',
    desc: '爆炸范围随敌群密度放大收益',
    req: { explosion: 3, area: 2 },
    evolution: 'SKYBREAKER',
    strong: '群体清场', weak: '单体 Boss DPS',
  },
  {
    id: 'missileNetwork', name: '导弹网络', sub: 'MISSILE NETWORK',
    desc: '自动索敌 + 多重锁定，降低瞄准压力',
    req: { missile: 3, tracking: 2 },
    evolution: 'STORM HUNTER',
    strong: '自动索敌', weak: '近距离爆发不稳定',
  },
  {
    id: 'overdrive', name: '过载', sub: 'OVERDRIVE',
    desc: '积热换输出，极易失控',
    req: { heat: 3, crit: 2 },
    evolution: 'OVERDRIVE CORE',
    strong: '极高持续输出', weak: '热量失控',
  },
  {
    id: 'thunderRail', name: '雷霆磁轨', sub: 'THUNDER RAIL',
    desc: '单发重击，穿透与暴击导向',
    req: { penetration: 2, crit: 2, heavy: 1 },
    evolution: 'THUNDER RAIL',
    strong: 'Boss / 重型目标', weak: '清场能力弱',
  },
  {
    id: 'droneCommand', name: '无人机指挥', sub: 'DRONE COMMAND',
    desc: '自动单位接管近身防御',
    req: { drone: 2, radar: 1 },
    evolution: 'SWARM COMMAND',
    strong: '自动化极高', weak: '主炮输出较低',
  },
  {
    id: 'empControl', name: '电磁控制', sub: 'EMP CONTROL',
    desc: '控制 + 连锁，大规模瘫痪',
    req: { electric: 3, control: 1 },
    evolution: 'STORM GRID',
    strong: '大规模控制', weak: 'Boss 纯输出不足',
  },
  {
    id: 'fortress', name: '要塞', sub: 'FORTRESS',
    desc: '用生存换时间',
    req: { shield: 2, armor: 2 },
    evolution: 'BASTION PRIME',
    strong: '高难容错', weak: 'DPS 低',
  },
];

/** ─────────────── 6 个混合流派（§72 Cross Build） ─────────────── */
export const CROSS_BUILDS = [
  { id: 'vulcanSurge',   name: '弹幕过载',    sub: 'VULCAN SURGE', req: { bullet: 2, heat: 2 },      parent: 'bulletStorm + overdrive' },
  { id: 'electricHunter',name: '电磁猎手', sub: 'ELECTRIC HUNTER', req: { missile: 2, electric: 2 }, parent: 'missileNetwork + empControl' },
  { id: 'mobileBastion', name: '移动堡垒',  sub: 'MOBILE BASTION', req: { explosion: 2, shield: 2 }, parent: 'flakBastion + fortress' },
  { id: 'lanceMaster',   name: '长枪宗师',    sub: 'LANCE MASTER', req: { penetration: 2, crit: 3 }, parent: 'thunderRail 强化' },
  { id: 'skyMesh',       name: '天网',        sub: 'SKY MESH',     req: { drone: 2, radar: 2 },      parent: 'droneCommand 强化' },
  { id: 'solarLance',    name: '烈日长枪',     sub: 'SOLAR LANCE', req: { pulse: 2, heat: 2 },       parent: 'pulseLaser 专线' },
];

/** ─────────────── Build Milestone（§31：Build 本身也会升级） ───────────────
 *  达到阈值时一次性写入 PlayerStats（复用 upgrade 结构，Zero 新代码路径）。
 */
export const MILESTONES = [
  { id: 'bullet3',  tag: 'bullet',  at: 3, name: '弹幕增幅',   desc: '弹幕 3 · 每次开火多 1 发',  mods: { multiShot: 1 } },
  { id: 'bullet5',  tag: 'bullet',  at: 5, name: '贯穿弹链',   desc: '弹幕 5 · 穿透 +1',          mods: { penetration: 1 } },
  { id: 'bullet7',  tag: 'bullet',  at: 7, name: '微型爆破',   desc: '弹幕 7 · 命中产生微型爆炸',  mods: { damageMul: 1.08 }, flag: 'miniBoom' },
  { id: 'heat3',    tag: 'heat',    at: 3, name: '强化散热',   desc: '热量 3 · 散热 +18%',        mods: { coolRateMul: 1.18 } },
  { id: 'heat5',    tag: 'heat',    at: 5, name: '过载弹头',   desc: '热量 5 · 伤害 +12%',        mods: { damageMul: 1.12 } },
  { id: 'missile3', tag: 'missile', at: 3, name: '增程挂架',   desc: '导弹 3 · 齐射 +1',           mods: { missileCount: 1 } },
  { id: 'missile5', tag: 'missile', at: 5, name: '重装填',     desc: '导弹 5 · 导弹伤害 +15%',     mods: { missileDamageMul: 1.15 } },
  { id: 'explosion3', tag: 'explosion', at: 3, name: '扩爆药',   desc: '爆炸 3 · 爆炸范围 +15%',    mods: { explosionRadiusMul: 1.15 } },
  { id: 'electric3',  tag: 'electric',  at: 3, name: '超导线圈', desc: '电弧 3 · 技能冷却 -12%',   mods: { skillCdMul: 0.88 } },
  { id: 'crit4',      tag: 'crit',      at: 4, name: '弱点分析', desc: '暴击 4 · 暴击率 +5%',      mods: { critChance: 0.05 } },
  { id: 'shield3',    tag: 'shield',    at: 3, name: '要塞协议', desc: '护盾 3 · 基地生命 +12%',   mods: { maxHpMul: 1.12 } },
  { id: 'radar3',     tag: 'radar',     at: 3, name: '广域扫描', desc: '雷达 3 · 雷达 +20%',       mods: { radarRangeMul: 1.20 } },
  /* Phase F：新增 12 条里程碑（GDD §9.4，覆盖元素/控制/经济/范围/无人机） */
  { id: 'fire4',      tag: 'heat',      at: 4, name: '燃烧弹链', desc: '热量 4 · 状态强度 +10%',   mods: { statusPower: 1.10 } },
  { id: 'fire7',      tag: 'heat',      at: 7, name: '烈焰核心', desc: '热量 7 · 伤害 +18%',       mods: { damageMul: 1.18 } },
  { id: 'electric4',  tag: 'electric',  at: 4, name: '电弧回路', desc: '电弧 4 · 状态强度 +10%',   mods: { statusPower: 1.10 } },
  { id: 'electric7',  tag: 'electric',  at: 7, name: '风暴引擎', desc: '电弧 7 · EMP 伤害 +30%',   mods: { empDamageMul: 1.30 } },
  { id: 'ice4',       tag: 'control',   at: 4, name: '低温稳定', desc: '控制 4 · 状态强度 +8%',    mods: { statusPower: 1.08 } },
  { id: 'armor7',     tag: 'armor',     at: 7, name: '钢铁壁垒', desc: '装甲 7 · 基地生命 +15%',   mods: { maxHpMul: 1.15 } },
  { id: 'drone4',     tag: 'drone',     at: 4, name: '协同控制', desc: '无人机 4 · 技能冷却 -8%',  mods: { skillCdMul: 0.92 } },
  { id: 'drone7',     tag: 'drone',     at: 7, name: '蜂群协议', desc: '无人机 7 · 伤害 +12%',     mods: { damageMul: 1.12 } },
  { id: 'lock5',      tag: 'lock',      at: 5, name: '猎杀协议', desc: '锁定 5 · 导弹伤害 +20%',   mods: { missileDamageMul: 1.20 } },
  { id: 'tracking5',  tag: 'tracking',  at: 5, name: '火控网络', desc: '追踪 5 · 暴击 +4%',        mods: { critChance: 0.04 } },
  { id: 'area7',      tag: 'area',      at: 7, name: '覆盖轰炸', desc: '范围 7 · 爆炸范围 +10%',   mods: { explosionRadiusMul: 1.10 } },
  { id: 'penetration5', tag: 'penetration', at: 5, name: '贯穿矩阵', desc: '穿透 5 · 穿透 +1',     mods: { penetration: 1 } },
];

/** ─────────────── Build Discovery（§33：研究流派本身就是内容） ───────────────
 *  玩家第一次达成某个流派 → +蓝图 +钢材 + 图鉴条目
 */
export const DISCOVERY_REWARD = { blueprint: 1, steel: 100 };

export function archetypeById(id) {
  return ARCHETYPES.find((a) => a.id === id) || CROSS_BUILDS.find((a) => a.id === id) || null;
}

/** 计算一个流派的完成度（0~1） */
export function archetypeProgress(arch, tags) {
  let need = 0, have = 0;
  for (const t in arch.req) {
    need += arch.req[t];
    have += Math.min(arch.req[t], tags[t] || 0);
  }
  return need ? have / need : 0;
}

export default { ARCHETYPES, CROSS_BUILDS, BUILD_TAGS, MILESTONES, TAG_NAMES };
