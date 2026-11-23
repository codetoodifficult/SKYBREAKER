import { CONFIG } from '../data/config.js';

/**
 * 索敌公共约束（Phase 21：进画面才开火）
 * ----------------------------------------------------------------------------
 * 背景：世界尺寸 === 可见画面（1280×720，见 CONFIG.WORLD），敌人从画面外
 * （x = -50 / x = W+50，y ∈ [60,300]）飞入。自动武器如果射程过大，敌人
 * 还没进入画面就被清空，玩家看不到"来袭 → 拦截 → 爆炸"的过程，观感很差。
 *
 * 因此自动武器的索敌统一遵守两条约束（缺一不可）：
 *   1. 【射程】目标到开火点的距离 ≤ weapon.cfg.range（数据驱动，见 js/data/weapons.js）
 *   2. 【视野】目标必须已经进入可见区域（中心距边缘 ≥ EDGE px），否则不选为目标
 *
 * 玩家手动瞄准的机炮（machineGun）不受此约束 —— 打不打由玩家决定。
 */

/** 可见区域判定留白：目标中心进入画面内 EDGE px 之后才算"看得见" */
export const EDGE = 14;

/** 坐标是否落在可见画面内（不判断存活，统计/调试用） */
export function inRect(e, edge = EDGE) {
  if (!e) return false;
  return e.x >= edge && e.x <= CONFIG.WORLD.WIDTH - edge
    && e.y >= edge && e.y <= CONFIG.WORLD.HEIGHT - edge;
}

/** 目标是否已进入可见画面（索敌判定用：必须存活且在画面内） */
export function inView(e, edge = EDGE) {
  if (!e || !e.alive) return false;
  return inRect(e, edge);
}

/** 点到点的距离平方 */
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * 自动武器索敌判定：射程内 + 已进画面
 * @param {{x:number,y:number}} from 开火点（炮塔 / 无人机 / 导弹当前位置）
 * @param {{x:number,y:number,alive:boolean}} e 候选目标
 * @param {number} range 射程 px
 */
export function canEngage(from, e, range, edge = EDGE) {
  if (!inView(e, edge)) return false;
  return dist2(from.x, from.y, e.x, e.y) <= range * range;
}

/**
 * 通用选敌：在 world.enemies.list 中挑出满足「射程 + 视野」的目标。
 * @param {{x:number,y:number}} from 开火点
 * @param {object} world
 * @param {number} range 射程 px
 * @param {(cur:{e:object,d:number}, best:{e:object,d:number}) => boolean} better
 *        比较函数：新候选是否优于当前最优。默认"距离更近"。
 * @returns {{e:object,d:number}|null}
 */
export function pickTarget(from, world, range, better) {
  const list = world && world.enemies && world.enemies.list;
  if (!list || !list.length) return null;
  const cmp = better || ((c, b) => c.d < b.d);
  let best = null;
  for (const e of list) {
    if (!e.alive) continue;
    const d2 = dist2(from.x, from.y, e.x, e.y);
    if (d2 > range * range) continue;
    if (!inView(e)) continue;
    const cand = { e, d: Math.sqrt(d2) };
    if (!best || cmp(cand, best)) best = cand;
  }
  return best;
}

/**
 * 沿指定方向选敌（玩家手动瞄准用）。
 * 主武器开火方向由玩家准星决定，不再自动挑目标；但子弹/射线仍需要知道
 * "这条线上第一个挡着的是谁"（用于高射炮的引爆距离、激光的落点、导弹的初始目标）。
 *
 * @param {{x:number,y:number}} from 开火点
 * @param {object} world
 * @param {number} range 射程 px
 * @param {number} angle 开火方向（rad）
 * @param {number} halfWidth 射线半宽 px（超出这个横向偏移的目标不算挡在射线上）
 * @returns {{e:object, along:number, perp:number}|null} 射线上最近的目标
 */
export function pickTargetAlong(from, world, range, angle, halfWidth = 26) {
  const list = world && world.enemies && world.enemies.list;
  if (!list || !list.length) return null;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = null;
  for (const e of list) {
    if (!e.alive) continue;
    const rx = e.x - from.x, ry = e.y - from.y;
    const along = rx * dx + ry * dy;
    if (along < 0 || along > range) continue;
    const perp = Math.abs(rx * dy - ry * dx);
    if (perp > halfWidth + (e.radius || 0)) continue;
    if (!inView(e)) continue;              // 与自动武器一致：画面外的不打
    if (!best || along < best.along) best = { e, along, perp };
  }
  return best;
}

/** 两角之间的最小夹角（0 ~ π） */
export function angleDiff(a, b) {
  const TAU = Math.PI * 2;
  let d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/**
 * 手动主武器的软辅助 —— 直接复用该武器「作为副武器自动开火时」的选敌结果。
 *
 * 非机炮武器（高射炮 / 电磁炮 / 脉冲激光）射速慢、弹道或射线判定窄，
 * 让玩家纯手瞄会很挫败。所以手动模式下仍用自动索敌挑目标，
 * 只要那个目标大致落在准星方向（辅助锥内）就自动对准它 ——
 * 命中手感和它当副武器时一致；玩家朝别处时不做任何修正，方向依然归玩家。
 *
 * @param {{x:number,y:number}} muzzle 炮口坐标
 * @param {object} gun 需带 angle（炮管朝向 rad）
 * @param {{x:number,y:number}|null} target 自动索敌挑出的目标
 * @param {number} coneRad 辅助锥半角（rad），超出则不修正
 * @returns {number|null} 修正后的开火角；null = 不修正，沿准星方向
 */
export function assistAngle(muzzle, gun, target, coneRad = 0.35) {
  if (!target) return null;
  const a = Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
  return angleDiff(a, gun.angle) <= coneRad ? a : null;
}

export default {
  EDGE, inRect, inView, dist2, canEngage, pickTarget, pickTargetAlong, angleDiff, assistAngle,
};
