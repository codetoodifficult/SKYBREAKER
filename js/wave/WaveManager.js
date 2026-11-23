import { WAVES } from '../data/waves.js';
import { CONFIG } from '../data/config.js';

const W = CONFIG.WORLD.WIDTH;

const PREPARE_SEC = 2.5;     // 警告 → 开战的准备时间
const CLEAR_SEC   = 2.2;     // 清场后的短暂休息
const REST_SEC    = 2.0;     // 下一波警告之前的真空期
const TOTAL_WAVES = WAVES.length;
const DEFAULT_MAX_SEC = 90;  // 未配置 maxSec 时的兜底最长持续时间

/**
 * WaveManager —— 10 波节奏控制
 * 状态机：
 *   idle    → 尚未开始
 *   prepare → 倒计时警告（UI 显示 WAVE N）
 *   active  → 持续按 spawnQueue 推怪
 *   clear   → 该波全部出场+全灭，进入短暂奖励
 *   rest    → 通关空隙，可接 WAVE_BREAK 插屏
 *   done    → 全部通关，触发胜利
 *
 * 对外回调：
 *   onPrepare(idx) / onActive(idx) / onClear(idx) / onRest(idx) / onDone()
 */
export class WaveManager {
  constructor() {
    this.index = -1;           // 0-based，当前波号（-1 表示未开始）
    this.state = 'idle';
    this.timer = 0;
    this.spawnQueue = [];      // [{ type, delay }]
    this.spawnedThisWave = 0;
    this.totalThisWave = 0;
    this.killsThisWave = 0;

    this.onPrepare = null;
    this.onActive  = null;
    this.onClear   = null;
    this.onRest    = null;
    this.onDone    = null;
    /** 无尽模式：波次无限，第 11 波起由 endlessWaveFor(index) 合成 */
    this.endless = false;
    this.endlessWaveFor = null;
    this.onWaveBreakAd = null;   // 进入 rest 时 Game 决定是否弹插屏
    this.onTimeout = null;       // 到达 maxSec 仍有残敌时回调（Game 负责让残敌撤离）

    /**
     * Phase 17：可选的 SpawnDirector。
     * 设置后 WaveManager 只负责"节奏"（prepare/active/clear/rest），
     * 具体刷什么、以什么编队、从哪个方向交给 Director（设计文档 §7）。
     * 未设置时完全退回 Phase 16 之前的 spawnQueue 行为，保证旧测试不破。
     */
    this.spawnDirector = null;
  }

  reset() {
    this.index = -1; this.state = 'idle'; this.timer = 0; this.spawnQueue = [];
    this.spawnedThisWave = 0; this.killsThisWave = 0;
    if (this.spawnDirector) this.spawnDirector.reset();
  }

  start() {
    if (this.state !== 'idle') return;
    this._nextWave();
  }

  // 玩家死亡后，复活时是否继续当前波？（这里选择：复活回到当前 active 波）
  resumeAfterDeath() {
    if (this.state === 'idle') this._nextWave();
  }

  get currentWaveNumber() { return this.index + 1; }
  get totalWaves() { return TOTAL_WAVES; }
  get isActive() { return this.state === 'active'; }

  update(dt, world) {
    switch (this.state) {
      case 'prepare':
        this.timer -= dt;
        if (this.timer <= 0) this._enterActive();
        break;
      case 'active': {
        this.timer -= dt;
        if (this.spawnDirector) this._updateDirector(dt, world);
        else this._updateQueue(dt, world);

        // 清场判定（设计文档 §3）："清空敌人" 与 "最长持续时间" 二者取先到者。
        // maxSec 是安全阀 —— EW Plane 会在顶部无限巡逻，没有它波次可能永远结束不了。
        const allSpawned = this.spawnDirector
          ? this.spawnDirector.finished()
          : this.spawnedThisWave >= this.totalThisWave;
        const cleared = allSpawned && world.enemiesAlive() === 0;
        const timedOut = this.timer <= 0;
        if (cleared) this._enterClear();
        else if (timedOut) this._enterTimeout(world);
        break;
      }
      case 'clear':
        this.timer -= dt;
        if (this.timer <= 0) this._enterRest();
        break;
      case 'rest':
        this.timer -= dt;
        if (this.timer <= 0) {
          // 无尽模式：永不 _enterDone，一直推进下一波
          if (!this.endless && this.index + 1 >= TOTAL_WAVES) { this._enterDone(); }
          else this._nextWave();
        }
        break;
      default: break;
    }
  }

