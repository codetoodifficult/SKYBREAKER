import {
  ARCHETYPES, CROSS_BUILDS, BUILD_TAGS, MILESTONES, DISCOVERY_REWARD,
  archetypeProgress, TAG_NAMES,
} from '../data/builds.js';
import { BUILD_CORES, buildCoreById } from '../data/buildCores.js';
import { EVOLUTIONS } from '../data/evolution.js';

/**
 * BuildSystem（Phase 18，设计文档 §17~§18 / §26 / §28~§33 / §76）
 *
 * 职责：
 *   1. 实时统计 BuildTag（来自已获得的武器 / 装备 / 升级，数据在 data/builds.js）
 *   2. 计算流派进度（8 基础 + 6 混合）与 BuildScore（0~100，判断 Build 成熟度）
 *   3. Build Milestone：Tag 达到阈值时一次性写入 PlayerStats（§31）
 *   4. Build Discovery：首次达成流派 → 蓝图 + 钢材 + 图鉴（§33，跨局持久化）
 *   5. Build Core 的条件型加成（§22，开关式结算，避免逐帧漂移）
 *
 * 结算顺序（§85）：Build Core 位于 Difficulty 之后、Equipment 之后、Temporary 之前。
 * Build 只读玩家侧数据，绝不触碰敌人侧（§86）。
 */
