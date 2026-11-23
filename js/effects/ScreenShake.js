import { rand } from '../core/utils.js';

/**
 * 屏幕震动
 * 用法：shake.shake(5, 100) —— 强度 px / 持续 ms
 * 强度随时间二次衰减，绝不会永久震动。
 */
export class ScreenShake {
  constructor() {
    this.x = 0;
    this.y = 0;
    this._t = 0;
    this._dur = 0;
    this._mag = 0;
  }

  /**
   * @param {number} mag 最大位移 px
   * @param {number} durMs 持续毫秒
   */
  shake(mag, durMs) {
    // 新震动更强，或者旧震动已结束 → 覆盖；否则保留更强的那个
    if (mag >= this._mag || this._t <= 0) {
      this._mag = mag;
      this._dur = durMs / 1000;
      this._t = this._dur;
    }
  }

  update(dt) {
    if (this._t > 0) {
      this._t -= dt;
      const k = Math.max(0, this._t / this._dur);
      const m = this._mag * k * k;
      this.x = rand(-m, m);
      this.y = rand(-m, m);
      if (this._t <= 0) { this._mag = 0; this.x = 0; this.y = 0; }
    } else {
      this.x = 0;
      this.y = 0;
    }
  }

  reset() { this._t = 0; this._dur = 0; this._mag = 0; this.x = 0; this.y = 0; }
}

export default ScreenShake;
