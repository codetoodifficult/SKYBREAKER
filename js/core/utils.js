/** 通用数学 / 工具函数 */

export const TAU = Math.PI * 2;

export function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }

/** 把角度归一化到 (-PI, PI] */
export function normalizeAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** 角度插值（走最短弧） */
export function lerpAngle(a, b, t) {
  return a + normalizeAngle(b - a) * t;
}

/** 以固定角速度朝目标角旋转 */
export function rotateTowards(a, b, maxDelta) {
  const d = normalizeAngle(b - a);
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

export function rand(min, max) { return min + Math.random() * (max - min); }
export function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
export function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
export function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

/** 线段 AB 到点 P 的最短距离平方（用于高速子弹的扫掠碰撞，防穿透） */
export function distSegPoint2(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist2(ax, ay, px, py);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist2(ax + t * dx, ay + t * dy, px, py);
}

export function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.floor(n));
}
