/**
 * 武器数值配置（数据驱动，禁止写死在 class 内部）
 *
 * Phase 13 Weapon Framework：
 *   - 新增 slot（primary / auto）与 maxLevel，武器一律从 Lv1 起步
 *   - §10：开局只有 Machine Gun，其余武器通过三选一"获得 / 强化"逐步拿到
 *   - §6 / §7：高射炮与导弹数值重新定位；§8 / §9：新增 Rail Cannon / Pulse Laser
 *   - damage/fireRate 等为 Lv1 基础值，WeaponLevel 在其上做等级乘算，Upgrade 再乘一层
 *
 * Phase 21 · 射程收敛：
 *   世界尺寸 === 可见画面（1280×720），敌人从画面外（x = -50 / 1330）飞入。
 *   原先自动武器射程普遍 900~1400px，导致敌人还没进画面就被清空，观感很差。
 *   现在统一给每把自动武器显式 `range`（px），并强制要求目标已进画面才索敌
 *   （判定见 js/core/targeting.js）。机炮为玩家手动瞄准，保持原样不限制。
 */

export const WEAPONS = {
  /* ---- §5 主武器：Machine Gun Mk.I（8 × 9 = 72 DPS） ---- */
  machineGun: {
    id: 'machineGun',
    name: '机炮',
    slot: 'primary',
    maxLevel: 6,
    desc: '高射速 / 低单发伤害 / 有过热',

    damage: 8,
    fireRate: 9,          // 发/秒
    bulletSpeed: 1150,    // px/s
    bulletRadius: 3.2,
    bulletLife: 1.6,      // s
    spread: 0.025,        // rad 随机散布
    penetration: 0,       // 可穿透目标数

    heatPerShot: 3.6,     // 射速 8→9 后同比例下调，过热节奏不变
    maxHeat: 100,
    coolRate: 20,         // /s
    overheatResumeRatio: 0.35,  // 过热后冷却到 35% 才能重新开火

    muzzleShake: { mag: 0.6, dur: 40 },
  },

  /* ---- §6 群体控制武器：Flak Cannon ---- */
  flakCannon: {
    id: 'flakCannon',
    name: '高射炮',
    slot: 'auto',
    maxLevel: 6,
    desc: '范围爆炸 / 敌人扎堆时远强于机炮',

    damage: 50,
    fireRate: 1.25,
    bulletSpeed: 820,
    bulletRadius: 6,
    bulletLife: 2.2,
    spread: 0.02,
    penetration: 0,
    explosionRadius: 105,
    explosionDamage: 55,
    range: 760,           // 索敌半径 px（原为硬编码 900，Phase 21 收敛）
    heatPerShot: 0,       // 副武器不过热
    maxHeat: 100,
    coolRate: 999,
    overheatResumeRatio: 0,
    muzzleShake: { mag: 5, dur: 100 },
  },

  /* ---- §7 自动索敌武器：Missile ---- */
  missile: {
    id: 'missile',
    name: '防空导弹',
    slot: 'auto',
    maxLevel: 6,
    desc: '自动处理高价值 / 远处 / 脱离准星的目标',

    damage: 70,
    fireRate: 0.75,
    bulletSpeed: 520,
    bulletRadius: 4.5,
    bulletLife: 2.4,      // 射程收敛到 820 后同步下调（原 4.0 ≈ 2080px 飞行距离）
    turnRate: 5.2,        // rad/s 追踪转向速率
    lockTime: 0.40,
    explosionRadius: 75,
    explosionDamage: 45,
    maxAmmo: 5,
    reloadTime: 3.0,
    range: 820,           // 索敌半径上限 px（再与雷达范围取小值）
    heatPerShot: 0,
    maxHeat: 100,
    coolRate: 999,
    overheatResumeRatio: 0,
    muzzleShake: { mag: 3, dur: 80 },
  },

  /* ---- §8 新增：Rail Cannon（极慢 / 极高伤害 / 穿透） ---- */
  railCannon: {
    id: 'railCannon',
    name: '电磁轨道炮',
    slot: 'auto',
    maxLevel: 6,
    desc: '贯穿目标，对直线后方敌人造成 60% 伤害',

    damage: 180,
    fireRate: 0.45,
    bulletSpeed: 1800,
    bulletRadius: 5,
    bulletLife: 1.2,
    spread: 0,            // 精确武器，零散布
    penetration: 3,
    beamAfterMul: 0.6,    // 贯穿后对后方敌人的伤害倍率（能量线）
    beamWidth: 26,        // 能量线判定宽度 px
    range: 880,           // 有效射程 px（原为硬编码 1400，仍为全场最远）
    heatPerShot: 0,
    maxHeat: 100,
    coolRate: 999,
    overheatResumeRatio: 0,
    muzzleShake: { mag: 9, dur: 160 },
  },

  /* ---- §9 新增：Pulse Laser（高频脉冲 + 灼烧） ---- */
  pulseLaser: {
    id: 'pulseLaser',
    name: '脉冲激光',
    slot: 'auto',
    maxLevel: 6,
    desc: '瞬发命中，连续命中同一目标叠加灼烧',

    damage: 18,
    fireRate: 6.0,        // pulse/s
    range: 700,           // 射程 px（瞬发，无弹道）—— 全场最短，贴脸武器
    penetration: 0,
    spread: 0,
    burnDps: 12,          // 灼烧：每秒伤害
    burnDuration: 2.0,    // 灼烧持续 s
    burnMaxStack: 3,      // 最多叠加层数
    heatPerShot: 0,
    maxHeat: 100,
    coolRate: 999,
    overheatResumeRatio: 0,
    muzzleShake: { mag: 1.5, dur: 60 },
  },
};

/** 开局默认拥有的武器（§10：主武器 Machine Gun） */
export const STARTING_WEAPON = 'machineGun';

/** 可通过三选一获得的武器（不含开局武器） */
export const ACQUIRABLE_WEAPONS = ['flakCannon', 'missile', 'railCannon', 'pulseLaser'];

export default WEAPONS;
