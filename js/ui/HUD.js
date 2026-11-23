import { CONFIG } from '../data/config.js';
import { clamp, TAU } from '../core/utils.js';

const W = CONFIG.WORLD.WIDTH;
const H = CONFIG.WORLD.HEIGHT;

/**
 * 战斗 HUD（绘制在 Canvas 上，素材来自 Kenney UI Pack，经 SpriteLoader 绘制）
 *
 * 与 Prompt 第 42 节的一处有意偏差：战斗内 HUD 走 Canvas 而非 DOM ——
 * HP/热量/XP 每帧变化，DOM 会 reflow；且它们必须与战场一起按 1280×720 统一缩放。
 * 菜单 / 暂停 / 结算 / 升级卡片 / 广告容器 仍走 HTML+CSS。
 */
export class HUD {
  constructor(game) { this.game = game; }

  render(ctx) {
    const g = this.game;

    this._baseHp(ctx, g);
    this._cityHp(ctx, g);
    this._xp(ctx, g);
    this._topCenter(ctx, g);
    this._topRight(ctx, g);
    this._bossBar(ctx, g);
    this._heat(ctx, g);
    this._missileAmmo(ctx, g);
    this._crosshair(ctx, g);
    this._assistMarker(ctx, g);
    this._shield(ctx, g);
    this._weaponStrip(ctx, g);   // Phase 13：已获得武器与等级
    this._build(ctx, g);         // Phase 18：Build HUD（当前流派 + 完成度）
    this._combo(ctx, g);         // Phase 11：连击
    this._threat(ctx, g);        // Phase 11：危险度
    this._eventBanner(ctx, g);   // Phase 11：随机事件横幅
    this._lowHpVignette(ctx, g);
  }

  /* ---------------- Phase 13：武器条 ---------------- */
  _weaponStrip(ctx, g) {
    const list = (g.weapons && g.weapons.list) ? g.weapons.list() : [];
    // Phase 14：战术装备接在武器后面展示，并画出冷却进度
    if (g.equipment) for (const it of g.equipment.tactical.values()) list.push(it);
    if (!list.length) return;
    const x = 34, y = H - 78, gap = 6, boxH = 18;   // HEAT 条在 H-46，这里留出 14px 间距
    ctx.save();
    ctx.font = '11px Orbitron, "Noto Sans SC", sans-serif';
    ctx.textBaseline = 'middle';
    let cx = x;
    for (const w of list) {
      const label = w.name + ' Lv' + w.level;
      const bw = ctx.measureText(label).width + 30;
      ctx.fillStyle = 'rgba(8,12,20,.78)';
      ctx.fillRect(cx, y, bw, boxH);
      ctx.strokeStyle = w.isMaxLevel ? '#ffd166' : 'rgba(140,200,255,.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, y + 0.5, bw - 1, boxH - 1);
      for (let i = 0; i < w.maxLevel; i++) {
        ctx.fillStyle = i < w.level ? (w.isMaxLevel ? '#ffd166' : '#8fd6ff') : 'rgba(255,255,255,.18)';
        ctx.fillRect(cx + 5 + i * 4, y + 4, 2.5, boxH - 8);
      }
      ctx.fillStyle = w.isMaxLevel ? '#ffd166' : '#dbe9ff';
      ctx.fillText(label, cx + 8 + w.maxLevel * 4, y + boxH / 2 + 0.5);
      // 战术装备：底部一条冷却进度（cd 越小越接近就绪）
      if (w.slot === 'tactical') {
        const total = (w.eff && w.eff.cooldown) || 1;
        const k = Math.max(0, Math.min(1, 1 - (w.cd || 0) / total));
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.fillRect(cx + 4, y + boxH - 4, bw - 8, 2);
        ctx.fillStyle = k >= 1 ? '#4dffa6' : '#ffb03d';
        ctx.fillRect(cx + 4, y + boxH - 4, (bw - 8) * k, 2);
      }
      cx += bw + gap;
    }
    ctx.restore();
  }

