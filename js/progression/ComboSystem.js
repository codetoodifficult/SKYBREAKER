import { CONFIG } from '../data/config.js';

/**
 * 连击系统（Phase 11）
 *
 * 规则（Prompt §48）：
 *   - 击杀敌人 → Combo +1
 *   - 连续击杀跨过 x5 / x10 / x25 / x50 / x100 档位 → 额外 XP + 额外资源
 *   - 停止击杀超过 windowSec → Combo 重置
 */
export class ComboSystem {
  constructor() { this.reset(); }

  reset() {
    this.count = 0;          // 当前连击数
    this.timer = 0;          // 剩余保持时间（秒）
    this.best = 0;           // 本局最高连击
    this.tier = 0;           // 已跨过的档位数 0~5
    this.justTiered = false; // 本帧是否刚跨档（HUD 特效用）
    this.flash = 0;          // 跨档闪光计时
  }

  get active() { return this.count > 0; }

  /** XP 收益倍率 */
  get xpMul() { return 1 + this.tier * CONFIG.COMBO.xpBonusPerTier; }

  /** 钢材收益倍率 */
  get steelMul() { return 1 + this.tier * CONFIG.COMBO.steelBonusPerTier; }

  /** 连击剩余时间比例（0~1，HUD 倒计时条用） */
  get remainRatio() {
    const w = CONFIG.COMBO.windowSec;
    return w > 0 ? Math.max(0, Math.min(1, this.timer / w)) : 0;
  }

  /**
   * 记录一次击杀
   * @returns {number} 本次新跨过的档位序号（0 = 未跨档）
   */
  addKill() {
    this.count++;
    this.timer = CONFIG.COMBO.windowSec;
    if (this.count > this.best) this.best = this.count;

    const tiers = CONFIG.COMBO.tiers;
    let t = 0;
    for (let i = 0; i < tiers.length; i++) if (this.count >= tiers[i]) t++;

    if (t > this.tier) {
      this.tier = t;
      this.justTiered = true;
      this.flash = 0.6;
      return t;
    }
    return 0;
  }

  /**
   * @param {number} dt
   * @returns {boolean} 本帧是否发生连击断裂
   */
  update(dt) {
    this.justTiered = false;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (!this.active) return false;

    this.timer -= dt;
    if (this.timer > 0) return false;
    this.break_();
    return true;
  }

  /** 连击断裂（超时调用；也可被外部主动打断） */
  break_() {
    this.count = 0;
    this.timer = 0;
    this.tier = 0;
  }
}

export default ComboSystem;
