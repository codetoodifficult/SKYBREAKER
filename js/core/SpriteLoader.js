/**
 * SpriteLoader —— Kenney UI Pack (CC0) 加载与绘制
 *
 * 约定：
 *   - 所有素材位于 img/UI/<color>/Double/<key>.png（Double = 2x 分辨率，画到逻辑像素一半大小刚好 1:1）
 *   - 支持 3 段（l/m/r）素材按文件名约定：<key>_l, _m, _r
 *   - draw 方法若素材未加载，自动回退到程序化绘制（保证游戏永远可玩）
 *   - 缺失素材只 console.warn，不抛异常
 */
const BASE = 'img/UI/';
const COLORS = { blue:'Blue', green:'Green', grey:'Grey', red:'Red', yellow:'Yellow', extra:'Extra' };

/** 需要预加载的素材清单。Game.init 时 await preload(KENNEY_ASSETS) */
export const KENNEY_ASSETS = [
  // 血条/热量/XP 条：track 用 Extra 的 shadow，fill 用各色（large=24px 高，small=16px 高）
  ['Extra', 'bar_shadow_round_large'],
  ['Extra', 'bar_shadow_round_small'],
  ['Blue',   'bar_round_gloss_large'],
  ['Red',    'bar_round_gloss_large'],
  ['Yellow', 'bar_round_gloss_large'],
  ['Green',  'bar_round_gloss_large'],
  ['Red',    'bar_round_gloss_small'],
  ['Yellow', 'bar_round_gloss_small'],
  ['Green',  'bar_round_gloss_small'],
  // 准星
  ['Blue',  'crosshair_color_a'],
  ['Yellow','crosshair_color_a'],
  // 面板（升级卡片 9 宫格用）
  ['Extra', 'panel_square'],
  ['Extra', 'panel_rectangle'],
  // 按钮头（卡片头部 + DOM 按钮 CSS 背景）
  ['Blue',  'button_square_header_large_rectangle'],
  ['Grey',  'button_square_header_large_rectangle'],
  ['Yellow','button_square_header_large_rectangle'],
  ['Red',   'button_square_header_large_rectangle'],
  ['Green', 'button_square_header_large_rectangle'],
];

export class SpriteLoader {
  constructor() {
    this.cache = new Map(); // fullPath -> { image, promise }
  }

  url(color, key) { return `${BASE}${color}/Double/${key}.png`; }

  load(color, key) {
    const full = this.url(color, key);
    let e = this.cache.get(full);
    if (e) return e.promise;
    const entry = {};
    entry.promise = new Promise((res) => {
      const img = new Image();
      img.onload  = () => { entry.image = img; res(img); };
      img.onerror = () => { entry.image = null; console.warn('[sprite] missing', full); res(null); };
      img.src = full;
    });
    this.cache.set(full, entry);
    return entry.promise;
  }

  preload(list = KENNEY_ASSETS) {
    return Promise.all(list.map(([c, k]) => this.load(c, k)));
  }

  get(color, key) {
    const e = this.cache.get(this.url(color, key));
    return (e && e.image) || null;
  }

