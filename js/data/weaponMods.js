/**
 * 武器专属改装（Phase D，GDD 第 5 章）
 *
 * 设计原则（GDD §0.3 / §5）：
 *   - 每张改装必须有真实战斗效果 —— 全部通过 `stats` 修改武器等级快照 eff 中
 *     已被开火逻辑消费的字段（damage / fireRate / penetration / explosion…），
 *     不新增"只显示不生效"的卡。
 *   - 改装与等级分离：不改变武器 ID、不覆盖等级快照，只在 eff 上叠加增量。
 *   - 每把武器最多 2 个改装；`exclusive` 组内互斥（如穿甲弹链 vs 空尖弹）。
 *   - 未部署武器也能预研：改装存入 weaponProgress[id].mods，部署后 _pushEff 自动生效。
 *
 * stats 语法：{ 字段名: { add: 数值 } | { mul: 数值 } }
 */

export const MOD_SLOT_CAP = 2;

export const WEAPON_MODS = {
  /* ---------------- Machine Gun 机炮 ---------------- */
  mgArmorPiercer: {
    id: 'mgArmorPiercer', weaponId: 'machineGun', name: '穿甲弹链',
    rarity: 'uncommon', exclusive: 'mgMode',
    desc: '穿透 +2，单发伤害 -6%',
    stats: { penetration: { add: 2 }, damage: { mul: 0.94 } },
  },
  mgHollowPoint: {
    id: 'mgHollowPoint', weaponId: 'machineGun', name: '空尖弹',
    rarity: 'uncommon', exclusive: 'mgMode',
    desc: '伤害 +25%，射速 -12%',
    stats: { damage: { mul: 1.25 }, fireRate: { mul: 0.88 } },
  },
  mgRicochet: {
    id: 'mgRicochet', weaponId: 'machineGun', name: '跳弹机构',
    rarity: 'rare', exclusive: null,
    desc: '弹丸 +1，散布收窄 15%',
    stats: { multiShot: { add: 1 }, spread: { mul: 0.85 } },
  },
  mgOverfeed: {
    id: 'mgOverfeed', weaponId: 'machineGun', name: '超量供弹',
    rarity: 'epic', exclusive: null,
    desc: '射速 +35%，弹速 +10%',
    stats: { fireRate: { mul: 1.35 }, bulletSpeed: { mul: 1.10 } },
  },

  /* ---------------- Flak Cannon 高射炮 ---------------- */
  flakCluster: {
    id: 'flakCluster', weaponId: 'flakCannon', name: '集束破片',
    rarity: 'uncommon', exclusive: 'flakMode',
    desc: '爆炸范围 +22%，爆炸伤害 -8%',
    stats: { explosionRadius: { mul: 1.22 }, explosionDamage: { mul: 0.92 } },
  },
  flakFocused: {
    id: 'flakFocused', weaponId: 'flakCannon', name: '聚焦引信',
    rarity: 'uncommon', exclusive: 'flakMode',
    desc: '爆炸伤害 +30%，爆炸范围 -15%',
    stats: { explosionDamage: { mul: 1.30 }, explosionRadius: { mul: 0.85 } },
  },
  flakProximity: {
    id: 'flakProximity', weaponId: 'flakCannon', name: '近炸引信',
    rarity: 'rare', exclusive: null,
    desc: '射程 +18%，射速 +15%',
    stats: { range: { mul: 1.18 }, fireRate: { mul: 1.15 } },
  },
  flakSiegeShell: {
    id: 'flakSiegeShell', weaponId: 'flakCannon', name: '攻城弹',
    rarity: 'epic', exclusive: null,
    desc: '爆炸伤害 +35%，射速 -10%',
    stats: { explosionDamage: { mul: 1.35 }, fireRate: { mul: 0.90 } },
  },

  /* ---------------- Missile 导弹 ---------------- */
  missileSwarm: {
    id: 'missileSwarm', weaponId: 'missile', name: '蜂群弹头',
    rarity: 'uncommon', exclusive: 'missileMode',
    desc: '齐射 +1，单发伤害 -15%',
    stats: { missileCount: { add: 1 }, damage: { mul: 0.85 } },
  },
  missileHeavy: {
    id: 'missileHeavy', weaponId: 'missile', name: '重型弹头',
    rarity: 'uncommon', exclusive: 'missileMode',
    desc: '伤害 +35%，装填时间 +20%',
    stats: { damage: { mul: 1.35 }, reloadTime: { mul: 1.20 } },
  },
  missileEMP: {
    id: 'missileEMP', weaponId: 'missile', name: 'EMP 弹头',
    rarity: 'rare', exclusive: null,
    desc: '爆炸范围 +25%，弹匣 +1',
    stats: { explosionRadius: { mul: 1.25 }, maxAmmo: { add: 1 } },
  },
  missileOverload: {
    id: 'missileOverload', weaponId: 'missile', name: '过载推进器',
    rarity: 'epic', exclusive: null,
    desc: '射速 +25%，装填 -15%',
    stats: { fireRate: { mul: 1.25 }, reloadTime: { mul: 0.85 } },
  },

  /* ---------------- Rail Cannon 磁轨炮 ---------------- */
  railPhaseRound: {
    id: 'railPhaseRound', weaponId: 'railCannon', name: '相位弹',
    rarity: 'uncommon', exclusive: 'railMode',
    desc: '穿透 +2，伤害 -8%',
    stats: { penetration: { add: 2 }, damage: { mul: 0.92 } },
  },
  railExecution: {
    id: 'railExecution', weaponId: 'railCannon', name: '处决弹',
    rarity: 'uncommon', exclusive: 'railMode',
    desc: '伤害 +30%，穿透 -1',
    stats: { damage: { mul: 1.30 }, penetration: { add: -1 } },
  },
  railCharge: {
    id: 'railCharge', weaponId: 'railCannon', name: '线圈蓄能',
    rarity: 'rare', exclusive: null,
    desc: '伤害 +45%，射速 -20%',
    stats: { damage: { mul: 1.45 }, fireRate: { mul: 0.80 } },
  },
  railOverpenetrate: {
    id: 'railOverpenetrate', weaponId: 'railCannon', name: '超载穿透',
    rarity: 'epic', exclusive: null,
    desc: '穿透 +3，弹线伤害 60%→75%',
    stats: { penetration: { add: 3 }, beamAfterMul: { add: 0.15 } },
  },

  /* ---------------- Pulse Laser 脉冲激光 ---------------- */
  laserSustain: {
    id: 'laserSustain', weaponId: 'pulseLaser', name: '持续照射',
    rarity: 'uncommon', exclusive: 'laserMode',
    desc: '伤害 +20%，射速 -10%',
    stats: { damage: { mul: 1.20 }, fireRate: { mul: 0.90 } },
  },
  laserPrism: {
    id: 'laserPrism', weaponId: 'pulseLaser', name: '棱镜分束',
    rarity: 'uncommon', exclusive: 'laserMode',
    desc: '灼烧 DPS +35%，射程 -10%',
    stats: { burnDps: { mul: 1.35 }, range: { mul: 0.90 } },
  },
  laserFocus: {
    id: 'laserFocus', weaponId: 'pulseLaser', name: '聚焦透镜',
    rarity: 'rare', exclusive: null,
    desc: '伤害 +30%，灼烧层数 -1',
    stats: { damage: { mul: 1.30 }, burnMaxStack: { add: -1 } },
  },
  laserOverheat: {
    id: 'laserOverheat', weaponId: 'pulseLaser', name: '热能过载',
    rarity: 'epic', exclusive: null,
    desc: '灼烧 DPS +50%，灼烧层数 +2',
    stats: { burnDps: { mul: 1.50 }, burnMaxStack: { add: 2 } },
  },
};

export function modsForWeapon(weaponId) {
  return Object.values(WEAPON_MODS).filter(m => m.weaponId === weaponId);
}

export function getMod(id) { return WEAPON_MODS[id] || null; }

/**
 * 把改装效果叠加到等级快照 eff（原地修改，返回同一对象）。
 * add/mul 分别对应加算 / 乘算，顺序：先 add 后 mul。
 */
export function applyModsToEff(eff, modIds = []) {
  if (!eff) return eff;
  for (const id of modIds) {
    const mod = WEAPON_MODS[id];
    if (!mod) continue;
    for (const stat in mod.stats) {
      const rule = mod.stats[stat];
      if (rule.add !== undefined) eff[stat] = (eff[stat] || 0) + rule.add;
      if (rule.mul !== undefined) eff[stat] = (eff[stat] || 0) * rule.mul;
    }
  }
  return eff;
}
