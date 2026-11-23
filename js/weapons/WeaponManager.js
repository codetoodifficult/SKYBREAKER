import { WEAPONS, STARTING_WEAPON } from '../data/weapons.js';
import { WeaponSlots } from './WeaponSlot.js';
import { computeEff, MAX_WEAPON_LEVEL } from './WeaponLevel.js';
import { MachineGun } from './MachineGun.js';
import { FlakCannon } from './FlakCannon.js';
import { MissileLauncher } from './MissileLauncher.js';
import { RailCannon } from './RailCannon.js';
import { PulseLaser } from './PulseLaser.js';
import { InterceptorDrone } from '../equipment/InterceptorDrone.js';
import { WeaponProgression } from '../progression/WeaponProgression.js';
import { applyModsToEff } from '../data/weaponMods.js';

/**
 * 武器管理器（Phase 13 Weapon Framework）
 *
 * - slots：装备槽（primary×1 / auto×3 / tactical×2 / passive×6，见 WeaponSlot.js）
 * - §10：开局只装备 STARTING_WEAPON（Machine Gun）；其余武器实例存在 all 里但 acquired=false，
 *        既不自动开火也不进 HUD，直到玩家通过三选一"获得"
 * - acquire(id) / upgradeWeapon(id)：由 WeaponOffer 生成的卡片驱动
 */
export class WeaponManager {
  constructor() {
    this.slots = new WeaponSlots();
    // Phase B：类型级研发进度（等级与部署状态解耦的唯一数据源）
    this.progression = new WeaponProgression();

    // 全部武器实例（未获得的只是不生效）
    this.all = {
      machineGun: new MachineGun(),
      flakCannon: new FlakCannon(),
      missile: new MissileLauncher(),
      railCannon: new RailCannon(),
      pulseLaser: new PulseLaser(),
      interceptorDrone: new InterceptorDrone(),   // Phase 14：自动武器槽
    };
    this.weapons = [];                       // 兼容：按创建顺序的实例数组
    for (const k in this.all) {
      this.weapons.push(this.all[k]);
      this._pushEff(this.all[k]);
    }

    this.starting = null;
    this.startingId = STARTING_WEAPON;   // Phase 15：由构型（WEAPON 槽）在 startRun 前改写
    this._equipStarting();
  }

  /** 把等级快照下发到武器实例（MachineGun 走 WeaponBase.applyLevel，其余为普通类） */
  _pushEff(w) {
    if (typeof w.applyLevel === 'function') w.applyLevel();
    else w.eff = computeEff(w.cfg, w.level || 1);
    // Phase D：叠加该武器的预研改装（未部署武器也会被写入，但不会开火）
    const mods = this.progression.modsOf(w.id);
    if (mods.length) applyModsToEff(w.eff, mods);
    return w;
  }

  /** Phase 15：设置起手武器（构型 WEAPON 槽） */
  setStarting(id) {
    if (!this.all[id]) return false;
    this.startingId = id;
    return true;
  }

  /**
   * 起手武器一律进 primary 槽（玩家手动开火）。
   * 玩家在出击构型里可以把导弹 / 电磁炮 / 脉冲激光 / 高射炮选成主武器，
   * 若按 cfg.slot 归类它们会掉进 auto 槽自动开火，玩家按住屏幕毫无反应 —— 只能干看着。
   */
  _equipStarting() {
    const w = this.all[this.startingId] || this.all[STARTING_WEAPON] || this.all.machineGun;
    this.slots.add(w, 'primary');
    this._pushEff(w);
    this.starting = w;
  }

  /* ---------------- 对外 ---------------- */

  get primary() { return this.slots.primary; }
  get secondaries() { return this.slots.autos; }

  has(id) { return this.slots.has(id); }
  get(id) { return this.all[id] || null; }

  /** 获得一件武器。返回实例，失败返回 null */
  acquire(id) {
    const w = this.all[id];
    if (!w || this.slots.has(id)) return null;
    if (!this.slots.add(w)) return null;
    // Phase B：部署时继承本局已积累的研发等级（不重置到 Lv1）
    const inheritLv = this.progression.setOwned(id) || 1;
    if (typeof w.setLevel === 'function') w.setLevel(inheritLv);
    else w.level = inheritLv;
    this._pushEff(w);
    if (typeof w.reset === 'function') w.reset();
    return w;
  }

