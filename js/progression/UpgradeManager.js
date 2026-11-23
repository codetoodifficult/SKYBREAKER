import { getUnlockedUpgrades, RARE_UPGRADES, RARE_MIN_LEVEL, RARE_CHANCE, rarityWeight, withMeta } from '../data/upgrades.js';
import { rand, pick } from '../core/utils.js';
import { buildWeaponOffers, pickWeighted, targetWeaponCount } from '../weapons/WeaponOffer.js';
import { buildEquipmentOffers } from '../equipment/EquipmentOffer.js';

/**
 * 升级管理器
 *   pickThree(): 从未锁定的池里挑 3 个不重复的升级
 *                软加权：每个升级的选中概率 = 1 / (1 + timesTaken)，已选多次的会被压低
 *   apply(u, game): 写 PlayerStats + 触发副作用（治疗、加护盾等）
 */
/** Phase 16 §24：第 1 次免费，之后 10 / 20 / 40 Scrap，每局最多 4 次 */
const REROLL_COSTS = [0, 10, 20, 40];
const REROLL_CAP = 4;
/** Phase 16 §25：每局可 Banish 2 次 */
export const BANISH_CAP = 2;

export class UpgradeManager {
  constructor() {
    this.pool = getUnlockedUpgrades();
    this.rerollUsedFree = 0;     // 已用免费刷新次数
    this.rerollFreeCap = 1;      // §24：只有第 1 次免费
    this.rerollCount = 0;        // 本局累计重抽次数（免费 + Scrap + 广告）
    this.banished = new Set();   // 本局被排除的升级 id
    /** Phase 17 §34：难度覆盖的 Rare 出现率（未设置时用 data/upgrades.js 的 RARE_CHANCE） */
    this.rareChanceOverride = null;
  }

  reset() {
    this.rerollUsedFree = 0;
    this.rerollCount = 0;
    this.banished.clear();
    this._noWeaponPicks = 0;   // §2.4 保底计数：连续无武器卡的选择次数
  }

  /** 当前 Rare 出现率（难度优先） */
  get rareChance() {
    return this.rareChanceOverride == null ? RARE_CHANCE : this.rareChanceOverride;
  }

  /* ---------------- Phase 16：Reroll / Banish ---------------- */

  /** 下一次重抽的花费；null = 本局已达上限 */
  rerollCost() {
    return this.rerollCount >= REROLL_CAP ? null : REROLL_COSTS[this.rerollCount];
  }

  /** 剩余重抽次数（含广告兜底：上限内即算还有） */
  rerollLeft() { return Math.max(0, REROLL_CAP - this.rerollCount); }

  /** 用 Scrap 重抽；返回是否成功 */
  rerollWithScrap(game) {
    const cost = this.rerollCost();
    if (cost === null) return false;
    if ((game.run.scrap || 0) < cost) return false;
    game.run.scrap -= cost;
    this.rerollCount++;
    if (cost === 0) this.rerollUsedFree++;
    return true;
  }

  /** 广告恢复的一次重抽（不消耗 Scrap，也不占免费额度） */
  rerollByAd() {
    if (this.rerollCount >= REROLL_CAP + 1) return false;   // 广告可多换 1 次
    this.rerollCount++;
    return true;
  }

  /** 排除一个升级：本局不再出现在三选一里 */
  banish(id, game) {
    if (!id || this.banished.has(id)) return false;
    if ((game.run.banishLeft || 0) <= 0) return false;
    this.banished.add(id);
    game.run.banishLeft--;
    return true;
  }

  /**
   * Phase C：统一候选校验（GDD §3.2~3.4 / §15.2）。
   * 检查：排除、叠加上限、前置、互斥、等级门槛。
   * 武器 / 装备卡由各自系统校验槽位，这里只处理被动与稀有卡。
   */
  canApply(u, stats, game = null) {
    if (!u || this.banished.has(u.id)) return false;
    if (u.kind) return true;   // 武器 / 装备候选交给各自生成器保证有效性
    const max = u.maxStacks;
    if (max != null && stats.taken(u.id) >= max) return false;
    const rarity = u.rarity || 'common';
    const gates = { common: 1, uncommon: 3, rare: 6, epic: 10, legendary: 15 };
    const lv = game && game.level ? game.level.level : 1;
    if (lv < (gates[rarity] || 1) && !u.rare) return false;  // 旧 Rare 走原投放逻辑
    for (const req of u.requires || []) if (stats.taken(req) <= 0) return false;
    for (const ex of u.excludes || []) if (stats.taken(ex) > 0) return false;
    return true;
  }

