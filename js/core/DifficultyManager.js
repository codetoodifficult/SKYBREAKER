import { DIFFICULTIES, DIFFICULTY_ORDER, MAX_DIFFICULTY, difficultyOf, THREAT_COST } from '../data/difficulties.js';
import { ENDLESS_DEF } from '../data/endless.js';   // 无尽模式固定基线

/**
 * DifficultyManager（Phase 17，设计文档 §3 / §4 / §5 / §10 / §34）
 *
 * 职责：
 *   1. 保存难度解锁 / 通关记录 / 计数器（存在 meta.difficulty，旧档自动补字段）
 *   2. 提供当前难度的所有敌人侧倍率（§85：Difficulty 只作用于敌人侧，绝不削弱玩家）
 *   3. 结算时推进解锁（§4：靠通关推进，不靠钢材；D3 起追加 Clear Requirement）
 *
 * 解锁是"并集"（沿用 Phase 16 的经验）：
 *   达成解锁条件  OR  蓝图买断  OR  广告解锁（Phase 19）
 */
export class DifficultyManager {
  constructor(meta) {
    this.meta = meta || {};
    this.state = this._loadState();
    /** 本局是否已记录（防止重复结算） */
    this._settled = false;
  }

  /* ---------------- 存档 ---------------- */

  _loadState() {
    const def = {
      sel: 0,
      unlocked: { 0: true },      // { [d]: true }
      cleared: {},                // { [d]: true } 首通记录（§35 First Clear Reward）
      best: {},                   // { [d]: { wave, score, time, kills } }（§74 本地排行榜）
      counters: {
        eliteKills: 0,
        challenges: 0,
        buildScoreBest: 0,
        hardEventClears: 0,
        noReviveClears: 0,
        evolutionClears: 0,
        weaponClears: {},         // { weaponId: n }
      },
      /** Phase 19：广告解锁的额外路径记录 { [d]: true } */
      adUnlocked: {},
      /** 已领取的首通奖励（避免重复发） */
      claimed: {},
    };
    const s = Object.assign({}, def, this.meta.difficulty || {});
    s.unlocked = Object.assign({ 0: true }, s.unlocked || {});
    s.cleared = Object.assign({}, s.cleared || {});
    s.best = Object.assign({}, s.best || {});
    s.counters = Object.assign({}, def.counters, s.counters || {});
    s.counters.weaponClears = Object.assign({}, s.counters.weaponClears || {});
    s.adUnlocked = Object.assign({}, s.adUnlocked || {});
    s.claimed = Object.assign({}, s.claimed || {});
    if (s.sel == null || s.sel < 0 || s.sel > MAX_DIFFICULTY) s.sel = 0;
    this.meta.difficulty = s;
    return s;
  }

  save() { this.meta.difficulty = this.state; return this.state; }

  /* ---------------- 选择 ---------------- */

  get id() { return this.state.sel; }
  get def() { return this._endless ? ENDLESS_DEF : difficultyOf(this.state.sel); }

  /* ---------------- 无尽模式（固定基线） ---------------- */

  get endless() { return !!this._endless; }
  /** 切换到无尽模式：后续 def 返回固定的 D5 基线，不再读玩家所选难度 */
  setEndless(on) { this._endless = !!on; }

  select(d) {
    if (!this.isUnlocked(d)) return false;
    this.state.sel = d;
    this.save();
    return true;
  }

  /* ---------------- 解锁 ---------------- */

  isUnlocked(d) {
    if (d <= 0) return true;
    if (this.state.unlocked[d]) return true;
    return this.checkRequirement(d).ok;
  }

  /** 强制解锁（蓝图 / 广告等外部路径） */
  forceUnlock(d, path) {
    if (d <= 0) return false;
    if (this.state.unlocked[d]) return false;
    this.state.unlocked[d] = true;
    if (path === 'ad') this.state.adUnlocked[d] = true;
    this.save();
    return true;
  }

  isCleared(d) { return !!this.state.cleared[d]; }

