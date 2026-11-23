import { WEAPONS } from '../data/weapons.js';
import { rand } from '../core/utils.js';
import { pickTarget, assistAngle } from '../core/targeting.js';

const BEAM_LIFE = 0.16;      // 能量线显示时长 s
/** 软辅助锥半角：瞬发穿透武器，锥可以放宽 */
const ASSIST_CONE = 0.30;    // ≈17°

/**
 * Rail Cannon 电磁轨道炮（设计文档 §8）
 * 极慢 + 极高伤害 + 穿透。瞬发命中（无弹道），沿射线产生短暂能量线：
 *   前 (penetration+1) 个目标吃满伤害，直线后方的敌人只吃 beamAfterMul（默认 60%）。
 * 目标优先级：血量最高的敌人 —— 用来精确击杀轰炸机 / 运输机 / Boss 核心。
 */
export class RailCannon {
  constructor() {
    this.cfg = WEAPONS.railCannon;
    this.id = this.cfg.id;
    this.name = this.cfg.name;
    this.slot = this.cfg.slot;
    this.maxLevel = this.cfg.maxLevel;
    this.level = 1;
    this.acquired = false;

    this.timer = rand(0, 0.6);   // 错开首次开火，避免所有自动武器同帧齐射
    this.beams = [];             // 待绘制的能量线 { x1,y1,x2,y2,t }
    this.assistCone = ASSIST_CONE;
    this.eff = null;             // 由 WeaponManager 注入等级快照
    this._mkEff();
  }

  _mkEff() {
    // 轻量版：不在武器内部依赖 WeaponLevel，等级快照由 WeaponManager.applyLevel 统一下发；
    // 这里只保证未下发时也有可用值。
    this.eff = this.eff || {
      damage: this.cfg.damage, fireRate: this.cfg.fireRate, penetration: this.cfg.penetration,
      beamAfterMul: this.cfg.beamAfterMul, beamWidth: this.cfg.beamWidth, range: this.cfg.range,
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
  reset() { this.timer = rand(0, 0.6); this.beams.length = 0; }

  /**
   * 选血量最高的敌人（Boss / 运输机 / 轰炸机优先）
   * Phase 21：射程改为读 cfg.range（880），并且目标必须已进画面
   */
  _bestTarget(gun, world) {
    const e = this._mkEff();
    const range = e.range || this.cfg.range || 880;
    const t = pickTarget(gun, world, range, (c, b) => c.e.hp > b.e.hp);
    return t ? t.e : null;
  }

  /**
   * 每帧：推进光束动画与冷却。
   * 手动模式（装在主武器槽）时只更新这两项，开火等玩家按下。
   */
  autoUpdate(dt, gun, world) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }
    if (this.timer > 0) this.timer -= dt;
    if (this.manual) return;
    if (!this.acquired) return;
    this.fire(gun, world);
  }

  /**
   * 开火。
   * - 手动（主武器槽）：沿玩家准星方向（gun.angle）打出穿透射线，指哪打哪。
   * - 自动（自动槽）：保持原行为 —— 自动挑血量最高的目标并算提前量。
   */
  fire(gun, world) {
    if (!this.acquired) return false;
    if (this.timer > 0) return false;

    const e = this._mkEff();
    const RANGE = e.range || this.cfg.range || 880;
    let dx, dy;

    if (this.manual) {
      // 软辅助：复用「作为副武器自动开火时」的选敌结果（血量最高目标）
      const muzzle = { x: gun.x, y: gun.y - 14 };
      const auto = this._bestTarget(gun, world);
      const aAim = assistAngle(muzzle, gun, auto, this.assistCone);
      if (aAim !== null) {
        dx = Math.cos(aAim); dy = Math.sin(aAim);
      } else {
        const a = gun.angle;
        dx = Math.cos(a); dy = Math.sin(a);
      }
    } else {
      const t = this._bestTarget(gun, world);
      if (!t) return false;                        // 自动模式没目标不消耗冷却
      // 提前量：瞬发武器可以忽略，但敌人高速移动时补一点更跟手
      const d = Math.hypot(t.x - gun.x, t.y - gun.y);
      const travel = d / 1800;
      const px = t.x + (t.vx || 0) * travel;
      const py = t.y + (t.vy || 0) * travel;
      const a = Math.atan2(py - gun.y, px - gun.x);
      dx = Math.cos(a); dy = Math.sin(a);
    }

    this.timer = 1 / e.fireRate;
    const a = Math.atan2(dy, dx);

    this.beams.push({ x1: gun.x, y1: gun.y - 14, x2: gun.x + dx * RANGE, y2: gun.y - 14 + dy * RANGE, t: BEAM_LIFE });

    // 主武器：射线扫过的 XP 光球也会被激活（副武器不参与经验交互）
    if (this.manual && world.xpOrbs) {
      world.xpOrbs.hitByBeam(gun.x, gun.y - 14, gun.x + dx * RANGE, gun.y - 14 + dy * RANGE, (e.beamWidth || 8) + 6);
    }

    // 收集射线上的敌人，按沿射线的距离排序
    const w = e.beamWidth;
    const hits = [];
    for (const en of world.enemies.list) {
      if (!en.alive) continue;
      const rx = en.x - gun.x, ry = en.y - (gun.y - 14);
      const along = rx * dx + ry * dy;
      if (along < 0 || along > RANGE) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp > w + en.radius) continue;
      hits.push({ e: en, along });
    }
    hits.sort((p, q) => p.along - q.along);

    const full = (e.penetration || 0) + 1;
    // Phase 16：THUNDER RAIL（磁轨 Lv6 + 高压电容 Lv3）—— 暴击召唤闪电链
    const ev = world.evolutionFlags;
    const thunder = !!(ev && ev.thunderRail);
    const crit = thunder && gun.stats
      ? Math.random() < gun.stats.base.critChance : false;

    hits.forEach((h, i) => {
      let dmg = i < full ? e.damage : e.damage * e.beamAfterMul;
      if (crit && i === 0) dmg *= (gun.stats.base.critDamage || 1.5);
      h.e.takeDamage(Math.round(dmg), world);
    });

    if (crit && hits.length) {
      let from = hits[0].e;
      const used = new Set([from.id]);
      for (let j = 0; j < 3; j++) {
        let best = null, bd = 260 * 260;
        for (const en of world.enemies.list) {
          if (!en.alive || used.has(en.id)) continue;
          const d = (en.x - from.x) ** 2 + (en.y - from.y) ** 2;
          if (d < bd) { bd = d; best = en; }
        }
        if (!best) break;
        used.add(best.id);
        best.takeDamage(60, world);
        world.particles.hit(best.x, best.y, 0, [200, 230, 255]);
        from = best;
      }
      world.particles.explosion(hits[0].e.x, hits[0].e.y, 0.9, [180, 220, 255]);
    }
    if (hits.length) {
      world.particles.hit(hits[0].e.x, hits[0].e.y, a, [180, 240, 255]);
      world.audio.explosion ? world.audio.explosion(0.5) : world.audio.shoot();
    }
    world.shake.shake(this.cfg.muzzleShake.mag, this.cfg.muzzleShake.dur);
    world.audio.shoot();
    return true;
  }

  draw(ctx) {
    if (!this.beams.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const a = Math.max(0, b.t / BEAM_LIFE);
      const g = ctx.createLinearGradient(b.x1, b.y1, b.x2, b.y2);
      g.addColorStop(0, `rgba(160,230,255,${0.9 * a})`);
      g.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 7 * a + 1;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export default RailCannon;