  /* ---------------- Phase 18：Build HUD（§76 只显示流派名 + 完成度） ---------------- */
  _build(ctx, g) {
    if (!g.build || !g.build.best) return;
    const a = g.build.best;
    const p = g.build.bestProgress;
    const score = g.build.score();
    const x = 34, y = 84, w = 150, h = 30;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,.72)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = p >= 1 ? 'rgba(255,209,102,.85)' : 'rgba(57,215,255,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '700 10px Orbitron, Menlo, monospace';
    ctx.fillStyle = 'rgba(127,149,171,.9)';
    ctx.fillText('构型', x + 7, y + 9);
    ctx.font = '800 12px Orbitron, Menlo, monospace';
    ctx.fillStyle = p >= 1 ? '#ffd166' : '#dbe9ff';
    ctx.fillText(a.name, x + 7, y + 21);

    // 进度条
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x + w - 44, y + 7, 36, 5);
    ctx.fillStyle = p >= 1 ? '#ffd166' : '#39d7ff';
    ctx.fillRect(x + w - 44, y + 7, 36 * Math.min(1, p), 5);
    ctx.font = '700 9px Orbitron, Menlo, monospace';
    ctx.fillStyle = 'rgba(219,233,245,.75)';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(p * 100) + '%', x + w - 7, y + 21);
    // BuildScore 徽标
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,209,102,.85)';
    ctx.fillText('得分 ' + score, x + w + 8, y + 15);
    ctx.restore();
  }

  /* ---------------- 基地生命（Kenney 血条） ---------------- */  _baseHp(ctx, g) {
    const x = 34, y = 20, w = 300, h = 24;
    const r = clamp(g.base.ratio, 0, 1);
    g.spriteLoader.drawBar(ctx, 'Blue', x, y, w, h, r, { lowColorRed: true, size: 'large' });

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(219,233,245,.9)';
    ctx.font = '700 12px Orbitron, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('基地', x, y + h + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(200,220,240,.85)';
    ctx.fillText(`${Math.ceil(g.base.hp)} / ${g.base.maxHp}`, x + w, y + h + 12);
    ctx.restore();
  }

  /* ---------------- 城市生命（轰炸机/重型单位攻击） ---------------- */
  _cityHp(ctx, g) {
    if (!g.city) return;
    const x = 34, y = 76, w = 300, h = 18;
    const r = clamp(g.city.hp / g.city.maxHp, 0, 1);
    g.spriteLoader.drawBar(ctx, 'Green', x, y, w, h, r, { size: 'small' });

    ctx.save();
    ctx.fillStyle = r > 0.35 ? 'rgba(200,255,225,.9)' : '#ff9a3d';
    ctx.font = '700 11px Orbitron, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('城市', x, y - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(g.city.hp)} / ${g.city.maxHp}`, x + w, y - 3);
    ctx.restore();
  }

  /* ---------------- XP 条 + 等级 ---------------- */
  _xp(ctx, g) {
    const w = 220, h = 14;
    const x = W / 2 - w / 2;
    const y = 58;
    const ratio = clamp(g.level.xp / g.level.xpToNext(g.level.level), 0, 1);
    g.spriteLoader.drawBar(ctx, 'Yellow', x, y, w, h, ratio, { size: 'small' });

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,209,102,.95)';
    ctx.font = '700 12px Orbitron, Menlo, monospace';
    ctx.fillText(`LV ${g.level.level}`, x - 10, y + h / 2);
    ctx.restore();
  }

  /* ---------------- 中间：分数 / 击杀 / 波次 ---------------- */
  _topCenter(ctx, g) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(234,246,255,.96)';
    ctx.font = '900 34px Orbitron, Menlo, monospace';
    ctx.fillText(String(g.run.score), W / 2, 12);
    ctx.fillStyle = 'rgba(127,149,171,.85)';
    ctx.font = '700 12px Orbitron, Menlo, monospace';
    ctx.fillText(`击落 ${g.run.kills}`, W / 2, 82);
    // 波次
    const wn = g.wave ? g.wave.currentWaveNumber : 0;
    const wt = g.wave ? g.wave.totalWaves : 0;
    const endless = !!(g.run && g.run.endless);
    let wtext, wcolor;
    if (endless) {
      // 无尽模式没有"总波数"，写 /10 会让玩家误以为打完 10 波就结束
      wtext = `第 ${String(wn).padStart(2, '0')} 波 · 无尽`;
      wcolor = '#ffd166';                       // 金色：无尽模式标识
    } else {
      wtext = `第 ${String(wn).padStart(2, '0')} / ${String(wt).padStart(2, '0')} 波`;
      // 交战中原本用橙红（#ff7a3d），像报错警告，改用亮白，与顶部分数同一套视觉；
      // 间歇期用绿、准备期用青
      wcolor = (g.wave && g.wave.state === 'active') ? '#eaf6ff'
             : (g.wave && g.wave.state === 'rest')    ? '#4dffa6' : '#39d7ff';
    }
    ctx.fillStyle = wcolor;
    ctx.font = '700 13px Orbitron, Menlo, monospace';
    ctx.fillText(wtext, W / 2, 102);
    // Phase 17：难度徽标（让玩家随时知道自己在挑战哪一层）
    if (g.difficulty) {
      const d = g.difficulty.def;
      const label = `${d.label} ${d.name}`;
      ctx.font = '700 11px Orbitron, Menlo, monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(57,215,255,.14)';
      ctx.fillRect(W / 2 - tw / 2 - 7, 118, tw + 14, 16);
      ctx.fillStyle = d.id >= 8 ? '#ff5f6d' : d.id >= 5 ? '#ffd166' : '#39d7ff';
      ctx.fillText(label, W / 2, 121);
    }
    ctx.restore();
  }

  /* ---------------- 右上：时间 / FPS ---------------- */
  _topRight(ctx, g) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(127,149,171,.9)';
    ctx.font = '700 13px Orbitron, Menlo, monospace';
    ctx.fillText(`${g.run.time.toFixed(1)}s`, W - 60, 22);
    if (CONFIG.DEBUG && g.loop) {
      ctx.fillStyle = g.loop.fps >= 50 ? 'rgba(77,255,166,.8)' : 'rgba(255,209,102,.9)';
      ctx.fillText(`${g.loop.fps} FPS`, W - 60, 42);
    }
    ctx.restore();
  }

  /* ---------------- Boss 血条 ---------------- */
  _bossBar(ctx, g) {
    const boss = g.enemies.pools.boss.active.find(e => e.alive);
    if (!boss) return;
    const w = 560, h = 18, x = W / 2 - w / 2, y = 140;
    const r = clamp(boss.hp / boss.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,.82)';
    ctx.strokeStyle = 'rgba(255,59,92,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    const g2 = ctx.createLinearGradient(x, y, x, y + h);
    g2.addColorStop(0, '#ff5f6d'); g2.addColorStop(1, '#b52b4a');
    ctx.fillStyle = g2;
    ctx.fillRect(x + 2, y + 2, (w - 4) * r, h - 4);
    ctx.fillStyle = '#ffb3c0';
    ctx.font = '900 13px Orbitron, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const phaseName = boss.state === 'core' ? '核心暴露' : `第 ${boss.phase} 阶段`;
    ctx.fillText(`天穹轰炸舰  ·  ${phaseName}`, W / 2, y - 5);
    ctx.restore();
  }

  /* ---------------- 热量 / 过热（Kenney 血条） ---------------- */
  _heat(ctx, g) {
    const w = g.weapons.primary;
    if (!w) return;
    const x = 34, y = H - 46, bw = 260, bh = 16;
    // 主武器可以是非机炮（高射炮 / 电磁炮 / 脉冲激光 / 导弹，见构型 WEAPON 槽）。
    // 它们不过热，此时这条改为"冷却 / 就绪"进度，否则玩家会看到一条永远空着的血条。
    const usesHeat = (w.heatPerShot || 0) > 0;
    const ratio = usesHeat
      ? clamp(w.heat / (w._effectiveMaxHeat || w.maxHeat), 0, 1)
      : (typeof w.readyRatio === 'number' ? w.readyRatio : 1);
    // 条色：热量用红；冷却用绿（Blue 没有 small 尺寸素材，会退到 fallback 纯色条）
    g.spriteLoader.drawBar(ctx, usesHeat ? 'Red' : 'Green', x, y, bw, bh, ratio, { size: 'small' });

    ctx.save();
    ctx.fillStyle = w.overheated ? '#ff6b7f' : 'rgba(219,233,245,.85)';
    ctx.font = '700 11px Orbitron, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    let label = w.overheated ? '过热' : '热量';
    if (!usesHeat) label = ratio >= 1 ? '就绪' : (w.name || '冷却');
    ctx.fillText(label, x, y - 4);
    ctx.restore();
  }

  /* ---------------- 导弹弹匣 / 装填 ---------------- */
  _missileAmmo(ctx, g) {
    const l = g.missileLauncher;
    if (!l || !l.acquired) return;    // Phase 13：未获得导弹时不显示
    const x = 34, y = H - 20, w = 200, h = 8;
    let ratio, label;
    if (l.reloading) {
      ratio = 1 - (l.reloadTimer / l._reloadTime);
      label = '导弹装填中';
    } else {
      ratio = l.ammoRatio;
      label = `MSL ${l.ammo}/${l._maxAmmo}`;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,.82)';
    ctx.fillRect(x, y, w, h);
    const col = l.reloading ? '#ff7a3d' : '#8fd6ff';
    ctx.fillStyle = col;
    ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, ratio)), h - 2);
    ctx.fillStyle = 'rgba(219,233,245,.82)';
    ctx.font = '700 10px Orbitron, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y - 2);
    ctx.restore();
  }

  /* ---------------- 触摸准星 ---------------- */
  _crosshair(ctx, g) {
    if (g.state !== 'PLAYING' || !g.input.isDown) return;
    g.spriteLoader.drawCrosshair(ctx, 'Blue', g.input.x, g.input.y, 34);
  }

  /* ---------------- 辅助瞄准标记 ---------------- */
  _assistMarker(ctx, g) {
    const t = g.aim.assistTarget;
    if (!t || !t.alive) return;
    const s = t.radius + 10;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,122,61,.85)';
    ctx.lineWidth = 1.6;
    const c = 7;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(t.x + sx * s, t.y + sy * s - sy * c);
      ctx.lineTo(t.x + sx * s, t.y + sy * s);
      ctx.lineTo(t.x + sx * s - sx * c, t.y + sy * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 护盾 ---------------- */
  _shield(ctx, g) {
    if (!g.run.shield) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(57,215,255,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(CONFIG.TURRET.x, CONFIG.TURRET.y, 62, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(57,215,255,.8)';
    ctx.font = '700 11px Orbitron, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`SHIELD x${g.run.shield}`, CONFIG.TURRET.x, CONFIG.TURRET.y - 74);
    ctx.restore();
  }

  /* ---------------- 连击（Phase 11） ---------------- */
  _combo(ctx, g) {
    const c = g.combo;
    if (!c || !c.active) return;

    const x = 34, y = 128;
    const tierColors = ['#8fb8d8', '#39d7ff', '#4dffa6', '#ffd166', '#ff7a3d'];
    const col = tierColors[Math.min(c.tier, tierColors.length - 1)];

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // 跨档时轻微放大，给正反馈
    const pop = c.flash > 0 ? 1 + c.flash * 0.35 : 1;
    ctx.font = `900 ${Math.round(28 * pop)}px Orbitron, Menlo, monospace`;
    ctx.fillStyle = col;
    ctx.fillText(`x${c.count}`, x, y);

    ctx.font = '700 11px Orbitron, Menlo, monospace';
    ctx.fillStyle = 'rgba(127,149,171,.9)';
    ctx.fillText('连击', x, y + 34);

    if (c.tier > 0) {
      ctx.fillStyle = 'rgba(77,255,166,.9)';
      ctx.fillText(
        `XP +${Math.round((c.xpMul - 1) * 100)}%  钢材 +${Math.round((c.steelMul - 1) * 100)}%`,
        x, y + 50
      );
    }

    // 连击剩余时间条
    const bw = 120, bh = 5, by = y + 70;
    ctx.fillStyle = 'rgba(10,20,34,.75)';
    ctx.fillRect(x, by, bw, bh);
    ctx.fillStyle = col;
    ctx.fillRect(x, by, bw * c.remainRatio, bh);
    ctx.restore();
  }

  /* ---------------- 危险度（Phase 11） ----------------
     位置：右上、时间/FPS 下方。
     - 左下 x=34 同一列已被 HEAT 条(y=H-46) 与导弹弹匣(y=H-20) 占满
     - 顶部居中会被 DOM toast（top:14% 且可堆叠）周期性盖住
     - 右上 y>=76 起完全空闲（暂停按钮已挪到右下角，比赛版布局） */
  _threat(ctx, g) {
    const t = g.threat;
    if (!t) return;

    const segs = 10, sw = 18, bh = 9;
    const bw = segs * sw;
    const x = W - 34 - bw;                  // 右对齐，边距 34 与其它 HUD 一致
    const y = 90;
    const filled = clamp(t.value, 0, 1) * segs;
    const col = t.level >= 3 ? '#ff5a4d' : (t.level === 2 ? '#ffd166' : '#4dffa6');

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '700 11px Orbitron, Menlo, monospace';
    ctx.fillStyle = t.level >= 3 ? '#ff9a8d' : (t.level === 2 ? '#ffd166' : 'rgba(200,220,240,.9)');
    ctx.fillText(`威胁等级 · ${t.name}`, W - 34, 76);

    for (let i = 0; i < segs; i++) {
      const sx = x + i * sw;
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(sx, y, sw - 2, bh);
      const a = clamp(filled - i, 0, 1);
      if (a > 0) {
        ctx.fillStyle = col;
        ctx.fillRect(sx, y, (sw - 2) * a, bh);
      }
    }
    ctx.restore();
  }

  /* ---------------- 随机事件横幅（Phase 11） ---------------- */
  _eventBanner(ctx, g) {
    const b = (g.events && g.events.banner) ? g.events.banner() : null;
    if (!b) return;

    const cx = W / 2, y = 196;
    const pulse = 0.5 + 0.5 * Math.sin((g.run ? g.run.time : 0) * 5);
    const col = b.warn
      ? `rgba(255,122,61,${(0.72 + 0.28 * pulse).toFixed(3)})`
      : 'rgba(57,215,255,.95)';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,16,28,.74)';
    ctx.fillRect(cx - 200, y - 28, 400, 58);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 200, y - 28, 400, 58);

    ctx.font = '900 20px Orbitron, Menlo, monospace';
    ctx.fillStyle = col;
    ctx.fillText(b.title, cx, y - 10);

    ctx.font = '700 12px Orbitron, Menlo, monospace';
    ctx.fillStyle = 'rgba(219,233,245,.92)';
    ctx.fillText(`${b.text}    ${b.left > 0 ? b.left.toFixed(1) + 's' : ''}`, cx, y + 14);
    ctx.restore();
  }

  /* ---------------- 低血量红晕 ---------------- */
  _lowHpVignette(ctx, g) {
    const r = g.base.ratio;
    if (r > 0.35) return;
    const a = (0.35 - r) / 0.35 * (0.35 + 0.2 * Math.sin(g.run.time * 6));
    ctx.save();
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.78);
    grd.addColorStop(0, 'rgba(255,40,70,0)');
    grd.addColorStop(1, `rgba(255,40,70,${a * 0.5})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** 开局操作提示（前 4 秒淡出） */
  renderHint(ctx, t) {
    if (t > 4) return;
    const a = clamp(4 - t, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(219,233,245,.9)';
    ctx.font = '700 15px Orbitron, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('拖动瞄准 · 按住持续开火', W / 2, CONFIG.WORLD_GROUND_Y - 120);
    ctx.restore();
  }
}

export default HUD;
