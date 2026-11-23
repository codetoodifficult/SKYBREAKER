/**
 * 程序合成音效（Web Audio API）
 * 音效不依赖任何外部音频文件：oscillator + noise + filter + gain 直接合成军用电子音。
 * BGM 使用外部音频文件（HTMLAudioElement），走独立低音量通道，
 * 只有音量与播放/暂停受本类管理，不经过 SFX 的 master 增益，避免被音效峰值盖住。
 */

/** 战斗 BGM 资源路径 */
const BGM_SRC = 'assets/audio/battle.mp3';
/** UI 按钮点击音效（外部素材：320181__dland__hint.wav，已转单声道 44.1kHz） */
const CLICK_SRC = 'assets/audio/ui_click.wav';
/** 点击音效音量（相对 master） */
const CLICK_VOLUME = 0.55;
/** 点击音效节流：同一帧内"全局委托 + 按钮自身回调"会各触发一次，靠这个去重 */
const CLICK_THROTTLE = 0.04;
/** 点击音效最大尝试次数（网络抖动要能重试，别一次失败就永久静音） */
const CLICK_MAX_ATTEMPTS = 3;
/** BGM 基准音量（相对 master 0.55 归一；战斗时约为音效的 30%） */
const BGM_BASE_VOLUME = 0.16;
/** 淡入 / 淡出时长（秒） */
const BGM_FADE = 0.8;

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
    this._noiseBuf = null;
    this._lastShot = 0;
    this._lastClick = -1;     // 点击音效节流时间戳

    /** UI 点击素材（解码后的 AudioBuffer；未加载完 / 加载失败则回退到合成音） */
    this._clickBuf = null;
    this._clickRaw = null;      // 提前下载好的原始字节（不需要 AudioContext）
    this._clickLoading = false;
    this._clickAttempts = 0;    // 已尝试次数（网络抖动要能重试，不能一次失败就永久禁用）

    /** BGM */
    this.bgm = null;            // HTMLAudioElement
    this.bgmReady = false;      // 是否成功创建了音频元素
    this.bgmWanted = false;     // 目标状态（战斗=true）
    this.bgmLevel = 0;          // 当前淡入淡出进度 0~1
    this._bgmBroken = false;    // 加载失败则彻底放弃，不再报错
  }

  /** 必须在用户手势中调用一次（浏览器自动播放策略） */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch (_) {
      this.enabled = false;
    }
    // 有 ctx 了才能解码素材，这里顺手把点击音效解出来
    // （异步，失败自动回退合成音；字节若已提前下载好这里会直接解码）
    this.preloadClick();
    this._loadClick();
  }

  /** 素材是否彻底不可用（多次重试仍失败） */
  get clickBroken() { return this._clickAttempts >= CLICK_MAX_ATTEMPTS; }

  /**
   * 提前把点击音效的字节下载下来（**不需要 AudioContext**，可在 unlock 之前调用）。
   * 目的是让下载与 BGM 等大文件错开，第一次点击就有真实素材可用。
   */
  /** 是否具备下载素材的运行环境（Node 无头测试里没有 location，fetch 相对路径会报错） */
  get _canFetch() {
    return typeof fetch === 'function' && typeof window !== 'undefined' && !!window.location;
  }

  async preloadClick() {
    if (this._clickRaw || this._clickBuf || this._clickFetching || this.clickBroken) return;
    if (!this._canFetch) return;
    this._clickFetching = true;
    try {
      const res = await fetch(CLICK_SRC);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ab = await res.arrayBuffer();
      if (ab && ab.byteLength) this._clickRaw = ab;
      else throw new Error('空响应');
      this._clickAttempts = 0;        // 下载成功，重置失败计数
    } catch (e) {
      this._clickAttempts++;
      this._warnClick(e);
    } finally {
      this._clickFetching = false;
      // 字节到位了就顺手解码（此时可能已经有 ctx 了）
      this._loadClick();
    }
  }

  /**
   * 解码点击音效。优先用已下载的字节；没有就边下边解。
   * 失败只累加计数，达到上限才彻底放弃 —— 网络抖动不会永久静音。
   */
  async _loadClick() {
    if (this._clickBuf || this._clickLoading || this.clickBroken) return;
    if (!this.ctx || !this.ctx.decodeAudioData) return;

    this._clickLoading = true;
    try {
      let ab = this._clickRaw;
      if (!ab) {
        if (!this._canFetch) return;
        const res = await fetch(CLICK_SRC);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        ab = await res.arrayBuffer();
      }
      if (!ab || !ab.byteLength) throw new Error('空响应');

      // 老 Safari 的 decodeAudioData 是回调式，这里两种都兼容
      const decoded = await new Promise((resolve, reject) => {
        const p = this.ctx.decodeAudioData(ab, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
      this._clickBuf = decoded;
      this._clickRaw = null;          // ArrayBuffer 已被解码消耗，不能复用
      this._clickAttempts = 0;
    } catch (e) {
      this._clickAttempts++;
      this._clickRaw = null;
      this._warnClick(e);
    } finally {
      this._clickLoading = false;
    }
  }

  _warnClick(e) {
    if (typeof console === 'undefined') return;
    console.warn(`[Audio] 点击音效加载失败（第 ${this._clickAttempts}/${CLICK_MAX_ATTEMPTS} 次），回退合成音：`, e && (e.message || e));
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
    this._applyBgmVolume();
  }

  /* ================================================================== */
  /* BGM                                                                 */
  /* ================================================================== */

  /** 惰性创建 BGM 元素（浏览器自动播放策略：必须在用户手势之后再 play） */
  _ensureBgm() {
    if (this.bgm || this._bgmBroken || typeof Audio === 'undefined') return;
    try {
      const a = new Audio(BGM_SRC);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      a.addEventListener('error', () => { this._bgmBroken = true; this.bgmWanted = false; });
      this.bgm = a;
      this.bgmReady = true;
    } catch (_) {
      this._bgmBroken = true;
    }
  }

  /** 实际音量 = 基准音量 × 淡入淡出进度 × (主音量 / 默认主音量) */
  _applyBgmVolume() {
    if (!this.bgm) return;
    const scale = this.volume / 0.55;
    const v = BGM_BASE_VOLUME * this.bgmLevel * scale;
    this.bgm.volume = Math.max(0, Math.min(1, v));
  }

  /**
   * 设置是否需要战斗 BGM（每帧调用即可，内部会自行去重）
   * @param {boolean} wanted 战斗中=true
   */
  setBattleBgm(wanted) {
    this.bgmWanted = !!wanted;
    if (!this.bgmWanted) return;
    this._ensureBgm();
    if (!this.bgm || this._bgmBroken) return;
    if (this.bgm.paused) {
      // 自动播放被拦截时静默失败，等下一次用户手势再试
      const p = this.bgm.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  /** 主循环驱动：处理淡入淡出与"淡完即停" */
  update(dt) {
    if (!this.bgm || this._bgmBroken) return;

    const target = this.bgmWanted ? 1 : 0;
    if (this.bgmLevel !== target) {
      const step = dt / BGM_FADE;
      this.bgmLevel = target > this.bgmLevel
        ? Math.min(target, this.bgmLevel + step)
        : Math.max(target, this.bgmLevel - step);
      this._applyBgmVolume();
    }

    if (!this.bgmWanted && this.bgmLevel <= 0 && !this.bgm.paused) {
      this.bgm.pause();   // 保留播放进度，恢复战斗时从原处继续
    }
  }

  get _ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  _env(node, t0, attack, decay, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  /** 机炮射击：短噪声爆 + 低频方波 "咚" */
  shoot() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    if (t0 - this._lastShot < 0.045) return;   // 节流，防止高射速下爆音
    this._lastShot = t0;

    // 噪声爆
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    src.playbackRate.value = 1.6;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.9;
    src.connect(bp);
    this._env(bp, t0, 0.002, 0.055, 0.16);
    src.start(t0);
    src.stop(t0 + 0.1);

    // 低频体感
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(180, t0);
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.06);
    this._env(o, t0, 0.002, 0.06, 0.1);
    o.start(t0);
    o.stop(t0 + 0.12);
  }

  /** 命中金属声 */
  hit() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1400, t0);
    o.frequency.exponentialRampToValueAtTime(560, t0 + 0.05);
    this._env(o, t0, 0.001, 0.05, 0.07);
    o.start(t0); o.stop(t0 + 0.1);
  }

  /** 爆炸：噪声 + 低通扫频 + 低频轰鸣 */
  explosion(scale = 1) {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    src.playbackRate.value = 0.55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t0);
    lp.frequency.exponentialRampToValueAtTime(120, t0 + 0.5 * scale);
    src.connect(lp);
    this._env(lp, t0, 0.005, 0.45 * scale, 0.3 * Math.min(1.6, scale));
    src.start(t0); src.stop(t0 + 1.0 * scale);

    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(34, t0 + 0.35);
    this._env(o, t0, 0.004, 0.4, 0.28 * Math.min(1.5, scale));
    o.start(t0); o.stop(t0 + 0.6);
  }

  /** 基地受创警报 */
  alarm() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t0);
    o.frequency.linearRampToValueAtTime(300, t0 + 0.22);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 14;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(o.frequency);
    this._env(o, t0, 0.01, 0.3, 0.1);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + 0.4); lfo.stop(t0 + 0.4);
  }

  /** 过热警告（连续短蜂鸣） */
  overheat() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 880;
      this._env(o, t0 + i * 0.09, 0.002, 0.05, 0.06);
      o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.09);
    }
  }

  /** 导弹发射（上扫 whoosh） */
  missile() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(880, t0 + 0.18);
    this._env(o, t0, 0.01, 0.2, 0.07);
    o.start(t0); o.stop(t0 + 0.24);
  }

  /** 高射炮开火（低沉 punch） */
  flak() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    src.playbackRate.value = 0.5;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    src.connect(lp);
    this._env(lp, t0, 0.002, 0.14, 0.2);
    src.start(t0); src.stop(t0 + 0.2);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 0.12);
    this._env(o, t0, 0.002, 0.12, 0.12);
    o.start(t0); o.stop(t0 + 0.18);
  }

  /**
   * 按钮点击音效（外部素材 ui_click.wav）。
   * 全局委托监听 + 按钮自身回调会各触发一次，这里用节流去重，避免叠成两声。
   */
  click() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    if (t0 - this._lastClick < CLICK_THROTTLE) return;
    this._lastClick = t0;

    // 素材没解码好（或 fetch 失败）时，退回原来的合成"滴"，保证永远有反馈
    if (!this._clickBuf) {
      if (!this._clickLoading && !this.clickBroken) this._loadClick();
      this._synthClick(t0);
      return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = this._clickBuf;
    const g = this.ctx.createGain();
    g.gain.value = CLICK_VOLUME;
    src.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  /** 合成兜底点击音（原 ui() 的音色） */
  _synthClick(t0) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t0);
    o.frequency.exponentialRampToValueAtTime(990, t0 + 0.06);
    this._env(o, t0, 0.002, 0.07, 0.06);
    o.start(t0); o.stop(t0 + 0.12);
  }

  /** UI 点击 */
  ui() {
    if (!this._ok) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(990, this.ctx.currentTime + 0.06);
    this._env(o, this.ctx.currentTime, 0.002, 0.07, 0.06);
    o.start(this.ctx.currentTime); o.stop(this.ctx.currentTime + 0.12);
  }

  /** 广告奖励到账（后续 Phase 用） */
  reward() {
    if (!this._ok) return;
    const t0 = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      this._env(o, t0 + i * 0.07, 0.01, 0.18, 0.09);
      o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + 0.3);
    });
  }
}

export default AudioManager;
