import { CONFIG } from '../data/config.js';
import { TAU } from '../core/utils.js';
import {
  groundShadow, metalGrad, concreteGrad, rivets, panelLine, warnStripes, glowDot, truss,
  EDGE_COLD, EDGE_WARM,
} from '../effects/StructureArt.js';

/**
 * 基地（Phase 2 简化版）
 * 当前：Base 持有总生命值，雷达 / 发电站 只做视觉占位。
 * Phase 6 会拆成 Base / Radar / PowerStation 三个独立建筑，各自有血量与目标优先级。
 */
export class Base {
  constructor() {
    this.maxHp = CONFIG.BASE.maxHp;
    this.hp = this.maxHp;
    this.x = CONFIG.TURRET.x;
    this.y = CONFIG.WORLD_GROUND_Y;
    this.t = 0;
    this.hitFlash = 0;
  }

  reset() {
    this.hp = this.maxHp;
    this.hitFlash = 0;
  }

  get ratio() { return Math.max(0, this.hp / this.maxHp); }

  update(dt) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  render(ctx) {
    const gy = CONFIG.GROUND_Y;   // 视觉地平线：与炮塔基座底边同一条线
    const cx = CONFIG.TURRET.x;

    // ---- 左侧：雷达站 ----
    this._radar(ctx, cx - 250, gy);
    // ---- 右侧：发电站 ----
    this._power(ctx, cx + 250, gy);
    // ---- 中间：指挥地堡 ----
    this._bunker(ctx, cx, gy);
  }

  _radar(ctx, x, gy) {
    const t = this.t;
    ctx.save();
    ctx.translate(x, gy);

    // ---- 地面阴影 ----
    groundShadow(ctx, 40, 8, 0.5);

    // ---- 混凝土基座 ----
    ctx.beginPath();
    ctx.moveTo(-32, 0); ctx.lineTo(-22, -16); ctx.lineTo(22, -16); ctx.lineTo(32, 0);
    ctx.closePath();
    ctx.fillStyle = concreteGrad(ctx, -16, 0);
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.30)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // 斜切受光
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(210,235,255,.06)';
    ctx.beginPath();
    ctx.moveTo(-32, 0); ctx.lineTo(-22, -16); ctx.lineTo(-8, -16); ctx.lineTo(-18, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.moveTo(12, -16); ctx.lineTo(22, -16); ctx.lineTo(32, 0); ctx.lineTo(18, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    warnStripes(ctx, -30, -9, 60, 7);
    rivets(ctx, [[-26, -2], [-13, -2], [0, -2], [13, -2], [26, -2]], 1.1);

    // ---- 设备平台 ----
    ctx.beginPath();
    ctx.moveTo(-25, -16); ctx.lineTo(25, -16); ctx.lineTo(25, -22); ctx.lineTo(-25, -22);
    ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, -22, -16, '#6d859d', '#31424f', '#121a23');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.34)';
    ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = 'rgba(200,232,255,.15)';
    ctx.fillRect(-24, -21.6, 48, 1.3);