  /**
   * 检查解锁条件（§4）
   * @returns {{ok:boolean, cur:number, need:number, text:string, clearOk:boolean}}
   */
  checkRequirement(d) {
    const u = DIFFICULTIES[d] ? DIFFICULTIES[d].unlock : null;
    if (!u) return { ok: true, cur: 1, need: 1, text: '', clearOk: true };

    const clearOk = u.clear == null ? true : !!this.state.cleared[u.clear];
    const req = u.req;
    if (!req) {
      return {
        ok: clearOk, cur: clearOk ? 1 : 0, need: 1, clearOk,
        text: clearOk ? '' : `需先通关 D${u.clear}`,
      };
    }

    const c = this.state.counters;
    let cur = 0, need = req.n || 1, text = req.text || '';
    switch (req.type) {
      case 'evolution':    cur = c.evolutionClears || 0; break;
      case 'eliteKills':   cur = c.eliteKills || 0; break;
      case 'weaponClear':  cur = (c.weaponClears && c.weaponClears[req.weapon]) || 0; break;
      case 'challenges':   cur = c.challenges || 0; break;
      case 'buildScore':   cur = c.buildScoreBest || 0; break;
      case 'hardEventClear': cur = c.hardEventClears || 0; break;
      case 'noReviveClear':  cur = c.noReviveClears || 0; break;
      default: cur = 0;
    }
    const ok = clearOk && cur >= need;
    if (!clearOk) text = `需先通关 D${u.clear} · ${text}`;
    return { ok, cur, need, text, clearOk };
  }

  /** 全部难度的展示信息（供 UI 直接渲染） */
  list() {
    return DIFFICULTY_ORDER.map((d) => {
      const def = DIFFICULTIES[d];
      const unlocked = this.isUnlocked(d);
      const r = this.checkRequirement(d);
      const best = this.state.best[d];
      return {
        id: d, def, unlocked,
        selected: this.state.sel === d,
        cleared: !!this.state.cleared[d],
        adUnlocked: !!this.state.adUnlocked[d],
        req: r,
        reqText: unlocked ? '' : r.text,
        best,
      };
    });
  }

  /* ---------------- 敌人侧倍率（§85） ---------------- */

  /** 同屏上限（§10） */
  get spawnCap() { return this.def.spawnCap; }
  /** 每秒威胁预算（§9） */
  get threatBudgetPerSec() { return this.def.threatBudgetPerSec; }
  get xpMul() { return this.def.xpMul; }
  get rewardMul() { return this.def.rewardMul; }
  get rareChance() { return this.def.rareChance; }
  get eliteChance() { return this.def.eliteChance; }
  get enemyCountMul() { return this.def.enemyCountMul; }
  get spawnRateMul() { return this.def.spawnRateMul; }
  get rules() { return this.def.rules; }
  /** 本波可投放的精英数（§67） */
  eliteBudgetForWave(waveNo) {
    const list = this.def.eliteBudget;
    const base = list[Math.min(waveNo, list.length) - 1] ?? 0;
    // 无尽模式：精英预算随波次抬升（每 3 波 +1），保持"精英 = 检查器"的压力
    if (this._endless) return base + Math.floor(waveNo / 3);
    return base;
  }

  /**
   * 把难度倍率写进敌人 cfg 副本（绝不修改 ENEMIES 原表）
   * @param {object} cfg
   * @param {boolean} isElite
   */
  scaleCfg(cfg, isElite = false) {
    const d = this.def;
    const hpMul = d.enemyHpMul * (isElite ? d.eliteHpMul : 1);
    const out = { ...cfg };
    out.hp = Math.max(1, Math.round(cfg.hp * hpMul));
    out.damage = Math.max(1, Math.round(cfg.damage * d.enemyDamageMul));
    out.speed = cfg.speed * d.enemySpeedMul;
    if (cfg.diveSpeed) out.diveSpeed = cfg.diveSpeed * d.enemySpeedMul;
    return out;
  }

  /** Boss 生命倍率（叠加设计文档 §35 的玩家等级缩放） */
  bossHpMul() { return this.def.bossHpMul; }
  bossDamageMul() { return this.def.bossDamageMul; }

  /** 单位威胁成本 */
  costOf(type) { return THREAT_COST[type] || 1; }

  /* ---------------- 局内计数 ---------------- */

