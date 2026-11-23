/**
 * ============================================================================
 * SKYBREAKER 广告位清单（Ad Inventory）
 * ============================================================================
 *
 * 定位：TapTap 小游戏 / 休闲-中度混合变现。
 * 原则（非常重要）：
 *   1. 激励视频 = 玩家主动选择，奖励必须是"真奖励"，且不影响公平性（不给 PVP 优势）
 *   2. 插屏 = 只在"自然断点"出现，绝不打断战斗中的操作
 *   3. Banner = 只出现在非战斗页（菜单/基地/结算），战斗中禁止出现（会挡操作区）
 *   4. 所有广告位都要有频控 + 每日上限，首局前 X 分钟不推插屏
 *
 * status:
 *   'wired'     —— 本阶段已接通（有真实入口 + 真实奖励）
 *   'reserved'  —— 位置与调用点已预留，等对应系统开发完成后接线（AdManager.show 已可直接调用）
 *
 * 接入真实 SDK 时，只需要把 slotId 映射到 SDK 的广告位 ID（见 AD_SLOTS.md）。
 * ============================================================================
 */

export const AD_TYPE = {
  REWARDED: 'rewarded',       // 激励视频
  INTERSTITIAL: 'interstitial', // 插屏
  BANNER: 'banner',           // 横幅
  SPLASH: 'splash',           // 开屏
  NATIVE: 'native',           // 原生/信息流
};

