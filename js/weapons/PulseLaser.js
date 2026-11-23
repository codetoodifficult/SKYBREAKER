import { WEAPONS } from '../data/weapons.js';
import { rand } from '../core/utils.js';
import { pickTarget, pickTargetAlong, assistAngle } from '../core/targeting.js';

/** 软辅助锥半角：贴脸短射程武器，锥最宽 */
const ASSIST_CONE = 0.42;    // ≈24°

/**
 * Pulse Laser 脉冲激光（设计文档 §9）
 * 不是持续射线，而是高频瞬发能量脉冲：
 *   - 射程内瞬发命中（无弹道），优先打离准星最近 / 最近的敌人
 *   - 对同一目标连续命中叠加「灼烧」：每秒 burnDps，持续 burnDuration，最多 burnMaxStack 层
 *
 * 灼烧不写进 Enemy 基类，而是在本类内用 e._burn 挂件自行 tick，
 * 避免为一件武器改动所有敌人的更新循环。
 */
export class PulseLaser {
  constructor() {
    this.cfg = WEAPONS.pulseLaser;
    this.id = this.cfg.id;
    this.name = this.cfg.name;
    this.slot = this.cfg.slot;
    this.maxLevel = this.cfg.maxLevel;
    this.level = 1;
    this.acquired = false;

    this.timer = rand(0, 0.4);
    this.shots = [];          // 待绘制的脉冲线段
    this.assistCone = ASSIST_CONE;
    this.eff = null;
    this._mkEff();
  }

  _mkEff() {
    this.eff = this.eff || {
      damage: this.cfg.damage, fireRate: this.cfg.fireRate, range: this.cfg.range,
      burnDps: this.cfg.burnDps, burnDuration: this.cfg.burnDuration, burnMaxStack: this.cfg.burnMaxStack,
    };
    return this.eff;
  }

  setLevel(lv) { this.level = Math.max(1, Math.min(this.maxLevel, lv | 0)); }
  get isMaxLevel() { return this.level >= this.maxLevel; }

  /** 就绪进度 0~1（1 = 可以开火），主武器槽时给 HUD 画冷却条 */
  get readyRatio() {
    const e = this._mkEff();
    const cd = 1 / (e.fireRate || 1);
    if (!(this.timer > 0)) return 1;
    return Math.max(0, Math.min(1, 1 - this.timer / cd));
  }
  syncStats() {}
  reset() { this.timer = rand(0, 0.4); this.shots.length = 0; }

  /**
   * 最近目标
   * Phase 21：射程内 + 已进画面（原先只判距离，画面外的敌人会被激光点掉）
   */
  _nearest(gun, world, range) {
    const t = pickTarget(gun, world, range);
    return t ? t.e : null;
  }

