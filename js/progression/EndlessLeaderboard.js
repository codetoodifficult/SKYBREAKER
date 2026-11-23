/**
 * EndlessLeaderboard —— 无尽模式排行榜
 *
 * 设计：本地榜立即可用；远端排行榜只做**接口预留**，不内置任何后端。
 * 接入在线排行榜时，实现一个 provider（见 RemoteLeaderboardProvider 接口说明），
 * 然后调用 leaderboard.attachRemote(provider) 并把 ENDLESS.leaderboard.remoteEnabled 置 true。
 * 未接入时 UI 展示"本地榜"，提交按钮不报错（本地记录照常写入）。
 */

import { ENDLESS } from '../data/endless.js';

const CFG = ENDLESS.leaderboard;

/**
 * 远端排行榜 provider 接口（**预留，尚未实现**）
 * 接入时实现以下方法并 attachRemote：
 *
 *   class MyProvider {
 *     get enabled() { return true; }
 *     async submit(entry) { ... return { ok:true, rank: 12 } }   // 上传成绩
 *     async fetchTop(n)   { ... return [entry, ...] }            // 拉取榜单
 *     async fetchMe()     { ... return { rank, best } }          // 拉取本人最好成绩
 *   }
 */
export class RemoteLeaderboardProvider {
  get enabled() { return false; }
  /* eslint-disable class-methods-use-this */
  async submit() { throw new Error('remote leaderboard not configured'); }
  async fetchTop() { return []; }
  async fetchMe() { return null; }
}

export class EndlessLeaderboard {
  constructor(opts = {}) {
    this.storage = opts.storage || safeStorage();
    this.remote = null;                       // 由 attachRemote() 注入
    this.entries = this._load();
    this.lastSubmit = null;
  }

  /* ---------------- 远端接入点 ---------------- */

  /** 接入在线排行榜：传入实现了 submit/fetchTop/fetchMe 的 provider */
  attachRemote(provider) {
    this.remote = provider || null;
    return this.remote;
  }
  get remoteEnabled() {
    return !!(this.remote && this.remote.enabled) && CFG.remoteEnabled !== false;
  }

  /* ---------------- 本地榜 ---------------- */

  _load() {
    try {
      const raw = this.storage.getItem(CFG.storageKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  _save() {
    try {
      this.storage.setItem(CFG.storageKey, JSON.stringify(this.entries));
    } catch (e) { /* 隐私模式 / 配额满：静默降级，不影响游戏 */ }
  }

  /** 本地榜（按分数降序，最多 localSize 条） */
  board() {
    return this.entries.slice(0, CFG.localSize);
  }

  /** 历史最好成绩（最高分那一条） */
  best() {
    return this.entries.length ? this.entries[0] : null;
  }

  /** 是否已破纪录（提交前判断，用于 UI 高亮） */
  isNewRecord(score) {
    const b = this.best();
    return !b || score > b.score;
  }

  /**
   * 提交一局战绩
   * @param {{score:number, wave:number, kills?:number, timeSec?:number, build?:string}} e
   * @returns {{ok:boolean, rank:number, newRecord:boolean, entry:object, remote?:object}}
   */
  submit(e) {
    const entry = {
      score: Math.max(0, Math.round(e.score || 0)),
      wave: Math.max(0, Math.round(e.wave || 0)),
      kills: Math.max(0, Math.round(e.kills || 0)),
      timeSec: Math.max(0, Math.round(e.timeSec || 0)),
      build: e.build || '',
      date: Date.now(),
    };
    const newRecord = this.isNewRecord(entry.score);

    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score || b.wave - a.wave);
    this.entries = this.entries.slice(0, CFG.localSize);
    this._save();

    const rank = this.entries.indexOf(entry) + 1;   // 1 基；被挤出榜则为 0
    const out = { ok: true, rank, newRecord, entry };

    this.lastSubmit = out;

    // 远端（TapTap 官方榜）：异步上传，失败也不影响本地榜与结算流程
    this._submitRemote(entry);

    return out;
  }

  /** 异步提交到远端；结果存在 lastRemote，UI 可选展示（失败静默降级） */
  _submitRemote(entry) {
    if (!this.remoteEnabled || !this.remote || typeof this.remote.submit !== 'function') return;
    this.lastRemote = { ok: false, pending: true };
    try {
      Promise.resolve(this.remote.submit(entry))
        .then((r) => {
          this.lastRemote = r || { ok: false, why: '无返回' };
          if (this.onRemoteResult) this.onRemoteResult(this.lastRemote);
        })
        .catch((e) => {
          this.lastRemote = { ok: false, why: (e && e.message) || '提交异常' };
          if (this.onRemoteResult) this.onRemoteResult(this.lastRemote);
        });
    } catch (e) {
      this.lastRemote = { ok: false, why: (e && e.message) || '提交异常' };
    }
  }

  /* ---------------- 昵称（将来上传远端时用） ---------------- */

  get nickname() {
    try { return this.storage.getItem(CFG.nicknameKey) || ''; } catch (e) { return ''; }
  }
  setNickname(name) {
    try { this.storage.setItem(CFG.nicknameKey, String(name || '').slice(0, 12)); } catch (e) { /* noop */ }
  }

  clear() {
    this.entries = [];
    this._save();
  }
}

/** localStorage 兜底（测试环境 / 隐私模式下退化为内存存储） */
function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const k = '__sb_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    }
  } catch (e) { /* ignore */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

export default EndlessLeaderboard;
