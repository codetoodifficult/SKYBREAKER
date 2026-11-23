import { CONFIG } from '../data/config.js';
import { rotateTowards, clamp, TAU } from '../core/utils.js';
import {
  groundShadow, metalGrad, concreteGrad, rivets, panelLine, warnStripes, glowDot,
  EDGE_COLD,
} from '../effects/StructureArt.js';

/**
 * 防空炮塔（固定，玩家不能移动）
 * 只负责：位置 / 旋转 / 承载武器 / 后坐动画 / 绘制
 */
export class AntiAircraftGun {
  constructor(x, y) {
    this.x = x;
    this.y = y;

    this.angle = -Math.PI / 2;
    this.barrelLength = CONFIG.TURRET.barrelLength;

    this.recoil = 0;          // 当前后坐位移
    this.firing = false;      // 是否正在开火（用于绘制）

    /** 由 WeaponManager 注入 */
    this.weapon = null;

    /** 由 Game 注入：玩家成长数值（PlayerStats） */
    this.stats = null;

    this.damageMul = 1;       // 广告增益 / MetaProgression 会改这里
    this.eventFireRateMul = 1; // Phase 11：随机事件（弹药危机）射速修正，由 Game 每帧写入
    this.flash = 0;           // 炮口闪光计时
    this.t = 0;               // 本地动画时钟（仅绘制用）
  }

  /** 炮口世界坐标（含后坐） */
  muzzle() {
    const len = this.barrelLength - this.recoil;
    return {
      x: this.x + Math.cos(this.angle) * len,
      y: this.y + Math.sin(this.angle) * len,
    };
  }

  kick(amount) {
    this.recoil = Math.min(this.recoil + amount, 12);
    this.flash = 0.05;
  }

  update(dt, aimAngle) {
    this.t += dt;
    // 角度由 AimController 决定，这里只做插值跟随，让炮塔"有重量"
    this.angle = rotateTowards(this.angle, aimAngle, CONFIG.TURRET.turnSpeed * dt);
    this.recoil = Math.max(0, this.recoil - CONFIG.TURRET.recoilRecover * dt);
    if (this.flash > 0) this.flash -= dt;
  }

  /** 玩家升级后由 Game 调用，刷新武器的 maxHeat/coolRate */
  syncStats() {
    if (this.weapon && this.weapon.syncStats) this.weapon.syncStats(this.stats);
  }

  render(ctx) {
    const { x, y } = this;
    const t = this.t;
    const rec = this.recoil;
    const L = this.barrelLength;

    ctx.save();
    ctx.translate(x, y);

    // ============ 地面接触阴影 ============
    ctx.save();
    ctx.translate(0, 46);
    groundShadow(ctx, 66, 9, 0.5);
    ctx.restore();

    // ============ 固定基座（混凝土） ============
    ctx.beginPath();
    ctx.moveTo(-54, 46);
    ctx.lineTo(-34, 12);
    ctx.lineTo(34, 12);
    ctx.lineTo(54, 46);
    ctx.closePath();
    ctx.fillStyle = concreteGrad(ctx, 12, 46);
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.26)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 基座斜切高光（主光源在左上）
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(210,235,255,.055)';
    ctx.beginPath();
    ctx.moveTo(-54, 46); ctx.lineTo(-34, 12); ctx.lineTo(-15, 12); ctx.lineTo(-35, 46);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.beginPath();
    ctx.moveTo(20, 12); ctx.lineTo(34, 12); ctx.lineTo(54, 46); ctx.lineTo(35, 46);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // 警示条纹 + 面板分割 + 铆钉
    warnStripes(ctx, -52, 34, 104, 8);
    panelLine(ctx, -42, 31, 42, 31);
    panelLine(ctx, -35, 24, 35, 24);
    rivets(ctx, [[-45, 41], [-30, 41], [-15, 41], [0, 41], [15, 41], [30, 41], [45, 41]], 1.2);
    rivets(ctx, [[-27, 17], [0, 17], [27, 17]], 1.1);
    // 状态灯带（缓慢呼吸）
    ctx.fillStyle = `rgba(57,215,255,${0.22 + 0.16 * Math.sin(t * 2.2)})`;
    ctx.fillRect(-33, 19, 66, 1.6);

