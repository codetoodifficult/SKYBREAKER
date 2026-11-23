import { availableFormations, SINGLE_FORMATION } from '../data/formations.js';
import { SPAWN_RATE_SCALE } from '../data/difficulties.js';
import { ThreatBudget, BUDGET_TIME_UNIT } from './ThreatBudget.js';
import { CONFIG } from '../data/config.js';
import { rand, pick } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;

/** 特殊单位：按波次表设计的"时间点"投放，不走编队（保留波次身份） */
const SPECIAL = new Set(['boss', 'ewPlane', 'transport', 'heavyBomber', 'aceFighter',
  'supportDrone', 'shieldCarrier', 'hunterDrone']);
/** 特殊单位的同波数量硬上限（避免 D10 把整波刷成电子战机） */
const SPECIAL_CAP = { boss: 1, ewPlane: 2, transport: 4, heavyBomber: 3, aceFighter: 6,
  supportDrone: 2, shieldCarrier: 2, hunterDrone: 4 };
/** 精英升级路径（§6：精英插入，而不是无脑堆小飞机） */
const ELITE_OF = { fighter: 'aceFighter', bomber: 'heavyBomber' };

/**
 * SpawnDirector（Phase 17，设计文档 §6 / §7 / §8 / §9 / §10 / §67）
 *
 * WaveManager 负责"节奏"（prepare → active → clear → rest），
 * Director 负责"内容"（这一秒天空里应该出现什么、以什么编队、从哪个方向）。
 *
 * 三条硬规则：
 *   1. 数量由【波次配额 × enemyCountMul】决定，不是把所有数字乘 3
 *   2. 密度由【编队 + 投放速率】决定，特殊单位仍按波次表的设计时间点出现
 *   3. 同屏达到 spawnCap 的 80% 时降低小飞机权重（§10），避免"无脑小飞机填满屏幕"
 */
export class SpawnDirector {
  constructor(game) {
    this.game = game;
    this.budget = new ThreatBudget();
    this.groups = [];
    this.pending = [];        // 编队内的延迟出场
    this.elapsed = 0;
    this.index = -1;
    this.waveDef = null;
    this.eliteLeft = 0;
    this.eliteSpawned = 0;
    this.maxRate = 1;
    this.spawned = 0;
    this.enabled = true;
    // Phase 20 §37：SKYBREAKER CORE 的刷怪代价（beginWave 时按 run.spawnRateMul 刷新）
    this.rateMul = 1;
  }

  /** @returns {import('../core/DifficultyManager.js').DifficultyManager} */
  get dm() { return this.game.difficulty; }

  reset() {
    this.groups.length = 0;
    this.pending.length = 0;
    this.elapsed = 0;
    this.index = -1;
    this.eliteLeft = 0;
    this.spawned = 0;
  }

  /* ------------------------------------------------------------------ */
  /** 开波：把 WAVES 的 comp 翻译成"配额 + 时间表 + 预算" */
  beginWave(index, waveDef) {
    const dm = this.dm;
    const d = dm.def;
    this.index = index;
    this.waveDef = waveDef;
    this.elapsed = 0;
    this.pending.length = 0;
    this.spawned = 0;
    this.eliteSpawned = 0;

    // 无尽模式：数量按波次线性放大（§ 递增曲线）
    this.countMul = (this.game.run && this.game.run.endlessCountMul) || 1;
    this.groups = (waveDef.comp || []).map((grp) => {
      const target = this._scaleCount(grp.type, grp.count, d.enemyCountMul * this.countMul);
      return {
        type: grp.type,
        target,
        remaining: target,
        earliest: grp.delay || 0,
        // 比赛版：下限也按同一系数缩放，否则高难度 3 倍频率会被 0.28s 下限截断
        gap: Math.max(0.28 / SPAWN_RATE_SCALE, (grp.interval || 1.5) / d.spawnRateMul),
        next: grp.delay || 0,
      };
    });

    // 精英预算（§67）：有节奏地投放，而不是一直刷
    this.eliteLeft = dm.eliteBudgetForWave(waveDef.id || (index + 1));

    // 预算速率：配额总量 / 投放窗口（窗口越短 → 越密集）
    let quotaCost = 0;
    for (const g of this.groups) quotaCost += g.target * dm.costOf(g.type);
    const window = (waveDef.maxSec || 90) * 0.72;
    const rate = Math.max(0.1, quotaCost / window);

    this.budget.beginWave({ rate, cap: dm.spawnCap });
    this.maxRate = dm.threatBudgetPerSec / BUDGET_TIME_UNIT;   // §9 压力天花板
    // Phase 20 §37：SKYBREAKER CORE 的代价 —— 敌人刷怪 +15%
    this.rateMul = this.game.run && this.game.run.spawnRateMul ? this.game.run.spawnRateMul : 1;
    // 比赛版：预算积累同步 ×3，否则 pool 成为瓶颈、组内间隔缩了也刷不出来
    this.budget.rate = Math.max(0.05, rate * this.rateMul * SPAWN_RATE_SCALE);

    // Phase 20 §43~§46：战略支援单位按难度规则插入（保留波次身份，走时间表）
    const waveNo = waveDef.id || (index + 1);
    const extra = [];
    if (d.rules.supportUnits && waveNo >= 4) {
      extra.push({ type: 'supportDrone', target: waveNo >= 8 ? 2 : 1, earliest: 6, gap: 26, next: 6 });
    }
    if (d.rules.shieldCarrier && waveNo >= 5) {
      extra.push({ type: 'shieldCarrier', target: 1, earliest: 11, gap: 32, next: 11 });
    }
    if (d.rules.hunterDrone && waveNo >= 6) {
      extra.push({ type: 'hunterDrone', target: waveNo >= 9 ? 3 : 2, earliest: 4, gap: 9, next: 4 });
    }
    this.groups.push(...extra);
  }

