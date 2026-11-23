/**
 * ============================================================================
 * AdManager —— 比赛版：广告系统整体移除（纯本地单机）
 * ----------------------------------------------------------------------------
 * 原作为 TapTap 广告小游戏，比赛版把"所有涉及广告的加成元素"从玩法闭环中
 * 彻底删除：开局增益 / 原地复活 / 结算翻倍 / 离线翻倍 / 广告解锁 /
 * 广告刷新三选一 —— 相关 UI 入口与奖励发放逻辑均已删除。
 *
 * 本文件仅保留一个空壳，原因是历史工具脚本与调试面板里还残留
 * `g.ads.setNoAds()` / `g.ads.stats` 等无害调用；show() 恒不发放任何奖励。
 * 游戏本体不依赖它。广告位清单 adslots.js 也仅为历史兼容而保留，不再接线。
 * ============================================================================
 */
export class AdManager {
  constructor(opts = {}) {
    this.noAds = true;                 // 比赛版永远"免广告"
    this.provider = null;
    this.usage = { date: this._todayKey(), slots: {} };
    this.stats = { rewardedShown: 0, interstitialShown: 0, rewardsGranted: 0, failed: 0 };
    this.onLog = opts.onLog || null;
  }

  _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  _saveUsage() {}
  setNoAds() {}
  useProvider() {}
  get ready() { return true; }

  /** 广告位一律不可用（比赛版无任何广告奖励） */
  isReady() { return { ok: false, reason: '比赛版已移除广告' }; }

  /** 空操作：不发放任何奖励，不触发任何回调 */
  show() { return false; }

  showBanner() {}
  hideBanner() {}
  _log() {}
}

/** 空壳，兼容历史 import */
export class MockAdProvider {
  init(cb) { if (cb) cb(true); }
  isReady() { return false; }
  show() {}
  showBanner() {}
  hideBanner() {}
}

export default AdManager;