  /**
   * 武器升一级（Phase B：研发 / 强化统一入口）。
   * 已解锁武器无论是否已部署都能研发；未部署时只改类型级进度，不动实体。
   * 返回是否成功。
   */
  upgradeWeapon(id) {
    const w = this.all[id];
    if (!w || !this.progression.canResearch(id)) return false;
    const lv = this.progression.research(id);
    if (!lv) return false;
    // 已部署武器同步到实例，立即强化战斗实体；未部署武器只积累研发等级
    if (this.slots.has(id)) {
      if (typeof w.setLevel === 'function') w.setLevel(lv);
      else w.level = lv;
      this._pushEff(w);
    }
    return true;
  }

  /* ---------------- Phase B：研发进度对外接口 ---------------- */

  getResearchLevel(id) { return this.progression.levelOf(id); }
  canResearch(id) { return this.progression.canResearch(id); }
  isOwnedInProgress(id) { return this.progression.isOwned(id); }
  researchSnapshot() { return this.progression.snapshot(); }

  /** Phase D：预研一枚改装（未部署也能存），成功后立即刷新 eff */
  addMod(weaponId, modId) {
    const ok = this.progression.addMod(weaponId, modId);
    if (!ok) return false;
    const w = this.all[weaponId];
    if (w) this._pushEff(w);   // 已部署武器立即生效；未部署则等 acquire 时继承
    return true;
  }

  modsOf(weaponId) { return this.progression.modsOf(weaponId); }

  list() { return this.slots.list(); }
  get count() { return this.slots.weaponCount; }

  /** Phase 17：本局已获得的主/副武器 id 列表（难度解锁「使用特定武器通关」用） */
  ownedIds() {
    const out = [];
    for (const k in this.all) if (this.slots.has(k)) out.push(k);
    return out;
  }

  /* ---------------- 每帧 ---------------- */

  update(dt) {
    for (const w of this.weapons) if (w.update) w.update(dt);
  }

  /**
   * 每帧推进所有已装备武器（primary + auto）。
   * 注意：主武器槽里的非机炮武器也要走这里 —— 装填 / 锁定 / 冷却 / 光束动画
   * 都在这里推进，只是开火那一步由 firePrimary 等玩家按下才触发
   * （武器内部靠 manual 标记区分，见各武器的 autoUpdate）。
   */
  autoUpdate(dt, gun, world) {
    const p = this.slots.primary;
    if (p && p.autoUpdate) p.autoUpdate(dt, gun, world);
    for (const s of this.slots.autos) {
      if (s.autoUpdate) s.autoUpdate(dt, gun, world);
    }
  }

  /** 玩家开火：只打主武器槽那把 */
  firePrimary(gun, world) {
    const p = this.slots.primary;
    if (p && p.fire) p.fire(gun, world);
  }

  /** 光束 / 脉冲线等武器的自定义绘制层（战斗层之上、HUD 之下） */
  render(ctx, gun) {
    const p = this.slots.primary;
    if (p && p.draw) p.draw(ctx, gun);
    for (const s of this.slots.autos) if (s.draw) s.draw(ctx, gun);
  }

  syncStats(stats) {
    for (const w of this.weapons) if (w.syncStats) w.syncStats(stats);
  }

  reset() {
    // Phase B：每局重置类型级研发进度（起手武器 owned=true，其余 Lv1 未部署）
    this.progression.reset(this.startingId);
    for (const w of this.weapons) {
      if (w.reset) w.reset();
      if (typeof w.setLevel === 'function') w.setLevel(1);
      else w.level = 1;
      this._pushEff(w);
    }
    this.slots.reset();
    this._equipStarting();
  }
}

export { MachineGun, FlakCannon, MissileLauncher, RailCannon, PulseLaser, MAX_WEAPON_LEVEL };
export { WEAPONS };
export default WeaponManager;
