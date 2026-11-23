import { distSegPoint2 } from '../core/utils.js';

/**
 * 碰撞系统
 * 第一版只用 Circle（子弹-敌机）+ 半径判定（爆炸），不引入 SAT / 复杂物理。
 * 子弹用「上一帧位置 → 当前位置」的线段做扫掠检测，避免高速穿透。
 */
export class CollisionSystem {
  /**
   * @param {import('./Bullet.js').BulletSystem} bullets
   * @param {import('../enemies/EnemyManager.js').EnemyManager} enemies
   * @param {object} world 战斗上下文（particles / audio / shake ...）
   */
  constructor(bullets, enemies, world) {
    this.bullets = bullets;
    this.enemies = enemies;
    this.world = world;
  }

  /**
   * Phase E：命中时按 PlayerStats 的概率施加状态（GDD §4.3 元素卡）。
   * 一次命中最多触发一种状态，避免四张元素卡叠满导致 100% 常驻。
   */
  _applyHitStatus(enemy, bullet) {
    const SE = this.world.statusEffects;
    const s = this.world.gun && this.world.gun.stats ? this.world.gun.stats.base : null;
    if (!SE || !s || !enemy.alive) return;
    const power = s.statusPower || 1;
    const src = bullet.weaponId ? { kind: 'weapon', weaponId: bullet.weaponId } : null;
    const r = Math.random();
    // 逐状态独立判定但短路：先判腐蚀（易伤立即对本次生效），其它取一个
    if (s.corrosionChance > 0 && r < s.corrosionChance) {
      SE.apply(enemy, 'corrosion', { power, source: src });
      return;
    }
    if (s.burnChance > 0 && r < s.burnChance) {
      SE.apply(enemy, 'burn', { power: 12 * power, source: src });
      return;
    }
    if (s.shockChance > 0 && r < s.shockChance) {
      const dmg = Math.max(4, Math.round((bullet.damage || 8) * 0.5));
      SE.shock(enemy, dmg, this.world, src, 2);
      return;
    }
    if (s.chillChance > 0 && r < s.chillChance) {
      SE.apply(enemy, 'chill', { power, source: src });
    }
  }

  update() {
    const blist = this.bullets.list;
    const elist = this.enemies.list;
    const orbs = this.world.xpOrbs ? this.world.xpOrbs.list : null;

    for (let bi = blist.length - 1; bi >= 0; bi--) {
      const b = blist[bi];
      if (b.flak) continue;                          // 高射炮弹走 AoE，不做直接碰撞
      let consumed = false;

      for (let ei = 0; ei < elist.length; ei++) {
        const e = elist[ei];
        if (!e.alive) continue;                       // 死亡敌人不再参与碰撞
        if (b.hitIds.indexOf(e.id) !== -1) continue;  // 该子弹已命中过它

        const rr = (b.r + e.radius);
        const d2 = distSegPoint2(b.px, b.py, b.x, b.y, e.x, e.y);
        if (d2 > rr * rr) continue;

        // 命中
        b.hitIds.push(e.id);
        // Phase E：元素卡状态触发（在扣血前施加，让易伤状态对本次命中生效）
        this._applyHitStatus(e, b);
        const source = b.weaponId ? { kind: 'weapon', weaponId: b.weaponId } : null;
        const killed = e.takeDamage(b.damage, this.world, source);

        // Phase 11：协同「穿甲爆破」——具备穿透的子弹命中后引发小范围爆炸
        if (this.world.synergyFlags && this.world.synergyFlags.armorBreak
            && b.penetration > 0 && this.world.onAreaDamage) {
          this.world.onAreaDamage(b.x, b.y, 46, Math.round(b.damage * 0.6));
          this.world.particles.explosion(b.x, b.y, 0.6, [255, 190, 110]);
        }

        // Phase 16：VULCAN BURST —— 每发命中都引发小范围爆炸
        if (b.boomOnHit && this.world.onAreaDamage) {
          this.world.onAreaDamage(b.x, b.y, b.boomOnHit.radius, Math.round(b.damage * b.boomOnHit.pct));
          this.world.particles.explosion(b.x, b.y, 0.55, [255, 170, 90]);
        }

        if (!killed) {
          this.world.particles.hit(b.x, b.y, Math.atan2(b.vy, b.vx), [190, 235, 255]);
          this.world.audio.hit();
        }

        // 穿透判定
        if (b.hitIds.length > b.penetration) { consumed = true; break; }
      }

      // 子弹命中 XP 光球 → 激活其"追踪炮塔"状态（光球像导弹一样飞回）
      //
      // 【只有主武器子弹能打光球】副武器（自动槽）的子弹一律穿过，不消耗、不激活。
      // 想吃到经验就得用当前局的主武器把光球"打"回来，或者把炮塔开进磁吸范围。
      if (!consumed && b.primary && orbs && orbs.length) {
        for (let oi = 0; oi < orbs.length; oi++) {
          const o = orbs[oi];
          if (!o.alive || o.homing) continue;
          const rr = (b.r + 11);                       // 光球半径 ~11
          const d2 = distSegPoint2(b.px, b.py, b.x, b.y, o.x, o.y);
          if (d2 > rr * rr) continue;

          this.world.xpOrbs.hitByBullet(o, b);
          this.world.particles.hit(b.x, b.y, Math.atan2(b.vy, b.vx), [255, 225, 130]);
          this.world.audio.hit();
          consumed = true;
          break;
        }
      }

      if (consumed) {
        this.bullets.releaseAt(bi);
      }
    }
  }
}

export default CollisionSystem;