export class BuildSystem {
  /** @param {import('../core/Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.tags = {};             // { tag: count }
    this.appliedMilestones = new Set();
    this.scoreVal = 0;
    this.bestId = null;
    this.bestProgress = 0;
    this._coreOn = {};          // 条件型核心的开关状态

    /** 跨局持久化（meta.builds） */
    const m = game.meta;
    if (!m.builds) m.builds = { discovered: {}, clears: {} };
    this.meta = m.builds;
  }

  /* ---------------- 重置（每局） ---------------- */

  reset() {
    this.tags = {};
    this.appliedMilestones.clear();
    this.scoreVal = 0;
    this.bestId = null;
    this.bestProgress = 0;
    this._coreOn = {};
  }

  /* ---------------- Tag 统计 ---------------- */

  /** 重新统计（每次获得 / 升级装备后调用） */
  rebuild() {
    const g = this.game;
    const t = {};

    const add = (id, n = 1) => {
      const list = BUILD_TAGS[id];
      if (!list) return;
      for (const tag of list) t[tag] = (t[tag] || 0) + n;
    };

    // 武器（含自动武器）—— 已获得才算
    if (g.weapons) for (const k in BUILD_TAGS) if (g.weapons.has(k)) add(k);

    // 装备（战术 + 被动）
    if (g.equipment) {
      for (const id of g.equipment.tactical.keys()) add(id);
      for (const id of g.equipment.passive.keys()) add(id);
    }

    // 升级（含 Rare）
    if (g.stats) {
      for (const id in g.stats.timesTaken) {
        const n = g.stats.timesTaken[id];
        if (n > 0 && BUILD_TAGS[id]) for (let i = 0; i < n; i++) add(id);
      }
    }

    this.tags = t;
    this._evalArchetypes();
    this._evalMilestones();
    return this.tags;
  }

  tagCount(tag) { return this.tags[tag] || 0; }

  /** Tag 汇总（HUD / Debug 面板） */
  tagSummary() {
    const out = [];
    for (const t in this.tags) if (this.tags[t] > 0) out.push(`${TAG_NAMES[t] || t} ${this.tags[t]}`);
    return out.join(' · ') || '无';
  }

  /* ---------------- 流派进度（§18 / §32） ---------------- */

  _evalArchetypes() {
    let best = null, bestP = 0;
    for (const a of [...ARCHETYPES, ...CROSS_BUILDS]) {
      const p = archetypeProgress(a, this.tags);
      a._progress = p;
      if (p > bestP) { bestP = p; best = a; }
    }
    this.bestId = best ? best.id : null;
    this.bestProgress = bestP;
  }

  progressOf(id) {
    const a = [...ARCHETYPES, ...CROSS_BUILDS].find((x) => x.id === id);
    return a ? archetypeProgress(a, this.tags) : 0;
  }

  get best() { return this.bestId ? [...ARCHETYPES, ...CROSS_BUILDS].find((x) => x.id === this.bestId) : null; }

  /**
   * BuildScore（§18）：不是"越高越强"，而是判断 Build 成熟度（0~100）。
   *   70% 来自最成熟流派的完成度
   *   30% 来自 Tag 多样性（最多 10 种）
   */
  score() {
    const distinct = Object.keys(this.tags).filter((t) => this.tags[t] > 0).length;
    const diversity = Math.min(distinct, 10) / 10;
    return Math.round(this.bestProgress * 70 + diversity * 30);
  }

  /* ---------------- Milestone（§31） ---------------- */

  _evalMilestones() {
    const g = this.game;
    for (const m of MILESTONES) {
      if (this.appliedMilestones.has(m.id)) continue;
      if (this.tagCount(m.tag) < m.at) continue;
      this.appliedMilestones.add(m.id);
      if (m.mods && g.stats) g.stats.apply(m.mods);
      if (m.flag) g.world.buildFlags = g.world.buildFlags || {};
      if (m.flag && g.world.buildFlags) g.world.buildFlags[m.flag] = true;
      if (g.syncStats) g.syncStats();
      if (g.screens) g.screens.toast(`★ BUILD 里程碑：${m.name} · ${m.desc}`, 'good');
      if (g.audio && g.audio.reward) g.audio.reward();
    }
  }

  /** 某个 Tag 的里程碑进度（HUD 显示 3/8 那种） */
  milestoneProgress(tag) {
    return MILESTONES.filter((m) => m.tag === tag && m.at <= this.tagCount(tag)).length;
  }

  /* ---------------- Build Core 条件加成（§22） ---------------- */

  /**
   * 每帧结算（Game._updateBattle 调用）。
   * 开关式：进入条件乘上、离开时除回。
   */
  update() {
    const g = this.game;
    const coreId = g.loadout && g.loadout.sel ? g.loadout.sel.build : null;
    const core = coreId ? buildCoreById(coreId) : null;

    // 1) 条件型核心
    for (const id in BUILD_CORES) {
      const c = BUILD_CORES[id];
      if (!c.cond) continue;
      const want = core && core.id === id ? this._condMet(c.cond) : false;
      if (want === !!this._coreOn[id]) continue;

      const m = c.mods || {};
      const b = g.stats.base;
      if (m.damageMul) b.damageMul = want ? b.damageMul * m.damageMul : b.damageMul / m.damageMul;
      if (m.fireRateMul) b.fireRateMul = want ? b.fireRateMul * m.fireRateMul : b.fireRateMul / m.fireRateMul;
      if (m.critChance) b.critChance = want ? b.critChance + m.critChance : b.critChance - m.critChance;
      this._coreOn[id] = want;
      if (want && g.screens) g.screens.toast(`★ ${c.name} 启动`, 'good');
    }

    // 2) 动态型核心（蜂群协议：自动武器数量 → 冷却缩减）
    if (core && core.dynamic === 'swarm') {
      const autos = g.weapons ? g.weapons.secondaries.length : 0;
      const mul = Math.max(0.6, 1 - 0.05 * autos);
      const b = g.stats.base;
      const cur = this._coreOn._swarm || 1;
      if (mul !== cur) {
        b.weaponCdMul = b.weaponCdMul / cur * mul;
        this._coreOn._swarm = mul;
      }
    } else if (this._coreOn._swarm) {
      const b = g.stats.base;
      b.weaponCdMul = b.weaponCdMul / this._coreOn._swarm;
      this._coreOn._swarm = 1;
    }
  }

  _condMet(cond) {
    const g = this.game;
    if (cond.type === 'heat') {
      const w = g.weapons ? g.weapons.primary : null;
      if (!w) return false;
      const max = w._effectiveMaxHeat || w.cfg.maxHeat;
      return max > 0 && w.heat / max > cond.value;
    }
    if (cond.type === 'shield') return (g.run.shield || 0) > 0;
    if (cond.type === 'locked') return !!g.aim.assistTarget;
    return false;
  }

  /* ---------------- Discovery（§33 / §52 / §73） ---------------- */

  isDiscovered(id) { return !!this.meta.discovered[id]; }

  /** 达成流派时调用（跨局幂等） */
  discover(id) {
    if (this.isDiscovered(id)) return null;
    const a = [...ARCHETYPES, ...CROSS_BUILDS].find((x) => x.id === id);
    if (!a) return null;
    this.meta.discovered[id] = { clears: 0, bestD: 0, bestWave: 0, bestCombo: 0 };
    const g = this.game;
    g.meta.blueprint = (g.meta.blueprint || 0) + DISCOVERY_REWARD.blueprint;
    g.meta.steel = (g.meta.steel || 0) + DISCOVERY_REWARD.steel;
    g.saveMeta();
    g.screens.toast(`🔍 BUILD 发现：${a.name} · 蓝图 +${DISCOVERY_REWARD.blueprint} 钢材 +${DISCOVERY_REWARD.steel}`, 'good');
    if (g.audio.reward) g.audio.reward();
    return a;
  }

  /** 结算时：本局达成的流派计数 + 记录最高纪录（§73） */
  recordClear(difficulty, wave, combo) {
    const all = [...ARCHETYPES, ...CROSS_BUILDS];
    // §33：达成即发现（未发现的先补发现，再计入战绩）
    for (const a of all) {
      if (a._progress >= 1 && !this.isDiscovered(a.id)) this.discover(a.id);
    }
    for (const a of all) {
      if (a._progress < 1 || !this.isDiscovered(a.id)) continue;
      const rec = this.meta.discovered[a.id];
      rec.clears = (rec.clears || 0) + 1;
      rec.bestD = Math.max(rec.bestD || 0, difficulty);
      rec.bestWave = Math.max(rec.bestWave || 0, wave);
      rec.bestCombo = Math.max(rec.bestCombo || 0, combo || 0);
    }
  }

  /** 供难度解锁（§4 D7 需要 BuildScore 60）与结算页使用 */
  report() {
    return {
      score: this.score(),
      best: this.best ? { id: this.best.id, name: this.best.name, sub: this.best.sub } : null,
      progress: this.bestProgress,
      tags: { ...this.tags },
    };
  }

  /* ---------------- BuildAwareOfferSystem（§28 / §29 / §30） ---------------- */

  /**
   * 给三选一加权：引导而不是强制（§29）。
   *   - 与当前 Build 相关的 Tag → 权重 ×(1 + 0.35 × 相关 Tag 数)
   *   - 未完成的 Evolution 方向 → 额外 ×1.3
   *   - 前 3 次三选一：至少保留 1 个新方向（§30 由 UpgradeManager 保证，这里提供权重）
   */
  offerWeight(upgradeOrOffer, baseWeight = 1) {
    const g = this.game;
    const list = BUILD_TAGS[upgradeOrOffer.id];
    if (!list || !list.length) return baseWeight;
    let rel = 0;
    for (const t of list) rel += Math.min(3, this.tagCount(t));
    let w = baseWeight * (1 + 0.35 * rel);
    // 未完成进化方向加权（§28）
    if (g.evolution) {
      for (const ev of EVOLUTIONS) {
        if (g.evolution.flags[ev.id]) continue;
        if (ev.weapon === upgradeOrOffer.weaponId || ev.module === upgradeOrOffer.equipId) w *= 1.3;
      }
    }
    return w;
  }
}

export default BuildSystem;
