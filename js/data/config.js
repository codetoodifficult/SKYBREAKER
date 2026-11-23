/**
 * 全局配置：所有"世界级"常量集中在这里，禁止散落进各个 class。
 *
 * 【宽屏适配 · Phase 21】
 * 逻辑**高度固定 720**，**宽度按设备屏幕比例动态计算**（16:9 → 1280，20:9 → 1600）。
 * 现代手机横屏普遍是 19.5:9 ~ 21:9，若仍按 16:9 画布等比缩放，左右会出现大黑边；
 * 把世界横向拉宽后画面能真正铺满，敌人来袭的横向纵深也更长。
 *
 * 计算时机：**本模块被 import 时**（早于任何其它模块），
 * 因此 `const W = CONFIG.WORLD.WIDTH` 这类模块级取值拿到的也是正确宽度。
 * 用 max/min 取边长，保证"竖屏打开 / 横屏打开"算出的是同一个横屏比例。
 */

/** 设计基准高度（永远不变） */
const DESIGN_H = 720;
/** 世界宽度下限 = 16:9 的设计基准（再窄会挤压 HUD 与阵型） */
const MIN_W = 1280;
/**
 * 世界宽度上限 ≈ 2.5:1。
 * 手机横屏扣掉浏览器工具栏后的真实视口比例普遍落在 1.9 ~ 2.45
 * （20:9 机型 ≈ 2.35，iPhone 刘海屏横屏 ≈ 2.43），对应世界宽 1370 ~ 1765。
 * 上限必须 ≥ 1765，否则主流机型仍会残留左右黑边；取 1800 留出余量。
 * 超过 2.5:1 的超宽屏（折叠屏展开 / 平板）才会退化为等比缩放留边。
 */
const MAX_W = 1800;

function computeWorldWidth() {
  let w = MIN_W;
  try {
    const a = window.innerWidth || window.screen?.availWidth || 0;
    const b = window.innerHeight || window.screen?.availHeight || 0;
    // 取长边/短边：竖屏持机也能算出横屏后的比例
    const aw = Math.max(a, b), ah = Math.min(a, b);
    if (aw > 0 && ah > 0) {
      const aspect = aw / ah;
      if (isFinite(aspect) && aspect > 0) w = Math.round(DESIGN_H * aspect);
    }
  } catch (_) { /* 非浏览器环境（Node 测试）用默认宽度 */ }
  return Math.max(MIN_W, Math.min(MAX_W, w));
}

const WORLD_W = computeWorldWidth();

