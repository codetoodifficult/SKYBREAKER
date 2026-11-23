/**
 * WeaponLevel —— 武器等级成长表（Phase 13）
 *
 * 设计文档 §5.1 给出了 Machine Gun 的 6 级曲线，其余武器沿用同一节奏：
 *   Lv2 伤害 / Lv3 形态（弹数·范围·穿透）/ Lv4 射速 / Lv5 机制 / Lv6 伤害 + Evolution 槽
 * Lv6 不只是"数字更大"，它是 Evolution（进化）的前置条件（Phase 16 落地）。
 *
 * 每个条目是**相对 Lv1 基础值的累计乘算**（不是逐级叠乘），
 * 这样 WeaponBase.applyLevel() 每次只需整体重算，不会因反复升级产生浮点漂移。
 */
export const MAX_WEAPON_LEVEL = 6;

/** 各等级卡面文案：{ short: 卡面短描述 } */
export const WEAPON_LEVELS = {
  /* ---- §5.1 Machine Gun ---- */
  machineGun: [
    { short: '8 伤害 / 9 发每秒' },
    { short: '伤害 ×1.18', damageMul: 1.18 },
    { short: '+1 弹丸，散布 +15%', damageMul: 1.18, multiShot: 1, spreadMul: 1.15 },
    { short: '射速 ×1.22', damageMul: 1.18, multiShot: 1, spreadMul: 1.15, fireRateMul: 1.22 },
    { short: '穿透 +1', damageMul: 1.18, multiShot: 1, spreadMul: 1.15, fireRateMul: 1.22, penetration: 1 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.475, multiShot: 1, spreadMul: 1.15, fireRateMul: 1.22, penetration: 1, evolutionReady: true },
  ],

  /* ---- Flak Cannon：群体控制 ---- */
  flakCannon: [
    { short: '50 伤害 / 105 爆炸范围' },
    { short: '伤害 ×1.18', damageMul: 1.18 },
    { short: '爆炸范围 ×1.15', damageMul: 1.18, explosionRadiusMul: 1.15 },
    { short: '射速 ×1.20', damageMul: 1.18, explosionRadiusMul: 1.15, fireRateMul: 1.20 },
    { short: '爆炸伤害 ×1.25', damageMul: 1.18, explosionRadiusMul: 1.15, fireRateMul: 1.20, explosionDamageMul: 1.25 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.475, explosionRadiusMul: 1.15, fireRateMul: 1.20, explosionDamageMul: 1.25, evolutionReady: true },
  ],

  /* ---- Missile：自动索敌 ---- */
  missile: [
    { short: '70 伤害 / 5 发弹匣' },
    { short: '伤害 ×1.18', damageMul: 1.18 },
    { short: '弹匣 +1', damageMul: 1.18, maxAmmoAdd: 1 },
    { short: '装填 ×0.85', damageMul: 1.18, maxAmmoAdd: 1, reloadTimeMul: 0.85 },
    { short: '齐射 +1', damageMul: 1.18, maxAmmoAdd: 1, reloadTimeMul: 0.85, missileCount: 1 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.475, maxAmmoAdd: 1, reloadTimeMul: 0.85, missileCount: 1, evolutionReady: true },
  ],

  /* ---- Rail Cannon：贯穿 ---- */
  railCannon: [
    { short: '180 伤害 / 穿透 3' },
    { short: '伤害 ×1.18', damageMul: 1.18 },
    { short: '穿透 +1', damageMul: 1.18, penetration: 1 },
    { short: '射速 ×1.20', damageMul: 1.18, penetration: 1, fireRateMul: 1.20 },
    { short: '能量线伤害 60%→80%', damageMul: 1.18, penetration: 1, fireRateMul: 1.20, beamAfterMul: 0.80 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.475, penetration: 1, fireRateMul: 1.20, beamAfterMul: 0.80, evolutionReady: true },
  ],

  /* ---- Pulse Laser：灼烧叠加 ---- */
  pulseLaser: [
    { short: '18 伤害 / 6 脉冲每秒' },
    { short: '伤害 ×1.18', damageMul: 1.18 },
    { short: '灼烧 12→16 /s', damageMul: 1.18, burnDps: 16 },
    { short: '射速 ×1.20', damageMul: 1.18, burnDps: 16, fireRateMul: 1.20 },
    { short: '灼烧上限 +2 层', damageMul: 1.18, burnDps: 16, fireRateMul: 1.20, burnMaxStackAdd: 2 },
    { short: '伤害 ×1.25 · 解锁进化槽', damageMul: 1.475, burnDps: 16, fireRateMul: 1.20, burnMaxStackAdd: 2, evolutionReady: true },
  ],
};