    // ---- 侧面机柜 + 指示灯 ----
    ctx.beginPath();
    ctx.rect(9, -34, 13, 12);
    ctx.fillStyle = metalGrad(ctx, -34, -22, '#5c7288', '#283747', '#101821');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.26)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(150,195,230,.26)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(11, -31 + i * 3.4); ctx.lineTo(20, -31 + i * 3.4); ctx.stroke();
    }
    glowDot(ctx, 15.5, -27.5, 4, '120,255,190', 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3.1)));

    // ---- 桁架塔 ----
    truss(ctx, 0, -46, -22, 13, 3);

    // ---- 塔顶转台 ----
    ctx.beginPath();
    ctx.rect(-9, -52, 18, 5);
    ctx.fillStyle = metalGrad(ctx, -52, -47, '#7289a1', '#2c3c4d', '#111922');
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.36)'; ctx.lineWidth = 1.1; ctx.stroke();

    // ---- 旋转碟面 ----
    ctx.save();
    ctx.translate(0, -51);
    ctx.rotate(-0.42);                       // 碟面朝右上仰起
    const a = t * 0.85;
    const open = 0.20 + 0.55 * Math.abs(Math.cos(a));   // 朝向变化（模拟绕竖轴自转）
    const ry = 16.5 * open + 1.6;

    // 支臂
    ctx.strokeStyle = 'rgba(160,200,235,.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, 0); ctx.stroke();

    // 背面壳体
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, ry + 2.4, 0, 0, TAU);
    const shell = ctx.createRadialGradient(-6, -5, 1, 0, 0, 19);
    shell.addColorStop(0, '#5b7186');
    shell.addColorStop(0.65, '#2a3745');
    shell.addColorStop(1, '#141c26');
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.strokeStyle = EDGE_COLD + '0.5)';
    ctx.lineWidth = 1.3; ctx.stroke();

    // 内凹盘面
    ctx.beginPath();
    ctx.ellipse(-2.6, -1.2, 12.8, ry * 0.92, 0, 0, TAU);
    ctx.fillStyle = 'rgba(57,215,255,.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(57,215,255,.34)';
    ctx.lineWidth = 1; ctx.stroke();
    // 同心刻度环
    ctx.beginPath();
    ctx.ellipse(-2.6, -1.2, 7, ry * 0.5, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(57,215,255,.18)';
    ctx.stroke();

    // 壳体左上受光弧
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, ry + 2.4, 0, Math.PI * 1.02, Math.PI * 1.72);
    ctx.strokeStyle = 'rgba(205,238,255,.30)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 扫描光针（裁在盘面内）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-2.6, -1.2, 12.8, ry * 0.92, 0, 0, TAU);
    ctx.clip();
    const sw = a * 2.2;
    const sg = ctx.createLinearGradient(-2.6, -1.2, -2.6 + Math.cos(sw) * 14, -1.2 + Math.sin(sw) * 14);
    sg.addColorStop(0, 'rgba(57,215,255,.55)');
    sg.addColorStop(1, 'rgba(57,215,255,0)');
    ctx.strokeStyle = sg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2.6, -1.2);
    ctx.lineTo(-2.6 + Math.cos(sw) * 14, -1.2 + Math.sin(sw) * 14);
    ctx.stroke();
    ctx.restore();

    // 馈源支杆 + 馈源
    ctx.strokeStyle = 'rgba(170,210,240,.42)';
    ctx.lineWidth = 1;
    for (const ang of [-Math.PI / 2, Math.PI, 0]) {
      ctx.beginPath();
      ctx.moveTo(-2.6 + Math.cos(ang) * 12.8, -1.2 + Math.sin(ang) * ry * 0.92);
      ctx.lineTo(-7.5, -7);
      ctx.stroke();
    }
    glowDot(ctx, -7.5, -7, 4.5, '57,215,255', 0.5);
    ctx.restore();

    // ---- 塔顶航空障碍灯 ----
    glowDot(ctx, 0, -56, 6, '255,90,110', 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.6)));

    ctx.restore();
  }

  _power(ctx, x, gy) {
    const t = this.t;
    ctx.save();
    ctx.translate(x, gy);

    // ---- 地面阴影 ----
    groundShadow(ctx, 40, 8, 0.5);

    // ---- 混凝土基座 ----
    ctx.beginPath();
    ctx.moveTo(-34, 0); ctx.lineTo(-25, -14); ctx.lineTo(25, -14); ctx.lineTo(34, 0);
    ctx.closePath();
    ctx.fillStyle = concreteGrad(ctx, -14, 0);
    ctx.fill();
    ctx.strokeStyle = EDGE_WARM + '0.30)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,220,190,.06)';
    ctx.beginPath();
    ctx.moveTo(-34, 0); ctx.lineTo(-25, -14); ctx.lineTo(-11, -14); ctx.lineTo(-20, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.moveTo(13, -14); ctx.lineTo(25, -14); ctx.lineTo(34, 0); ctx.lineTo(20, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    warnStripes(ctx, -32, -8, 64, 7);
    rivets(ctx, [[-28, -2], [-14, -2], [0, -2], [14, -2], [28, -2]], 1.1);

    // ---- 两侧变压器 ----
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * 24, 0);
      ctx.beginPath();
      ctx.rect(-7, -28, 14, 14);
      ctx.fillStyle = metalGrad(ctx, -28, -14, '#5f6a72', '#2b3038', '#12171e');
      ctx.fill();
      ctx.strokeStyle = EDGE_WARM + '0.28)';
      ctx.lineWidth = 1; ctx.stroke();
      warnStripes(ctx, -7, -28, 14, 3);
      // 散热鳍片
      ctx.strokeStyle = 'rgba(190,205,220,.22)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(-5, -23 + i * 2.6); ctx.lineTo(5, -23 + i * 2.6); ctx.stroke();
      }
      // 顶部绝缘子
      ctx.fillStyle = '#3a4550';
      ctx.fillRect(-3, -33, 6, 5);
      ctx.fillStyle = 'rgba(180,200,220,.35)';
      ctx.fillRect(-4, -34, 8, 1.6);
      ctx.restore();
    }

    // ---- 冷却塔主体（双曲线轮廓） ----
    ctx.beginPath();
    ctx.moveTo(-20, -14);
    ctx.quadraticCurveTo(-16.5, -34, -11, -46);
    ctx.lineTo(11, -46);
    ctx.quadraticCurveTo(16.5, -34, 20, -14);
    ctx.closePath();
    const tg = ctx.createLinearGradient(-20, -46, 18, -10);
    tg.addColorStop(0, '#93805f');
    tg.addColorStop(0.42, '#4a423b');
    tg.addColorStop(1, '#181f28');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = EDGE_WARM + '0.48)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 塔身环筋
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-20, -14);
    ctx.quadraticCurveTo(-16.5, -34, -11, -46);
    ctx.lineTo(11, -46);
    ctx.quadraticCurveTo(16.5, -34, 20, -14);
    ctx.closePath();
    ctx.clip();
    for (const hy of [-20, -27, -34, -41]) {
      const halfW = 20 - (hy + 14) * -0.26;
      ctx.strokeStyle = 'rgba(0,0,0,.30)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-halfW, hy + 0.8); ctx.lineTo(halfW, hy + 0.8); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,205,160,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-halfW, hy - 0.4); ctx.lineTo(halfW, hy - 0.4); ctx.stroke();
    }
    // 左受光 / 右暗面
    ctx.fillStyle = 'rgba(255,225,195,.07)';
    ctx.fillRect(-20, -46, 9, 32);
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.fillRect(6, -46, 14, 32);
    ctx.restore();

    // ---- 顶部围栏 + 塔口 ----
    ctx.beginPath();
    ctx.rect(-13, -50, 26, 4.5);
    ctx.fillStyle = metalGrad(ctx, -50, -45, '#7e8b96', '#333c46', '#141a21');
    ctx.fill();
    ctx.strokeStyle = EDGE_WARM + '0.4)';
    ctx.lineWidth = 1.1; ctx.stroke();
    warnStripes(ctx, -13, -50, 26, 4.5);
    // 塔口内壁
    ctx.beginPath();
    ctx.ellipse(0, -49.5, 11, 3, 0, 0, TAU);
    ctx.fillStyle = '#0b1016';
    ctx.fill();

    // ---- 蒸汽（循环上升） ----
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const p = ((t * 11 + i * 10) % 30) / 30;
      const py = -52 - p * 26;
      const pr = 4 + p * 9;
      const pa = (1 - p) * 0.16;
      ctx.fillStyle = `rgba(206,220,238,${pa})`;
      ctx.beginPath();
      ctx.arc(Math.sin(t * 0.9 + i * 2.1) * 5 * p, py, pr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // ---- 能量核心窗口 ----
    ctx.beginPath();
    ctx.rect(-8.5, -41, 17, 16);
    ctx.fillStyle = '#0a1016';
    ctx.fill();
    ctx.strokeStyle = EDGE_WARM + '0.5)';
    ctx.lineWidth = 1.3; ctx.stroke();
    // 纵向约束栅栏
    ctx.strokeStyle = 'rgba(255,190,140,.28)';
    ctx.lineWidth = 1;
    for (const gx of [-4, 0, 4]) {
      ctx.beginPath(); ctx.moveTo(gx, -40); ctx.lineTo(gx, -26); ctx.stroke();
    }
    // 核心脉冲
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -33, 0, 0, -33, 14);
    cg.addColorStop(0, `rgba(255,238,205,${0.6 + pulse * 0.4})`);
    cg.addColorStop(0.4, `rgba(255,150,60,${0.4 + pulse * 0.3})`);
    cg.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, -33, 14, 0, TAU); ctx.fill();
    ctx.restore();
    // 核心外溢光
    glowDot(ctx, 0, -33, 30, '255,150,60', 0.2 + 0.25 * pulse);

    // ---- 两侧变压器 → 塔身输电线 ----
    ctx.strokeStyle = 'rgba(255,160,90,.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-24, -33); ctx.quadraticCurveTo(-17, -30, -14, -26);
    ctx.moveTo(24, -33); ctx.quadraticCurveTo(17, -30, 14, -26);
    ctx.stroke();
    glowDot(ctx, -24, -33, 4, '255,150,60', 0.35 + 0.35 * pulse);
    glowDot(ctx, 24, -33, 4, '255,150,60', 0.35 + 0.35 * (1 - pulse));

    ctx.restore();
  }

  _bunker(ctx, x, gy) {
    const t = this.t;
    ctx.save();
    ctx.translate(x, gy);
    const flash = this.hitFlash > 0 ? this.hitFlash / 0.3 : 0;

    // ---- 地面阴影 ----
    groundShadow(ctx, 72, 8, 0.45);

    // ---- 主体（斜坡地堡） ----
    ctx.beginPath();
    ctx.moveTo(-58, 0); ctx.lineTo(-44, -26); ctx.lineTo(44, -26); ctx.lineTo(58, 0);
    ctx.closePath();
    if (flash > 0) {
      const rg = ctx.createLinearGradient(-30, -26, 20, 0);
      rg.addColorStop(0, `rgb(${120 + flash * 135},${70 + flash * 40},${80})`);
      rg.addColorStop(1, '#2a1418');
      ctx.fillStyle = rg;
    } else {
      ctx.fillStyle = concreteGrad(ctx, -26, 0);
    }
    ctx.fill();
    ctx.strokeStyle = flash > 0 ? '#ff6b7f' : EDGE_COLD + '0.28)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // 斜切受光 / 暗面 + 竖向面板分割
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-58, 0); ctx.lineTo(-44, -26); ctx.lineTo(44, -26); ctx.lineTo(58, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(210,235,255,.055)';
    ctx.beginPath();
    ctx.moveTo(-58, 0); ctx.lineTo(-44, -26); ctx.lineTo(-24, -26); ctx.lineTo(-40, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.moveTo(28, -26); ctx.lineTo(44, -26); ctx.lineTo(58, 0); ctx.lineTo(38, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    for (const px of [-46, -30, 30, 46]) {
      panelLine(ctx, px, -25, px * 1.28, -1);
    }

    // ---- 顶部檐口 ----
    ctx.beginPath();
    ctx.rect(-47, -30, 94, 4.5);
    ctx.fillStyle = metalGrad(ctx, -30, -25, '#66798f', '#2c3a49', '#111922');
    ctx.fill();
    ctx.strokeStyle = flash > 0 ? '#ff6b7f' : EDGE_COLD + '0.3)';
    ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = 'rgba(200,232,255,.14)';
    ctx.fillRect(-46, -29.6, 92, 1.3);

    // ---- 灯带 ----
    ctx.fillStyle = flash > 0
      ? `rgba(255,120,140,${0.5 + 0.4 * flash})`
      : `rgba(57,215,255,${0.25 + 0.2 * Math.sin(t * 2)})`;
    ctx.fillRect(-40, -18, 80, 2.2);

    // ---- 两侧通风格栅 ----
    for (const sx of [-1, 1]) {
      ctx.fillStyle = 'rgba(8,13,19,.85)';
      ctx.fillRect(sx > 0 ? 34 : -50, -12, 16, 9);
      ctx.strokeStyle = EDGE_COLD + '0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx > 0 ? 34 : -50, -12, 16, 9);
      ctx.strokeStyle = 'rgba(150,195,230,.22)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo((sx > 0 ? 35 : -49), -10.5 + i * 2.2);
        ctx.lineTo((sx > 0 ? 49 : -35), -10.5 + i * 2.2);
        ctx.stroke();
      }
    }

    // ---- 顶部天线 ----
    ctx.strokeStyle = 'rgba(160,200,235,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-38, -30); ctx.lineTo(-40, -42);
    ctx.moveTo(38, -30); ctx.lineTo(40, -42);
    ctx.stroke();
    glowDot(ctx, -40, -43, 5, '57,215,255', 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.4)));
    glowDot(ctx, 40, -43, 5, '57,215,255', 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.4 + 1.6)));

    ctx.restore();
  }
}

export default Base;
