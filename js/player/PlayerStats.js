/**
 * PlayerStats —— 玩家永久 / 局内成长数值
 * 升级（UpgradeManager.apply）写入这里；武器 / 敌人伤害 / 拾取等所有系统都从这里取值。
 */
export class PlayerStats {
  constructor() {
    this.base = null;
    this.timesTaken = {};
    this.reset();
  }

  reset() {
    this.base = {
      damageMul: 1,
      fireRateMul: 1,
      bulletSpeedMul: 1,
      critChance: 0.05,
      critDamage: 1.5,
      penetration: 0,
      maxHeatMul: 1,
      coolRateMul: 1,
      radarRangeMul: 1,
      pickupRadiusMul: 1,
      xpMul: 1,
      armor: 0,            // 0~1 减伤比例
      multiShot: 1,
      maxHpMul: 1,
      repairPct: 0,        // 立即修复比例
      shield: 0,           // 护盾层数

      // 副武器（Phase 7：导弹 / 高射炮）
      missileDamageMul: 1,
      missileCount: 1,
      missileCooldownMul: 1,   // <1 = 更快
      missileSpeedMul: 1,
      lockTimeMul: 1,          // 锁定时间 <1 = 更快
      maxAmmoMul: 1,
      reloadTimeMul: 1,        // 装填时间 <1 = 更快
      targeting: 0,            // 额外同时锁定数

      // 构型（Phase 15：Core × Weapon × Power）
      heatPerShotMul: 1,       // 每发积累热量倍率（高压核心 ×1.20）
      weaponCdMul: 1,          // 武器冷却倍率 <1 = 更快（稳定核心 ×0.92）
      skillCdMul: 1,           // 战术技能冷却倍率 <1 = 更快（电容核心 ×0.8）
      damageTakenMul: 1,       // 基地受到伤害倍率 <1 = 更耐打
      explosionRadiusMul: 1,   // 爆炸范围倍率
      aimAssistMul: 1,         // 辅助瞄准强度倍率
      empDamageMul: 1,         // EMP / 特殊武器伤害倍率
      luck: 0,                 // §3.3 幸运：提升高稀有卡权重与稀有卡出现率（递减收益，100 封顶）

      // Phase E：状态触发概率（GDD §4.3 元素卡，上限 0.6 常规 / 0.8 特殊）
      burnChance: 0,
      shockChance: 0,
      chillChance: 0,
      corrosionChance: 0,
      statusPower: 1,          // 状态强度倍率（腐蚀易伤 / 冰缓减速 / 灼烧 DPS）
    };
    this.timesTaken = {};
  }

  /** 应用一次升级的定义 */
  apply(upgrade) {
    const u = upgrade;
    const b = this.base;
    if (u.damageMul)        b.damageMul      *= u.damageMul;
    if (u.fireRateMul)      b.fireRateMul    *= u.fireRateMul;
    if (u.bulletSpeedMul)   b.bulletSpeedMul *= u.bulletSpeedMul;
    if (u.critChance)       b.critChance      = Math.min(0.95, b.critChance + u.critChance);
    if (u.critDamageMul)    b.critDamage     *= u.critDamageMul;
    if (u.penetration)      b.penetration    += u.penetration;
    if (u.maxHeatMul)       b.maxHeatMul     *= u.maxHeatMul;
    if (u.coolRateMul)      b.coolRateMul    *= u.coolRateMul;
    if (u.radarRangeMul)    b.radarRangeMul  *= u.radarRangeMul;
    if (u.pickupRadiusMul)  b.pickupRadiusMul *= u.pickupRadiusMul;
    if (u.xpMul)            b.xpMul          *= u.xpMul;
    if (u.armor)            b.armor           = Math.min(0.9, b.armor + u.armor);
    if (u.multiShot)        b.multiShot      += u.multiShot;
    if (u.maxHpMul)         b.maxHpMul       *= u.maxHpMul;
    if (u.repairPct)        b.repairPct      += u.repairPct;
    if (u.shield)           b.shield         += u.shield;
    // 副武器
    if (u.missileDamageMul)   b.missileDamageMul   *= u.missileDamageMul;
    if (u.missileCount)       b.missileCount       += u.missileCount;
    if (u.missileCooldownMul) b.missileCooldownMul *= u.missileCooldownMul;
    if (u.missileSpeedMul)    b.missileSpeedMul    *= u.missileSpeedMul;
    if (u.lockTimeMul)        b.lockTimeMul        *= u.lockTimeMul;
    if (u.maxAmmoMul)         b.maxAmmoMul         *= u.maxAmmoMul;
    if (u.reloadTimeMul)      b.reloadTimeMul      *= u.reloadTimeMul;
    if (u.targeting)          b.targeting          += u.targeting;
    // 构型 / 装备共用的附加乘区（Phase 15~16）
    if (u.heatPerShotMul)     b.heatPerShotMul     *= u.heatPerShotMul;
    if (u.weaponCdMul)        b.weaponCdMul        *= u.weaponCdMul;
    if (u.skillCdMul)         b.skillCdMul         *= u.skillCdMul;
    if (u.damageTakenMul)     b.damageTakenMul     *= u.damageTakenMul;
    if (u.explosionRadiusMul) b.explosionRadiusMul *= u.explosionRadiusMul;
    if (u.aimAssistMul)       b.aimAssistMul       *= u.aimAssistMul;
    if (u.empDamageMul)       b.empDamageMul       *= u.empDamageMul;
    if (u.luckAdd)            b.luck += u.luckAdd;   // §3.3 幸运为加算属性
    // Phase E：状态触发概率（软上限 0.6，特殊卡可到 0.8）
    if (u.burnChance)         b.burnChance         = Math.min(0.8, b.burnChance + u.burnChance);
    if (u.shockChance)        b.shockChance        = Math.min(0.8, b.shockChance + u.shockChance);
    if (u.chillChance)        b.chillChance        = Math.min(0.8, b.chillChance + u.chillChance);
    if (u.corrosionChance)    b.corrosionChance    = Math.min(0.8, b.corrosionChance + u.corrosionChance);
    if (u.statusPower)        b.statusPower        *= u.statusPower;
    this.timesTaken[upgrade.id] = (this.timesTaken[upgrade.id] || 0) + 1;
  }

  /** 已选次数，用于升级池软加权 */
  taken(id) { return this.timesTaken[id] || 0; }

  /** Phase 18 §30：本局已完成的升级总数（用于"前 3 次三选一必须保留新方向"） */
  totalTaken() {
    let n = 0;
    for (const k in this.timesTaken) n += this.timesTaken[k];
    return n;
  }
}

export default PlayerStats;
