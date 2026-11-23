/**
 * 主循环
 * dt 做了上限截断：切后台/掉帧回来后不会因为 dt 巨大导致敌机瞬移穿过防线。
 */
export class GameLoop {
  /**
   * @param {(dt:number)=>void} update 逻辑更新（秒）
   * @param {()=>void} render 渲染
   * @param {number} maxDt 单帧最大步长
   */
  constructor(update, render, maxDt = 1 / 20) {
    this.update = update;
    this.render = render;
    this.maxDt = maxDt;

    this.running = false;
    this._raf = 0;
    this._last = 0;

    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;

    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this.running) return;
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > this.maxDt) dt = this.maxDt;
    if (dt < 0) dt = 0;

    // FPS 统计
    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    // 关键：单帧异常不能中断 RAF 循环，否则画面会"卡死"（彻底冻结）。
    // 捕获并打印，但继续调度下一帧。
    try {
      this.update(dt);
      this.render();
    } catch (e) {
      console.error('[SKYBREAKER] frame error:', e);
    }

    this._raf = requestAnimationFrame(this._tick);
  }
}

export default GameLoop;
