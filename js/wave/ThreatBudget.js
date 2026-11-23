/**
 * ThreatBudget（Phase 17，设计文档 §9 / §10）
 *
 * 每秒可生成的"威胁点数"由难度决定（D0=10 → D10=27）。
 * 敌人按单价消耗预算：Fighter 1 / Drone 1 / Bomber 3 / EW 4 / Transport 5 / Ace 6 / Heavy Bomber 9。
 *
 * 关于刻度：文档给出的 10~27 是"压力刻度"，直接当 pts/s 会让 D0 的 30 点波次在 3 秒内刷完。
 * 这里把它当作「每 BUDGET_TIME_UNIT 秒的威胁点数」，换算后：
 *   D0  = 10/12 ≈ 0.83 pts/s   —— 与"每波约 30 点 / 45 秒窗口"吻合
 *   D10 = 27/12 ≈ 2.25 pts/s   —— 同时对高难度波次预算形成真实天花板
 * 真正决定"这一波刷多久"的是波次自身的配额（见 SpawnDirector），预算只是节流阀 + 上限。
 */
export const BUDGET_TIME_UNIT = 12;

export class ThreatBudget {
  constructor() {
    this.pool = 0;
    this.rate = 0;          // pts/s
    this.spawnCap = 50;
    this.spent = 0;
    this.total = 0;
    this.enemyCount = 0;
  }

  /**
   * 开波
   * @param {{rate:number, cap:number}} o
   */
  beginWave(o) {
    this.rate = Math.max(0.05, o.rate || 0.5);
    this.spawnCap = o.cap || 50;
    this.pool = 0;
    this.spent = 0;
    this.total = 0;
    this.enemyCount = 0;
  }

  /**
   * @param {number} dt
   * @param {number} enemyCount 当前同屏敌人数
   * @param {number} maxRate 难度的威胁上限（pts/s）
   */
  update(dt, enemyCount, maxRate) {
    this.enemyCount = enemyCount;
    const r = maxRate ? Math.min(this.rate, maxRate) : this.rate;
    this.pool = Math.min(this.pool + r * dt, r * 6 + 8);   // 池上限：避免长时间攒出一大波
  }

  canAfford(cost) { return this.pool >= cost; }

  spend(cost) {
    if (this.pool < cost) return false;
    this.pool -= cost;
    this.spent += cost;
    this.total += cost;
    return true;
  }

  /** 同屏压力 0~1（§10：达到 80% 时降低普通 Fighter 权重） */
  get pressure() { return this.spawnCap ? this.enemyCount / this.spawnCap : 0; }
  get congested() { return this.pressure >= 0.8; }

  /** 拥挤时的小飞机权重衰减（§10） */
  get lightWeightMul() {
    const p = this.pressure;
    if (p < 0.6) return 1;
    if (p < 0.8) return 0.7;
    return 0.35;
  }

  /** 是否禁止再刷（同屏已达上限） */
  get blocked() { return this.enemyCount >= this.spawnCap; }
}

export default ThreatBudget;