  /** 由 Game 在敌人死亡时调用 */
  notifyKill() { this.killsThisWave++; }

  /* ---------------------------------------------------------------- */
  /** 进入下一波：index 自增 + 进入 prepare 警告 */
  _nextWave() {
    this.index += 1;
    this._enterPrepare();
  }

  /** 当前波次定义（无尽模式下第 11 波起动态合成） */
  _waveDef() {
    if (this.index < WAVES.length) return WAVES[this.index];
    if (this.endless && this.endlessWaveFor) return this.endlessWaveFor(this.index);
    return WAVES[WAVES.length - 1];
  }

  _enterPrepare() {
    this.state = 'prepare';
    this.timer = PREPARE_SEC;
    this.spawnedThisWave = 0;
    this.killsThisWave = 0;
    this.onPrepare && this.onPrepare(this.currentWaveNumber);
  }

  /** Phase 17：Director 模式 —— 只推进 Director，不自己排队 */
  _updateDirector(dt, world) {
    this.spawnDirector.update(dt, world);
    this.spawnedThisWave = this.spawnDirector.spawned;
  }

  /** 兼容模式：原有的 spawnQueue 出怪 */
  _updateQueue(dt, world) {
    while (this.spawnQueue.length && this.spawnQueue[0].delay <= 0) {
      const s = this.spawnQueue.shift();
      this._spawnFromComposition(s, world);
      this.spawnedThisWave++;
    }
    for (const s of this.spawnQueue) s.delay -= dt;
  }

  _enterActive() {
    this.state = 'active';
    this.spawnQueue = [];
    const w = this._waveDef();
    this.maxSec = w.maxSec || DEFAULT_MAX_SEC;
    this.timer = this.maxSec;      // active 阶段的 timer 兼作"最长持续时间"倒计时

    if (this.spawnDirector) {
      this.spawnDirector.beginWave(this.index, w);
      this.totalThisWave = this.spawnDirector.groups.reduce((s, g) => s + g.target, 0);
      this.onActive && this.onActive(this.currentWaveNumber);
      return;
    }

    const comp = w.comp;
    for (const grp of comp) {
      for (let i = 0; i < grp.count; i++) {
        this.spawnQueue.push({ type: grp.type, delay: grp.delay + i * grp.interval });
      }
    }
    // 按延迟排序，保证 while(queue[0].delay<=0) 正确弹出
    this.spawnQueue.sort((a, b) => a.delay - b.delay);
    this.totalThisWave = this.spawnQueue.length;
    this.onActive && this.onActive(this.currentWaveNumber);
  }

  _spawnFromComposition(s, world) {
    // 默认随机进入位置（左右入场）
    if (!world.spawnEnemy) return;
    const fromLeft = Math.random() < 0.5;
    let x = fromLeft ? -50 : W + 50;
    let y;
    if (s.type === 'ewPlane') y = 80;
    else if (s.type === 'bomber' || s.type === 'boss' || s.type === 'heavyBomber') y = 100;
    else if (s.type === 'drone') y = 200;
    else y = 60 + Math.random() * 240;
    world.spawnEnemy(s.type, x, y);
  }

  _enterClear() {
    this.state = 'clear';
    this.timer = CLEAR_SEC;
    this.onClear && this.onClear(this.currentWaveNumber);
  }

  /**
   * 到达 maxSec 仍有残敌：交给 Game 让残敌撤离（不给奖励），随后正常结算本波。
   * Phase 17：onTimeout 返回 true 表示"续时"，本波不结算（Boss 未死时必须续，
   * 否则 D10 Boss 血量 ×3.5 会被 80 秒超时直接送走，变成假胜利）。
   */
  _enterTimeout(world) {
    const left = world.enemiesAlive ? world.enemiesAlive() : 0;
    const extended = this.onTimeout ? this.onTimeout(this.currentWaveNumber, left) : false;
    this.spawnQueue.length = 0;
    if (this.spawnDirector) this.spawnDirector.forceFinish();
    if (extended) { this.timer = Math.max(this.timer, 30); return; }
    this._enterClear();
  }

  _enterRest() {
    this.state = 'rest';
    this.timer = REST_SEC;
    this.onRest && this.onRest(this.currentWaveNumber);
    if (this.onWaveBreakAd) this.onWaveBreakAd(this.currentWaveNumber);
  }

  _enterDone() {
    this.state = 'done';
    this.onDone && this.onDone();
  }
}

export default WaveManager;
