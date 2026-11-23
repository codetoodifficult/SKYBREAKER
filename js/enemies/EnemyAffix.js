import { AFFIXES, AFFIX_ORDER, ELITE_ONLY_AFFIXES, affixRule } from '../data/affixes.js';

/**
 * EnemyAffix —— 词缀运行时（Phase 17 框架，设计文档 §14 / §15）
 *
 * 分两段执行，避免污染 Enemy 子类：
 *   ① 静态段 modifyCfg()：在 init 之前改写 cfg（HP / 速度 / 伤害），
 *      这样 Fighter 这类"init 里缓存 cfg.speed"的子类也能正确吃到加成。
 *   ② 运行段 attach()/update()/onDamaged()/onDeath()：只挂在基类 Enemy 的三个钩子上。
 *
 * 词缀绝不叠加到"普通小飞机满身词缀"（§15）：只有精英或被强化的单位才会 roll。
 */
export class EnemyAffix {
  /**
   * 掷词缀
   * @param {number} d 难度
   * @param {boolean} isElite
   * @returns {string[]}
   */
  static roll(d, isElite) {
    const rule = affixRule(d, isElite);
    if (!rule.enabled) return [];
    if (Math.random() >= rule.chance) return [];

    const count = rule.maxCount > 1 && Math.random() < 0.45 ? 2 : 1;   // §15：精英有概率 2 个
    let pool = AFFIX_ORDER.filter((id) => isElite || !ELITE_ONLY_AFFIXES.has(id));
    if (!pool.length) pool = AFFIX_ORDER.slice();

    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const id = pool[(Math.random() * pool.length) | 0];
      out.push(id);
      pool = pool.filter((p) => p !== id);
    }
    return out;
  }

  /** 静态段：把词缀的数值写进 cfg 副本（不改变原 ENEMIES 表） */
  static modifyCfg(cfg, ids) {
    if (!ids || !ids.length) return cfg;
    let hpMul = 1, speedMul = 1, damageMul = 1;
    for (const id of ids) {
      const a = AFFIXES[id];
      if (!a) continue;
      if (a.hpMul) hpMul *= a.hpMul;
      if (a.speedMul) speedMul *= a.speedMul;
      if (a.berserkDamageMul) { /* 狂暴是条件触发，不进静态 */ }
    }
    if (hpMul === 1 && speedMul === 1 && damageMul === 1) return cfg;
    const out = { ...cfg };
    if (hpMul !== 1) out.hp = Math.max(1, Math.round(cfg.hp * hpMul));
    if (speedMul !== 1) {
      out.speed = cfg.speed * speedMul;
      if (cfg.diveSpeed) out.diveSpeed = cfg.diveSpeed * speedMul;
    }
    if (damageMul !== 1) out.damage = Math.round(cfg.damage * damageMul);
    return out;
  }

  /** 运行段：挂载词缀到敌人实例 */
  static attach(enemy, ids) {
    if (!ids || !ids.length) { enemy.affixes = null; return enemy; }
    enemy.affixes = ids.slice();

    for (const id of ids) {
      const a = AFFIXES[id];
      if (!a) continue;
      if (a.onDamaged === 'shield') enemy.affixShield = a.shieldHp;
      if (a.onDamaged === 'dodge') { enemy.affixDodgeLeft = 1; }
      if (a.onSpawn === 'escort') enemy.affixPendingEscort = a;
    }
    enemy.affixBerserkOn = false;
    return enemy;
  }

  /** 每帧（由 EnemyManager 在所有敌人 update 之前统一调用） */
  static update(enemy, dt, world) {
    const ids = enemy.affixes;
    if (!ids || !ids.length) return;

    for (const id of ids) {
      const a = AFFIXES[id];
      if (!a) continue;

      // 再生
      if (a.regenPerSec) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + a.regenPerSec * dt);
      }

      // 狂暴（条件触发：不改写缓存速度，改为"额外位移"，避免污染子类的 speed 缓存）
      if (a.berserkBelow) {
        const want = enemy.hp < enemy.maxHp * a.berserkBelow;
        if (want !== enemy.affixBerserkOn) {
          enemy.affixBerserkOn = want;
          enemy.affixSpeedBuff = want ? a.berserkSpeedMul : 1;
        }
        if (want) {
          const k = (a.berserkSpeedMul - 1);
          enemy.x += (enemy.vx || 0) * k * dt;
          enemy.y += (enemy.vy || 0) * k * dt;
        }
      }

      // 护航（延迟到有 world 的第一帧再生成）
      if (enemy.affixPendingEscort && world) {
        const a2 = enemy.affixPendingEscort;
        enemy.affixPendingEscort = null;
        for (let i = 0; i < a2.escortCount; i++) {
          const sx = enemy.x + (i === 0 ? -46 : 46);
          const sy = enemy.y + 30;
          if (world.spawnEnemy) world.spawnEnemy(a2.escortType, sx, sy);
        }
      }
    }
  }

  /**
   * 受伤钩子（Enemy.takeDamage 内调用）
   * @returns {{dmg:number, dodged:boolean, absorbed:boolean}}
   */
  static onDamaged(enemy, dmg, world) {
    const ids = enemy.affixes;
    if (!ids || !ids.length) return { dmg, dodged: false, absorbed: false };

    for (const id of ids) {
      const a = AFFIXES[id];
      if (!a) continue;

      // 老练：一次闪避
      if (a.onDamaged === 'dodge' && enemy.affixDodgeLeft > 0) {
        if (Math.random() < a.dodgeChance) {
          enemy.affixDodgeLeft--;
          if (world && world.particles) world.particles.hit(enemy.x, enemy.y, 0, [255, 209, 102]);
          return { dmg: 0, dodged: true, absorbed: false };
        }
      }

      // 护盾：首次受伤展开，吸收伤害直到打破
      if (a.onDamaged === 'shield' && enemy.affixShield > 0) {
        const left = enemy.affixShield - dmg;
        if (left > 0) {
          enemy.affixShield = left;
          return { dmg: 0, dodged: false, absorbed: true };
        }
        enemy.affixShield = 0;
        return { dmg: -left, dodged: false, absorbed: true };   // 溢出部分才扣血
      }
    }
    return { dmg, dodged: false, absorbed: false };
  }

  /** 死亡钩子（Enemy.die 内调用） */
  static onDeath(enemy, world) {
    const ids = enemy.affixes;
    if (!ids || !ids.length || !world) return;

    for (const id of ids) {
      const a = AFFIXES[id];
      if (!a) continue;

      if (a.onDeath === 'split') {
        for (let i = 0; i < a.splitCount; i++) {
          const sx = enemy.x + (i === 0 ? -22 : 22);
          if (world.spawnEnemy) world.spawnEnemy(a.splitType, sx, enemy.y + 8);
        }
      }

      if (a.onDeath === 'explode') {
        if (world.onAreaDamage) world.onAreaDamage(enemy.x, enemy.y, a.boomRadius, a.boomDamage);
        if (world.particles) world.particles.explosion(enemy.x, enemy.y, 1.6, [255, 140, 60]);
        if (world.shake) world.shake.shake(4, 120);
      }
    }
  }

  /** 场上所有干扰词缀叠加后的雷达系数 */
  static radarJamMul(list) {
    let jam = 0;
    for (const e of list) {
      if (!e.alive || !e.affixes) continue;
      for (const id of e.affixes) {
        const a = AFFIXES[id];
        if (a && a.radarJam) jam += a.radarJam;
      }
    }
    return Math.max(0.4, 1 - jam);
  }

  /** HUD / Debug 用的短标签，如 "ARM·REG" */
  static label(enemy) {
    if (!enemy.affixes || !enemy.affixes.length) return '';
    return enemy.affixes.map((id) => (AFFIXES[id] ? AFFIXES[id].short : '?')).join('·');
  }

  /** 是否有护盾（HUD 显示用） */
  static shieldHp(enemy) { return enemy.affixShield || 0; }
}

export default EnemyAffix;