  _scaleCount(type, count, mul) {
    if (type === 'boss') return 1;
    const raw = Math.round(count * mul);
    const cap = SPECIAL_CAP[type];
    if (cap) return Math.max(1, Math.min(cap, raw));
    return Math.max(1, raw);
  }

  /* ------------------------------------------------------------------ */

  /** WaveManager 用：本波是否已投放完毕 */
  finished() {
    if (!this.enabled) return true;
    for (const g of this.groups) if (g.remaining > 0) return false;
    return this.pending.length === 0;
  }

  /** 超时续时后强制收尾：放弃剩余配额，避免波次永远结束不了 */
  forceFinish() {
    this.pending.length = 0;
    for (const g of this.groups) g.remaining = 0;
  }

  update(dt, world) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.budget.update(dt, world.enemies ? world.enemies.count : 0, this.maxRate);

    // 1) 编队内延迟出场
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t > 0) continue;
      this.pending.splice(i, 1);
      this._spawnOne(p.type, p.x, p.y, p.elite);
    }

    if (this.budget.blocked) return;

    // 2) 特殊单位：按设计时间点投放（Boss / EW / Transport / Heavy / Ace）
    this._spawnSpecials(world);

    // 3) 编队投放：消耗威胁预算
    this._spawnFormation(world);
  }

  _spawnSpecials() {
    const dm = this.dm;
    for (const g of this.groups) {
      if (!SPECIAL.has(g.type) || g.remaining <= 0) continue;
      if (this.elapsed < g.next) continue;
      if (this.budget.blocked) return;

      const cost = dm.costOf(g.type);
      // Boss 不计预算（它自带阶段援军，且波次以击杀 Boss 为结算条件）
      if (g.type !== 'boss' && !this.budget.canAfford(cost)) continue;

      const y = this._baseY(g.type);
      const fromLeft = Math.random() < 0.5;
      const x = fromLeft ? -60 : W + 60;
      if (g.type === 'boss') this._spawnOne(g.type, W / 2, y, false);
      else this._spawnOne(g.type, x, y, false);

      if (g.type !== 'boss') this.budget.spend(cost);
      g.remaining--;
      g.next = this.elapsed + g.gap;
    }
  }

  _spawnFormation() {
    const dm = this.dm;
    const d = dm.def;
    if (this.budget.pool < 1) return;

    const cands = availableFormations(d.id, d.rules.doubleFormation);
    const scored = [];
    for (const c of cands) {
      const f = c.f;
      if (f.cost > this.budget.pool) continue;
      let ok = true, demand = 0;
      for (const u of f.units) {
        const g = this.groups.find((x) => x.type === u.type);
        if (!g || g.remaining <= 0) { ok = false; break; }
        demand += g.remaining;
      }
      if (!ok) continue;
      let w = c.w * (0.5 + demand / 8);
      // §10：同屏拥挤 → 降低小飞机 / 集群编队权重
      if (f.tags.includes('light') || f.tags.includes('swarm')) w *= this.budget.lightWeightMul;
      scored.push({ f, w });
    }

    let chosen = null;
    // 精英插入（§6 / §13 D3）：精英预算有剩时优先精英编队
    if (d.rules.eliteBoost && this.eliteLeft > 0 && Math.random() < d.eliteChance) {
      const eliteForms = scored.filter((s) => s.f.tags.includes('elite'));
      if (eliteForms.length) chosen = weightedPick(eliteForms);
    }
    if (!chosen && scored.length) chosen = weightedPick(scored);

    if (chosen) {
      if (!this.budget.spend(chosen.f.cost)) return;
      this._emitFormation(chosen.f);
      return;
    }

    // 兜底：没有合适编队时，把配额最多的常规单位单只投放（保证配额能排空）
    let best = null;
    for (const g of this.groups) {
      if (SPECIAL.has(g.type) || g.remaining <= 0) continue;
      if (!best || g.remaining > best.remaining) best = g;
    }
    if (!best) return;
    const cost = dm.costOf(best.type);
    if (!this.budget.canAfford(cost)) return;
    this.budget.spend(cost);
    const y = this._baseY(best.type);
    const fromLeft = Math.random() < 0.5;
    this._spawnOne(best.type, fromLeft ? -60 : W + 60, y, false);
    best.remaining--;
  }

  _emitFormation(f) {
    const dm = this.dm;
    const d = dm.def;
    const side = f.sides === 'both' ? 0 : (Math.random() < 0.5 ? -1 : 1);   // -1 左入场，+1 右入场
    const baseY = this._baseY(f.units[0].type);

    // 精英升级：把队长的机型升为精英型（消耗队长所在配额 + 1 点精英预算）
    let eliteIdx = -1;
    if (d.rules.eliteBoost && this.eliteLeft > 0 && Math.random() < d.eliteChance) {
      for (let i = 0; i < f.units.length; i++) {
        if (ELITE_OF[f.units[i].type]) { eliteIdx = i; break; }
      }
    }

    for (let i = 0; i < f.units.length; i++) {
      const u = f.units[i];
      let type = u.type;
      let elite = false;
      if (i === eliteIdx && this.eliteLeft > 0) {
        type = ELITE_OF[u.type];
        elite = true;
        this.eliteLeft--;
        this.eliteSpawned++;
      }
      const g = this.groups.find((x) => x.type === u.type);
      if (g) g.remaining--;

      const dir = f.sides === 'both' ? (u.side || -1) : side;   // -1 = 从左往右
      const originX = dir < 0 ? -60 : W + 60;
      const x = originX - dir * (u.back || 0);
      const y = clampY(baseY + (u.vert || 0));
      if (u.delay > 0) this.pending.push({ type, x, y, elite, t: u.delay });
      else this._spawnOne(type, x, y, elite);
    }
  }

  _spawnOne(type, x, y, elite) {
    const world = this.game.world;
    if (!world || !world.spawnEnemy) return;
    if (this.game.enemies && this.game.enemies.count >= this.dm.spawnCap) return;
    const e = world.spawnEnemy(type, x, y, { elite: !!elite });
    if (e) this.spawned++;
  }

  /** 各机型的进场高度（沿用原 WaveManager 的经验值） */
  _baseY(type) {
    if (type === 'ewPlane') return 80;
    if (type === 'bomber' || type === 'boss' || type === 'heavyBomber' || type === 'transport') return 100;
    if (type === 'drone') return 200;
    if (type === 'aceFighter') return rand(90, 220);
    if (type === 'hunterDrone') return rand(120, 300);
    return rand(60, 300);
  }

  /* ---------------- Debug / HUD ---------------- */

  debugInfo() {
    return {
      wave: this.index + 1,
      budget: +this.budget.pool.toFixed(1),
      rate: +this.budget.rate.toFixed(2),
      cap: this.budget.spawnCap,
      count: this.budget.enemyCount,
      eliteLeft: this.eliteLeft,
      pending: this.pending.length,
    };
  }
}

function clampY(y) { return Math.max(50, Math.min(CONFIG.WORLD_GROUND_Y - 180, y)); }

function weightedPick(list) {
  let total = 0;
  for (const s of list) total += s.w;
  let r = Math.random() * total;
  for (const s of list) { r -= s.w; if (r <= 0) return s; }
  return list[list.length - 1];
}

export default SpawnDirector;
