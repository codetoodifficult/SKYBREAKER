import { CONFIG } from '../data/config.js';
import { normalizeAngle, clamp } from '../core/utils.js';
import { inView } from '../core/targeting.js';

/**
 * 瞄准控制器
 * 1) 由指针位置算出期望角度
 * 2) 炮塔角度做插值（有重量感，不会瞬间甩头）
 * 3) Soft Aim Assist：期望方向附近锥形内有敌机时，只做"部分修正"
 *    —— 辅助强度 0.55，玩家仍然需要自己大致对准
 */
export class AimController {
  constructor() {
    this.angle = -Math.PI / 2;     // 当前炮管角度
    this.desired = -Math.PI / 2;   // 期望角度（含辅助修正）
    this.rawAngle = -Math.PI / 2;  // 纯玩家输入角度（调试用）
    this.assistTarget = null;      // 当前被辅助瞄准的敌人
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number}} pivot 炮塔旋转轴心
   * @param {{x:number,y:number}} pointer 指针逻辑坐标
   * @param {Array} enemies 存活敌人列表
   * @param {number} radarRange 雷达有效距离
   */
  update(dt, pivot, pointer, enemies, radarRange, assistMul = 1) {
    // 1) 玩家输入方向
    const ra = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x);
    this.rawAngle = ra;

    let desired = ra;
    this.assistTarget = null;

    // 2) 软辅助
    if (enemies && enemies.length) {
      const cone = CONFIG.AIM.assistConeRad * assistMul;
      const range = radarRange;   // 雷达有效距离（含永久成长/干扰修正）
      let best = null, bestScore = Infinity, bestDelta = 0;

      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive) continue;
        // Phase 21：辅助瞄准不锁定画面外目标（否则炮口会对着看不见的方向，
        // 导弹也会追着画面外的敌人飞出去）
        if (!inView(e)) continue;
        const dx = e.x - pivot.x, dy = e.y - pivot.y;
        const d = Math.hypot(dx, dy);
        if (d > range) continue;

        // 提前量：子弹飞到目标期间敌机的位移（移动端不做预判几乎打不中）
        let tx = e.x, ty = e.y;
        if (CONFIG.AIM.lead) {
          const tof = d / CONFIG.AIM.leadSpeed;
          tx += (e.vx || 0) * tof;
          ty += (e.vy || 0) * tof;
        }

        const ea = Math.atan2(ty - pivot.y, tx - pivot.x);
        const delta = normalizeAngle(ea - ra);
        if (Math.abs(delta) > cone) continue;
        // 优先"角度最接近"的，其次距离近的
        const score = Math.abs(delta) * 260 + d * 0.35;
        if (score < bestScore) { bestScore = score; best = e; bestDelta = delta; }
      }

      if (best) {
        desired = ra + bestDelta * Math.min(1, CONFIG.AIM.assistStrength * assistMul);
        this.assistTarget = best;
      }
    }

    this.desired = desired;

    // 3) 角度插值（限制角速度）
    const maxDelta = CONFIG.TURRET.turnSpeed * dt;
    const d = normalizeAngle(desired - this.angle);
    if (Math.abs(d) <= maxDelta) this.angle = desired;
    else this.angle += Math.sign(d) * maxDelta;
    this.angle = normalizeAngle(this.angle);
  }

  /** 复活/重开时重置 */
  reset(angle = -Math.PI / 2) {
    this.angle = angle;
    this.desired = angle;
    this.rawAngle = angle;
    this.assistTarget = null;
  }
}

export default AimController;