export const AD_SLOTS = {
  /* ------------------------------------------------------------------ */
  /* 一、激励视频 —— 主收入来源（eCPM 最高，且玩家不反感）                */
  /* ------------------------------------------------------------------ */

  /** ① 开局增益：出击前观看，本局获得增益 */
  START_BOOST: {
    id: 'START_BOOST',
    type: AD_TYPE.REWARDED,
    scene: '主菜单 · 出击前',
    desc: '本局机炮伤害 +25%，并额外获得 1 点护盾（抵挡一次突防）',
    reward: { damageMul: 1.25, shield: 1 },
    cooldownSec: 0,
    dailyCap: 10,
    status: 'wired',
  },

  /** ② 战地复活：基地被摧毁后原地续命 */
  REVIVE: {
    id: 'REVIVE',
    type: AD_TYPE.REWARDED,
    scene: '结算 · DEFENSE FAILED',
    desc: '恢复 60% 基地生命，清屏并清场，获得 3 秒无敌',
    reward: { hpRatio: 0.6, invulnSec: 3 },
    cooldownSec: 0,
    dailyCap: 8,
    status: 'wired',
  },

  /** ③ 结算双倍：本局资源翻倍 */
  RESULT_DOUBLE: {
    id: 'RESULT_DOUBLE',
    type: AD_TYPE.REWARDED,
    scene: '结算 · MISSION COMPLETE / FAILED',
    desc: '本局获得的钢材 / 分数 ×2',
    reward: { multiplier: 2 },
    cooldownSec: 0,
    dailyCap: 10,
    status: 'wired',
  },

  /** ④ 离线收益翻倍（Phase 10 已接线） */
  OFFLINE_X2: {
    id: 'OFFLINE_X2',
    type: AD_TYPE.REWARDED,
    scene: '离线收益弹窗',
    desc: '离线收益 ×2，或立即补满 4 小时上限',
    reward: { multiplier: 2 },
    cooldownSec: 0,
    dailyCap: 6,
    status: 'wired',
    needPhase: 10,
  },

  /** ⑤ 升级卡刷新（Phase 4 接线）—— 三选一不满意时刷新 */
  UPGRADE_REROLL: {
    id: 'UPGRADE_REROLL',
    type: AD_TYPE.REWARDED,
    scene: 'LEVEL UP 三选一界面',
    desc: '刷新 3 个升级选项（每局前 2 次免费，之后走广告）',
    reward: { reroll: 1 },
    cooldownSec: 5,
    dailyCap: 20,
    status: 'wired',
  },

  /** ⑥ 战术空投（Phase 7+ 接线）—— 战斗内主动召唤 */
  AIRDROP: {
    id: 'AIRDROP',
    type: AD_TYPE.REWARDED,
    scene: '战斗 HUD · 空投按钮（60s CD）',
    desc: '呼叫空投：全屏清场 + 8 秒无限弹药不发热',
    reward: { clearScreen: true, freeFireSec: 8 },
    cooldownSec: 60,
    dailyCap: 12,
    status: 'reserved',
    needPhase: 7,
  },

  /** ⑦ Boss 增援（Phase 8 接线） */
  BOSS_REINFORCE: {
    id: 'BOSS_REINFORCE',
    type: AD_TYPE.REWARDED,
    scene: 'BOSS 出现前警告界面',
    desc: '呼叫增援：进入 Boss 战时携带 3 发 EMP + 满弹药',
    reward: { emp: 3, fullAmmo: true },
    cooldownSec: 0,
    dailyCap: 8,
    status: 'reserved',
    needPhase: 8,
  },

  /** ⑧ 基地加速建造（Phase 9 接线） */
  BASE_RUSH: {
    id: 'BASE_RUSH',
    type: AD_TYPE.REWARDED,
    scene: '基地页 · 升级等待',
    desc: '立即完成当前升级 / 免费刷新一次商店',
    reward: { instantUpgrade: true },
    cooldownSec: 30,
    dailyCap: 10,
    status: 'reserved',
    needPhase: 9,
  },

  /**
   * ⑫ 内容解锁（Phase 19，§49"解锁不应该全部靠 Blueprint"）
   * —— 后期解锁内容的免费替代路径：看一次广告直接解锁 1 件。
   * 限制：每日上限 + 同一内容只解锁一次（进度存 meta，防止刷）。
   */
  UNLOCK_CONTENT: {
    id: 'UNLOCK_CONTENT',
    type: AD_TYPE.REWARDED,
    scene: '军械库 / 难度页 · 内容解锁',
    desc: '观看广告立即解锁 1 件后期内容（构筑核心 / 高难度 / 武器）',
    reward: { unlock: true },
    cooldownSec: 0,
    dailyCap: 5,
    status: 'wired',
  },

  /* ------------------------------------------------------------------ */
  /* 二、插屏 —— 只在自然断点，绝不打断战斗                              */
  /* ------------------------------------------------------------------ */

  /** ⑨ 波次间隙（已停用：局中插屏影响体验，用户要求移除） */
  WAVE_BREAK: {
    id: 'WAVE_BREAK',
    type: AD_TYPE.INTERSTITIAL,
    scene: 'Wave 结束 → 下一 Wave 准备阶段',
    desc: '已停用（不再触发），保留定义供历史存档兼容',
    minIntervalSec: 90,
    warmupSec: 120,
    dailyCap: 12,
    status: 'disabled',
  },

  /** ⑩ 返回主菜单 */
  BACK_TO_MENU: {
    id: 'BACK_TO_MENU',
    type: AD_TYPE.INTERSTITIAL,
    scene: '暂停 → 返回主菜单',
    desc: '从战斗退回主菜单时触发，最小间隔 120s',
    minIntervalSec: 120,
    warmupSec: 60,
    dailyCap: 8,
    status: 'reserved',
    needPhase: 5,
  },

  /** ⑪ 重开一局 */
  RESTART: {
    id: 'RESTART',
    type: AD_TYPE.INTERSTITIAL,
    scene: '结算 → 重新部署',
    desc: '每 3 次重新部署最多触发 1 次',
    minIntervalSec: 120,
    warmupSec: 90,
    dailyCap: 8,
    status: 'reserved',
    needPhase: 5,
  },

  /* ------------------------------------------------------------------ */
  /* 三、Banner —— 只出现在非战斗页                                      */
  /* ------------------------------------------------------------------ */

  BANNER_MENU: {
    id: 'BANNER_MENU',
    type: AD_TYPE.BANNER,
    scene: '主菜单 / 基地 / 结算页 底部',
    desc: '战斗中隐藏；底部预留 68px 安全区（--ad-safe-area）',
    refreshSec: 30,
    status: 'wired',
  },

  /* ------------------------------------------------------------------ */
  /* 四、开屏 / 原生                                                     */
  /* ------------------------------------------------------------------ */

  SPLASH: {
    id: 'SPLASH',
    type: AD_TYPE.SPLASH,
    scene: '游戏冷启动',
    desc: '首帧加载完成后展示，最长 5s，可跳过',
    dailyCap: 5,
    status: 'reserved',
  },

  NATIVE_RECOMMEND: {
    id: 'NATIVE_RECOMMEND',
    type: AD_TYPE.NATIVE,
    scene: '主菜单 · 推荐位卡片',
    desc: '原生信息流：其它小游戏推荐（TapTap 生态内导流）',
    status: 'reserved',
  },
};

/** 已接通（本阶段真实可用）的广告位 */
export function wiredSlots() {
  return Object.values(AD_SLOTS).filter(s => s.status === 'wired');
}

/** 已预留（待接线）的广告位 */
export function reservedSlots() {
  return Object.values(AD_SLOTS).filter(s => s.status === 'reserved');
}

export default AD_SLOTS;
