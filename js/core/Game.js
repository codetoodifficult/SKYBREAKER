import { CONFIG } from '../data/config.js';
import { GameState } from './GameState.js';
import SaveStore from './SaveStore.js';
import GameLoop from './GameLoop.js';
import Input from './Input.js';
import Background from '../effects/Background.js';
import ParticleSystem from '../effects/ParticleSystem.js';
import ScreenShake from '../effects/ScreenShake.js';
import AudioManager from '../audio/AudioManager.js';
import BulletSystem from '../combat/Bullet.js';
import CollisionSystem from '../combat/CollisionSystem.js';
import EnemyManager from '../enemies/EnemyManager.js';
import AntiAircraftGun from '../player/AntiAircraftGun.js';
import AimController from '../player/AimController.js';
import PlayerStats from '../player/PlayerStats.js';
import WeaponManager from '../weapons/WeaponManager.js';
import { STARTING_WEAPON } from '../data/weapons.js';   // 比赛版：主武器固定机炮
import MachineGun from '../weapons/MachineGun.js';
import FlakCannon from '../weapons/FlakCannon.js';
import MissileLauncher from '../weapons/MissileLauncher.js';
import MissileEntity from '../combat/MissileEntity.js';
import EquipmentManager from '../equipment/EquipmentManager.js';
import Base from '../base/Base.js';
import MetaProgression from '../base/MetaProgression.js';
import HUD from '../ui/HUD.js';
import Screens from '../ui/Screens.js';
import UpgradeUI from '../ui/UpgradeUI.js';
import DebugPanel from '../debug/DebugPanel.js';
import XPOrb from '../progression/XPOrb.js';
import LevelSystem from '../progression/LevelSystem.js';
import UpgradeManager from '../progression/UpgradeManager.js';
import { ShopSystem } from '../progression/ShopSystem.js';   // Phase G：补给商店
import ComboSystem from '../progression/ComboSystem.js';
import SynergySystem from '../progression/SynergySystem.js';
import Loadout from '../progression/Configuration.js';   // Phase 15：构型
import EvolutionSystem from '../progression/EvolutionSystem.js';   // Phase 16：武器进化
import BuildSystem from '../progression/BuildSystem.js';            // Phase 18：Build 2.0
import WaveManager from '../wave/WaveManager.js';
import ThreatSystem from '../wave/ThreatSystem.js';
import RandomEventSystem from '../wave/RandomEventSystem.js';
import DifficultyManager from './DifficultyManager.js';   // Phase 17：难度 D0–D10
import SpawnDirector from '../wave/SpawnDirector.js';      // Phase 17：刷怪导演
import SpriteLoader from './SpriteLoader.js';
import { AdManager } from '../ads/AdManager.js';
import {
  FIRST_CLEAR_REWARDS, BP_TIER, bpTierOf, bpCountOf, bpSpend, bpSummary,
  MASTERY, masteryPoints,
} from '../data/unlocks.js';   // Phase 19：内容树 / 蓝图分级 / 武器精通
import { EVOLUTIONS } from '../data/evolution.js';
import { CHALLENGES, CHALLENGE_ORDER, challengeSlotsFor } from '../data/challenges.js';   // Phase 20
import { ENDLESS, ENDLESS_DEF, endlessGrowth, endlessWaveDef, endlessUnlocked } from '../data/endless.js';
import { EndlessLeaderboard } from '../progression/EndlessLeaderboard.js';
import * as StatusEffects from '../combat/StatusEffects.js';   // Phase E：统一状态效果

const META_KEY = 'skybreaker.meta.v1';

