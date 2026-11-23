import { ObjectPool } from '../core/ObjectPool.js';
import { Fighter } from './Fighter.js';
import { Bomber } from './Bomber.js';
import { SuicideDrone } from './Drone.js';
import { Transport } from './Transport.js';
import { EWPlane } from './EWPlane.js';
import { AceFighter } from './AceFighter.js';
import { HeavyBomber } from './HeavyBomber.js';
import { Boss } from './Boss.js';
import { SupportDrone, ShieldCarrier, HunterDrone } from './SupportUnits.js';   // Phase 20
import { EnemyAffix } from './EnemyAffix.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { rand } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * 敌人管理器 —— 所有敌机类型的对象池
 * 刷怪由 WaveManager 通过 world.spawnEnemy() 驱动；本类的"连续刷怪"仅作兼容保留。
 */
export class EnemyManager {
  constructor() {
    this.pools = {
      fighter:   new ObjectPool(() => new Fighter(),      (e) => { e.alive = false; }, 24),
      bomber:    new ObjectPool(() => new Bomber(),       (e) => { e.alive = false; }, 12),
      drone:     new ObjectPool(() => new SuicideDrone(), (e) => { e.alive = false; }, 14),
      transport: new ObjectPool(() => new Transport(),    (e) => { e.alive = false; },  6),
      ewPlane:   new ObjectPool(() => new EWPlane(),      (e) => { e.alive = false; },  4),
      aceFighter: new ObjectPool(() => new AceFighter(),  (e) => { e.alive = false; },  6),
      heavyBomber: new ObjectPool(() => new HeavyBomber(),(e) => { e.alive = false; },  4),
      boss:      new ObjectPool(() => new Boss(),         (e) => { e.alive = false; },  2),
      supportDrone:  new ObjectPool(() => new SupportDrone(),  (e) => { e.alive = false; }, 6),
      shieldCarrier: new ObjectPool(() => new ShieldCarrier(), (e) => { e.alive = false; }, 4),
      hunterDrone:   new ObjectPool(() => new HunterDrone(),   (e) => { e.alive = false; }, 10),
    };
    this.list = [];
    this.continuousSpawner = false;   // WaveManager 模式关闭自动刷怪
    this.spawnTimer = 1.2;
    this.spawnInterval = 1.9;
    this.spawnedTotal = 0;

    // Phase 17：难度与词缀由 Game 注入（未注入时保持 Phase 16 之前的行为，保证旧测试不破）
    this.difficulty = null;
    this.spawnCapOverride = 0;
    this.affixCount = 0;      // 本局带词缀的单位计数（Debug 面板）
    this.challengeHpMul = 1;   // Phase 20：Challenge Modifier 的额外 HP 倍率
    this.endlessHpMul = 1;     // 无尽模式：血量随波次复利增长
  }

  get count() { return this.list.length; }

  /** 当前同屏上限：难度覆盖值优先，否则用 CONFIG.PERF.maxEnemies */
  get cap() { return this.spawnCapOverride || CONFIG.PERF.maxEnemies; }

  /**
   * 任意类型生成。x/y 缺省时随机进场（左右入场）
   * @param {string} type
   * @param {number} [x]
   * @param {number} [y]
   * @param {number} [hpMul=1] 生命倍率（Boss 按玩家等级动态缩放时使用，见 Game.computeBossHp）
   * @param {{elite?:boolean}} [opts] Phase 17：精英插入标记
   */
  spawn(type = 'fighter', x, y, hpMul = 1, opts) {
    const pool = this.pools[type];
    if (!pool) return null;
    if (this.list.length >= this.cap) return null;

    if (x === undefined) {
      const fromLeft = Math.random() < 0.5;
      x = fromLeft ? -50 : W + 50;
    }
    if (y === undefined) {
      if (type === 'ewPlane') y = 80;
      else if (type === 'bomber' || type === 'boss' || type === 'heavyBomber') y = 100;
      else if (type === 'drone') y = 200;
      else y = rand(60, 300);
    }

    // Phase 17：难度缩放（§85 —— 只作用于敌人侧）+ 词缀（§14）
    let cfg = ENEMIES[type];
    if (!cfg) return null;
    const isElite = !!(cfg.isElite || (opts && opts.elite));
    cfg = this._scaleCfg(cfg, isElite, hpMul);

    let affixIds = null;
    if (this.difficulty) {
      // 词缀只给精英或被"精英插入"标记的单位（§15：禁止普通小飞机满身词缀）
      affixIds = EnemyAffix.roll(this.difficulty.id, isElite || cfg.isBoss);
      if (affixIds.length) cfg = EnemyAffix.modifyCfg(cfg, affixIds);
    }

    const e = pool.get().init(cfg, x, y);
    if (affixIds && affixIds.length) { EnemyAffix.attach(e, affixIds); this.affixCount++; }
    this.spawnedTotal++;
    return e;
  }

