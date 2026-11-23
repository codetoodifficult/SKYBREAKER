import { CONFIG } from '../data/config.js';

/**
 * 输入系统：统一 Pointer Events（同时覆盖 手机触摸 / 鼠标 / 平板手写笔）
 * 对外只暴露"逻辑坐标"，调用方不需要关心屏幕缩放。
 */
export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;

    /** 指针在 1280×720 逻辑坐标系中的位置 */
    this.x = CONFIG.WORLD.WIDTH / 2;
    this.y = 200;

    /** 是否按住（按住 = 持续开火） */
    this.isDown = false;

    /** 本帧是否刚按下（用于菜单点击/一次性触发） */
    this.justPressed = false;
    this.justReleased = false;

    /** 多指：只跟踪主指针，忽略其它手指，避免瞄准乱跳 */
    this._primaryId = null;

    /** 键盘（调试用） */
    this.keys = new Set();

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    const opt = { passive: false };

    c.addEventListener('pointerdown', (e) => {
      if (this._primaryId !== null) return;      // 已有主指针，忽略第二根手指
      this._primaryId = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* 某些浏览器不支持，忽略 */ }
      this._updatePos(e);
      this.isDown = true;
      this.justPressed = true;
      e.preventDefault();
    }, opt);

    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._primaryId) return;
      this._updatePos(e);
      e.preventDefault();
    }, opt);

    const end = (e) => {
      if (e.pointerId !== this._primaryId) return;
      this._primaryId = null;
      this.isDown = false;
      this.justReleased = true;
      try { c.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      e.preventDefault();
    };
    c.addEventListener('pointerup', end, opt);
    c.addEventListener('pointercancel', end, opt);
    c.addEventListener('lostpointercapture', end, opt);

    // ---- 阻止移动端浏览器默认行为 ----
    // 注意：绝不能在 document 上无差别 preventDefault( touchstart / touchmove )！
    // 那会阻止浏览器合成 click 事件，导致手机上所有 UI 按钮都点不动
    // （实测：主菜单「开始任务」点了没反应）。
    // 页面滚动 / 缩放 / 双击缩放改用 CSS `touch-action: none` 拦截（见 style.css），
    // 它同样能禁掉手势，但不影响 click 合成。
    const block = (e) => e.preventDefault();
    document.addEventListener('gesturestart', block, opt);   // iOS 双指缩放
    document.addEventListener('gesturechange', block, opt);
    document.addEventListener('contextmenu', block, opt);    // 长按菜单
    document.addEventListener('dblclick', block, opt);       // 双击缩放

    // ---- 键盘（PC 调试）----
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'F1' || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.isDown = false; this._primaryId = null; });
  }

  /**
   * 把屏幕坐标换算成世界坐标。
   * 触屏时瞄准点会上移一段（见 CONFIG.INPUT.touchAimOffsetY），
   * 否则手指正好盖住准星，玩家看不到自己在瞄哪。
   * 偏移取 min(配置值, 手指 y)，手指靠近画面顶部时平滑收敛到 0，不会卡在上边缘。
   */
  _updatePos(e) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.x = (e.clientX - r.left) / r.width * CONFIG.WORLD.WIDTH;
    const y = (e.clientY - r.top) / r.height * CONFIG.WORLD.HEIGHT;
    const isTouch = e.pointerType === 'touch';
    const off = isTouch ? (CONFIG.INPUT?.touchAimOffsetY || 0) : 0;
    this.y = off > 0 ? y - Math.min(off, Math.max(0, y)) : y;
  }

  /** 每帧逻辑结束后调用，清掉一次性标记 */
  endFrame() {
    this.justPressed = false;
    this.justReleased = false;
  }
}

export default Input;
