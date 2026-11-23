import { CONFIG } from '../data/config.js';
import { clamp } from '../core/utils.js';

/**
 * 危险度系统（Phase 11）
 *
 * 依据（Prompt §49）：
 *   敌人数 / 敌人类型 / Boss / 基地生命
 * 动态计算 0~1 的威胁值，让玩家有"空袭正在升级"的压迫感。
 */
export class ThreatSystem {
  constructor() {
    this.raw = 0;      // 瞬时计算值
    this.value = 0;    // 平滑后的显示值
  }

  reset() { this.raw = 0; this.value = 0; }

  /**
   * @param {number} dt
   * @param {Array} enemies 存活敌人列表（e.type 为敌人 id）
   * @param {{hp:number,maxHp:number}} base 基地
   */
  update(dt, enemies, base) {
    const W = CONFIG.THREAT.typeWeight;
    let sum = 0;

    if (enemies && enemies.length) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.alive) continue;
        sum += W[e.type] || 0.05;      // 未知敌种给一个保守权重
      }
    }

    // 基地残血 → 局势更危险
    if (base && base.maxHp > 0) {
      const ratio = base.hp / base.maxHp;
      if (ratio < CONFIG.THREAT.lowHpThreshold) sum += CONFIG.THREAT.lowHpBonus;
    }

    this.raw = clamp(sum, 0, 1);

    // 指数平滑，避免数字跳动
    const k = 1 - Math.exp(-CONFIG.THREAT.lerpSpeed * dt);
    this.value += (this.raw - this.value) * k;
    if (Math.abs(this.raw - this.value) < 0.002) this.value = this.raw;
  }

  /** 0 ~ levelNames.length-1 */
  get level() {
    const n = CONFIG.THREAT.levelNames.length;
    return clamp(Math.floor(this.value * n), 0, n - 1);
  }

  get name() { return CONFIG.THREAT.levelNames[this.level] || ''; }
}

export default ThreatSystem;