  /**
   * 难度 × Boss 等级缩放 × 词缀静态段，统一在这里合成 cfg 副本。
   * 必须在 init 之前完成 —— Fighter 之类会在 init 里缓存 cfg.speed。
   */
  _scaleCfg(cfg, isElite, hpMul) {
    let out = this.difficulty ? this.difficulty.scaleCfg(cfg, isElite) : cfg;
    // Phase 20 §38 Iron Sky：敌人 HP +25%
    if (this.challengeHpMul && this.challengeHpMul !== 1) {
      out = { ...out, hp: Math.max(1, Math.round(out.hp * this.challengeHpMul)) };
    }
    // Phase 无尽模式：血量按波次复利增长
    if (this.endlessHpMul && this.endlessHpMul !== 1) {
      out = { ...out, hp: Math.max(1, Math.round(out.hp * this.endlessHpMul)) };
    }
    if (hpMul !== 1) out = { ...out, hp: Math.max(1, Math.round(out.hp * hpMul)) };
    return out;
  }

  update(dt, world) {
    if (this.continuousSpawner) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn('fighter');
        this.spawnInterval = Math.max(0.5, this.spawnInterval - 0.045);
        this.spawnTimer = this.spawnInterval * rand(0.8, 1.2);
      }
    }

    this.list.length = 0;
    for (const key in this.pools) {
      const p = this.pools[key];
      const act = p.active;
      for (let i = act.length - 1; i >= 0; i--) {
        const e = act[i];
        // Phase E：状态结算 DoT（冻结时也继续，燃烧不因 EMP 停摆）
        if (e.alive && world.statusEffects) world.statusEffects.tick(e, dt, world);
        // Phase 14：EMP 瘫痪 —— 冻结移动与开火，但仍可被命中
        if (e.frozen > 0) { e.frozen -= dt; e.hitFlash = Math.max(e.hitFlash, 0.05); }
        else if (e.alive) {
          // Phase 17：词缀每帧效果（再生 / 狂暴 / 护航生成）
          if (e.affixes && e.affixes.length) EnemyAffix.update(e, dt, world);
          // Phase E：冰缓减速（Boss 自动衰减在 speedMul 内处理）
          const sm = world.statusEffects ? world.statusEffects.speedMul(e) : 1;
          e.update(dt * sm, world);
        }
        if (!e.alive) { p.releaseAt(i); continue; }
        this.list.push(e);
      }
    }
  }

  render(ctx) {
    for (const key in this.pools) {
      const act = this.pools[key].active;
      for (let i = 0; i < act.length; i++) {
        act[i].draw(ctx);
        act[i].drawStatus(ctx);     // Phase E：状态图标
        act[i].drawHpBar(ctx);
      }
    }
  }

  killAll(world, silent = false) {
    for (const key in this.pools) {
      const p = this.pools[key];
      for (let i = p.active.length - 1; i >= 0; i--) {
        const e = p.active[i];
        if (silent) e.alive = false;
        else { e.alive = false; e.die(world, true); }
      }
    }
    this.list.length = 0;
  }

  clear() {
    for (const key in this.pools) this.pools[key].releaseAll();
    this.list.length = 0;
    this.spawnTimer = 1.2;
    this.spawnInterval = 1.9;
    this.spawnedTotal = 0;
    this.affixCount = 0;
    this.challengeHpMul = 1;
  }

  /** Phase 17：场上带词缀的单位数（Debug 面板 / HUD） */
  affixAlive() {
    let n = 0;
    for (const e of this.list) if (e.affixes && e.affixes.length) n++;
    return n;
  }

  /** Phase 17：场上精英单位数 */
  eliteAlive() {
    let n = 0;
    for (const e of this.list) if (e.cfg && (e.cfg.isElite || e.cfg.isBoss)) n++;
    return n;
  }

  /** Phase 17：词缀造成的雷达干扰系数（叠加在 EW 干扰之上） */
  affixRadarMul() { return EnemyAffix.radarJamMul(this.list); }

  stats() {
    const s = {};
    for (const key in this.pools) s[key] = this.pools[key].stats();
    return s;
  }
}

export default EnemyManager;