/**
 * 计算某武器在某等级下的属性快照（eff）。
 * 每次都从 cfg 基础值整体重算，避免逐级叠乘产生浮点漂移。
 * @param {object} cfg WEAPONS 中的武器配置
 * @param {number} lv  1..6
 */
/**
 * 通用版：从任意等级表计算属性快照（装备表 EQUIP_LEVELS 与武器表同构，可复用）
 * @param {object} table WEAPON_LEVELS 或 EQUIP_LEVELS
 * @param {object} cfg
 * @param {number} lv
 */
export function computeEffFrom(table, cfg, lv) {
  const list = table[cfg.id];
  const d = (list && list.length)
    ? list[Math.max(0, Math.min(list.length - 1, lv - 1))]
    : {};
  return {
    damage: cfg.damage * (d.damageMul || 1),
    fireRate: cfg.fireRate * (d.fireRateMul || 1),
    bulletSpeed: (cfg.bulletSpeed ?? 0) * (d.bulletSpeedMul || 1),
    spread: (cfg.spread ?? 0) * (d.spreadMul || 1),
    penetration: (cfg.penetration ?? 0) + (d.penetration || 0),
    multiShot: 1 + (d.multiShot || 0),
    explosionRadius: (cfg.explosionRadius ?? 0) * (d.explosionRadiusMul || 1),
    explosionDamage: (cfg.explosionDamage ?? 0) * (d.explosionDamageMul || 1),
    maxAmmo: (cfg.maxAmmo ?? 0) + (d.maxAmmoAdd || 0),
    reloadTime: (cfg.reloadTime ?? 0) * (d.reloadTimeMul || 1),
    missileCount: 1 + (d.missileCount || 0),
    beamAfterMul: d.beamAfterMul ?? cfg.beamAfterMul ?? 0.6,
    beamWidth: cfg.beamWidth ?? 26,
    range: cfg.range ?? 0,
    burnDps: d.burnDps ?? cfg.burnDps ?? 0,
    burnDuration: cfg.burnDuration ?? 0,
    burnMaxStack: (cfg.burnMaxStack ?? 0) + (d.burnMaxStackAdd || 0),

    // 装备专属
    cooldown: (cfg.cooldown ?? 0) * (d.cooldownMul || 1),
    radius: (cfg.radius ?? 0) * (d.radiusMul || 1),
    freeze: (cfg.freeze ?? 0) + (d.freezeAdd || 0),
    strikes: (cfg.strikes ?? 0) + (d.strikesAdd || 0),
    shieldCap: (cfg.shieldCap ?? 0) + (d.shieldCapAdd || 0),
    healPct: (cfg.healPct ?? 0) + (d.healAdd || 0),
    droneCount: (cfg.droneCount ?? 0) + (d.droneCountAdd || 0),

    evolutionReady: !!d.evolutionReady,
  };
}

export function computeEff(cfg, lv) {
  return computeEffFrom(WEAPON_LEVELS, cfg, lv);
}

/** 取某武器某等级的成长条目（越界自动夹取） */
export function levelOf(weaponId, lv) {
  const table = WEAPON_LEVELS[weaponId];
  if (!table) return { short: '' };
  const i = Math.max(0, Math.min(table.length - 1, lv - 1));
  return table[i];
}

export default WEAPON_LEVELS;