  /**
   * 每帧：推进激光线动画、灼烧结算与冷却。
   * 手动模式（装在主武器槽）时只更新这些，开火等玩家按下。
   */
  autoUpdate(dt, gun, world) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      this.shots[i].t -= dt;
      if (this.shots[i].t <= 0) this.shots.splice(i, 1);
    }
    this._tickBurns(dt, world);
    if (this.timer > 0) this.timer -= dt;
    if (this.manual) return;
    if (!this.acquired) return;
    this.fire(gun, world);
  }

  /**
   * 开火。
   * - 手动（主武器槽）：沿玩家准星方向（gun.angle）烧射线上第一个目标；
   *   空放也会出一道激光（给反馈），和机炮打空一样。
   * - 自动（自动槽）：保持原行为 —— 自动索敌最近目标。
   */
  fire(gun, world) {
    if (!this.acquired) return false;
    if (this.timer > 0) return false;

    const e = this._mkEff();
    const muzzle = { x: gun.x, y: gun.y - 14 };
    let t = null;

    if (this.manual) {
      // 软辅助：复用「作为副武器自动开火时」的选敌结果（最近目标）
      const auto = this._nearest(gun, world, e.range);
      const aAim = assistAngle(muzzle, gun, auto, this.assistCone);
      if (aAim !== null) t = auto;
      else {
        const hit = pickTargetAlong(muzzle, world, e.range, gun.angle, 18);
        t = hit ? hit.e : null;
      }
    } else {
      t = this._nearest(gun, world, e.range);
      if (!t) return false;                        // 自动模式没目标不消耗冷却
    }

    this.timer = 1 / e.fireRate;

    if (t) {
      const dmg = Math.round(e.damage);
      t.takeDamage(dmg, world);
      this._addBurn(t, e, world);
      this.shots.push({ x1: muzzle.x, y1: muzzle.y, x2: t.x, y2: t.y, t: 0.12 });
      world.particles.hit(t.x, t.y, Math.atan2(t.y - muzzle.y, t.x - muzzle.x), [120, 255, 210]);
    } else {
      // 手动空放：沿准星方向画一道到最大射程的激光
      this.shots.push({
        x1: muzzle.x, y1: muzzle.y,
        x2: muzzle.x + Math.cos(gun.angle) * e.range,
        y2: muzzle.y + Math.sin(gun.angle) * e.range,
        t: 0.08,
      });
    }
    // 主武器：光束扫过的 XP 光球也会被激活（副武器不参与经验交互）
    if (this.manual && world.xpOrbs) {
      const s = this.shots[this.shots.length - 1];
      if (s) {
        // 沿本次开火方向扫到最大射程（视觉光束止于目标，但脉冲是瞬发的，
        // 让它扫满射程，玩家才指哪吃哪）
        const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
        const len = Math.hypot(dx, dy) || 1;
        const k = (e.range || 420) / len;
        world.xpOrbs.hitByBeam(s.x1, s.y1, s.x1 + dx * k, s.y1 + dy * k, 12);
      }
    }

    world.audio.shoot();
    world.shake.shake(this.cfg.muzzleShake.mag, this.cfg.muzzleShake.dur);
    return true;
  }

  /**
   * Phase E：灼烧改为走统一状态系统（Boss 衰减 / 来源归属 / 叠层上限一致）。
   * 同时保留 enemy._burn 镜像，兼容既有测试与 HUD 读取；伤害只由 StatusEffects.tick 结算一次。
   */
  _addBurn(enemy, e, world) {
    if (!e.burnDps) return;
    if (world && world.statusEffects) {
      world.statusEffects.apply(enemy, 'burn', {
        power: e.burnDps,
        durationMul: e.burnDuration / 2,   // STATUS_DEF.burn.duration = 3s，按武器配置缩放
        stacks: 1,
        source: { kind: 'weapon', weaponId: this.id },
      });
      // 镜像：保留老字段形态 {dps,left,stacks}
      const s = enemy._status && enemy._status.burn;
      enemy._burn = s ? { dps: s.power, left: s.left, stacks: s.stacks } : null;
    } else {
      // 兜底（无状态系统的旧环境）：维持原行为
      const b = enemy._burn || (enemy._burn = { dps: 0, left: 0, stacks: 0 });
      b.dps = e.burnDps; b.left = e.burnDuration;
      b.stacks = Math.min(e.burnMaxStack, b.stacks + 1);
    }
  }

  _tickBurns(dt, world) {
    // Phase E：统一状态系统接管 DoT；这里只同步镜像（实际伤害在 EnemyManager 里 tick）
    const list = world.enemies && world.enemies.list;
    if (!list) return;
    for (const e of list) {
      if (!e.alive) continue;
      const s = e._status && e._status.burn;
      if (s) e._burn = { dps: s.power, left: s.left, stacks: s.stacks };
      else if (e._burn && !world.statusEffects) {
        // 旧环境兜底结算（新系统中不会进入此分支）
        if (e._burn.left > 0) {
          e._burn.left -= dt;
          const dmg = e._burn.dps * e._burn.stacks * dt;
          e._burnAcc = (e._burnAcc || 0) + dmg;
          if (e._burnAcc >= 1) {
            const whole = Math.floor(e._burnAcc); e._burnAcc -= whole;
            e.takeDamage(whole, world);
          }
        } else e._burn = null;
      }
    }
  }

  draw(ctx) {
    if (!this.shots.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shots) {
      const a = Math.max(0, s.t / 0.12);
      ctx.strokeStyle = `rgba(120,255,210,${0.85 * a})`;
      ctx.lineWidth = 3 * a + 0.8;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export default PulseLaser;
