/**
 * 敌人数值配置
 * target: 敌人优先攻击的目标（gun / city / base / radar）
 *
 * Phase 12 数值重构基线（设计文档 §37）：
 *   Fighter        45 HP / 175 spd /  8 xp /  4 steel
 *   Suicide Drone  30 HP / 320 spd /  7 xp /  3 steel
 *   Bomber        220 HP /  78 spd / 25 xp / 14 steel
 *   EW Plane      180 HP / 110 spd / 28 xp / 18 steel
 *   Transport     420 HP /  62 spd / 40 xp / 32 steel
 *   Ace Fighter   180 HP / 300 spd / 45 xp / 25 steel
 *   Heavy Bomber  480 HP /  65 spd / 85 xp / 50 steel
 *   Boss         3000 HP /  38 spd /180 xp /150 steel  （实际 HP 按玩家等级动态缩放，见 Game.computeBossHp）
 *
 * 设计前提（设计文档 §38）：基础机炮 72 DPS 下的理论击杀时间
 *   Fighter 0.63s / Drone 0.42s / Bomber 3.06s / EW 2.50s
 *   Transport 5.83s / Ace 2.50s / Heavy Bomber 6.67s / Boss 41.7s
 */

export const ENEMIES = {
  fighter: {
    id: 'fighter',
    name: '战斗机',
    hp: 45,
    speed: 175,          // 巡航速度 px/s
    diveSpeed: 290,      // 俯冲速度
    turnRate: 2.4,       // rad/s
    damage: 22,          // 撞击基地造成的伤害（Phase 13：基地 1000HP 后必须同步放大，否则基地条形同虚设）
    radius: 16,
    xp: 8,
    score: 100,
    steel: 4,
    target: 'gun',
    color: '#8fd6ff',
    accent: '#ff5f6d',
  },

  bomber: {
    id: 'bomber', name: '轰炸机', hp: 220, speed: 78, diveSpeed: 110, turnRate: 1.0,
    damage: 22, radius: 28, xp: 25, score: 420, steel: 14, target: 'city',
    color: '#c8b6ff', accent: '#ffb03d',
  },

  suicideDrone: {
    id: 'suicideDrone', name: '自杀无人机', hp: 30, speed: 320, diveSpeed: 400, turnRate: 3.4,
    damage: 28, radius: 12, xp: 7, score: 90, steel: 3, target: 'base',
    color: '#ff8a5c', accent: '#ff3b5c',
  },

  transport: {
    id: 'transport', name: '运输机', hp: 420, speed: 62, diveSpeed: 62, turnRate: 0.6,
    damage: 18, radius: 34, xp: 40, score: 700, steel: 32, target: 'city',
    color: '#9ad0b0', accent: '#4dffa6', spawnInterval: 1.6,
  },

  ewPlane: {
    id: 'ewPlane', name: '电子战机', hp: 180, speed: 110, diveSpeed: 130, turnRate: 1.2,
    damage: 8, radius: 22, xp: 28, score: 500, steel: 18, target: 'radar',
    radarJam: 0.3,       // 雷达范围 -30%
    color: '#7fe3c0', accent: '#39d7ff',
  },

  /* ---- Phase 12 新增精英（设计文档 §33）---- */
  aceFighter: {
    id: 'aceFighter', name: '王牌战机', hp: 180, speed: 300, diveSpeed: 430, turnRate: 3.2,
    damage: 18, radius: 17, xp: 45, score: 900, steel: 25, target: 'gun',
    // 精英能力：短距突进 + 被击中后闪避
    dashInterval: 2.6,   // 突进冷却（s）
    dashDuration: 0.45,  // 突进持续（s）
    dashSpeedMul: 2.15,  // 突进期速度倍率
    dodgeChance: 0.35,   // 每次被击中触发闪避的概率
    dodgeCooldown: 1.5,  // 闪避冷却（s）
    dodgeDuration: 0.28, // 闪避位移持续（s）
    dodgeOffset: 78,     // 闪避横向位移 px
    color: '#ffd166', accent: '#ff3b5c', isElite: true,
  },

  /* ---- Phase 12 新增精英（设计文档 §34）---- */
  heavyBomber: {
    id: 'heavyBomber', name: '重装轰炸机', hp: 480, speed: 65, diveSpeed: 80, turnRate: 0.7,
    damage: 34, radius: 36, xp: 85, score: 1800, steel: 50, target: 'city',
    // 精英能力：周期性释放 3 枚高威力炸弹
    salvoInterval: 2.8,  // 一轮齐射冷却（s）
    salvoCount: 3,       // 每轮炸弹数
    salvoGap: 0.22,      // 弹间间隔（s）
    salvoDamageMul: 1.6, // 单枚炸弹伤害倍率（相对 cfg.damage）
    color: '#b06bff', accent: '#ffd166', isElite: true,
  },

  /* ---- 多阶段 Boss（HP 由 Game.computeBossHp 动态覆盖，见 §35）---- */
  boss: {
    id: 'boss', name: '天穹轰炸舰', hp: 3000, speed: 38, diveSpeed: 50, turnRate: 0.4,
    damage: 30, radius: 42, xp: 180, score: 3000, steel: 150, target: 'city',
    color: '#8a4ad6', accent: '#ff3b5c', isBoss: true,
  },

  /* ---- Phase 20 战略支援单位（§43~§46：强制建立目标优先级）---- */
  supportDrone: {
    id: 'supportDrone', name: '战地维修机', hp: 70, speed: 150, diveSpeed: 150, turnRate: 1.0,
    damage: 0, radius: 14, xp: 30, score: 450, steel: 20, target: 'gun',
    healInterval: 3, healRadius: 200,     // 每 3s 治疗附近敌人 5% HP
    color: '#4dffa6', accent: '#123326', isSupport: true,
  },

  shieldCarrier: {
    id: 'shieldCarrier', name: '护盾母机', hp: 350, speed: 55, diveSpeed: 55, turnRate: 0.6,
    damage: 0, radius: 26, xp: 55, score: 800, steel: 36, target: 'gun',
    shieldInterval: 5, shieldRadius: 240, shieldHp: 150,
    color: '#7fd1ff', accent: '#1d2a44', isSupport: true,
  },

  hunterDrone: {
    id: 'hunterDrone', name: '猎杀无人机', hp: 40, speed: 340, diveSpeed: 480, turnRate: 3.6,
    damage: 24, radius: 12, xp: 22, score: 260, steel: 12, target: 'gun',
    color: '#ff3b5c', accent: '#3a1020',
  },
};

/**
 * 兼容别名：对象池 / 波次表使用的键名是 'drone'，
 * 数据键是 'suicideDrone'。这里显式建立映射，避免 ENEMIES['drone'] 为 undefined
 * （历史上依赖 Drone.init 的 cfg 兜底，容易在新增敌种时踩坑）。
 */
ENEMIES.drone = ENEMIES.suicideDrone;

export default ENEMIES;
