/**
 * 补给商店系统（Phase G · GDD §17.5）
 *
 * 职责：
 *  - 管理本局 Credits（收益记账）
 *  - 维护 4 槽商品池：加权抽取、锁定槽、刷新费用递增
 *  - 购买执行（消耗品立即生效 / 属性商品写入 stats，均走真实系统，杜绝假商品）
 *
 * 生命周期：每波 rest 进入时 Game._enterShop() 调 open()；玩家点"开始下一波"→ close()。
 * 状态机：商店期间 GameState.SHOP，世界更新停摆（与 PAUSED 同级），关闭后回到 PLAYING 继续 rest 倒计时。
 */
import { CONSUMABLES, BUFF_GOODS, CREDIT_EARN, SHOP_CONFIG } from '../data/shop.js';

export class ShopSystem {
  /** @param {import('../core/Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.slots = [];          // [{good, locked}]
    this.refreshCost = SHOP_CONFIG.refreshBaseCost;
    this.bought = {};         // buff 商品限购计数
    this.purchases = 0;
  }

  /* ---------------- Credits ---------------- */

  get credits() { return (this.game.run && this.game.run.credits) || 0; }

  /** 击杀收益。elite / boss 由 Enemy.isElite / isBoss 标记 */
  earnKill(enemy) {
    if (!enemy || !this.game.run) return 0;
    let v = CREDIT_EARN.normal;
    if (enemy.isBoss) v = CREDIT_EARN.boss;
    else if (enemy.isElite) v = CREDIT_EARN.elite;
    this.game.run.credits = this.credits + v;
    return v;
  }

  /** 每波清空奖励 */
  earnWave() {
    if (!this.game.run) return 0;
    this.game.run.credits = this.credits + CREDIT_EARN.waveClear;
    return CREDIT_EARN.waveClear;
  }

  /* ---------------- 商品池 ---------------- */

  /** 波次间开局：重置刷新费用，保留限购计数（本局持续） */
  open() {
    this.refreshCost = SHOP_CONFIG.refreshBaseCost;
    if (!this.slots.length) this.roll();
  }

  close() { /* 保留 slots，下一波 open() 时不重摇（未锁定也保留，玩家可继续买） */ }

  /** 重摇全部未锁定槽位 */
  roll() {
    const next = [];
    for (let i = 0; i < SHOP_CONFIG.slotCount; i++) {
      if (this.slots[i] && this.slots[i].locked) { next.push(this.slots[i]); continue; }
      next.push({ good: this._pickGood(), locked: false });
    }
    this.slots = next;
    this.refreshCost = Math.min(SHOP_CONFIG.refreshCostCap, this.refreshCost + 1);
  }

  /** 加权抽取：先按槽位奇偶保证至少一半是消耗品，属性商品只在还有可买时出现 */
  _pickGood() {
    const buffOk = BUFF_GOODS.filter((b) => this._boughtOf(b) < (b.maxStacks || 99));
    const canBuff = buffOk.length > 0;
    // 槽位 0/2 优先消耗品，1/3 允许属性商品 —— 保证每刷一次大概率有补给
    const buffChance = canBuff ? 0.45 : 0;
    const pool = (Math.random() < buffChance ? buffOk : CONSUMABLES);
    const total = pool.reduce((s, g) => s + (g.weight || 10), 0);
    let r = Math.random() * total;
    for (const g of pool) { r -= (g.weight || 10); if (r <= 0) return g; }
    return pool[0];
  }

  _boughtOf(good) { return this.bought[good.id] || 0; }

  /* ---------------- 交易 ---------------- */

  canBuy(slotIdx) {
    const slot = this.slots[slotIdx];
    if (!slot || !slot.good) return { ok: false, reason: '' };
    if (this.credits < slot.good.price) return { ok: false, reason: 'Credits 不足' };
    if (slot.good.kind === 'buff' && this._boughtOf(slot.good) >= slot.good.maxStacks) {
      return { ok: false, reason: '已达限购' };
    }
    return { ok: true };
  }

  /**
   * 购买槽位商品。返回 {ok, reason}
   * 消耗品执行 effect；buff 写 stats 并保留槽位空置（防止重买）。
   */
  buy(slotIdx) {
    const chk = this.canBuy(slotIdx);
    if (!chk.ok) return chk;
    const slot = this.slots[slotIdx];
    const good = slot.good;
    this.game.run.credits = this.credits - good.price;
    this.purchases++;
    const done = this.game._applyShopGood(good);
    if (good.kind === 'buff') {
      this.bought[good.id] = this._boughtOf(good) + 1;
      slot.good = null;                  // 已售罄
    } else {
      slot.good = null;                  // 消耗品一次性
    }
    return { ok: true, good, done };
  }

  /** 锁定/解锁槽位（免费） */
  toggleLock(slotIdx) {
    const slot = this.slots[slotIdx];
    if (!slot || !slot.good) return false;
    slot.locked = !slot.locked;
    return slot.locked;
  }

  /** HUD/面板用 */
  snapshot() {
    return {
      credits: this.credits,
      slots: this.slots.map((s) => ({
        good: s.good ? { ...s.good } : null,
        locked: !!s.locked,
      })),
      refreshCost: this.refreshCost,
      bought: { ...this.bought },
    };
  }
}
