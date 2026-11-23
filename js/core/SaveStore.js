/**
 * ============================================================================
 * SaveStore —— 纯本地存档（比赛版）
 * ----------------------------------------------------------------------------
 * 原作针对 TapTap 小程序做三层存档（宿主文件系统 / localStorage / 云存档）。
 * 比赛版是纯本地单机 H5，统一用 localStorage，并保留内存兜底。
 *
 * API 与线上版完全一致（get / set / flush / hasLocalSave / debugInfo /
 * hasFs / hasCloud），Game.js 无需改动；hasCloud 恒 false，云存档相关
 * 方法为空操作，_setupCloudRestore 因此天然不会触发。
 * ============================================================================
 */

const FILE_NAME = 'save.json';

export class SaveStore {
  constructor(opts = {}) {
    this.debug = !!opts.debug;
    this.data = {};
    this.ready = false;
    this.backend = 'memory';
    this.lastError = null;
    this.lastEvent = 'created';
    this._loadFromDisk();
  }

  _log(...a) { if (this.debug) console.log('[Save]', ...a); }

  get hasFs() { return false; }
  get hasCloud() { return false; }

  _lsOk() {
    try { return typeof localStorage !== 'undefined' && !!localStorage; }
    catch (_) { return false; }
  }

  _readLs() {
    try {
      if (!this._lsOk()) return null;
      const s = localStorage.getItem(FILE_NAME);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  _loadFromDisk() {
    const fromLs = this._readLs();
    if (fromLs && typeof fromLs === 'object') {
      this.data = fromLs;
      this.backend = 'localStorage';
    } else {
      this.data = {};
      this.backend = this._lsOk() ? 'localStorage(empty)' : 'memory';
    }
    this.ready = true;
    this._importLegacy();
    this._log('载入完成 · backend =', this.backend);
  }

  /** 老档迁移：把散键 skybreaker.meta.v1 收进 save.json 容器 */
  _importLegacy() {
    if (!this._lsOk()) return;
    const legacy = ['skybreaker.meta.v1'];
    let moved = false;
    for (const k of legacy) {
      if (this.data[k] !== undefined) continue;
      try {
        const s = localStorage.getItem(k);
        if (!s) continue;
        this.data[k] = JSON.parse(s);
        moved = true;
      } catch (_) { /* 坏档忽略 */ }
    }
    if (moved) { this.lastEvent = 'legacy.imported'; this.flush(); }
  }

  get hasLocalSave() { return !!(this.data && Object.keys(this.data).length); }

  _writeLs(obj) {
    if (!this._lsOk()) return false;
    try {
      localStorage.setItem(FILE_NAME, JSON.stringify(obj));
      for (const k in obj) {
        try { localStorage.setItem(k, JSON.stringify(obj[k])); } catch (_) { /* 单键失败不影响其它 */ }
      }
      return true;
    } catch (e) { return false; }
  }

  /** 读一个键 */
  get(key, def = null) {
    const v = this.data ? this.data[key] : undefined;
    return v === undefined ? def : v;
  }

  /** 写一个键并落盘 */
  set(key, value) {
    if (!this.data) this.data = {};
    this.data[key] = value;
    this.flush();
  }

  flush() {
    const obj = this.data || {};
    this._writeLs(obj);
    this.lastEvent = 'flush';
    return true;
  }

  /* 云存档 / 宿主文件系统：比赛版全部空操作 */
  syncCloud() { return false; }
  restoreFromCloud(cb) { if (cb) cb(false, null); }

  debugInfo() {
    return {
      backend: this.backend,
      hasTap: false, hasFs: false, hasCloud: false,
      keys: Object.keys(this.data || {}),
      lastError: this.lastError,
      lastEvent: this.lastEvent,
      cloudThrottled: false,
    };
  }
}

export default SaveStore;