/**
 * Game —— 顶层协调者
 * 主循环顺序：Input → Update → Collision → Spawner → Particle → Render
 * 状态机：MENU / PLAYING / PAUSED / GAME_OVER / RESULT ...（暂停时逻辑完全停摆）
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    this.state = GameState.MENU;
    this.view = { scale: 1, dpr: 1, k: 1 };
    this.config = CONFIG;   // 调试/测试用（__SB__.config）

    // ---- 系统 ----
    this.input = new Input(canvas);
    this.audio = new AudioManager();
    this.background = new Background();
    this.particles = new ParticleSystem();
    this.shake = new ScreenShake();
    this.bullets = new BulletSystem();
    this.enemies = new EnemyManager();
    this.base = new Base();

    this.gun = new AntiAircraftGun(CONFIG.TURRET.x, CONFIG.TURRET.y);
    this.aim = new AimController();
    this.weapons = new WeaponManager();
    // Phase 13 §10：开局只有 Machine Gun；其余武器实例由 WeaponManager 持有，获得后才生效
    this.machineGun      = this.weapons.get('machineGun');
    this.flakCannon      = this.weapons.get('flakCannon');
    this.missileLauncher = this.weapons.get('missile');
    this.railCannon      = this.weapons.get('railCannon');
    this.pulseLaser      = this.weapons.get('pulseLaser');
    this.interceptorDrone = this.weapons.get('interceptorDrone');
    // Phase 14：战术槽（C）与被动槽（D）
    this.equipment = new EquipmentManager(this);
    this.missiles = new MissileEntity();
    this.gun.weapon = this.machineGun;

    this.stats = new PlayerStats();
    this.gun.stats = this.stats;
    this.syncStats();

    this.bullets.onBoom = (x, y, boom, b) => {
      this.areaDamage(x, y, boom.radius, boom.damage);
      // 主武器高炮：空爆冲击波掀动范围内的 XP 光球（副武器不参与经验交互）
      if (b && b.primary && this.xpOrbs) this.xpOrbs.activateInCircle(x, y, boom.radius, 0, 0);
    };

    this.xpOrbs = new XPOrb();
    this.level = new LevelSystem();
    this.upgradeMgr = new UpgradeManager();
    this.shop = new ShopSystem(this);      // Phase G：波次间补给商店
    this.upgradeUI = new UpgradeUI();

    // Phase 11：连击 / 危险度 / 随机事件 / 协同
    this.combo = new ComboSystem();
    this.threat = new ThreatSystem();
    this.events = new RandomEventSystem();
    this.synergy = new SynergySystem();
    this.synergyFlags = { armorBreak: false };   // 协同开关（按字段重置，保持 world 引用一致）
    this._setupEventCallbacks();

    this.spriteLoader = new SpriteLoader();
    this.spritesReady = false;

    this.wave = new WaveManager();
    this.waveNotice = { text: '', t: 0 };
    this.city = { hp: CONFIG.BASE.cityHp, maxHp: CONFIG.BASE.cityHp };
    // Phase 17：刷怪导演（WaveManager 管节奏，Director 管内容）
    this.spawnDirector = new SpawnDirector(this);
    this.wave.spawnDirector = this.spawnDirector;
    this.timeScale = 1;        // 慢动作（Boss 死亡时）
    this._setupWaveCallbacks();

    this.hud = new HUD(this);
    this.evolution = new EvolutionSystem(this);   // Phase 16

    // ---- 存档 ----
    // SaveStore 必须在 _loadMeta 之前建好：先从存档读回进度
    this.store = new SaveStore({ debug: !!CONFIG.DEBUG });
    this.meta = this._loadMeta();
    this.metaProg = new MetaProgression();
    this.metaProg.load(this.meta);
    // Phase 15：构型（CORE × WEAPON × POWER），选择持久化在 meta.loadout
    this.loadout = new Loadout(this.meta).load();
    // Phase 18：Build 系统（Tag / Score / Milestone / Discovery / Build Core）
    // 必须在 meta 载入之后创建（Discovery 记录持久化在 meta.builds）
    this.build = new BuildSystem(this);
    // Phase 17：难度（D0–D10）—— 必须在 SpawnDirector 之前创建
    this.difficulty = new DifficultyManager(this.meta);
    this.metaRadarMul = 1;     // 永久成长里雷达范围的乘算（每次 startRun 刷新）
    this.pendingOffline = null;   // Phase 10：离线收益（进入游戏时结算，弹窗只负责告知）
    this._saveAcc = 0;            // 心跳存档计时
    this.godMode = false;
    this.invuln = 0;
    this._prevState = null;

    this.run = this._freshRun();

    this.loop = null;
  }

  /* ================================================================== */
  /* 初始化                                                              */
  /* ================================================================== */

  async init() {
    this._buildWorld();
    this.collision = new CollisionSystem(this.bullets, this.enemies, this.world);

    this._setupAds();

    this.screens = new Screens(this);
    this.debug = new DebugPanel(this);

    // 预加载 Kenney UI 素材（用于 Canvas HUD 的血条/热量/XP 条/准星/升级卡片）
    try {
      await this.spriteLoader.preload();
      this.spritesReady = true;
    } catch (e) {
      console.warn('SpriteLoader.preload 出错（会自动回退到程序化绘制）', e);
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._onOrientChange(), 160));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === GameState.PLAYING) this.togglePause();
        this.saveMeta();                      // 切后台即存档：离线收益从这一刻开始计时
      }
    });
    // 关闭 / 刷新页面时兜底存档（pagehide 比 beforeunload 更可靠，移动端也生效）
    window.addEventListener('pagehide', () => this.saveMeta());
    window.addEventListener('blur', () => this.saveMeta());
    // 浏览器自动播放策略：首次交互后才能启动 AudioContext
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });

    // 提前下载 UI 点击音效（不需要 AudioContext，可与其它资源并行，
    // 避免首次点击时还在下载导致只能听到兜底合成音）
    this.audio.preloadClick();

    this._setupButtonSfx();

    // 键盘暂停
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === GameState.PLAYING || this.state === GameState.PAUSED) this.togglePause();
      }
    });

    this.loop = new GameLoop((dt) => this.update(dt), () => this.render(), CONFIG.PERF.maxDt);

    // Phase 10：离线收益（有则先弹收益窗，关闭后回主菜单；无则直接进主菜单）
    if (this._applyOfflineOnLoad()) this.screens.showOffline(this.pendingOffline);
    else this.screens.showMenu();

    this.loop.start();
  }

  _buildWorld() {
    this.world = {
      gun: this.gun,
      bullets: this.bullets,
      enemies: this.enemies,
      particles: this.particles,
      xpOrbs: this.xpOrbs,
      synergyFlags: this.synergyFlags,   // Phase 11：协同开关（穿甲爆破等）
      evolutionFlags: this.evolution.flags,   // Phase 16：武器进化开关
      statusEffects: StatusEffects,          // Phase E：燃烧/电击/冰缓/腐蚀/标记统一入口
      audio: this.audio,
      shake: this.shake,
      aimTarget: null,
      spawnEnemy: (type, x, y, opts) => this.enemies.spawn(
        type, x, y, type === 'boss' ? this.computeBossHpMul() : 1, opts),
      enemiesAlive: () => this.enemies.count,
      spawnMissile: (x, y, target, opt) => this.missiles.fire(x, y, target, opt, this.world),
      onEnemyDeath: (e, byPlayer, source) => this.onEnemyDeath(e, byPlayer, source),
      onEnemyEscape: (e) => this.onEnemyEscape(e),
      onBaseDamage: (d) => this.damageBase(d),
      onCityDamage: (d) => this.damageCity(d),
      onAreaDamage: (x, y, radius, dmg) => this.areaDamage(x, y, radius, dmg),
      onBossPhase: (p, name) => this.onBossPhase(p, name),
      onBossDeath: (boss, byPlayer) => this.onBossDeath(boss, byPlayer),
      onOverheat: () => this.onOverheat(),
      difficultyRules: null,      // Phase 20：Boss 读这里的规则（核心护盾 / 阶段强化）
    };
  }

  _setupWaveCallbacks() {
    const w = this.wave;
    w.onPrepare = (n) => {
      this.waveNotice = this.run && this.run.endless
        ? { text: 'ENDLESS  WAVE  ' + String(n).padStart(2, '0'), t: 2.5 }
        : { text: 'WAVE  ' + String(n).padStart(2, '0') + '  /  ' + String(w.totalWaves).padStart(2, '0'), t: 2.5 };
      this.screens.toast(`第 ${n} 波来袭`, 'warn');
    };
    w.onActive = (n) => {
      // Phase 15：记录历史最高波次，用于构型解锁门槛
      if (n > (this.meta.bestWave || 0)) { this.meta.bestWave = n; this.saveMeta(); }
      this._applyEndlessGrowth(n);
    };
    w.onClear = (n) => {
      this.waveNotice = { text: `第 ${n} 波 · 已清空`, t: 2.0 };
      const rw = this.difficulty ? this.difficulty.rewardMul : 1;
      // 无尽模式：每清一波额外记分（冲榜分数的主要来源）
      if (this.run.endless) {
        this.run.score += ENDLESS.score.perWave * n;
        this.run.endlessBestWave = Math.max(this.run.endlessBestWave || 0, n);
      }
      this.run.scrap = (this.run.scrap || 0) + 2;      // Phase 16
      if (this.shop) this.shop.earnWave();             // Phase G：波清空 Credits +12
      this.meta.blueprint = (this.meta.blueprint || 0) + Math.round(2 * rw * (this.run.blueprintMul || 1));   // §54 × §34 × §38
      this.saveMeta();
      this.screens.toast(`第 ${n} 波 清除 · 废料 +2 · 蓝图 +${Math.round(2 * rw)}`, 'good');
    };
    /**
     * 波次到达 maxSec 仍有残敌（设计文档 §3）：残敌撤离、不给奖励。
     * 没有这条，EW Plane 这类无限巡逻的单位会让波次永远结束不了。
     */
    w.onTimeout = (n, left) => {
      // Phase 17：Boss 还活着就不能算清场 —— D10 Boss 血量 ×3.5，
      // 若被 maxSec 超时直接清掉，玩家会在没打死 Boss 的情况下拿到"胜利"。
      const bossAlive = this.enemies.list.some((e) => e.alive && e.isBoss);
      if (bossAlive) {
        this.screens.toast('空袭窗口延长 · 击落旗舰才能结束', 'warn');
        return true;                 // 续时
      }
      if (left > 0) {
        this.enemies.clear();
        this.screens.toast(`残余敌机撤离（${left}）`, 'warn');
      }
      return false;
    };
    w.onRest = (n) => {
      // Phase G：波次间隙打开补给商店（世界停摆，点"开始下一波"后继续 rest 倒计时）
      this._enterShop(n);
    };
    // 局中插屏广告已按用户要求移除（WAVE_BREAK 不再触发，波次间隙纯喘息）
    w.onDone = () => {
      this.state = GameState.VICTORY;
      this.screens.showPauseButton(false);
      this._settleRun(true);
      setTimeout(() => {
        if (this.state === GameState.VICTORY) this.screens.showResult(true);
      }, 600);
    };
  }

  /**
   * 随机事件回调（Phase 11）
   * 严格满足"有预警 / 有 UI / 有声音 / 有持续时间 / 有结果"，且全程不暂停游戏。
   */
  _setupEventCallbacks() {
    const ev = this.events;

    ev.onWarn = (def) => {
      this.screens.toast(`${def.name}：${def.warn}`, 'warn');
      this.audio.alarm ? this.audio.alarm() : this.audio.ui();
    };

    ev.onStart = (def) => {
      this.screens.toast(`${def.name} 生效 · ${def.desc}`, 'warn');
      this.audio.ui();
    };

    ev.onEnd = (def) => {
      this.screens.toast(`${def.name} 已结束`, 'good');
      this.audio.ui();
    };

    // spawn 类事件：立刻投放运输机，并打标记以便击毁时给额外资源
    ev.onSpawnCarrier = () => {
      const x = 200 + Math.random() * (CONFIG.WORLD.WIDTH - 400);
      const e = this.enemies.spawn('transport', x, -60);
      if (e) {
        e.eventCarrier = true;
        this.screens.toast('敌方运输机已出现 · 击毁可得额外钢材', 'warn');
      }
    };
  }

  _setupAds() {
    // 无尽模式本地排行榜（比赛版：无在线榜 / 无远端 provider）
    this.endlessBoard = new EndlessLeaderboard();
    // 广告系统空壳：仅为兼容历史工具的 ads.stats / setNoAds 调用，不发放任何奖励
    this.ads = new AdManager({ onLog: (m, d) => { if (CONFIG.DEBUG) console.log(m, d || ''); } });
  }

  /** 比赛版无广告，诊断入口保留为空信息 */
  adStatusText() { return '比赛版 · 无广告'; }
  adDebug() { return { contest: true, adsStats: this.ads ? this.ads.stats : null }; }

  /* ================================================================== */
  /* 存档                                                                */
  /* ================================================================== */

  /** 存档版本：v2 = Phase 15 构型（新增 runs / bestWave / loadout，旧档自动迁移） */
  _loadMeta() {
    const def = {
      bestScore: 0, steel: 0, noAds: false, metaLevels: {}, lastSaveTime: 0,
      runs: 0, bestWave: 0, loadout: null, saveVersion: 2,
      blueprint: 0, unlocked: {}, useCount: {},   // Phase 16：蓝图 / 构型解锁 / 使用次数
      blueprintRare: 0, blueprintLegendary: 0,    // Phase 19 §60：蓝图分级
      mastery: {},                                 // Phase 19 §50：武器精通
      adUnlockedItems: {},                         // Phase 19：广告解锁记录（每件只解锁一次）
    };
    let data;
    try {
      data = Object.assign({}, def, this.store.get(META_KEY, {}) || {});
    } catch (_) {
      data = { ...def };
    }
    // v1 → v2 迁移：只补新字段，绝不丢弃老玩家的 metaLevels / steel / bestScore
    if (data.saveVersion !== 2) {
      data.runs = data.runs || 0;
      data.bestWave = data.bestWave || 0;
      if (!data.loadout) data.loadout = null;
      data.blueprint = data.blueprint || 0;      // Phase 16
      data.unlocked = data.unlocked || {};
      data.useCount = data.useCount || {};
      data.blueprintRare = data.blueprintRare || 0;             // Phase 19
      data.blueprintLegendary = data.blueprintLegendary || 0;   // Phase 19
      data.mastery = data.mastery || {};
      data.adUnlockedItems = data.adUnlockedItems || {};
      data.saveVersion = 2;
    }
    return data;
  }

  saveMeta() {
    try {
      this.meta.metaLevels = this.metaProg.dump();
      // 离线收益的计时基准：每次存档都刷新，退出/心跳均会走到这里
      this.meta.lastSaveTime = Date.now();
      // 走 SaveStore：宿主文件系统（小程序）→ localStorage（浏览器）→ 内存，外加节流云存档
      this.store.set(META_KEY, this.meta);
    } catch (_) { /* noop */ }
  }

  /** 比赛版无云存档，保留空方法兼容历史调用 */
  _setupCloudRestore() {}

  /** 存档诊断入口：__SB__.saveDebug() */
  saveDebug() {
    return {
      store: this.store ? this.store.debugInfo() : null,
      steel: this.meta && this.meta.steel,
      bestScore: this.meta && this.meta.bestScore,
      lastSaveTime: this.meta && this.meta.lastSaveTime,
    };
  }

  _freshRun() {
    return { score: 0, kills: 0, steel: 0, time: 0, revived: false, shield: 0, banked: 0,
      scrap: 0, banishLeft: 2,          // Phase 16：Scrap 货币 / Banish 次数（§25）
      credits: 0,                       // Phase G：补给商店本局货币
      challenges: [], challengeDone: [], // Phase 20：Challenge Modifier
      steelMul: 1, blueprintMul: 1, spawnRateMul: 1, eliteKills: 0,
      // 无尽模式
      endless: false, endlessCountMul: 1, endlessHpMul: 1, endlessStart: 0 };
  }

  /**
   * 把本局钢材入库（Phase 9）。
   * 幂等：只把「尚未入库的增量」加进 meta.steel，可被 RESULT_DOUBLE 广告再次调用。
   */
  bankRun() {
    const delta = this.run.steel - (this.run.banked || 0);
    if (delta > 0) {
      this.meta.steel = (this.meta.steel || 0) + delta;
      this.run.banked = this.run.steel;
      this.saveMeta();
    }
    return this.run.banked;
  }

  /** 购买一项永久升级；成功返回 { ok:true, cost }，失败 { ok:false } */
  buyMetaUpgrade(id) {
    const cost = this.metaProg.buy(id, this.meta.steel || 0);
    if (cost < 0) return { ok: false, cost: 0 };
    this.meta.steel -= cost;
    this.saveMeta();
    return { ok: true, cost };
  }

  /* ================================================================== */
  /* 离线收益（Phase 10）                                                */
  /* ================================================================== */

  /**
   * 计算本次打开游戏应得的离线收益（不写存档，纯计算，便于测试）。
   * @returns {null|{seconds:number, effSeconds:number, capped:boolean, steel:number}}
   */
  computeOfflineReward() {
    const last = this.meta.lastSaveTime || 0;
    if (!last) return null;                        // 首次进入，无历史存档

    let sec = (Date.now() - last) / 1000;
    if (!isFinite(sec) || sec < 0) sec = 0;        // 时钟回拨 / 脏存档保护

    const maxSec = CONFIG.OFFLINE.maxHours * 3600;
    const capped = sec > maxSec;
    const effSec = Math.min(sec, maxSec);

    if (effSec < CONFIG.OFFLINE.minMinutes * 60) return null;   // 太短不发放

    const steel = Math.floor((effSec / 60) * CONFIG.OFFLINE.steelPerMin);
    if (steel <= 0) return null;

    return { seconds: sec, effSeconds: effSec, capped, steel };
  }

  /**
   * 进入游戏时结算离线收益：立即发放基础量，并重置计时基准。
   * 玩家即使不点任何按钮也不会损失，弹窗只负责告知。
   * @returns {boolean} 是否有离线收益
   */
  _applyOfflineOnLoad() {
    const r = this.computeOfflineReward();
    if (!r) return false;

    r.granted = r.steel;                            // 已发放的基础量
    this.meta.steel = (this.meta.steel || 0) + r.granted;
    this.pendingOffline = r;
    this.saveMeta();                                // 关键：刷新 lastSaveTime，防止重复领取
    return true;
  }

  /**
   * 比赛版已移除离线翻倍广告位；保留方法兼容历史调用，恒不发放额外奖励。
   * @returns {number} 恒为 0
   */
  claimOfflineBonus() { return 0; }

  /** 关闭离线收益弹窗（基础量已在进游戏时发放，这里只清理挂起状态） */
  dismissOffline() { this.pendingOffline = null; }

  /* ================================================================== */
  /* 流程                                                                */
  /* ================================================================== */

  /**
   * 开一局
   * @param {boolean} [endless=false] 无尽模式：固定 D5 基线 + 逐波递增 + 无胜利条件
   */
  startRun(endless = false) {
    this.run = this._freshRun();
    this.run.endless = !!endless;
    this.run.endlessStart = Date.now();
    // 无尽模式：难度切换为固定基线（不读玩家所选难度）
    this.difficulty.setEndless(!!endless);
    this.wave.endless = !!endless;
    this.wave.endlessWaveFor = endless ? endlessWaveDef : null;
    this.meta.runs = (this.meta.runs || 0) + 1;   // Phase 15：出击次数（构型解锁门槛）
    // Phase 16：记录构型使用次数（ARMORY 图鉴用）
    const lo = this.loadout;
    for (const slot of ['core', 'weapon', 'power']) {
      const k = `${slot}:${lo.sel[slot]}`;
      this.meta.useCount[k] = (this.meta.useCount[k] || 0) + 1;
    }
    this.base.reset();
    this.enemies.clear();
    this.bullets.clear();
    this.particles.clear();
    this.xpOrbs.clear();
    this.shake.reset();
    // 比赛版：主武器固定机炮（构型 WEAPON 槽已移除可选性），必须在 weapons.reset() 之前设置
    this.weapons.setStarting(STARTING_WEAPON);
    this.weapons.reset();
    // Phase B：把研发进度表挂到本局 run 上（GDD §2.2 run.weaponProgress，同一份引用，非并行系统）
    this.run.weaponProgress = this.weapons.progression.data;
    this.equipment.reset();              // Phase 14：清空战术槽与被动槽
    this.aim.reset();
    this.godMode = false;
    this.invuln = 0;
    this.city.hp = this.city.maxHp;

    // 每局重置成长（Roguelite 局内成长从 0 开始；永久成长在下面 _applyMetaBonuses 应用）
    this.stats.reset();
    this.level.reset();
    this.upgradeMgr.reset();
    this.shop.reset();                    // Phase G：商店槽位/限购/刷新费按局重置
    this.missiles.clear();

    // Phase 11：连击 / 危险度 / 随机事件 / 协同 按局重置
    this.evolution.reset();                   // Phase 16：进化每局重新解锁
    this.world.evolutionFlags = this.evolution.flags;
    this.world.buildFlags = {};               // Phase 18：Build 里程碑 flag
    this.build.reset();                       // Phase 18：Build 每局重新统计
    this.build.rebuild();
    this.combo.reset();
    this.threat.reset();
    this.events.reset();
    this._setupEventCallbacks();          // reset 会清空回调，重新挂上
    this.synergy.reset();
    this.synergyFlags.armorBreak = false; // 按字段重置，保持 world 引用一致

    // Phase 9：局外永久成长（机炮伤害 / 基地生命 / 雷达范围 / 导弹伤害 / 初始经验）
    this._applyMetaBonuses();
    // Phase 15：构型大型乘区（§71 结算顺序：Meta 之后、Temporary 之前）
    this.loadout.apply(this.stats);
    // 构型会改写 maxHpMul / damageTakenMul，基地上限需按单一来源重算
    this.base.maxHp = this.computeBaseMaxHp();
    this.base.hp = this.base.maxHp;

    this.syncStats();

    // 启动波次系统
    this.wave.reset();
    // Phase 20：Challenge Modifier（§38）—— 玩家主动勾选，换取奖励
    this.run.challenges = (this.meta.pendingChallenges || []).slice(0, challengeSlotsFor(this.difficulty.def));
    this.run.challengeDone = [];
    this.run.steelMul = 1;
    this.run.blueprintMul = 1;
    this.run.spawnRateMul = 1;
    for (const cid of this.run.challenges) {
      const c = CHALLENGES[cid];
      if (!c) continue;
      if (c.steelMul) this.run.steelMul *= c.steelMul;
      if (c.blueprintMul) this.run.blueprintMul *= c.blueprintMul;
      if (c.enemyHpMul) this.enemies.challengeHpMul *= c.enemyHpMul;
    }

    // Phase 17：把难度注入敌人侧（§85 —— 只影响敌人，绝不削弱玩家）
    this.enemies.difficulty = this.difficulty;
    this.enemies.spawnCapOverride = this.difficulty.spawnCap;
    this.upgradeMgr.rareChanceOverride = this.difficulty.rareChance
      + (this.run.challenges.includes('noRepair') ? 0.10 : 0);
    // Phase 20 §37：SKYBREAKER CORE —— 武器/被动槽 +1，代价刷怪 +15%
    const core = this.loadout.buildCore;
    if (core && core.dynamic === 'skybreaker') {
      this.weapons.slots.capBonus.auto = 1;
      this.weapons.slots.capBonus.passive = 1;
      this.run.spawnRateMul = 1.15;
      this.screens.toast('SKYBREAKER CORE 启动 · 槽位扩展 / 空袭强度 +15%', 'warn');
    } else {
      this.weapons.slots.capBonus.auto = 0;
      this.weapons.slots.capBonus.passive = 0;
    }
    this.spawnDirector.reset();
    this.run.eliteKills = 0;
    this.wave.start();

    // Phase 20：把难度规则交给 Boss（核心护盾 / 阶段强化 / 最终形态）
    this.world.difficultyRules = this.difficulty.rules;

    this.state = GameState.PLAYING;
    this.screens.clear();
    this.screens.showPauseButton(true);
    this.audio.unlock();
    this.audio.setBattleBgm(true);   // 用户手势内启动，符合自动播放策略
  }

  /**
   * 应用 MetaProgression 永久加成（在局内成长 reset 之后、syncStats 之前调用）
   */
  _applyMetaBonuses() {
    const m = this.metaProg.summary();

    // 机炮伤害：仅永久加成（比赛版已移除 START_BOOST 广告增益）
    this.gun.damageMul = m.gunDamageMul;

    // 基地生命上限（含局内 maxHpMul，此时 stats 刚 reset，故为 1）
    this.base.maxHp = this.computeBaseMaxHp();
    this.base.hp = this.base.maxHp;   // 开局满血（覆盖 reset 时用的旧上限）

    // 雷达范围（存到实例，update 里读取）
    this.metaRadarMul = m.radarRangeMul;

    // 导弹伤害：注入 stats.base，供 MissileLauncher 实时读取
    this.stats.base.missileDamageMul *= m.missileDamageMul;

    // 初始资源：开局额外经验（更快拿到首个强化）
    if (m.startXp > 0) this.level.addXp(m.startXp);
  }

  toMenu() {
    this.state = GameState.MENU;
    this.wave.reset();
    this.enemies.clear();
    this.bullets.clear();
    this.particles.clear();
    this.screens.showMenu();
  }

  /** 进入基地升级界面（永久成长） */
  toBase() {
    this.state = GameState.BASE;
    this.screens.showBase();
  }

  togglePause() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
      this.screens.showPause();
    } else if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
      this.screens.clear();
      this.screens.showPauseButton(true);
    }
  }

  gameOver(win) {
    if (this.state === GameState.GAME_OVER || this.state === GameState.RESULT) return;
    this.state = win ? GameState.VICTORY : GameState.GAME_OVER;
    this.shake.shake(14, 420);
    this.audio.explosion(1.6);
    this.particles.explosion(CONFIG.TURRET.x, CONFIG.TURRET.y - 24, 2.6, [255, 120, 60]);
    this.screens.showPauseButton(false);

    // 留一点爆炸演出时间再弹结算
    setTimeout(() => {
      if (this.state === GameState.PLAYING) return;   // 期间已被复活
      this.state = GameState.RESULT;
      this.screens.showResult(win);
    }, 750);
  }

  /** 广告位 REVIVE 的奖励落地 */
  revive(reward) {
    // 注意：广告播放期间 state 会被临时切到 PAUSED，真实状态在 _prevState
    const st = (this.state === GameState.PAUSED && this._prevState) ? this._prevState : this.state;
    if (st !== GameState.RESULT && st !== GameState.GAME_OVER) return;
    this._prevState = null;
    const r = reward || {};
    this.run.revived = true;
    this.base.hp = Math.max(this.base.hp, this.base.maxHp * (r.hpRatio ?? 0.6));
    this.invuln = r.invulnSec ?? 3;
    this.enemies.killAll(this.world, true);
    this.bullets.clear();
    this.weapons.reset();
    this.shake.reset();

    this.state = GameState.PLAYING;
    this.screens.clear();
    this.screens.showPauseButton(true);
    this.screens.toast('部队重新部署完成', 'good');
    this.audio.reward();
  }

  /* ================================================================== */
  /* 战斗回调                                                            */
  /* ================================================================== */

  onEnemyDeath(enemy, byPlayer, source = null) {
    this.wave.notifyKill();
    if (!byPlayer) return;                 // 撞击自毁不给奖励
    this.run.kills++;

    // Phase E：击杀来源归属（状态伤害归属到施加它的武器 / 全局音效）
    if (source && source.weaponId && this.weapons && this.weapons.progression) {
      const p = this.weapons.progression.get(source.weaponId);
      if (p) p.masteryXP = (p.masteryXP || 0) + 1;
    }

    // Phase 17：难度奖励（§34）—— 高难度必须明显更值得挑战
    const rw = this.difficulty ? this.difficulty.rewardMul : 1;
    const xpD = this.difficulty ? this.difficulty.xpMul : 1;

    // Phase 17：精英击杀计入解锁计数器（§4 D4 需要"累计击落精英"）
    if (enemy.cfg && enemy.cfg.isElite) {
      this.run.eliteKills = (this.run.eliteKills || 0) + 1;
    }

    // Phase 11：连击（先累加，再用新档位结算本次收益）
    const newTier = this.combo.addKill();
    if (newTier > 0) {
      const n = CONFIG.COMBO.tiers[newTier - 1];
      this.screens.toast(`连击 x${n} · 收益提升`, 'good');
      if (this.audio.reward) this.audio.reward();
    }

    this.run.score += enemy.cfg.score || 0;
    this.run.steel += Math.round((enemy.cfg.steel || 0) * this.combo.steelMul * rw
      * (this.run.steelMul || 1));

    // Phase G：补给商店 Credits（普通 1 / 精英 8 / Boss 60，不吃难度奖励倍率防滚雪球）
    if (this.shop) this.shop.earnKill(enemy);

    // Phase 11：随机事件「敌方运输机」的结果 —— 击毁给额外钢材
    if (enemy.eventCarrier) {
      enemy.eventCarrier = false;
      this.run.steel += CONFIG.EVENTS.carrierBonusSteel;
      this.screens.toast(`运输机被击毁 · 额外钢材 +${CONFIG.EVENTS.carrierBonusSteel}`, 'good');
    }

    // 掉落 XP 光球（Phase 3 基础 × 局内 xpMul × Phase 11 连击加成 × Phase 17 难度 xpMul）
    // §66：难度 XP 增速必须低于刷怪增速，否则"更多敌人 → 更快升级"会把难度抵消掉
    const xpVal = Math.round((enemy.cfg.xp || 1) * this.stats.base.xpMul * this.combo.xpMul * xpD);
    this.xpOrbs.spawn(enemy.x, enemy.y, xpVal);
  }

  /** XP 光球被吸附后到账 */
  collectXp(value, x, y) {
    this.particles.hit(x, y, 0, [255, 225, 130]);
    this.audio.ui();
    const promoted = this.level.addXp(value);
    if (promoted > 0 && this.state === GameState.PLAYING) {
      this._enterLevelUp();
    }
  }

  _enterLevelUp() {
    this.run.scrap = (this.run.scrap || 0) + 3;   // Phase 16：每次升级 +3 Scrap
    this.state = GameState.LEVEL_UP;
    this.screens.showPauseButton(false);
    this._showUpgradeChoices();
  }

  /* ---------------- Phase G：补给商店（§17.5） ---------------- */

  /** 波次 rest 期间打开商店（世界停摆，与 PAUSED 同级） */
  _enterShop(waveN) {
    this.shop.open();
    this.state = GameState.SHOP;
    this.screens.showPauseButton(false);
    this.screens.showShop(waveN);
  }

  /** 玩家点"开始下一波"：回到 PLAYING，WaveManager 继续 rest 倒计时 */
  _closeShop() {
    if (this.state !== GameState.SHOP) return;
    this.shop.close();
    this.screens.clear();               // Bugfix：必须清掉商店 UI 层，否则面板永远挂着
    this.state = GameState.PLAYING;
    this.screens.showPauseButton(true);
  }

  /**
   * 商品生效（唯一的执行入口；只使用已接线系统，杜绝假商品）。
   * @returns {string} 生效描述（用于 toast）
   */
  _applyShopGood(good) {
    switch (good.id) {
      case 'fieldRepair': {
        const heal = Math.round(this.base.maxHp * 0.30);
        this.base.hp = Math.min(this.base.maxHp, this.base.hp + heal);
        return `基地修复 +${heal}`;
      }
      case 'cryoPayload': {
        let n = 0;
        for (const e of this.enemies.list) {
          if (e.alive && StatusEffects.apply(e, 'chill', { stacks: 3, source: 'shop' })) n++;
        }
        return `${n} 架敌机被冰缓`;
      }
      case 'airStrike': {
        let n = 0;
        for (const e of this.enemies.list) {
          if (!e.alive) continue;
          const dmg = e.maxHp * 0.18 * (e.isBoss ? 0.5 : 1);
          e.takeDamage(dmg, this.world, { source: 'shop:airStrike' });
          n++;
        }
        return `空投轰炸命中 ${n} 个目标`;
      }
      case 'shieldCell': {
        this.invuln = Math.max(this.invuln, 6);
        return '护盾展开 6 秒';
      }
      case 'coolantPurge': {
        for (const w of this.weapons.weapons) {
          w.heat = 0;
          w.overheated = false;
        }
        return '武器热量已清零';
      }
      default: {
        // buff 类商品：写入 stats（damageMul / maxHpMul / xpMul 均为已接线键）
        if (good.mods) {
          this.stats.apply(good.mods);
          this.syncStats();
          if (good.id === 'hpBoost') {
            // 最大生命提高后立即按新上限回满差额（与 desc 一致）
            this.base.maxHp = this.computeBaseMaxHp();
            this.base.hp = Math.min(this.base.maxHp, this.base.hp + Math.round(this.base.maxHp * 0.1 / 1.1));
          }
          return good.name + ' 已生效';
        }
        return good.name;
      }
    }
  }

  _showUpgradeChoices() {
    const choices = this.upgradeMgr.pickThree(this.stats, this);
    const freeCap = this.upgradeMgr.rerollFreeCap;
    const freeLeft = Math.max(0, freeCap - this.upgradeMgr.rerollUsedFree);
    const self = this;
    this.upgradeUI.show({
      choices,
      freeLeft,
      freeCap,
      audio: this.audio,
      stackOf: (id) => this.stats.taken(id),   // Phase C：UI 显示当前层数 / 上限
      onPick: (u) => this.applyUpgrade(u),
      onReroll: () => {
        this.upgradeMgr.rerollWithScrap(this);
        this._showUpgradeChoices();
      },
      onRerollScrap: () => {
        if (this.upgradeMgr.rerollWithScrap(this)) this._showUpgradeChoices();
        else this.screens.toast('废料不足', 'warn');
      },
      onBanish: (u) => {
        if (this.upgradeMgr.banish(u.id, this)) {
          this.screens.toast('已排除：' + u.name, 'warn');
          this._showUpgradeChoices();
        } else this.screens.toast('无法排除', 'warn');
      },
      scrap: this.run.scrap || 0,
      rerollCost: this.upgradeMgr.rerollCost() ?? 0,
      rerollLeft: this.upgradeMgr.rerollLeft(),
      banishLeft: this.run.banishLeft || 0,
    });
  }

  applyUpgrade(upgrade) {
    this.upgradeMgr.apply(upgrade, this);
    this.build.rebuild();                     // Phase 18：Tag 可能变化

    // Phase 11：检查协同是否达成（每个协同只解锁一次，幂等不叠乘）
    const fresh = this.synergy.check(this.stats, this);
    if (fresh.length) {
      this.syncStats();          // 协同改了 stats.base，需要重新下发到武器
      for (const s of fresh) {
        this.screens.toast(`协同解锁 ${s.icon} ${s.name} · ${s.desc}`, 'good');
      }
      if (this.audio.reward) this.audio.reward();
    }

    this.upgradeUI.hide();
    this.state = GameState.PLAYING;
    this.screens.showPauseButton(true);
  }

  onEnemyEscape() {
    // Phase 5 的 WaveManager 会处理"漏怪"惩罚；此处先不惩罚
  }

  onOverheat() {
    this.screens.toast('武器过热！等待冷却', 'warn');
  }

  /** Boss 阶段切换（大字幕 + toast） */
  onBossPhase(p, name) {
    this.waveNotice = { text: name, t: 2.0 };
    this.screens.toast(name, 'warn');
  }

  /** Boss 击毁：慢动作 + 大字幕（胜利由 WaveManager 清场后触发） */
  onBossDeath(boss, byPlayer) {
    this.timeScale = 0.3;
    this.shake.shake(22, 700);
    this.waveNotice = { text: 'BOSS DESTROYED', t: 2.6 };
    this.audio.explosion(2.2);
    this.screens.toast('目标摧毁！', 'good');
  }

  damageBase(dmg) {
    if (this.godMode || this.invuln > 0) return;

    if (this.run.shield > 0) {
      this.run.shield--;
      this.shake.shake(4, 120);
      this.audio.hit();
      this.screens.toast(`护盾抵挡（剩余 ${this.run.shield}）`, 'good');
      return;
    }

    // 复合装甲减伤 × 构型减伤（要塞核心 / 稳定核心 / BASTION）
    const armor = this.stats ? this.stats.base.armor : 0;
    const takenMul = this.stats ? (this.stats.base.damageTakenMul || 1) : 1;
    const final = Math.max(1, Math.round(dmg * (1 - armor) * takenMul));

    this.base.hp -= final;
    this.base.hitFlash = 0.3;
    this.audio.alarm();
    this.shake.shake(7, 150);
    this.particles.explosion(this.base.x, this.base.y - 10, 0.9, [255, 90, 90]);

    if (this.base.hp <= 0) {
      this.base.hp = 0;
      this.gameOver(false);
    }
  }

  /** 城市受创（Bomber / Boss 投弹） */
  damageCity(dmg) {
    if (this.godMode) return;
    this.city.hp = Math.max(0, this.city.hp - dmg);
    this.shake.shake(4, 100);
    this.audio.alarm();
    if (this.city.hp <= 0) {
      this.gameOver(false);
    }
  }

  /** 范围伤害（高射炮 / 导弹爆炸 AoE） */
  areaDamage(x, y, radius, damage) {
    this.particles.explosion(x, y, radius / 70, [255, 170, 70]);
    this.audio.explosion(radius / 100);
    this.shake.shake(3, 90);
    const r2 = radius * radius;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2) {
        e.takeDamage(damage, this.world);
      }
    }
  }

  /** 同步所有武器的成长数值（升级后 / 开局时调用） */
  syncStats() {
    this.gun.syncStats();
    this.weapons.syncStats(this.stats);
  }

  /* ---------------- Phase 13：武器获取与升级 ---------------- */

  /** 获得一件武器（三选一「部署卡」）—— 继承本局研发等级 */
  acquireWeapon(id) {
    const lvBefore = this.weapons.getResearchLevel(id);
    const w = this.weapons.acquire(id);
    if (!w) return null;
    this.syncStats();
    this.build.rebuild();
    this._checkEvolution();
    this.audio.reward();
    this.screens.toast(lvBefore > 1
      ? `部署武器：${w.name} · 继承研发等级 Lv${lvBefore}`
      : '获得武器：' + w.name, 'good');
    return w;
  }

  /** Phase D：安装 / 预研武器改装 */
  addWeaponMod(weaponId, modId) {
    const ok = this.weapons.addMod(weaponId, modId);
    if (!ok) return false;
    this.syncStats();
    this.build.rebuild();
    this.audio.reward();
    const deployed = this.weapons.isOwnedInProgress(weaponId);
    const name = this.weapons.get(weaponId) ? this.weapons.get(weaponId).name : weaponId;
    this.screens.toast(deployed
      ? `改装完成：${name} · ${modId}`
      : `预研改装：${name} · 获得武器后生效`, 'good');
    return true;
  }

  /** 获得一件装备（Phase 14：战术 / 被动） */
  acquireEquipment(id) {
    const it = this.equipment.acquire(id);
    if (!it) return null;
    this.syncStats();
    this.build.rebuild();
    this._checkEvolution();
    this.audio.reward();
    this.screens.toast('获得装备：' + it.name, 'good');
    return it;
  }

  /** 装备升一级（Phase 14） */
  upgradeEquipment(id) {
    if (!this.equipment.upgrade(id)) return false;
    this.syncStats();
    this.build.rebuild();
    this._checkEvolution();
    this.audio.reward();
    const it = this.equipment.get(id);
    this.screens.toast('升级：' + it.name + ' Lv' + it.level, 'good');
    return true;
  }

  /** 武器升一级（三选一「强化卡 / 研发卡」，Phase B 统一入口） */
  upgradeWeapon(id) {
    const wasOwned = this.weapons.isOwnedInProgress(id);
    const ok = this.weapons.upgradeWeapon(id);
    if (!ok) return false;
    this.syncStats();
    this.build.rebuild();
    this._checkEvolution();
    this.audio.reward();
    const w = this.weapons.get(id);
    const nm = w ? w.name : id;
    const lv = this.weapons.getResearchLevel(id);
    this.screens.toast(wasOwned
      ? `强化：${nm} Lv${lv}`
      : `研发：${nm} Lv${lv} · 尚未部署，获得后生效`, 'good');
    return true;
  }

  /**
   * Phase 16：检查武器进化配方（主武器 Lv6 + 模块 Lv3）
   * 达成时给出明确反馈，并把 flag 同步到 world（武器在开火处读 flag 改变攻击形态）。
   */
  _checkEvolution() {
    if (!this.evolution) return;
    const fresh = this.evolution.check();
    if (!fresh.length) return;
    this.world.evolutionFlags = this.evolution.flags;
    for (const ev of fresh) {
      this.screens.toast(`★ EVOLUTION：${ev.name} · ${ev.desc}`, 'good');
    }
    if (this.audio.reward) this.audio.reward();
  }

  /**
   * Phase 16 §54：用蓝图解锁一件构型件（与里程碑解锁并存的第二条路径）
   * @returns {{ok:boolean, cost:number, why?:string}}
   */
  unlockWithBlueprint(slot, id) {
    const lo = this.loadout;
    if (lo.isSoon(slot, id)) return { ok: false, cost: 0, why: '该内容暂未开放' };
    if (lo.isUnlocked(slot, id)) return { ok: false, cost: 0, why: '已解锁' };
    const cost = lo.cost(slot, id);
    if (cost <= 0) return { ok: false, cost: 0, why: '该内容只能通过游玩解锁' };
    const tier = bpTierOf(slot, id);
    if (bpCountOf(this.meta, tier) < cost) {
      return { ok: false, cost, why: `${(BP_TIER[tier] || BP_TIER.common).name}不足` };
    }
    bpSpend(this.meta, tier, cost);
    this.meta.unlocked[`${slot}:${id}`] = true;
    this.saveMeta();
    this.audio.reward();
    return { ok: true, cost, tier };
  }

  /* ================================================================== */
  /* 比赛版：已移除广告解锁（§49 免费替代路径）                            */
  /* 后期内容仍可通过「通关推进」与「蓝图买断」两条原生路径解锁。          */
  /* 下面保留方法空壳，兼容可能残留的调用，恒返回不可用。                  */
  /* ================================================================== */

  /** 比赛版无广告解锁，恒不可用 */
  unlockItemWithAd() { return { ok: false, why: '比赛版已移除广告解锁' }; }

  /** 比赛版无广告解锁，恒不可用 */
  unlockDifficultyWithAd() { return { ok: false, why: '比赛版已移除广告解锁' }; }

  /** 恒 false（比赛版不存在广告解锁记录） */
  adUnlocked() { return false; }

  /** 蓝图库存汇总（§60 UI） */
  bpSummary() { return bpSummary(this.meta); }

  /* ================================================================== */
  /* Phase 19：Weapon Mastery（§50 / §51 —— 只给内容，不给数值）          */
  /* ================================================================== */

  /** 本局结束时累计精通（uses / evolutions），并发放等级蓝图奖励 */
  _settleMastery() {
    const m = this.meta.mastery || (this.meta.mastery = {});
    const owned = this.weapons ? this.weapons.ownedIds() : [];
    for (const id of owned) {
      const rec = m[id] || (m[id] = { uses: 0, evolutions: 0, claimed: {} });
      rec.uses = (rec.uses || 0) + 1;
      // 该武器的进化是否在本局达成
      if (this.evolution && this.evolution.done.length) {
        for (const evId of this.evolution.done) {
          const ev = EVOLUTIONS.find((x) => x.id === evId);
          if (ev && ev.weapon === id) rec.evolutions = (rec.evolutions || 0) + 1;
        }
      }
      // 等级奖励（§51：只给蓝图，不给属性）
      const lv = MASTERY.levelOf(masteryPoints(rec));
      for (const k in MASTERY.rewards) {
        const need = Number(k);
        if (lv >= need && !rec.claimed[need]) {
          rec.claimed[need] = true;
          this.meta.blueprint = (this.meta.blueprint || 0) + MASTERY.rewards[need];
          if (this.screens) {
            this.screens.toast(`武器精通 Lv${need} · 蓝图 +${MASTERY.rewards[need]}`, 'good');
          }
        }
      }
    }
    this.saveMeta();
  }

  /** 精通等级查询（UI） */
  masteryLevel(id) {
    const rec = this.meta.mastery && this.meta.mastery[id];
    return MASTERY.levelOf(masteryPoints(rec));
  }

  /** 基地生命上限的单一来源：基础值 × 局外永久成长 × 局内 maxHpMul */
  computeBaseMaxHp() {
    const metaMul = this.metaProg ? this.metaProg.summary().baseHpMul : 1;
    const runMul = this.stats ? this.stats.base.maxHpMul : 1;
    return Math.round(CONFIG.BASE.maxHp * metaMul * runMul);
  }

  /**
   * Boss 生命倍率（设计文档 §35 + Phase 17 §41）
   *   BossHP = 3000 × (1 + 0.08 × 玩家等级) × 难度 bossHpMul
   * 以倍率形式返回，交给 EnemyManager.spawn 在生成时套用到 ENEMIES.boss.hp 上，
   * 这样 Boss 出生瞬间的玩家等级决定血量，之后不再变化（避免血条长度抖动）。
   * 注意：CONFIG.BOSS.maxHp=6000 的钳位对高难度会失效（D10 ×3.5 = 10500），
   * 因此钳位改为"基础值 × 难度上限倍率"，保证 D10 Boss 真的是终局血量。
   */
  computeBossHpMul() {
    const lv = this.level ? this.level.level : 1;
    const dMul = this.difficulty ? this.difficulty.bossHpMul() : (CONFIG.BOSS.difficulty || 1);
    // 无尽模式：放开 Boss 血量上限，随波次复利增长（否则后期 Boss 会被 cap 压成纸糊）
    const endlessMul = (this.run && this.run.endlessHpMul) || 1;
    const cap = CONFIG.BOSS.maxHp * dMul * endlessMul;
    const raw = CONFIG.BOSS.baseHp * (1 + CONFIG.BOSS.perLevel * lv) * dMul;
    return Math.max(1, Math.min(cap, raw) / CONFIG.BOSS.baseHp);
  }

  /* ================================================================== */
  /* Phase 17：难度结算（§4 靠通关推进解锁）                              */
  /* ================================================================== */

  /**
   * 本局结束（胜 / 负）时推进难度记录与解锁。
   * 幂等：一局只结算一次（复活后继续再结束也不会重复计数）。
   * @param {boolean} win
   * @returns {{firstClear:boolean, newlyUnlocked:number[]}|null}
   */
  /* ================================================================== *
   *  无尽模式（Endless Mode）
   * ================================================================== */

  /** 无尽模式是否已解锁（难度 D5 解锁后开放） */
  get endlessUnlocked() { return endlessUnlocked(this.difficulty); }

  /** 开一局无尽模式（未解锁时直接拒绝） */
  startEndless() {
    if (!this.endlessUnlocked) {
      this.screens.toast(`无尽模式未解锁 · ${ENDLESS.unlockText}`, 'warn');
      return false;
    }
    // 无尽模式不接受 Challenge Modifier（难度已由波次递增决定）
    this.meta.pendingChallenges = [];
    this.startRun(true);
    return true;
  }

  /**
   * 每波开战前套用无尽模式的递增曲线：数量 / 血量 / 同屏上限 / 精英率
   * 只写"乘区"，不逐帧累加，避免数值漂移。
   */
  _applyEndlessGrowth(n) {
    if (!this.run || !this.run.endless) return;
    const g = endlessGrowth(n);
    this.run.endlessCountMul = g.countMul;
    this.run.endlessHpMul = g.hpMul;
    this.enemies.endlessHpMul = g.hpMul;
    this.enemies.spawnCapOverride = g.spawnCap;
    // 精英压力改由 eliteBudgetForWave 提升（见 DifficultyManager.endless 分支）
    this.run.endlessGrowthInfo = g;
  }

  /** 当前局的战绩（无尽模式结算用） */
  endlessResult() {
    return {
      score: Math.round(this.run.score || 0),
      wave: this.wave ? this.wave.currentWaveNumber : 0,
      kills: this.run.kills || 0,
      timeSec: this.run.endlessStart ? Math.round((Date.now() - this.run.endlessStart) / 1000) : Math.round(this.run.time || 0),
      build: this.loadout ? (this.loadout.summary().name || '') : '',
    };
  }

  /**
   * 提交无尽模式成绩到排行榜。
   * 远端排行榜通过 leaderboard.attachRemote(provider) 预留接入（未接入时只写本地榜）。
   */
  submitEndlessScore() {
    if (!this.endlessBoard) return null;
    const r = this.endlessResult();
    const out = this.endlessBoard.submit(r);
    this.run.lastEndlessSubmit = out;
    return out;
  }

  _settleRun(win) {
    if (!this.difficulty || this.run.settled) return null;
    this.run.settled = true;

    const d = this.difficulty.id;
    const info = {
      wave: this.wave.currentWaveNumber || 0,
      score: this.run.score || 0,
      time: this.run.time || 0,
      kills: this.run.kills || 0,
      eliteKills: this.run.eliteKills || 0,
      evolutions: this.evolution ? Object.keys(this.evolution.flags || {}).length : 0,
      weapons: this.weapons ? this.weapons.ownedIds() : [],
      hardEvent: this.events ? !!this.events.hardActive : false,
      revived: !!this.run.revived,
      buildScore: this.build ? this.build.score() : 0,
    };
    // Phase 18：Build 结算（发现 / 图鉴 / BuildScore 供 D7 解锁用）

    // 无尽模式：不参与难度解锁链（固定基线、无胜利条件），只走排行榜
    if (this.run.endless) {
      const sub = this.submitEndlessScore();
      info.endless = true;
      info.endlessSubmit = sub;
      info.newRecord = !!(sub && sub.newRecord);
      info.rank = sub ? sub.rank : 0;
      this.lastSettleInfo = info;
      return info;
    }

    const res = win ? this.difficulty.settleClear(d, info) : this.difficulty.settleFail(d, info);
    if (this.build) {
      this.build.recordClear(d, info.wave, this.combo ? this.combo.max || 0 : 0);
      this.difficulty.reportBuildScore(this.build.score());
    }
    this.saveMeta();

    if (win) {
      // §35 首通奖励：蓝图按难度倍率发放
      const rw = this.difficulty.rewardMul;
      const bp = Math.round(10 * rw);
      this.meta.blueprint = (this.meta.blueprint || 0) + bp;
      this.saveMeta();
      if (res.firstClear) {
        this.screens.toast(`★ D${d} 首次通关 · 蓝图 +${bp}`, 'good');
        // Phase 19 §35：First Clear Reward 内容树
        const fcr = FIRST_CLEAR_REWARDS[d];
        if (fcr) {
          if (fcr.blueprint) this.meta.blueprint = (this.meta.blueprint || 0) + fcr.blueprint;
          if (fcr.blueprintRare) this.meta.blueprintRare = (this.meta.blueprintRare || 0) + fcr.blueprintRare;
          if (fcr.blueprintLegendary) this.meta.blueprintLegendary = (this.meta.blueprintLegendary || 0) + fcr.blueprintLegendary;
          this.screens.toast(`🎁 首通奖励：${fcr.text}`, 'good');
        }
      }
      // Phase 19：武器精通结算
      this._settleMastery();
      if (res.newlyUnlocked.length) {
        this.screens.toast(`🔓 难度解锁：${res.newlyUnlocked.map((n) => `D${n}`).join(' / ')}`, 'good');
      }
    }
    return res;
  }

  /* ================================================================== */
  /* 主循环                                                              */
  /* ================================================================== */

  update(rawDt) {
    // 慢动作恢复（Boss 死亡后逐渐回到 1x）
    if (this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + rawDt * 0.5);
    const dt = rawDt * this.timeScale;

    this.debug.update(dt);

    // BGM：只在战斗状态播放（内部自带淡入淡出，每帧调用无副作用）
    this.audio.update(rawDt);
    const battle = this.state === GameState.PLAYING
      || this.state === GameState.BOSS
      || this.state === GameState.LEVEL_UP
      || this.state === GameState.SHOP;   // 三选一期间保持播放，避免反复淡入淡出（商店同理）
    this.audio.setBattleBgm(battle);

    switch (this.state) {
      case GameState.PLAYING:
        this._updateBattle(dt);
        break;

      case GameState.MENU:
      case GameState.BASE:
        this.background.update(dt);
        this.particles.update(dt);
        break;

      case GameState.GAME_OVER:
      case GameState.VICTORY:
      case GameState.LEVEL_UP:
      case GameState.SHOP:
        // 逻辑停摆，但保留环境/粒子演出（升级三选一 / 商店时背景仍在动）
        this.background.update(dt);
        this.particles.update(dt);
        this.shake.update(dt);
        break;

      case GameState.PAUSED:
      case GameState.RESULT:
      default:
        // 真正暂停：敌人 / 子弹 / 计时器 / 波次 全部停止
        break;
    }

    this.input.endFrame();
  }

  _updateBattle(dt) {
    this.run.time += dt;
    if (this.invuln > 0) this.invuln -= dt;

    // 心跳存档：刷新 lastSaveTime，保证离线收益的计时基准不过期（Phase 10）
    this._saveAcc += dt;
    if (this._saveAcc >= CONFIG.OFFLINE.saveIntervalSec) {
      this._saveAcc = 0;
      this.saveMeta();
    }

    this.background.update(dt);
    this.base.update(dt);

    // Phase 11：连击 / 危险度 / 随机事件
    this.combo.update(dt);
    this.threat.update(dt, this.enemies.list, this.base);
    this.events.update(dt);
    this.gun.eventFireRateMul = this.events.fireRateMul;   // 供 MachineGun 实时读取

    // 雷达范围：基础 900 × 局内雷达升级 × 永久成长 × 随机事件；EW 存活时 -30%；Phase 17 叠加词缀干扰
    const jam = this.enemies.pools.ewPlane.active.length > 0 ? 0.3 : 0;
    const affixJam = this.enemies.affixRadarMul ? this.enemies.affixRadarMul() : 1;
    const radarR = CONFIG.RADAR.baseRange * this.stats.base.radarRangeMul
      * this.metaRadarMul * this.events.radarMul * (1 - jam) * affixJam;
    // Phase 20 §38 BLACKOUT：雷达 -50%
    this.world.radarRange = this.run.challenges && this.run.challenges.includes('blackout')
      ? radarR * 0.5 : radarR;
    this.world.aimAngle = this.gun.angle;   // Phase 20：Hunter Drone 用
    // 瞄准（含 Soft Aim Assist；辅助强度受猎手核心修正）
    this.aim.update(dt, this.gun, this.input, this.enemies.list, radarR,
      this.stats.base.aimAssistMul || 1);
    // Phase 15：条件型构型加成（过热增伤 / OVERDRIVE）
    this.loadout.update(this);
    // Phase 18：Build Core 条件加成（开关式，绝不逐帧累积）
    this.build.update();

    // 炮塔 / 武器
    this.gun.update(dt, this.aim.angle);
    this.weapons.update(dt);

    // 按住即持续开火（主武器）
    if (this.input.isDown) this.weapons.firePrimary(this.gun, this.world);

    // 副武器自动开火（高射炮 / 导弹，实时读取 aimTarget）
    this.world.aimTarget = this.aim.assistTarget;
    this.weapons.autoUpdate(dt, this.gun, this.world);
    this.equipment.update(dt, this.world);      // Phase 14：战术技能冷却与施放
    this.missiles.update(dt, this.world);

    this.bullets.update(dt, this.world);   // 传 world：高射炮近炸引信需要敌人列表
    this.enemies.update(dt, this.world);
    this.collision.update();

    // XP 光球：磁吸 + 拾取（Phase 3）
    this.xpOrbs.update(dt, this.gun, this.stats.base.pickupRadiusMul, (v, o) => this.collectXp(v, o.x, o.y));

    // 波次推进（驱动 spawn 队列与状态机）
    this.wave.update(dt, this.world);

    // 波次通告倒计时（prepare/clear 期间显示大字）
    if (this.waveNotice.t > 0) this.waveNotice.t -= dt;

    this.particles.update(dt);
    this.shake.update(dt);
  }

  render() {
    const ctx = this.ctx;
    const k = this.view.k;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CONFIG.CANVAS.BG_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 战场（含屏幕震动）
    ctx.setTransform(k, 0, 0, k, this.shake.x * k, this.shake.y * k);

    this.background.render(ctx);
    this.base.render(ctx);
    this.enemies.render(ctx);
    this.bullets.render(ctx);
    this.missiles.render(ctx);
    this.weapons.render(ctx, this.gun); // Phase 13：轨道炮光束 / 脉冲激光线 / 拦截无人机
    this.equipment.render(ctx);          // Phase 14：EMP 环 / 空袭预警圈
    this.gun.render(ctx);
    this.particles.render(ctx);
    this.xpOrbs.render(ctx);

    // HUD（不跟随震动）
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.state === GameState.PLAYING || this.state === GameState.PAUSED || this.state === GameState.LEVEL_UP || this.state === GameState.SHOP) {
      this.hud.render(ctx);
      if (this.state === GameState.PLAYING) this.hud.renderHint(ctx, this.run.time);
    }

    // 无敌闪烁提示
    if (this.invuln > 0 && this.state === GameState.PLAYING) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.run.time * 18);
      ctx.strokeStyle = 'rgba(57,215,255,.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, CONFIG.WORLD.WIDTH - 4, CONFIG.WORLD.HEIGHT - 4);
      ctx.restore();
    }

    // 波次通告（prepare/clear 期间大字幕）
    if (this.waveNotice.t > 0 && this.state === GameState.PLAYING) {
      const a = this.waveNotice.t / 2.5;
      const W = CONFIG.WORLD.WIDTH, H = CONFIG.WORLD.HEIGHT;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(234,246,255,.96)';
      ctx.font = '900 64px Orbitron, Menlo, monospace';
      ctx.fillText(this.waveNotice.text, W / 2, H / 2 - 30);
      ctx.fillStyle = 'rgba(57,215,255,.75)';
      ctx.font = '700 14px Orbitron, Menlo, monospace';
      ctx.fillText('INCOMING  /  CLEARED', W / 2, H / 2 + 22);
      ctx.restore();
    }
  }

  /**
   * 全局按钮音效（Phase 21）
   * 用**捕获阶段**的委托监听统一给所有 DOM 按钮挂上点击音，好处：
   *   - 覆盖全部现有按钮，也覆盖以后新增的按钮（不用再逐处补 audio.click()）
   *   - 捕获阶段先于按钮自身的 click 回调执行，配合 AudioManager 的 40ms 节流，
   *     按钮里已有的 audio.click() 调用会被去重，不会叠成两声
   * 被禁用（disabled）或隐藏的按钮不发声。
   */
  _setupButtonSfx() {
    document.addEventListener('click', (e) => {
      if (!this.audio || !this.audio.enabled) return;
      const el = e.target;
      if (!el || !el.closest) return;
      const btn = el.closest('button, [data-sfx="click"]');
      if (!btn || btn.disabled) return;
      if (btn.getAttribute('aria-disabled') === 'true') return;
      this.audio.click();
    }, true);
  }

  /* ================================================================== */
  /* 自适应                                                              */
  /* ================================================================== */

  resize() {
    const W = CONFIG.WORLD.WIDTH;
    const H = CONFIG.WORLD.HEIGHT;
    const availW = window.innerWidth;
    const availH = window.innerHeight;

    // 逻辑分辨率恒定，只做等比缩放（支持 16:9 / 19.5:9 / 20:9 / 4:3 等任意比例）
    const scale = Math.min(availW / W, availH / H);
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.CANVAS.MAX_DPR);

    this.canvas.width = Math.round(W * scale * dpr);
    this.canvas.height = Math.round(H * scale * dpr);
    this.canvas.style.width = Math.floor(W * scale) + 'px';
    this.canvas.style.height = Math.floor(H * scale) + 'px';

    this.view.scale = scale;
    this.view.dpr = dpr;
    this.view.k = scale * dpr;

    this._applyUiScale(scale, W, H);
  }

  /**
   * UI DPI 适配：把 DOM 覆盖层（主菜单 / 暂停 / 结算 / Toast）当作
   * 与世界同尺寸的"设计画布"，施加与战场 canvas 完全一致的缩放。
   * 这样 UI 与战场始终等比，小屏手机横屏不会把 UI 撑出屏幕。
   * 上限 1.6 防止超大屏（4K / 平板）把菜单文字放得过大。
   */
  _applyUiScale(scale, W, H) {
    const uiScale = Math.max(0.4, Math.min(1.6, scale));
    try {
      const root = document.documentElement;
      if (root && root.style && typeof root.style.setProperty === 'function') {
        root.style.setProperty('--ui-w', W + 'px');
        root.style.setProperty('--ui-h', H + 'px');
        root.style.setProperty('--ui-scale', String(uiScale));
      }
    } catch (_) { /* 无头测试环境没有 documentElement 时跳过 */ }
  }

  /**
   * 转屏处理。
   * 世界宽度是模块加载时按「当时」的屏幕比例算好的（各模块用 const W 缓存了它，
   * 无法运行时改），所以竖屏打开 → 转横屏会得到一个偏窄的世界，左右留黑边。
   * 处理：若新比例算出的宽度与当前相差明显，且玩家还没开战（不会丢进度），
   * 就整页刷新一次让 config.js 按新比例重算。用 sessionStorage 防止刷新循环。
   */
  _onOrientChange() {
    this.resize();
    const aw = Math.max(window.innerWidth, window.innerHeight);
    const ah = Math.min(window.innerWidth, window.innerHeight);
    if (!(aw > 0 && ah > 0)) return;
    const wantW = Math.round(
      Math.max(CONFIG.WORLD_FIT.minWidth,
        Math.min(CONFIG.WORLD_FIT.maxWidth, CONFIG.WORLD.HEIGHT * aw / ah))
    );
    const curW = CONFIG.WORLD.WIDTH;
    if (Math.abs(wantW - curW) <= 40) return;              // 差异可忽略（取整/工具栏微动）
    if (this.state !== GameState.MENU) return;             // 已开战 → 不刷新，避免丢进度
    // 记录「上次刷新时目标宽度」：只有目标又变了才允许再刷，防止来回转屏刷循环
    let last = 0;
    try { last = +sessionStorage.getItem('skybreaker.orientReload') || 0; } catch (_) {}
    if (last && Math.abs(last - wantW) <= 40) return;
    try { sessionStorage.setItem('skybreaker.orientReload', String(wantW)); } catch (_) {}
    location.reload();
  }
}

export default Game;