  /**
   * 软加权抽取（Phase 18 §28：升级为 BuildAwareOfferSystem —— 权重考虑当前 Build）
   * @param {PlayerStats} stats
   * @param {string[]} exclude
   * @param {import('../core/Game.js').Game} [game]
   */
  _weightedPick(stats, exclude = [], game = null) {
    const pool = this.pool.filter(
      (u) => !exclude.includes(u.id) && this.canApply(u, stats, game)
    );
    if (!pool.length) return null;
    const weights = pool.map(u => {
      const t = stats.taken(u.id);
      let w = 1 / (1 + t);              // 重复越多权重越低
      // §29 防止"Build 饿死"：与当前 Build 相关的卡权重更高，但仍保留其它方向
      if (game && game.build) w = game.build.offerWeight(u, w);
      // Phase C：稀有度权重（难度倍率 / luck / 等级门槛）——与既有加权相乘，不覆盖
      if (game) {
        const rw = rarityWeight(u, {
          playerLevel: game.level ? game.level.level : 1,
          luck: (stats.base && stats.base.luck) || 0,   // §3.3：luck 已从 PlayerStats 接入
          difficultyRarityMul: 1,
        });
        if (rw > 0) w *= Math.min(2.5, rw / 100); // common=1.0, uncommon=0.35… 归一化到 common
      }
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /**
   * 三选一（Phase 13）：武器卡（获得 / 强化）与被动卡混合。
   * 未达 §11 的目标件数时，第一张必定是武器卡，保证武器真的能拿齐。
   * @param {PlayerStats} stats
   * @param {import('../core/Game.js').Game} [game] 提供武器槽与玩家等级
   */
  pickThree(stats, game) {
    const out = [];
    const used = [];
    const usedWeaponIds = new Set();   // Phase B：同一轮同武器最多一种卡
    const lv = game && game.level ? game.level.level : 1;
    const wOffers = (game && game.weapons)
      ? buildWeaponOffers(game.weapons.slots, lv, game.weapons.progression)
      : [];
    const eOffers = (game && game.equipment) ? buildEquipmentOffers(game.equipment) : [];
    const allOffers = wOffers.concat(eOffers)
      .filter((o) => !this.banished.has(o.id));
    const owned = game && game.weapons ? game.weapons.count : 1;
    const target = targetWeaponCount(lv);

    // Phase 16 §64：Rare Upgrade 单独投放（等级 ≥ 6，22% 概率 × luck 微增益，每张只出现一次）
    const luckRare = 1 + Math.min((stats.base && stats.base.luck) || 0, 100) * 0.002;   // Luck100 → ×1.20
    let rareOffer = null;
    if (lv >= RARE_MIN_LEVEL && Math.random() < this.rareChance * luckRare) {
      const rares = RARE_UPGRADES.map(withMeta)
        .filter((r) => this.canApply(r, stats, game) && !stats.taken(r.id));
      if (rares.length) rareOffer = rares[(Math.random() * rares.length) | 0];
    }

    let safety = 16;
    if (rareOffer) { used.push(rareOffer.id); out.push(rareOffer); }
    // §30 防止"Build 过早锁死"：本局前 3 次三选一，第一张必须保留新方向（武器 / 战术）
    const totalPicks = stats.totalTaken ? stats.totalTaken() : 0;
    // §2.4 保底：连续 4 次三选一没拿武器卡 → 这次第一张必出武器卡
    const weaponPity = this._noWeaponPicks >= 4;
    /** Phase B：过滤掉"同武器已有卡"的候选（部署与研发/强化不能同轮出现） */
    const conflictFree = (arr) => arr.filter((o) => !o.weaponId || !usedWeaponIds.has(o.weaponId));
    while (out.length < 3 && safety-- > 0) {
      // 第一张：未达目标件数 / 前 3 次 / 保底触发时强制武器卡；之后 42% 概率出武器卡
      const wantWeapon = (out.length === 0 && (owned < target || totalPicks < 3 || weaponPity))
        || Math.random() < 0.42;
      const wPool = conflictFree(allOffers);
      // §2.4：强制武器卡时必须从"纯武器池"取（研发/强化/改装/部署），装备卡不算数；
      // 纯武器池为空才允许退化到混合池（保证三选一永远能凑满 3 张）
      const weaponOnly = conflictFree(allOffers.filter(
        (o) => o.kind === 'weapon' || o.kind === 'weaponLevel' || o.kind === 'weaponMod'
      ));
      let choice = null;
      if (wantWeapon && weaponOnly.length) choice = pickWeighted(weaponOnly, used);
      else if (wantWeapon && wPool.length) choice = pickWeighted(wPool, used);
      if (!choice) choice = this._weightedPick(stats, used, game);
      if (!choice || used.includes(choice.id)) continue;
      // 选中武器卡后锁定该武器，后续轮不再出现同武器的另一张卡
      if (choice.weaponId) usedWeaponIds.add(choice.weaponId);
      used.push(choice.id);
      out.push(choice);
    }
    // 兜底（池极小 / 全部重复）：只补未用且可应用的卡，绝不重复塞 pool[0]（GDD §3.4.7）
    for (const u of this.pool) {
      if (out.length >= 3) break;
      if (!used.includes(u.id) && this.canApply(u, stats, game)) {
        used.push(u.id);
        out.push(u);
      }
    }
    // 极端情况下池真的不足 3 张：返回实际数量，允许"当前没有可选升级"，不伪造重复卡

    // §30 结果级保证：前 3 次三选一里一定至少有一张"新方向"卡（武器 / 战术 / 被动）。
    // 上面的"第一张优先武器"会被 Rare 卡抢占首位而失效，这里做最终兜底替换。
    if (totalPicks < 3 && allOffers.length) {
      const isNew = (u) => u.kind === 'weapon' || u.kind === 'equip';       // 新武器 / 新装备
      const isLevel = (u) => u.kind === 'weaponLevel' || u.kind === 'equipLevel';
      if (!out.some(isNew)) {
        // 优先补"新件"；确实没有新件可给时才接受升级件（避免池空时强行替换）
        let pool2 = conflictFree(allOffers).filter(isNew);
        if (!pool2.length) pool2 = conflictFree(allOffers).filter(isLevel);
        if (pool2.length) {
          // 替换掉最后一张"非新方向、非 Rare"的卡，尽量不挤掉 Rare 与已有件
          let idx = -1;
          for (let k = out.length - 1; k >= 0; k--) {
            if (out[k] === rareOffer) continue;
            if (isNew(out[k]) || isLevel(out[k])) continue;
            idx = k; break;
          }
          if (idx < 0) {
            for (let k = out.length - 1; k >= 0; k--) {
              if (out[k] !== rareOffer) { idx = k; break; }
            }
          }
          if (idx >= 0) {
            const replacement = pickWeighted(pool2, used);
            if (replacement) { used.push(replacement.id); out[idx] = replacement; }
          }
        }
      }
    }
    return out;
  }

  /** 当前是否还能免费刷新 */
  canFreeReroll() { return this.rerollUsedFree < this.rerollFreeCap; }
  usedFreeReroll() { if (this.canFreeReroll()) this.rerollUsedFree++; }

  /**
   * 应用一次升级
   * @param {object} upgrade
   * @param {import('../core/Game.js').Game} game
   */
  apply(upgrade, game) {
    // §2.4 保底计数：武器类卡清零，其它卡累加（连续 4 次无武器卡 → 下次必出）
    if (upgrade.kind === 'weapon' || upgrade.kind === 'weaponLevel' || upgrade.kind === 'weaponMod') {
      this._noWeaponPicks = 0;
    } else {
      this._noWeaponPicks++;
    }
    // 0) Phase 13：武器卡走独立分支，不写 PlayerStats
    if (upgrade.kind === 'weapon') {
      game.acquireWeapon(upgrade.weaponId);
      return;
    }
    if (upgrade.kind === 'weaponLevel') {
      game.upgradeWeapon(upgrade.weaponId);
      return;
    }
    // Phase D：武器专属改装（未部署可预研）
    if (upgrade.kind === 'weaponMod') {
      game.addWeaponMod(upgrade.weaponId, upgrade.modId);
      return;
    }
    // Phase 14：装备（战术 / 被动）
    if (upgrade.kind === 'equip') {
      game.acquireEquipment(upgrade.equipId);
      return;
    }
    if (upgrade.kind === 'equipLevel') {
      game.upgradeEquipment(upgrade.equipId);
      return;
    }

    // 1) 写 PlayerStats
    game.stats.apply(upgrade);

    // 2) 同步武器瞬时属性（主武器 maxHeat/coolRate + 副武器导弹/高射炮）
    game.syncStats();

    // 3) 修复效果
    if (upgrade.repairPct) {
      const heal = game.base.maxHp * upgrade.repairPct;
      game.base.hp = Math.min(game.base.maxHp, game.base.hp + heal);
    }
    if (upgrade.maxHpMul) {
      // 重算上限（单一来源：基础值 × 局外永久成长 × 局内 maxHpMul）
      const oldMax = game.base.maxHp;
      game.base.maxHp = game.computeBaseMaxHp();
      // 同步提升当前生命（保持比例）
      game.base.hp = Math.min(game.base.maxHp, Math.round(game.base.hp * (game.base.maxHp / oldMax)));
    }
    if (upgrade.shield) {
      game.run.shield += upgrade.shield;
    }

    // 4) 反馈
    game.audio.reward();
    game.screens.toast('升级：' + upgrade.name, 'good');
  }
}

export default UpgradeManager;