  addEliteKill(n = 1) {
    this.state.counters.eliteKills = (this.state.counters.eliteKills || 0) + n;
  }
  addChallenge(n = 1) {
    this.state.counters.challenges = (this.state.counters.challenges || 0) + n;
  }
  reportBuildScore(v) {
    if (v > (this.state.counters.buildScoreBest || 0)) {
      this.state.counters.buildScoreBest = Math.round(v);
    }
  }

  /**
   * 通关结算（只调用一次，幂等）
   * @param {number} d 难度
   * @param {{wave:number,score:number,time:number,kills:number, eliteKills?:number,
   *          evolutions?:number, weapons?:string[], hardEvent?:boolean, revived?:boolean}} r
   * @returns {{firstClear:boolean, newlyUnlocked:number[], bestUpdated:boolean}}
   */
  settleClear(d, r) {
    const st = this.state;
    const res = { firstClear: false, newlyUnlocked: [], bestUpdated: false };

    // 1) 计数器（无论首通与否都累计）
    if (r.eliteKills) this.addEliteKill(r.eliteKills);
    if (r.challenges) this.addChallenge(r.challenges);
    if (r.buildScore) this.reportBuildScore(r.buildScore);
    if (r.evolutions > 0) st.counters.evolutionClears = (st.counters.evolutionClears || 0) + 1;
    if (r.hardEvent) st.counters.hardEventClears = (st.counters.hardEventClears || 0) + 1;
    if (!r.revived) st.counters.noReviveClears = (st.counters.noReviveClears || 0) + 1;
    if (r.weapons && r.weapons.length) {
      for (const w of r.weapons) {
        st.counters.weaponClears[w] = (st.counters.weaponClears[w] || 0) + 1;
      }
    }

    // 2) 排行榜（§74 本地）
    const b = st.best[d] || { wave: 0, score: 0, time: 0, kills: 0 };
    if ((r.score || 0) > b.score) {
      st.best[d] = { wave: r.wave || b.wave, score: r.score || 0, time: r.time || 0, kills: r.kills || 0 };
      res.bestUpdated = true;
    } else if (!st.best[d]) {
      st.best[d] = { wave: r.wave || 0, score: r.score || 0, time: r.time || 0, kills: r.kills || 0 };
    }
    if ((r.wave || 0) > (st.best[d].wave || 0)) st.best[d].wave = r.wave;
    if ((r.kills || 0) > (st.best[d].kills || 0)) st.best[d].kills = r.kills;

    // 3) 首通标记（§35）
    if (!st.cleared[d]) { st.cleared[d] = true; res.firstClear = true; }

    // 4) 推进下一档解锁
    const next = d + 1;
    if (next <= MAX_DIFFICULTY && !st.unlocked[next]) {
      if (this.checkRequirement(next).ok) res.newlyUnlocked.push(next);
    }
    // 低难度条件补齐后也可能解锁更后面的档（例如后来才拿到进化）
    for (let i = next + 1; i <= MAX_DIFFICULTY; i++) {
      if (st.unlocked[i]) continue;
      if (this.checkRequirement(i).ok) res.newlyUnlocked.push(i);
      else break;
    }

    this.save();
    return res;
  }

  /** 失败结算：只记排行榜，不计首通 */
  settleFail(d, r) {
    const st = this.state;
    if (r.eliteKills) this.addEliteKill(r.eliteKills);
    if (r.buildScore) this.reportBuildScore(r.buildScore);
    const b = st.best[d] || { wave: 0, score: 0, time: 0, kills: 0 };
    if ((r.wave || 0) > (b.wave || 0)) { st.best[d] = { ...b, wave: r.wave }; }
    if ((r.score || 0) > (b.score || 0)) { st.best[d] = { ...(st.best[d] || b), score: r.score }; }
    this.save();
  }

  /** 最高已解锁难度 */
  get highestUnlocked() {
    let m = 0;
    for (const d of DIFFICULTY_ORDER) if (this.isUnlocked(d)) m = d;
    return m;
  }

  /** 下一档（0 基）未解锁难度；全部解锁返回 null */
  get nextLocked() {
    for (const d of DIFFICULTY_ORDER) if (!this.isUnlocked(d)) return d;
    return null;
  }
}

export default DifficultyManager;
