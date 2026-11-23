/**
 * 等级系统
 *   level / xp / xpToNext
 *   addXp(v): 多次升级也会在一次获得大额 XP 时连升
 *   consumeLevelUp(): 返回是否有待处理的升级
 */
export class LevelSystem {
  constructor() {
    this.level = 1;
    this.xp = 0;
    this._pending = false;
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this._pending = false;
  }

  /**
   * 等级门槛（Phase 12，设计文档 §41）
   *   xpToNext(level) = round(18 + level * 5 + pow(level, 1.4) * 2)
   * 目标：第一波不再"开局 10 秒连升 3 级"；一局约 15~18 次三选一，W10 时约 Lv17~19。
   */
  xpToNext(lv) {
    return Math.round(18 + lv * 5 + Math.pow(lv, 1.4) * 2);
  }

  addXp(v) {
    this.xp += v;
    let promoted = 0;
    while (this.xp >= this.xpToNext(this.level)) {
      this.xp -= this.xpToNext(this.level);
      this.level += 1;
      promoted += 1;
      this._pending = true;
      if (this.level > 99) break;
    }
    return promoted;
  }

  hasPending() { return this._pending; }
  consume() { const p = this._pending; this._pending = false; return p; }
}

export default LevelSystem;