  // ============================================================
  //  HUD Bar：track（深底）+ fill（亮色，按 ratio 裁剪左侧）
  // ============================================================
  /**
   * @param {string} color  Blue/Red/Yellow/Green
   * @param {number} x,y,w,h  逻辑像素矩形
   * @param {number} ratio  0~1
   * @param {{style?:'gloss'|'plain', size?:'large'|'small', lowColorRed?:boolean}} opts
   */
  drawBar(ctx, color, x, y, w, h, ratio, opts = {}) {
    ratio = Math.max(0, Math.min(1, ratio));
    const sizeKey = (opts.size === 'small' || h <= 18) ? 'small' : 'large';
    const style   = opts.style || 'gloss';

    // 低血量自动切红
    const fillColor = (opts.lowColorRed && ratio < 0.35) ? 'Red' : color;

    const track = this.get('Extra', `bar_shadow_round_${sizeKey}`);
    const fill  = this.get(fillColor, `bar_round_${style}_${sizeKey}`);

    if (!track || !fill) {
      this._fallbackBar(ctx, fillColor, x, y, w, h, ratio);
      return;
    }

    // 1) track
    ctx.drawImage(track, 0, 0, track.naturalWidth, track.naturalHeight, x, y, w, h);
    // 2) fill clipped
    if (ratio > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w * ratio, h);
      ctx.clip();
      ctx.drawImage(fill, 0, 0, fill.naturalWidth, fill.naturalHeight, x, y, w, h);
      ctx.restore();
    }
  }

  _fallbackBar(ctx, color, x, y, w, h, ratio) {
    ctx.fillStyle = 'rgba(8,12,20,.85)';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    const stop = color === 'Red' ? ['#ff3b5c', '#ff7a6b']
      : color === 'Yellow' ? ['#ffd166', '#ff9a3d']
      : color === 'Green'  ? ['#4dffa6', '#39d7ff']
      :                       ['#39d7ff', '#7fe3ff'];
    g.addColorStop(0, stop[0]); g.addColorStop(1, stop[1]);
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, y + 2, (w - 4) * ratio, h - 4);
    ctx.strokeStyle = 'rgba(57,215,255,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // ============================================================
  //  Panel 9 切片（panel_square / panel_rectangle）
  // ============================================================
  drawPanel9(ctx, color, shape, x, y, w, h, inset = 20) {
    const img = this.get(color, shape);
    if (!img) { this._fallbackPanel(ctx, x, y, w, h); return; }
    const sw = img.naturalWidth, sh = img.naturalHeight;  // Double 2x
    const I = inset;            // 逻辑 inset
    const SI = I * 2;           // 源 inset
    if (sw < SI * 2 + 2 || sh < SI * 2 + 2) { this._fallbackPanel(ctx, x, y, w, h); return; }

    // 4 角
    ctx.drawImage(img, 0,      0,      SI, SI, x,         y,         I, I);
    ctx.drawImage(img, sw - SI,0,      SI, SI, x + w - I, y,         I, I);
    ctx.drawImage(img, 0,      sh - SI,SI, SI, x,         y + h - I, I, I);
    ctx.drawImage(img, sw - SI,sh - SI,SI, SI, x + w - I, y + h - I, I, I);
    // 4 边（拉伸）
    ctx.drawImage(img, SI,     0,      sw - SI*2, SI,  x + I,     y,     w - I*2, I);
    ctx.drawImage(img, SI,     sh - SI,sw - SI*2, SI,  x + I,     y + h - I, w - I*2, I);
    ctx.drawImage(img, 0,      SI,     SI, sh - SI*2,  x,         y + I, I, h - I*2);
    ctx.drawImage(img, sw - SI,SI,     SI, sh - SI*2,  x + w - I, y + I, I, h - I*2);
    // 中心
    ctx.drawImage(img, SI,     SI,     sw - SI*2, sh - SI*2, x + I, y + I, w - I*2, h - I*2);
  }

  _fallbackPanel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(20,32,48,.94)';
    ctx.strokeStyle = 'rgba(57,215,255,.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
  }

  // ============================================================
  //  Button Header：卡片顶部色条（只画顶部指定高度的色带）
  // ============================================================
  drawButtonHeader(ctx, color, x, y, w, h) {
    const img = this.get(color, 'button_square_header_large_rectangle');
    if (!img) {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(40,80,120,.9)'); g.addColorStop(1, 'rgba(20,40,60,.9)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      return;
    }
    // 源 192x64 (Double)；只取顶部色带部分（约顶部 55%）
    const headSrcH = Math.floor(img.naturalHeight * 0.55);
    ctx.drawImage(img, 0, 0, img.naturalWidth, headSrcH, x, y, w, h);
  }

  // ============================================================
  //  Crosshair：在触摸点显示
  // ============================================================
  drawCrosshair(ctx, color, x, y, size) {
    const img = this.get(color, 'crosshair_color_a');
    if (!img) {
      ctx.strokeStyle = '#39d7ff'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y);
      ctx.moveTo(x + 5,  y); ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5);
      ctx.moveTo(x, y + 5);  ctx.lineTo(x, y + 14);
      ctx.stroke();
      return;
    }
    const s = size || img.naturalWidth * 0.5;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x - s / 2, y - s / 2, s, s);
  }
}

export { COLORS };
export default SpriteLoader;
