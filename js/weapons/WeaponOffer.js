import { WEAPONS, ACQUIRABLE_WEAPONS } from '../data/weapons.js';
import { RESEARCH_WEAPON_IDS } from '../progression/WeaponProgression.js';
import { WEAPON_MODS, MOD_SLOT_CAP, modsForWeapon } from '../data/weaponMods.js';

/**
 * WeaponOffer —— 武器三选一卡生成器（Phase 13 + Phase B 研发解耦）
 *
 * 三类卡（GDD §2.3）：
 *   acquire      已解锁未部署 → 「部署 X」（继承当前研发等级）
 *   weaponLevel  已解锁且等级未满 → 「强化 X」(已部署) / 「研发 X」(未部署)
 *                 未部署时卡片明确标注"获得后生效"，绝不创建实体
 *   Lv6          不再出现等级卡
 *
 * 同一武器在一轮三选一里最多出现一种卡（部署 or 研发/强化），由
 * UpgradeManager.pickThree 的 usedWeaponIds 去重保证。
 */

/** 该等级期望拥有的武器件数 */
export function targetWeaponCount(level) {
  if (level <= 5) return 2;
  if (level <= 10) return 3;
  if (level <= 15) return 4;
  return 5;
}

/** GDD §2.4 权重 */
const RESEARCH_WEIGHT = 1.25;    // 未拥有 · 研发卡
const UPGRADE_WEIGHT = 1.80;     // 已拥有 · 强化卡
const DEPLOY_WEIGHT = 2.60;      // 部署卡基础
const DEPLOY_WEIGHT_HIGH = 3.40; // 研发等级 ≥3 的部署卡
const DEPLOY_BELOW_TARGET_MUL = 1.5; // 件数未达目标时的部署加权

/**
 * @param {import('./WeaponSlot.js').WeaponSlots} slots
 * @param {number} playerLevel
 * @param {import('../progression/WeaponProgression.js').WeaponProgression} [progress]
 *        研发进度（Phase B）。缺省时退回旧的"仅已部署武器"行为，保持测试兼容。
 * @returns {Array} offer 列表（与 UPGRADES 同构，可直接进 UpgradeUI）
 */
export function buildWeaponOffers(slots, playerLevel = 1, progress = null) {
  const owned = slots.weaponCount;
  const target = targetWeaponCount(playerLevel);
  const belowTarget = owned < target;

  const out = [];
  const isDeployed = (id) => slots.has(id);
  const levelOfId = (id) => progress ? progress.levelOf(id)
    : (slots.get(id) ? (slots.get(id).level || 1) : 1);
  const unlocked = (id) => progress ? progress.isUnlocked(id) : true;

  // 1) 部署卡：已解锁、未部署、槽位有空
  for (const id of ACQUIRABLE_WEAPONS) {
    if (isDeployed(id)) continue;
    if (!unlocked(id)) continue;
    if (slots.isFull(WEAPONS[id].slot)) continue;
    const w = WEAPONS[id];
    const lv = levelOfId(id);
    let weight = (lv >= 3 ? DEPLOY_WEIGHT_HIGH : DEPLOY_WEIGHT);
    if (belowTarget) weight *= DEPLOY_BELOW_TARGET_MUL;
    out.push({
      kind: 'weapon',
      weaponId: id,
      id: 'wpn_' + id,
      cat: 'wpn',
      name: w.name,
      desc: lv > 1
        ? `${w.desc} · 将以当前研发等级 Lv${lv} 部署，获得后立即生效`
        : w.desc,
      weight,
      deployLevel: lv,
    });
  }

  // 2) 研发 / 强化卡：已解锁、等级未满（与是否部署无关）
  const ids = progress ? RESEARCH_WEAPON_IDS : Object.keys(WEAPONS);
  for (const id of ids) {
    if (!WEAPONS[id]) continue;
    if (!unlocked(id)) continue;
    const lv = levelOfId(id);
    if (lv >= (WEAPONS[id].maxLevel || 6)) continue;
    const deployed = isDeployed(id);
    // 部署卡与本武器的等级卡同轮由 pickThree 去重；这里仍生成以保留权重选择空间
    const nextInst = deployed ? slots.get(id) : null;
    const short = progress
      ? progress.nextDesc(id)
      : (nextInst && nextInst.nextLevelDesc) || '属性提升';
    out.push({
      kind: 'weaponLevel',
      weaponId: id,
      id: 'wpnlvl_' + id,
      cat: 'wpn',
      name: deployed ? `强化：${WEAPONS[id].name} Lv${lv + 1}` : `研发：${WEAPONS[id].name} Lv${lv + 1}`,
      desc: deployed ? short : `${short} · 尚未部署，获得该武器后生效`,
      weight: deployed ? UPGRADE_WEIGHT : RESEARCH_WEIGHT,
      researching: !deployed,
      deployLevel: lv,
    });
  }

  // 3) 武器改装卡（Phase D）：只给已解锁武器；未部署也可预研
  if (progress) {
    for (const id of RESEARCH_WEAPON_IDS) {
      if (!progress.isUnlocked(id)) continue;
      const have = progress.modsOf(id);
      if (have.length >= MOD_SLOT_CAP) continue;
      // 已装备的互斥组不再生成新卡
      const lockedGroups = new Set(have.map(m => (WEAPON_MODS[m] || {}).exclusive).filter(Boolean));
      for (const mod of modsForWeapon(id)) {
        if (have.includes(mod.id)) continue;
        if (mod.exclusive && lockedGroups.has(mod.exclusive)) continue;
        const lv = progress.levelOf(id);
        let weight = 1.0;
        if (isDeployed(id)) weight *= 1.15;
        else weight *= 0.85;
        if (lv >= 5) weight *= 1.5;
        else if (lv >= 3) weight *= 1.25;
        const rarityWeight = { uncommon: 1, rare: 0.6, epic: 0.3 }[mod.rarity] || 1;
        out.push({
          kind: 'weaponMod',
          weaponId: id,
          modId: mod.id,
          id: 'wpnmod_' + mod.id,
          cat: 'wpn',
          name: `${isDeployed(id) ? '改装' : '预研'}：${WEAPONS[id].name} · ${mod.name}`,
          desc: `${mod.desc} · ${isDeployed(id) ? '立即生效' : '尚未部署，获得该武器后生效'}`,
          weight: weight * rarityWeight,
          researching: !isDeployed(id),
        });
      }
    }
  }

  return out;
}

/** 按 weight 加权抽一个（不重复） */
export function pickWeighted(offers, exclude = []) {
  const pool = offers.filter((o) => !exclude.includes(o.id));
  if (!pool.length) return null;
  const total = pool.reduce((a, o) => a + o.weight, 0);
  let r = Math.random() * total;
  for (const o of pool) {
    r -= o.weight;
    if (r <= 0) return o;
  }
  return pool[pool.length - 1];
}

export default buildWeaponOffers;