    // ============ 顶部回转甲板 ============
    ctx.beginPath();
    ctx.moveTo(-38, 12); ctx.lineTo(38, 12); ctx.lineTo(38, 6); ctx.lineTo(-38, 6);
    ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 6, 12, '#6d859d', '#33455a', '#131b25');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.34)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,232,255,.16)';
    ctx.fillRect(-37, 6.5, 74, 1.4);

    // ---- 右侧弹药箱 / 设备舱 ----
    ctx.beginPath();
    ctx.moveTo(16, 6); ctx.lineTo(18, -6); ctx.lineTo(33, -6); ctx.lineTo(35, 6);
    ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, -6, 6, '#5e7590', '#2b3b4d', '#111922');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.3)';
    ctx.lineWidth = 1.1; ctx.stroke();
    panelLine(ctx, 18, -1, 33, -1);
    rivets(ctx, [[20, 3], [26, 3], [31, 3], [20, -4], [26, -4], [31, -4]], 1);
    // 弹药状态指示灯
    const ammoBlink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4.5));
    glowDot(ctx, 25, 1.5, 4.5, '120,255,180', ammoBlink);

    // ---- 左侧散热格栅 ----
    ctx.fillStyle = 'rgba(10,16,22,.9)';
    ctx.fillRect(-33, -4, 15, 10);
    ctx.strokeStyle = EDGE_COLD + '0.22)';
    ctx.lineWidth = 1; ctx.strokeRect(-33, -4, 15, 10);
    ctx.strokeStyle = 'rgba(150,195,230,.30)';
    for (let i = 0; i < 4; i++) {
      const gy = -3 + i * 2.6;
      ctx.beginPath(); ctx.moveTo(-32, gy); ctx.lineTo(-19, gy); ctx.stroke();
    }

    // ============ 传感器穹顶（半透明罩，位于炮塔之下） ============
    ctx.beginPath();
    ctx.arc(0, 3, 18, Math.PI, 0);
    ctx.fillStyle = 'rgba(57,215,255,.07)';
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.32)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // ============ 旋转部分：炮塔 + 炮管 ============
    ctx.save();
    ctx.rotate(this.angle);
    ctx.save();
    ctx.translate(-rec, 0);

    // ---- 炮塔主体 ----
    ctx.beginPath();
    ctx.moveTo(-17, 12);
    ctx.lineTo(-19, -2);
    ctx.quadraticCurveTo(-18, -12, -4, -13.5);
    ctx.lineTo(6, -13.5);
    ctx.quadraticCurveTo(16, -12, 17, -3);
    ctx.lineTo(15, 12);
    ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, -13, 12, '#7d94ad', '#33465a', '#141d27');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.42)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // 顶部受光面 / 右侧暗面
    ctx.fillStyle = 'rgba(205,238,255,.13)';
    ctx.fillRect(-13, -12, 26, 3);
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.fillRect(6, -10, 8, 21);
    panelLine(ctx, -18, 5, 16, 5);
    rivets(ctx, [[-13, 8], [-13, 1], [11, 8], [11, 1]], 1.05);

    // ---- 炮管根部衬套 ----
    ctx.beginPath();
    ctx.ellipse(11, -2, 6.5, 8.5, 0, 0, TAU);
    ctx.fillStyle = metalGrad(ctx, -10, 6, '#6a8299', '#2c3c4d', '#0f161f');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.3)';
    ctx.lineWidth = 1; ctx.stroke();

    // ---- 炮管（圆柱受光：上亮下暗） ----
    const b0 = 9;          // 根部
    const b1 = L - 20;     // 主管末端
    const bm = L - 6;      // 制退器末端
    // 主管（带轻微锥度）
    ctx.beginPath();
    ctx.moveTo(b0, -6.5);
    ctx.lineTo(b1, -5.4);
    ctx.lineTo(b1, 5.4);
    ctx.lineTo(b0, 6.5);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, -7, 0, 7);
    bg.addColorStop(0, '#8ea6be');
    bg.addColorStop(0.32, '#4a5f75');
    bg.addColorStop(0.72, '#243140');
    bg.addColorStop(1, '#101821');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.38)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 上缘镜面高光
    ctx.fillStyle = 'rgba(215,240,255,.26)';
    ctx.fillRect(b0 + 1, -5.6, b1 - b0 - 2, 1.6);

    // 散热环
    for (const rx of [b0 + 8, b0 + 14, b0 + 20]) {
      if (rx > b1 - 3) continue;
      ctx.fillStyle = 'rgba(18,26,35,.95)';
      ctx.fillRect(rx, -7.4, 2.4, 14.8);
      ctx.fillStyle = 'rgba(160,200,235,.16)';
      ctx.fillRect(rx, -7.4, 1, 14.8);
    }

    // ---- 制退器 ----
    ctx.beginPath();
    ctx.moveTo(b1, -8.6); ctx.lineTo(bm, -8); ctx.lineTo(bm, 8); ctx.lineTo(b1, 8.6);
    ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, -8.6, 8.6, '#748ba3', '#2d3d4f', '#0e151d');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.36)';
    ctx.lineWidth = 1.1; ctx.stroke();
    // 排气槽
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(b1 + 3, -8.2, 2.6, 16.4);
    ctx.fillRect(b1 + 8, -8, 2.6, 16);
    // 前端环
    ctx.fillStyle = metalGrad(ctx, -7, 7, '#8ba2b9', '#38495c', '#131b24');
    ctx.fillRect(bm, -6.6, 6, 13.2);
    ctx.strokeStyle = EDGE_COLD + '0.34)';
    ctx.strokeRect(bm, -6.6, 6, 13.2);

    // ---- 炮口闪光 ----
    if (this.flash > 0) {
      const a = Math.max(0, this.flash / 0.05);
      const mx = L + 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(mx, 0, 0, mx, 0, 30);
      g.addColorStop(0, `rgba(255,246,220,${0.95 * a})`);
      g.addColorStop(0.35, `rgba(255,168,70,${0.5 * a})`);
      g.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, 0, 30, 0, TAU); ctx.fill();
      // 星芒
      ctx.fillStyle = `rgba(255,230,168,${0.8 * a})`;
      ctx.beginPath();
      ctx.moveTo(mx, -15 * a - 3); ctx.lineTo(mx + 3, 0);
      ctx.lineTo(mx, 15 * a + 3); ctx.lineTo(mx - 3, 0);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - 24 * a, 0); ctx.lineTo(mx, 2.6);
      ctx.lineTo(mx + 13 * a, 0); ctx.lineTo(mx, -2.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // 后坐时炮尾露出的复进簧行程
    if (rec > 0.5) {
      ctx.strokeStyle = `rgba(255,170,80,${Math.min(0.5, rec / 12)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(2, 9); ctx.stroke();
    }

    ctx.restore(); // translate(-rec)
    ctx.restore(); // rotate

    // ============ 回转支撑环（护圈） ============
    ctx.beginPath();
    ctx.ellipse(0, 2, 15.5, 13, 0, 0, TAU);
    ctx.fillStyle = metalGrad(ctx, -11, 15, '#6e869d', '#2b3b4d', '#101821');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.45)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // 环上螺栓
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 11.5, 2 + Math.sin(a) * 9.5, 1.1, 0, TAU);
      ctx.fillStyle = 'rgba(195,225,255,.32)';
      ctx.fill();
    }
    // 中心轴帽
    ctx.beginPath();
    ctx.arc(0, 1, 5, 0, TAU);
    ctx.fillStyle = '#22303d';
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.5)';
    ctx.lineWidth = 1; ctx.stroke();
    glowDot(ctx, 0, 1, 7, '57,215,255', 0.28);

    ctx.restore();
  }
}

export default AntiAircraftGun;
