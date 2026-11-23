import { CONFIG } from '../data/config.js';
import { rand } from '../core/utils.js';

/**
 * 随机事件系统（Phase 11）
 *
 * 流程：idle --(倒计时)--> warning(预警 warnSec) --> active(持续 duration) --> idle
 *
 * 硬性要求（Prompt §51）：随机事件必须
 *   有预警 / 有 UI / 有声音 / 有持续时间 / 有结果
 * 不能毫无提示地突然修改属性 —— 所以属性修正在 active 阶段才生效，
 * 且 warning 阶段就已经把"即将发生什么"告诉玩家。
 *
 * 回调（由 Game 注入）：
 *   onWarn(def)   预警开始
 *   onStart(def)  事件生效
 *   onEnd(def)    事件结束（结果）
 */
export class RandomEventSystem {
  constructor() { this.reset(); }

  reset() {
    this.enabled = CONFIG.EVENTS.enabled;
    this.phase = 'idle';      // idle | warning | active
    this.def = null;
    this.timer = CONFIG.EVENTS.firstDelaySec;
    this.left = 0;            // 当前阶段剩余秒数
    this.fired = 0;           // 本局已触发次数
    // 回调
    this.onWarn = null;
    this.onStart = null;
    this.onEnd = null;
    this.onSpawnCarrier = null;
  }

  /** 雷达范围修正（仅雷达故障生效期间 <1） */
  get radarMul() {
    return (this.phase === 'active' && this.def && this.def.id === 'RADAR_FAILURE')
      ? CONFIG.EVENTS.radarMul : 1;
  }

  /** 射速修正（仅弹药危机生效期间 <1） */
  get fireRateMul() {
    return (this.phase === 'active' && this.def && this.def.id === 'AMMO_CRISIS')
      ? CONFIG.EVENTS.fireRateMul : 1;
  }

  /** 供 HUD 使用：当前横幅文案 */
  banner() {
    if (this.phase === 'warning' && this.def) {
      return { title: '⚠ ' + this.def.name, text: this.def.warn, left: this.left, warn: true };
    }
    if (this.phase === 'active' && this.def) {
      return { title: this.def.name, text: this.def.desc, left: this.left, warn: false };
    }
    return null;
  }

  update(dt) {
    if (!this.enabled) return;

    if (this.phase === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) this._beginWarning();
      return;
    }

    this.left -= dt;
    if (this.left > 0) return;

    if (this.phase === 'warning') this._activate();
    else if (this.phase === 'active') this._finish();
  }

  /** 手动触发（调试 / 测试用） */
  force(id) {
    const def = CONFIG.EVENTS.defs.find((d) => d.id === id);
    if (!def) return false;
    this.def = def;
    this._beginWarning();
    return true;
  }

  _beginWarning() {
    if (!this.def) {
      const defs = CONFIG.EVENTS.defs;
      this.def = defs[Math.floor(rand(0, defs.length))] || defs[0];
      if (!this.def) { this.timer = 999; return; }
    }
    this.phase = 'warning';
    this.left = CONFIG.EVENTS.warnSec;
    if (this.onWarn) this.onWarn(this.def);
  }

  _activate() {
    this.phase = 'active';
    this.left = Math.max(0, this.def.duration || 0);
    this.fired++;

    // spawn 类事件：立刻投放目标
    if (this.def.kind === 'spawn' && this.onSpawnCarrier) this.onSpawnCarrier(this.def);

    if (this.onStart) this.onStart(this.def);

    // 无持续时间的事件：下一帧立即收尾
    if (this.left <= 0) this._finish();
  }

  _finish() {
    const def = this.def;
    this.phase = 'idle';
    this.def = null;
    this.left = 0;
    const [a, b] = CONFIG.EVENTS.intervalSec;
    this.timer = rand(a, b);
    if (def && this.onEnd) this.onEnd(def);
  }
}

export default RandomEventSystem;
