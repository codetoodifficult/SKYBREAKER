/**
 * 通用对象池
 * 移动端 GC 压力是掉帧主因，所有高频创建/销毁对象（Bullet / Enemy / Particle / XPOrb）
 * 必须走池，禁止每帧 new。
 */
export class ObjectPool {
  /**
   * @param {() => object} factory 创建新对象
   * @param {(o:object)=>void} reset 回收时重置
   * @param {number} preload 预创建数量
   */
  constructor(factory, reset, preload = 0) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = [];
    this.created = 0;
    for (let i = 0; i < preload; i++) {
      this.free.push(this._create());
    }
  }

  _create() {
    this.created++;
    return this.factory();
  }

  /** 取出一个对象 */
  get() {
    const o = this.free.length ? this.free.pop() : this._create();
    this.active.push(o);
    return o;
  }

  /** 按引用回收 */
  release(o) {
    const i = this.active.indexOf(o);
    if (i === -1) return false;
    this.active.splice(i, 1);
    if (this.reset) this.reset(o);
    this.free.push(o);
    return true;
  }

  /** 按下标回收（倒序遍历时用，避免 indexOf 的 O(n)） */
  releaseAt(i) {
    const o = this.active[i];
    this.active.splice(i, 1);
    if (this.reset) this.reset(o);
    this.free.push(o);
  }

  /** 全部回收 */
  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) this.releaseAt(i);
  }

  get activeCount() { return this.active.length; }
  get freeCount() { return this.free.length; }

  stats() {
    return { active: this.active.length, free: this.free.length, created: this.created };
  }
}

export default ObjectPool;
