import { ObjectPool } from '../core/ObjectPool.js';
import { WEAPONS } from '../data/weapons.js';
import { CONFIG } from '../data/config.js';
import { rotateTowards, TAU, dist2 } from '../core/utils.js';
import { inView } from '../core/targeting.js';

const W = CONFIG.WORLD.WIDTH;

/**
 * 防空导弹（追踪实体）
 * 锁定目标 → 转向追踪 → 命中/超时 → 范围爆炸
 * 用对象池；world.onAreaDamage(x, y, radius, damage) 由 Game 提供
 */
function makeMissile() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, angle: 0,
    speed: 0, turnRate: 0,
    target: null, damage: 0, radius: 0,
    life: 0, alive: false, trailT: 0,
    primary: false,     // 是否由【主武器】发射（只有主武器能与 XP 光球交互）
  };
}
function resetMissile(m) { m.alive = false; m.target = null; m.life = 0; m.primary = false; }

export class MissileEntity {
  constructor() {
    this.pool = new ObjectPool(makeMissile, resetMissile, 30);
    this.cfg = WEAPONS.missile;
  }

  get list() { return this.pool.active; }
  get count() { return this.pool.activeCount; }

  /**
   * @param {number} x,y 发射点
   * @param {object} target 目标敌人（可为 null，取 world 内最近）
   * @param {{damage,radius,speed,turnRate}} opt
   * @param {object} world 战斗上下文（用于就近补目标）
   */
  fire(x, y, target, opt, world) {
    if (this.pool.activeCount >= 80) return null;
    const m = this.pool.get();
    m.x = x; m.y = y;
    m.vx = Math.cos(opt.angle ?? -Math.PI / 2) * (opt.speed || this.cfg.bulletSpeed);
    m.vy = Math.sin(opt.angle ?? -Math.PI / 2) * (opt.speed || this.cfg.bulletSpeed);
    m.angle = opt.angle ?? -Math.PI / 2;
    m.speed = opt.speed || this.cfg.bulletSpeed;
    m.turnRate = opt.turnRate || this.cfg.turnRate;
    m.target = target;
    m.damage = opt.damage || this.cfg.damage;
    m.radius = opt.radius || this.cfg.explosionRadius;
    m.life = opt.life || this.cfg.bulletLife;
    m.trailT = 0;
    m.primary = !!opt.primary;
    m.alive = true;
    return m;
  }

  update(dt, world) {
    const act = this.pool.active;
    for (let i = act.length - 1; i >= 0; i--) {
      const m = act[i];
      if (!m.alive) { this.pool.releaseAt(i); continue; }
      m.life -= dt;

      // 目标失效则就近补目标
      if (!m.target || !m.target.alive) m.target = this._nearest(m, world);

      if (m.target) {
        const want = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        m.angle = rotateTowards(m.angle, want, m.turnRate * dt);
        m.vx = Math.cos(m.angle) * m.speed;
        m.vy = Math.sin(m.angle) * m.speed;
      } else {
        m.vx = Math.cos(m.angle) * m.speed;
        m.vy = Math.sin(m.angle) * m.speed;
      }

      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // 尾迹
      m.trailT -= dt;
      if (m.trailT <= 0) { m.trailT = 0.03; world.particles.trail(m.x, m.y, [255, 150, 60]); }

      // 命中判定
      let hit = false;
      if (m.target && m.target.alive && dist2(m.x, m.y, m.target.x, m.target.y) < (m.target.radius + 12) ** 2) {
        hit = true;
      }
      const out = m.x < -60 || m.x > W + 60 || m.y < -160 || m.y > 760;
      if (hit || m.life <= 0 || out) {
        this._explode(m, world, hit);
        m.alive = false;
        this.pool.releaseAt(i);
      }
    }
  }

  /**
   * 目标失效后就近补目标。
   * Phase 21：只补"已进画面"的目标，否则导弹会追着画面外的敌人飞出去，
   * 玩家只看到导弹冲出屏幕然后一声爆炸。
   */
  _nearest(m, world) {
    const list = world.enemies.list;
    let best = null, bd = Infinity;
    for (const e of list) {
      if (!e.alive || !inView(e)) continue;
      const d = dist2(m.x, m.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _explode(m, world, hit) {
    world.particles.explosion(m.x, m.y, m.radius / 70, [255, 170, 70]);
    world.audio.explosion(0.9);
    world.shake.shake(3, 90);
    if (world.onAreaDamage) world.onAreaDamage(m.x, m.y, m.radius, m.damage);

    // 主武器导弹：冲击波把爆炸范围内的 XP 光球掀起来（随后照样追踪炮塔飞回）
    if (m.primary && world.xpOrbs) world.xpOrbs.activateInCircle(m.x, m.y, m.radius, 0, 0);

    // Phase 16：STORM HUNTER（导弹 Lv6 + EMP Lv3）—— 对瘫痪目标双倍伤害并引发电弧
    const ev = world.evolutionFlags;
    if (ev && ev.stormHunter && hit && hit.alive && (hit.frozen || 0) > 0) {
      hit.takeDamage(Math.round(m.damage), world);           // 额外 +100%
      world.particles.explosion(hit.x, hit.y, 0.8, [140, 220, 255]);
      // 电弧：最多跳跃 2 个目标
      let from = hit;
      const used = new Set([hit.id]);
      for (let j = 0; j < 2; j++) {
        let best = null, bd = 220 * 220;
        for (const e of world.enemies.list) {
          if (!e.alive || used.has(e.id)) continue;
          const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        used.add(best.id);
        best.takeDamage(Math.round(m.damage * 0.6), world);
        world.particles.hit(best.x, best.y, 0, [180, 235, 255]);
        from = best;
      }
    }
  }

  render(ctx) {
    const act = this.pool.active;
    ctx.save();
    for (let i = 0; i < act.length; i++) {
      const m = act[i];
      if (!m.alive) continue;
      // 尾焰
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(m.x - Math.cos(m.angle) * 8, m.y - Math.sin(m.angle) * 8, 0, m.x - Math.cos(m.angle) * 8, m.y - Math.sin(m.angle) * 8, 10);
      g.addColorStop(0, 'rgba(255,190,90,.9)');
      g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(m.x - Math.cos(m.angle) * 8, m.y - Math.sin(m.angle) * 8, 10, 0, TAU); ctx.fill();
      ctx.restore();
      // 弹体
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = '#dfe8f2';
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-8, 0); ctx.lineTo(-4, 3.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7a3d';
      ctx.fillRect(-4, -3.5, 2, 7);
      ctx.restore();
    }
    ctx.restore();
  }

  clear() { this.pool.releaseAll(); }
  stats() { return this.pool.stats(); }
}

export default MissileEntity;