export const CONFIG = {
  WORLD: {
    WIDTH: WORLD_W,
    HEIGHT: DESIGN_H,
  },

  /** 宽屏适配信息（调试面板 / 测试用） */
  WORLD_FIT: {
    minWidth: MIN_W,
    maxWidth: MAX_W,
    designHeight: DESIGN_H,
  },

  CANVAS: {
    MAX_DPR: 2,          // 限制 DPR 上限，避免高端机 Canvas 像素爆炸
    BG_COLOR: '#05080f',
  },

  /** 地面线（城市天际线之上），敌人越过即视为突防成功 */
  WORLD_GROUND_Y: 640,

  /**
   * 视觉地平线：所有地面建筑（炮塔 / 雷达站 / 发电站 / 地堡）的落地点。
   * 必须等于 TURRET.y + 炮塔基座底边偏移（596 + 46 = 642），否则建筑会浮空。
   */
  GROUND_Y: 642,

  /** 炮塔：x 永远居中（宽屏下世界变宽，炮塔跟着居中） */
  TURRET: {
    x: Math.round(WORLD_W / 2),
    y: 596,              // 炮管旋转轴心
    barrelLength: 58,
    turnSpeed: 7.0,      // 角度插值速度（rad/s），越小越"有重量感"
    recoil: 7,           // 后坐位移 px
    recoilRecover: 26,
  },

  /** 雷达：影响辅助瞄准与导弹索敌距离（Phase 9 永久成长会在此之上乘算） */
  RADAR: {
    baseRange: 900,      // 基础有效距离 px
  },

  /** Soft Aim Assist：辅助瞄准，但玩家控制感优先 */
  AIM: {
    assistConeRad: 0.22,   // 玩家指向 ±0.22rad 内的敌人才会被纳入修正
    assistStrength: 0.7,   // 修正比例 0~1（<1 = 保留手动手感）
    lead: true,            // 是否预判敌机提前量（移动端必需，否则弹速再快也打不中）
    leadSpeed: 1150,       // 用于计算提前量的弹速（= 机炮初速）
  },

  /**
   * 基地（Phase 12 数值重构：基础生命 1000，永久强化/局内成长一律按百分比乘算，见设计文档 §4.1）
   * city 与基地同为"玩家生命资源"：轰炸机/Heavy Bomber/Boss 投弹打的是城市，
   * 基地血量 ×10 后城市必须同步放大，否则漏一只轰炸机（一次通场约 11 枚 × 22 = 242 伤害）
   * 就会直接判负，节奏会被单点事故摧毁。
   */
  BASE: {
    maxHp: 1000,
    cityHp: 800,
  },

  /** Boss 动态生命（设计文档 §35）：BossHP = 3000 × (1 + 0.08 × 玩家等级) × 难度，上限 6000 */
  BOSS: {
    baseHp: 3000,
    perLevel: 0.08,
    maxHp: 6000,
    difficulty: 1.0,       // 预留：后续难度/模式在此乘算
  },

  /**
   * 离线收益（Phase 12 调整，设计文档 §52）
   * 6 Steel/min，最大累计 4 小时 = 1440 Steel ≈ 1~1.5 局正常收益，定位为「回流激励」而非主要来源。
   */
  OFFLINE: {
    maxHours: 4,           // 最大累计离线时长，超过按 4 小时结算（避免无限累积）
    minMinutes: 1,         // 少于该时长不发放、不弹窗（避免刷新页面就刷奖励）
    steelPerMin: 6,        // 每分钟钢材
    energyPerMin: 3,       // 预留：Energy 系统接入后启用
    sciencePerMin: 1,      // 预留：Science 系统接入后启用
    saveIntervalSec: 20,   // 战斗中心跳存档间隔（保证 lastSaveTime 不过期）
  },

  /** 连击系统（Phase 11）：连续击杀越高，额外 XP / 资源越多 */
  COMBO: {
    windowSec: 3.0,            // 距上次击杀超过该秒数 → 连击重置
    tiers: [5, 10, 25, 50, 100],
    xpBonusPerTier: 0.10,      // 每跨一档 XP +10%
    steelBonusPerTier: 0.10,   // 每跨一档 钢材 +10%
  },

  /**
   * 危险度（Phase 11，Phase 12 重新标定权重）
   * 新波次同屏敌人数明显上升（W9 峰值约 20+），旧权重会长期顶到 1.0，
   * 因此整体下调并补上精英敌种，使：W1≈0.24（警戒）→ W5≈0.55（紧张）→ W9≈0.95（临界）。
   */
  THREAT: {
    typeWeight: {
      fighter: 0.030, suicideDrone: 0.025, bomber: 0.055,
      transport: 0.060, ewPlane: 0.080,
      aceFighter: 0.090, heavyBomber: 0.140, boss: 0.500,
    },
    lowHpThreshold: 0.35,      // 基地血量低于该比例时额外加压
    lowHpBonus: 0.30,
    lerpSpeed: 2.0,            // 显示值平滑速度
    levelNames: ['平静', '警戒', '紧张', '危险', '临界'],
  },

  /**
   * 随机事件（Phase 11）
   * 硬性要求（Prompt §51）：有预警、有 UI、有声音、有持续时间、有结果；
   * 绝不暂停游戏、绝不毫无提示地突然改属性。
   */
  EVENTS: {
    enabled: true,
    firstDelaySec: 40,         // 开局后首个事件
    intervalSec: [55, 85],     // 后续间隔区间（随机）
    warnSec: 3,                // 预警时长
    radarMul: 0.6,             // 雷达故障：范围 ×0.6（-40%）
    fireRateMul: 0.7,          // 弹药危机：射速 ×0.7（-30%）
    carrierBonusSteel: 40,     // 敌方运输机：击毁额外钢材
    defs: [
      { id: 'RADAR_FAILURE', name: '雷达故障',   warn: '侦测到强烈电磁干扰', desc: '雷达范围 -40%',     duration: 20, kind: 'modifier' },
      { id: 'AMMO_CRISIS',   name: '弹药危机',   warn: '补给线受阻',         desc: '射速 -30%',         duration: 20, kind: 'modifier' },
      // spawn 类事件的 duration 只用于横幅展示时长（生效瞬间即完成，无持续修正）
      { id: 'ENEMY_CARRIER', name: '敌方运输机', warn: '侦测到大型慢速目标', desc: '击毁可得额外资源', duration: 6, kind: 'spawn' },
    ],
  },

  /** 性能（Phase 17 §87：高难度刷怪量上调，允许更大的池，但全部池化 + 动态降级） */
  PERF: {
    maxDt: 1 / 20,       // 单帧最大步长，防止切后台回来后"瞬移"
    maxParticles: 1800,
    maxBullets: 600,
    maxEnemies: 90,      // §10：D10 的极限同屏目标（不是要求每时每刻都达到）
    maxOrbs: 120,
    maxMissiles: 100,
    maxDrones: 30,
  },

  /**
   * 输入（触屏适配）
   * 手机按住屏幕开火时，手指会正好盖住准星（准星 34px，手指约 40~50 CSS px），
   * 玩家完全看不到自己在瞄哪。因此触屏时把瞄准点上移一段，让准星露在手指上方。
   * 设为 0 可关闭（恢复"手指位置即瞄准点"）。
   */
  INPUT: {
    touchAimOffsetY: 96,   // 逻辑 px；实际偏移取 min(配置值, 手指 y)，靠近顶部时平滑收敛
  },

  /** 开发模式（Debug 面板 / F1） */
  DEBUG: true,
};

/** 渲染层级（背景多层视差 + 战斗层） */
export const LAYERS = {
  STAR: 0,
  CLOUD: 1,
  CITY: 2,
  STRUCTURE: 3,
  ENEMY: 4,
  BULLET: 5,
  PARTICLE: 6,
  HUD: 7,
};
