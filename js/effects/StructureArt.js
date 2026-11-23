/**
 * StructureArt —— 地面建筑共用的绘制工具（炮塔 / 雷达站 / 发电站）
 *
 * 目标：让三座建筑从"几何色块"变成有体积、有材质、有光源的硬表面机械。
 * 统一约定：
 *   - 主光源在左上，因此左上角用亮金属、右下角压暗
 *   - 所有建筑共用同一套描边色（冷青 #39d7ff）与暖色（#ff7a3d），保证画面统一
 *   - 自转 / 脉冲等动画一律由调用方传入 t（秒），本模块不持有状态
 */
import { TAU } from '../core/utils.js';

export const EDGE_COLD = 'rgba(57,215,255,';
export const EDGE_WARM = 'rgba(255,122,61,';

/** 地面接触阴影：让建筑"踩"在地上而不是浮着 */
export function groundShadow(ctx, rx, ry = 7, alpha = 0.5) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.65, `rgba(0,0,0,${alpha * 0.45})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(0, ry);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * 竖直金属渐变（左上受光）
 * @returns {CanvasGradient}
 */
export function metalGrad(ctx, top, bottom, hi = '#5b7086', mid = '#2c3c4d', lo = '#141d2a') {
  const g = ctx.createLinearGradient(-30, top, 24, bottom);
  g.addColorStop(0, hi);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, lo);
  return g;
}

/** 混凝土渐变（更灰、更哑光） */
export function concreteGrad(ctx, top, bottom) {
  const g = ctx.createLinearGradient(-30, top, 20, bottom);
  g.addColorStop(0, '#4a5666');
  g.addColorStop(0.5, '#2a3542');
  g.addColorStop(1, '#161e28');
  return g;
}

/** 铆钉阵列 */
export function rivets(ctx, pts, r = 1.15, color = 'rgba(190,220,255,.35)') {
  ctx.fillStyle = color;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

/** 面板分割线（内凹感：先暗线再亮线） */
export function panelLine(ctx, x1, y1, x2, y2, w = 1) {
  ctx.lineWidth = w;
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.moveTo(x1, y1 + 0.5); ctx.lineTo(x2, y2 + 0.5); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,225,255,.12)';
  ctx.beginPath(); ctx.moveTo(x1, y1 - 0.5); ctx.lineTo(x2, y2 - 0.5); ctx.stroke();
}

/** 黄黑警示斜条纹（裁剪在 clipPath 内） */
export function warnStripes(ctx, x, y, w, h, phase = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffb03d';
  const step = 8;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.lineTo(x + i + h + step * 0.5, y);
    ctx.lineTo(x + i + step * 0.5, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 发光点（径向渐变 + lighter） */
export function glowDot(ctx, x, y, r, rgb, alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${0.9 * alpha})`);
  g.addColorStop(0.35, `rgba(${rgb},${0.35 * alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 桁架（雷达/输电塔用的 X 形支撑） */
export function truss(ctx, x, yTop, yBot, halfW, level = 3) {
  ctx.save();
  ctx.strokeStyle = 'rgba(150,190,225,.28)';
  ctx.lineWidth = 1;
  const h = (yBot - yTop) / level;
  for (let i = 0; i < level; i++) {
    const y0 = yTop + i * h;
    const y1 = y0 + h;
    const w0 = halfW * (1 - i / (level + 1));
    const w1 = halfW * (1 - (i + 1) / (level + 1));
    ctx.beginPath();
    ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y1);
    ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y1);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(150,190,225,.4)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - halfW, yTop); ctx.lineTo(x - halfW * 0.35, yBot);
  ctx.moveTo(x + halfW, yTop); ctx.lineTo(x + halfW * 0.35, yBot);
  ctx.stroke();
  ctx.restore();
}

export default {
  groundShadow, metalGrad, concreteGrad, rivets, panelLine, warnStripes, glowDot, truss,
  EDGE_COLD, EDGE_WARM,
};
