import { META_UPGRADES } from '../data/meta.js';
import { CONFIG } from '../data/config.js';
import { CORES, WEAPON_CORES, POWERS, CONFIG_BONUSES, LOADOUT_SLOTS, isSoon } from '../data/configuration.js';
import { BUILD_CORES } from '../data/buildCores.js';

const SLOT_LABEL = {
  core: 'CORE · 炮塔核心', weapon: 'WEAPON · 主武器', power: 'POWER · 供能系统',
  build: 'BUILD CORE · 构筑核心（每局 1 个，决定这局怎么玩）',
};
function SLOT_DEF(lo, slot) {
  if (slot === 'core') return lo.core;
  if (slot === 'weapon') return lo.weapon;
  if (slot === 'power') return lo.power;
  return lo.buildCore;
}
import { EVOLUTIONS, recipeText } from '../data/evolution.js';
import { CHALLENGES, CHALLENGE_ORDER, challengeSlotsFor } from '../data/challenges.js';   // Phase 20
import { ENDLESS, endlessGrowth } from '../data/endless.js';
import { ARCHETYPES, CROSS_BUILDS, TAG_NAMES } from '../data/builds.js';
import { WEAPON_COLLECTION, MASTERY } from '../data/unlocks.js';
import { WEAPONS, ACQUIRABLE_WEAPONS } from '../data/weapons.js';          // Phase F：构筑总览
import { WEAPON_MODS } from '../data/weaponMods.js';
import { SYNERGIES } from '../progression/SynergySystem.js';

/** 秒 → 「X 小时 Y 分钟 / X 分钟 / X 秒」 */
function fmtDuration(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  if (m > 0) return `${m} 分钟`;
  return `${t} 秒`;
}

/**
 * UI 覆盖层（HTML + CSS，按钮/面板用 Kenney UI Pack 素材）
 * 负责：主菜单 / 暂停 / 结算 / Toast / 暂停按钮
 * 战场内容一律不在这里画，全部交给 Canvas。
 */
export class Screens {
  /**
   * @param {import('../core/Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.layer = document.getElementById('ui-layer');
    this.current = null;

    this._toastBox = document.createElement('div');
    this._toastBox.id = 'ui-toast';
    this.layer.appendChild(this._toastBox);

    this._pauseBtn = document.createElement('button');
    this._pauseBtn.className = 'ad-btn kenney-btn-ghost';
    this._pauseBtn.textContent = '❚❚';
    // 战斗中常用，尺寸要够手指点（52px 经 UI 缩放后只剩 ~28 CSS px，太小）
    // 比赛版：放在右下角，避开右上角的时间/FPS/威胁条等 HUD。
    // bottom/right 叠加 safe-area：横屏下巴 / 圆角约 34px，不加会被系统手势区挡住
    this._pauseBtn.style.cssText =
      'position:fixed;' +
      'bottom:calc(10px + env(safe-area-inset-bottom));' +
      'right:calc(10px + env(safe-area-inset-right));' +
      'width:72px;height:72px;padding:0 0 8px;font-size:20px;z-index:12;display:none;';
    this._pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.audio.click();
      this.game.togglePause();
    });
    this.layer.appendChild(this._pauseBtn);

    // ---- UI DPI 适配：内容自适应塞进 UI 设计画布 ----
    // UI 层是一张「世界尺寸的设计画布 + 整体缩放」，内部排版固定。
    // 若某个界面的内容比画布还高（例如主菜单 7 个按钮），会溢出屏幕，
    // 所以每次界面内容变化后自动测量，必要时整体等比缩小（scale < 1）塞进画布。
    // MutationObserver 在 Node 无头测试桩里不存在，缺失时退化为手动/resize 触发。
    if (typeof MutationObserver === 'function') {
      this._fitPending = false;
      this._fitObserver = new MutationObserver(() => this._scheduleFit());
      this._fitObserver.observe(this.layer, { childList: true, subtree: true });
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => this._scheduleFit());
    }
  }

  _scheduleFit() {
    if (this._fitPending) return;
    this._fitPending = true;
    const run = () => { this._fitPending = false; this._fitScreens(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  /**
   * 让每个 .screen 的内容自动塞进 UI 设计画布（--ui-w × --ui-h）。
   * 只在内容确实超出时缩小，不超出则完全不动，避免影响既有视觉。
   */
  _fitScreens() {
    const layer = this.layer;
    if (!layer) return;
    for (const s of layer.querySelectorAll('.screen')) {
      const inner = s.firstElementChild;
      if (!inner) continue;
      inner.style.transform = 'none';        // 先复位，确保测量到真实尺寸
      const cs = getComputedStyle(s);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const availH = s.clientHeight - padY;
      const availW = s.clientWidth - padX;
      const needH = inner.scrollHeight;
      const needW = inner.scrollWidth;
      let k = 1;
      if (needH > availH && needH > 0) k = Math.min(k, availH / needH);
      if (needW > availW && needW > 0) k = Math.min(k, availW / needW);
      if (k < 1) {
        inner.style.transform = `scale(${k.toFixed(4)})`;
        inner.style.transformOrigin = 'center center';
      }
    }
  }

  showPauseButton(v) { this._pauseBtn.style.display = v ? 'flex' : 'none'; }

  clear() {
    for (const el of Array.from(this.layer.children)) {
      if (el === this._toastBox || el === this._pauseBtn) continue;
      el.remove();
    }
    this.current = null;
  }

  _screen() {
    const d = document.createElement('div');
    d.className = 'screen';
    this.layer.appendChild(d);
    this.current = d;
    return d;
  }

  _btn(parent, label, sub, onClick, cls = 'ad-btn-primary') {
    const b = document.createElement('button');
    b.className = 'ad-btn ' + cls;
    b.innerHTML = label + (sub ? `<span class="btn-note">${sub}</span>` : '');
    b.addEventListener('click', (e) => { e.stopPropagation(); this.game.audio.click(); onClick(); });
    parent.appendChild(b);
    return b;
  }

  /**
   * 三段式面板：头部固定 / 内容可滚 / 底栏固定。
   * 图鉴类界面内容动辄 1000px+，直接塞进 .screen 会顶出屏幕、
   * 上下都被裁掉且够不到底部按钮（2026-09-16 修复军械库 / 构型页）。
   *
   * ⚠️ 尺寸一律用运行时实测的 px，禁止 % / vh / min()：
   *  - TapTap 宿主 webview 内核对「flex 子项的百分比高度」支持有缺陷，
   *    max-height:94% 会失效 → 3000px 内容原样撑开 → 被 _fitScreens()
   *    等比缩到 5%，整个面板变成一条 100px 宽的窄柱（真机实锤）。
   *  - vh 在被缩放的容器里也会算错；min() 老内核可能不认识。
   *  px 是唯一在所有内核下行为一致的写法。
   * @param {number} width 期望面板宽度（px），超出可视区会自动收窄
   * @returns {{frame:HTMLElement, head:HTMLElement, body:HTMLElement, foot:HTMLElement}}
   */
  _panel(s, { width = 720, headHtml = '' } = {}) {
    // 单测的 DOM stub 没有 getComputedStyle / 尺寸，走 1280×720 设计画布默认值
    let padX = 48, padY = 48, cw = 1280, ch = 720;
    try {
      if (typeof getComputedStyle === 'function') {
        const cs = getComputedStyle(s);
        padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) || padX;
        padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) || padY;
      }
      if (s.clientWidth) cw = s.clientWidth;
      if (s.clientHeight) ch = s.clientHeight;
    } catch (_) { /* keep defaults */ }
    const maxW = Math.max(200, Math.round((cw - padX) * 0.96));
    const maxH = Math.max(160, Math.round((ch - padY) * 0.96));
    const w = Math.min(width, maxW);

    const frame = document.createElement('div');
    frame.className = 'screen-frame panel-frame';
    frame.style.cssText = `width:${w}px;max-height:${maxH}px;padding-bottom:16px;`;

    const head = document.createElement('div');
    head.className = 'panel-head';
    head.innerHTML = headHtml;

    const body = document.createElement('div');
    body.className = 'panel-body';
    // 标记：内容超出是设计预期（可滚动），UI 溢出检测应跳过这里面的元素
    body.dataset.scrollView = '1';

    const foot = document.createElement('div');
    foot.className = 'btn-col panel-foot';

    frame.appendChild(head);
    frame.appendChild(body);
    frame.appendChild(foot);
    s.appendChild(frame);
    return { frame, head, body, foot };
  }

  /* ------------------------------------------------------------------ */

  /** 主菜单：广告点 ① START_BOOST + Banner */
  showMenu() {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const s = this._screen();

    // 主菜单按钮多，整体约 740px 高，直接塞 .screen 会被裁掉底部
    const { frame, body } = this._panel(s, {
      width: 500,
      headHtml: `
        <div class="frame-header">破空者 · ＳＫＹＢＲＥＡＫＥＲ</div>
        <div class="title" style="font-size:34px;line-height:1.05">破空者<small>ＳＫＹＢＲＥＡＫＥＲ</small></div>
        <div class="sub">防空 Roguelite · 拖动瞄准 · 按住开火 · 拦截一切来袭目标</div>
        <div class="stat-line">历史最高分 <b>${this.game.meta.bestScore || 0}</b></div>
      `,
    });
    frame.querySelector('.panel-foot').remove();

    const col = document.createElement('div');
    col.className = 'btn-col';
    body.appendChild(col);

    // 比赛版：开始任务 = 直接进入难度选择，选完档位即开局（两步合并为一步）
    const dm = this.game.difficulty;
    const cur = dm.def;
    this._btn(
      col,
      '开始任务',
      `当前 ${cur.fullName} · ${cur.sub} · 奖励 ×${cur.rewardMul}`,
      () => this.showDifficulty(),
      'ad-btn-primary'
    );

    // ---- 无尽模式（解锁 D5 后开放）----
    const endlessOk = g.endlessUnlocked;
    const bestEndless = g.endlessBoard ? g.endlessBoard.best() : null;
    this._btn(
      col,
      endlessOk ? '无尽模式' : '无尽模式 · 未解锁',
      endlessOk
        ? (bestEndless ? `最佳 第 ${bestEndless.wave} 波 · ${bestEndless.score} 分` : '固定强度 · 逐波递增 · 冲榜')
        : ENDLESS.unlockText,
      () => (endlessOk ? this.showEndless() : this.toast(`无尽模式未解锁 · ${ENDLESS.unlockText}`, 'warn')),
      endlessOk ? 'kenney-btn-red' : 'kenney-btn-ghost'
    );

    // ---- Phase 15：出击前构型（CORE × WEAPON × POWER）----
    const lo = this.game.loadout;
    this._btn(
      col,
      '出击构型',
      `${lo.summary().name}${lo.bonus ? ' · ' + lo.bonus.name : ''}`,
      () => this.showLoadout(),
      'kenney-btn-green'
    );

    // ---- 基地升级（Phase 9 永久成长）----
    this._btn(
      col,
      '基地',
      `钢材 ${this.game.meta.steel || 0} · 永久强化`,
      () => this.game.toBase(),
      'kenney-btn-green'
    );

    // 比赛版：已移除「广告 · 开局增益」按钮

    this._btn(col, '静音：' + (this.game.audio.enabled ? '关' : '开'), null, () => {
      this.game.audio.enabled = !this.game.audio.enabled;
      this.showMenu();
    }, 'kenney-btn-ghost');

    // 主菜单底部 Banner 已按用户要求移除（2026-09-16）
  }

  /**
   * Phase 15：出击前构型选择（CORE × WEAPON × POWER）
   * 纯 DOM，未解锁项显示门槛；组合命中时展示 Configuration Bonus。
   */
  showLoadout() {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const lo = g.loadout;
    const s = this._screen();

    const { frame, body, foot } = this._panel(s, {
      width: 720,
      headHtml: `
        <div class="frame-header">出击构型 · COMBAT CONFIGURATION</div>
        <div class="title" style="font-size:26px;line-height:1.1">核心 × 武器 × 供能<small>组合决定这一局怎么打</small></div>
      `,
    });

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin:10px 0 4px;';
    body.appendChild(rows);

    const bonusBox = document.createElement('div');
    bonusBox.style.cssText =
      'border:1px solid rgba(57,215,255,.25);border-radius:10px;padding:10px 12px;background:rgba(57,215,255,.06);min-height:56px;margin-top:10px;';
    body.appendChild(bonusBox);

    const render = () => {
      rows.innerHTML = '';
      for (const slot of LOADOUT_SLOTS) {
        // 比赛版：主武器固定机炮，不再是可选槽
        const label = SLOT_LABEL[slot] + (slot === 'weapon' ? '（固定机炮 · 不可更换）' : '');
        const row = document.createElement('div');
        row.innerHTML = `<div style="font-size:12px;letter-spacing:1px;opacity:.75;margin-bottom:6px;">${label}</div>`;
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
        for (const opt of lo.options(slot)) {
          const b = document.createElement('button');
          const sel = opt.selected;
          if (opt.soon) b.dataset.soon = '1';
          b.className = 'ad-btn ' + (sel ? 'ad-btn-primary' : 'kenney-btn-ghost');
          // "待更新"项：比未解锁更暗，且不能被选中
          b.style.cssText = `flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;text-align:left;`
            + (opt.soon ? 'opacity:.32;filter:grayscale(1);cursor:not-allowed;'
              : (opt.unlocked ? '' : 'opacity:.45;filter:grayscale(1);'));
          b.innerHTML = `
            <span style="font-size:13px;font-weight:700;">${opt.def.short}</span>
            <span style="font-size:10px;opacity:.8;line-height:1.25;">${opt.def.desc}</span>
            ${opt.soon
              ? `<span style="font-size:10px;color:#ffd166;">🔧 ${opt.reqText}</span>`
              : (opt.unlocked ? '' : `<span style="font-size:10px;color:#ff9b6b;">🔒 ${opt.reqText}</span>`)}
          `;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (opt.soon) { this.toast(`${opt.def.short}：${opt.reqText}，暂未开放`, 'warn'); return; }
            if (!opt.unlocked) { this.toast('还未解锁：' + opt.reqText, 'warn'); return; }
            g.audio.click();
            lo.select(slot, opt.id);
            render();
          });
          grid.appendChild(b);
        }
        row.appendChild(grid);
        rows.appendChild(row);
      }

      // 当前组合详情
      const cur = document.createElement('div');
      cur.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:2px;';
      for (const slot of LOADOUT_SLOTS) {
        const def = SLOT_DEF(lo, slot);
        if (!def) continue;
        const d = document.createElement('div');
        d.style.cssText =
          'flex:1 1 180px;border:1px solid rgba(255,255,255,.10);border-radius:8px;padding:8px 10px;background:rgba(255,255,255,.03);';
        d.innerHTML = `
          <div style="font-size:12px;color:#39d7ff;letter-spacing:1px;">${def.name}</div>
          <div style="font-size:11px;opacity:.8;margin:4px 0 2px;">${def.tag}</div>
          ${def.lines.map((l) => `<div style="font-size:11px;opacity:.85;line-height:1.4;">· ${l}</div>`).join('')}
        `;
        cur.appendChild(d);
      }
      rows.appendChild(cur);

      // Configuration Bonus
      if (lo.bonus) {
        bonusBox.innerHTML = `
          <div style="font-size:14px;font-weight:800;color:#ffd166;letter-spacing:1px;">★ ${lo.bonus.name} · 组合奖励已激活</div>
          <div style="font-size:11px;opacity:.85;margin-top:3px;">${lo.bonus.desc}</div>
          ${lo.bonus.lines.map((l) => `<div style="font-size:12px;color:#b9f3ff;line-height:1.5;">· ${l}</div>`).join('')}
        `;
        bonusBox.style.borderColor = 'rgba(255,209,102,.5)';
        bonusBox.style.background = 'rgba(255,209,102,.08)';
      } else {
        bonusBox.innerHTML = `
          <div style="font-size:13px;font-weight:700;opacity:.8;">未触发组合奖励</div>
          <div style="font-size:11px;opacity:.7;margin-top:3px;line-height:1.5;">
            比赛版主武器固定为机炮，仅机炮组合可触发：<br>
            ${CONFIG_BONUSES.filter((b) => b.need.weapon === 'machineGun').map((b) => {
              // 组合里有"待更新"武器的话，标出来，免得玩家拼命凑一个暂时拿不到的奖励
              const soon = ['core', 'weapon', 'power'].some((s) => isSoon(s, b.need[s]));
              return `${b.short}：${CORES[b.need.core].short} + ${WEAPON_CORES[b.need.weapon].short} + ${POWERS[b.need.power].short}`
                + (soon ? '<span style="color:#ffd166;">（暂未开放）</span>' : '');
            }).join('　|　')}
          </div>`;
        bonusBox.style.borderColor = 'rgba(57,215,255,.25)';
        bonusBox.style.background = 'rgba(57,215,255,.06)';
      }
    };
    render();

    foot.innerHTML = '';
    this._btn(foot, '以此构型出击', `${lo.summary().name}`, () => {
      lo.save();
      g.saveMeta();
      g.startRun();
    }, 'ad-btn-primary');
    this._btn(foot, '返回', null, () => this.showMenu(), 'kenney-btn-ghost');
  }

  /**
   * Phase 17 §4：难度选择（D0–D10）
   * 解锁靠"通关"推进，不靠钢材；未解锁项显示 Clear Requirement 进度。
   */
  /**
   * 无尽模式页：说明 + 递增预览 + 本地排行榜 + 出发
   */
  showEndless() {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const s = this._screen();

    const frame = document.createElement('div');
    frame.className = 'screen-frame';
    frame.style.cssText = 'width:min(620px,94vw);';
    frame.innerHTML = `
      <div class="frame-header">ENDLESS · 无尽模式</div>
      <div class="title" style="font-size:28px;line-height:1.1">无尽模式<small>固定强度 · 逐波递增 · 打到防线失守</small></div>
      <div class="sub">难度固定为 D5 基线，不接受难度与加码选择；敌人数量与血量随波次成倍递增</div>
    `;
    s.appendChild(frame);

    // 递增预览
    const prev = document.createElement('div');
    prev.style.cssText = 'border:1px solid rgba(255,122,61,.3);border-radius:10px;padding:10px 12px;'
      + 'background:rgba(255,122,61,.07);width:100%;box-sizing:border-box;';
    const rows = [1, 5, 10, 15, 20].map((n) => {
      const gr = endlessGrowth(n);
      return `第 ${String(n).padStart(2, '0')} 波 · 数量 ×${gr.countMul.toFixed(2)} · 血量 ×${gr.hpMul.toFixed(2)}`
        + ` · 同屏 ${gr.spawnCap}${gr.boss ? ' · BOSS' : ''}`;
    }).join('<br>');
    prev.innerHTML = `
      <div style="font-size:13px;font-weight:800;letter-spacing:1px;color:#ffd166;">递增曲线</div>
      <div style="font-size:11px;line-height:1.7;margin-top:5px;opacity:.9;">${rows}</div>
      <div style="font-size:10.5px;opacity:.75;margin-top:5px;">数量线性 +25%/波 · 血量复利 ×1.16/波 · 每 5 波一个 Boss</div>
    `;
    frame.appendChild(prev);

    // 排行榜（比赛版：仅本地榜）
    const board = document.createElement('div');
    board.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid rgba(57,215,255,.25);'
      + 'border-radius:10px;padding:10px 12px;background:rgba(57,215,255,.06);';
    const list = (g.endlessBoard ? g.endlessBoard.board() : []).slice(0, 10);
    const listHtml = list.length
      ? list.map((e, i) => `<div style="display:flex;justify-content:space-between;font-size:11px;line-height:1.7;">
          <span>${i + 1}. 第 ${e.wave} 波</span>
          <span style="color:#ffd166;font-weight:700;">${e.score}</span>
        </div>`).join('')
      : '<div style="font-size:11px;opacity:.7;">暂无记录 —— 打一局就能上榜</div>';
    board.innerHTML = `
      <div style="font-size:13px;font-weight:800;letter-spacing:1px;">排行榜 · 本地</div>
      <div style="margin-top:6px;">${listHtml}</div>
      <div style="font-size:10px;opacity:.6;margin-top:6px;">比赛版：成绩保存在本机</div>
    `;
    frame.appendChild(board);

    const col = document.createElement('div');
    col.className = 'btn-col';
    frame.appendChild(col);
    this._btn(col, '开始无尽', `第 1 波起 · 共 ${ENDLESS.growth.bossEvery} 波一个 Boss`, () => {
      if (g.startEndless()) this.toast('无尽模式开始 · 活到最后一刻', 'warn');
    }, 'ad-btn-primary');
    this._btn(col, '返回', null, () => this.showMenu(), 'kenney-btn-ghost');
  }

  showDifficulty() {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const dm = g.difficulty;
    const s = this._screen();

    // 档位配色（纯 CSS 自绘，威胁递进：绿 → 蓝 → 橙 → 红 → 金）
    const TIER = (id) =>
      id >= 10 ? '#ffd166' :   // D10 SKYBREAKER
      id >= 8  ? '#ff3b5c' :   // D8–9
      id >= 6  ? '#ff7a3d' :   // D6–7
      id >= 3  ? '#39d7ff' :   // D3–5
                 '#4dffa6';    // D0–2

    // 全屏自绘布局：不使用 img/UI 素材（.screen-frame 的 Kenney 底图只给其它页用）
    const root = document.createElement('div');
    root.className = 'diff-screen';
    s.appendChild(root);
    root.innerHTML = `
      <div class="diff-head">
        <span class="dh-title">开始任务 · 难度选择</span>
        <span class="dh-sub">选择空袭强度后立即出击 · 每提升一档，敌人数量 / 编成 / 精英 / Boss 都会变化</span>
      </div>
      <div class="diff-body">
        <div class="diff-list"></div>
        <div class="diff-side"></div>
      </div>
    `;
    const listEl = root.querySelector('.diff-list');
    const sideEl = root.querySelector('.diff-side');

    const render = () => {
      /* ---------------- 左列：难度列表 ---------------- */
      listEl.innerHTML = '';
      for (const it of dm.list()) {
        const d = it.def;
        const card = document.createElement('button');
        card.className = 'diff-card' + (it.selected ? ' sel' : '') + (it.unlocked ? '' : ' locked');
        card.style.setProperty('--tier', TIER(it.id));
        const best = it.best;
        card.innerHTML = `
          <span class="dc-top">
            <span class="dc-badge">D${it.id}</span>
            <span class="dc-name">${d.name}</span>
            ${it.cleared ? `<span class="dc-check">✓ 通关${best ? ' · ' + best.score : ''}</span>` : ''}
          </span>
          <span class="dc-sub">${d.sub}</span>
          <span class="dc-stats">
            <span>HP <b>×${d.enemyHpMul.toFixed(2)}</b></span>
            <span>刷怪 <b>×${d.spawnRateMul.toFixed(2)}</b></span>
            <span>奖励 <b>×${d.rewardMul.toFixed(2)}</b></span>
            <span>精英 <b>${Math.round(d.eliteChance * 100)}%</b></span>
          </span>
          ${it.unlocked ? '' : `<span class="dc-lock">🔒 ${it.reqText}${it.req && it.req.need > 1 ? `（${Math.min(it.req.cur, it.req.need)}/${it.req.need}）` : ''}</span>`}
        `;
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!it.unlocked) { this.toast('还未解锁：' + it.reqText, 'warn'); return; }
          g.audio.click();
          dm.select(it.id);
          g.saveMeta();
          render();
        });
        // 比赛版：已移除「广告提前解锁」（难度只能靠通关推进）
        listEl.appendChild(card);
      }

      /* ---------------- 右列：详情 / 挑战 / 操作 ---------------- */
      sideEl.innerHTML = '';
      const cur = dm.def;
      const r = cur.rules;
      const ruleLines = [];
      if (r.eliteBoost) ruleLines.push('精英活跃');
      if (r.affix) ruleLines.push('敌人词缀');
      if (r.doubleFormation) ruleLines.push('双编队夹击');
      if (r.hardEvents) ruleLines.push('强化事件');
      if (r.eliteDoubleAffix) ruleLines.push('精英双词缀');
      if (r.bossCoreShield) ruleLines.push('Boss 核心护盾');
      if (r.eliteFormation) ruleLines.push('精英编队');
      if (r.skybreaker) ruleLines.push('破天形态');

      const detail = document.createElement('div');
      detail.className = 'diff-panel';
      detail.innerHTML = `
        <div class="dp-title">${cur.fullName}</div>
        <div class="dp-lines">
          敌方生命 <b>×${cur.enemyHpMul.toFixed(2)}</b> · 伤害 <b>×${cur.enemyDamageMul.toFixed(2)}</b> · 速度 <b>×${cur.enemySpeedMul.toFixed(2)}</b><br>
          刷怪 <b>×${cur.spawnRateMul.toFixed(2)}</b> · 同屏上限 <b>${cur.spawnCap}</b> · Boss 生命 <b>×${cur.bossHpMul.toFixed(2)}</b><br>
          钢材 / 蓝图 <b>×${cur.rewardMul.toFixed(2)}</b> · 经验 <b>×${cur.xpMul.toFixed(2)}</b> · 稀有卡 <b>${Math.round(cur.rareChance * 100)}%</b>
        </div>
        <div class="dp-rules">本档新增规则：${ruleLines.length ? ruleLines.join(' · ') : '无（基础空袭）'}</div>
      `;
      sideEl.appendChild(detail);

      // Phase 20 §38/§39：Challenge Modifier（主动加难度换奖励）
      const slots = challengeSlotsFor(cur);
      if (slots > 0) {
        const picked = g.meta.pendingChallenges || (g.meta.pendingChallenges = []);
        const box = document.createElement('div');
        box.className = 'diff-panel warn-panel';
        const grid = document.createElement('div');
        grid.className = 'diff-chal-grid';
        for (const cid of CHALLENGE_ORDER) {
          const c = CHALLENGES[cid];
          const on = picked.includes(cid);
          const cb = document.createElement('button');
          cb.className = 'diff-chal' + (on ? ' on' : '');
          cb.innerHTML = `
            <span class="dc-name2">${on ? '✓ ' : ''}${c.name} · ${c.sub}</span>
            <span class="dc-desc">${c.desc}</span>
            <span class="dc-reward">↳ ${c.rewardText}</span>
          `;
          cb.addEventListener('click', (e) => {
            e.stopPropagation(); g.audio.click();
            const i = picked.indexOf(cid);
            if (i >= 0) picked.splice(i, 1);
            else {
              if (picked.length >= slots) { this.toast(`本档最多选 ${slots} 项挑战`, 'warn'); return; }
              picked.push(cid);
            }
            g.saveMeta();
            render();
          });
          grid.appendChild(cb);
        }
        box.innerHTML = `
          <div class="dp-title gold">挑战加码 · 可选 ${slots} 项</div>
          <div class="dp-note">主动给自己加码，换取更高回报（开局生效）</div>
        `;
        box.appendChild(grid);
        sideEl.appendChild(box);
      }

      const actions = document.createElement('div');
      actions.className = 'diff-actions';
      const go = document.createElement('button');
      go.className = 'diff-btn go';
      go.innerHTML = `开始任务<small>${cur.label} · ${cur.sub}</small>`;
      go.addEventListener('click', (e) => {
        e.stopPropagation(); g.audio.click();
        dm.save(); g.saveMeta(); g.startRun();
      });
      const back = document.createElement('button');
      back.className = 'diff-btn ghost';
      back.textContent = '返回主菜单';
      back.addEventListener('click', (e) => {
        e.stopPropagation(); g.audio.click();
        this.showMenu();
      });
      actions.append(go, back);
      sideEl.appendChild(actions);
    };
    render();
  }

  /**
   * 离线收益弹窗（Phase 10）
   * 基础收益在进入游戏时已发放，这里只负责告知 + 提供广告翻倍。
   * @param {{seconds:number,effSeconds:number,capped:boolean,steel:number,granted?:number}} r
   */
  showOffline(r) {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const s = this._screen();

    const base = r.granted ?? r.steel;

    const frame = document.createElement('div');
    frame.className = 'screen-frame';
    frame.innerHTML = `
      <div class="frame-header">离线收益结算</div>
      <div class="title" style="font-size:30px;line-height:1.1">防线自动运转<small>你离开的这段时间</small></div>
      <div class="sub">离线时长 <b>${fmtDuration(r.effSeconds)}</b>${r.capped ? ` · 已达 ${CONFIG.OFFLINE.maxHours} 小时上限` : ''}</div>
      <div class="stat-line">钢材收益 <b id="offline-amount">+${base}</b></div>
    `;
    s.appendChild(frame);

    const col = document.createElement('div');
    col.className = 'btn-col';
    frame.appendChild(col);

    // 比赛版：已移除「广告 · 收益 ×2」按钮（基础离线收益进入游戏时已发放）

    this._btn(col, '收下', '返回主菜单', () => {
      g.dismissOffline();
      this.showMenu();
    }, 'ad-btn-primary');

    // Banner 已整体下线（AdManager.BANNER_ENABLED = false）
  }

/* ------------------------------------------------------------------ */

  /** 基地升级（Phase 9：永久成长，消耗钢材） */
  showBase() {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const s = this._screen();

    const frame = document.createElement('div');
    frame.className = 'screen-frame';
    frame.innerHTML = `
      <div class="frame-header">基地 · 永久强化</div>
      <div class="stat-line">可用钢材 <b id="base-steel">${g.meta.steel || 0}</b></div>
      <div class="meta-list" id="meta-list"></div>
    `;
    s.appendChild(frame);

    const steelEl = frame.querySelector('#base-steel');
    const listEl = frame.querySelector('#meta-list');

    const col = document.createElement('div');
    col.className = 'btn-col';
    frame.appendChild(col);

    // 渲染 5 行永久升级项
    const render = () => {
      listEl.innerHTML = '';
      for (const d of META_UPGRADES) {
        const lv = g.metaProg.levelOf(d.id);
        const maxed = g.metaProg.maxed(d.id);
        const cost = g.metaProg.cost(d.id);
        const afford = g.metaProg.canAfford(d.id, g.meta.steel || 0);

        const row = document.createElement('div');
        row.className = 'meta-row';

        const icon = document.createElement('div');
        icon.className = 'meta-icon';
        icon.textContent = d.icon;

        const info = document.createElement('div');
        info.className = 'meta-info';
        info.innerHTML = `<div class="meta-name">${d.name}<span class="meta-lv">Lv.${lv}/${d.maxLevel}</span></div><div class="meta-desc">${d.desc}</div>`;

        const buy = document.createElement('button');
        buy.className = 'meta-buy' + (maxed ? ' maxed' : '');
        buy.textContent = maxed ? '已满级' : `升级 ${cost}`;
        buy.disabled = !afford;
        buy.addEventListener('click', (e) => {
          e.stopPropagation();
          const r = g.buyMetaUpgrade(d.id);
          if (r.ok) {
            g.audio.reward();
            steelEl.textContent = g.meta.steel;
            render();
            this.toast(`${d.name} 提升至 Lv.${g.metaProg.levelOf(d.id)}`, 'good');
          } else {
            this.toast('钢材不足或已满级', 'warn');
          }
        });

        row.appendChild(icon);
        row.appendChild(info);
        row.appendChild(buy);
        listEl.appendChild(row);
      }
    };
    render();

    // 比赛版：基地不再提供军械库入口（蓝图买断入口随之收起）
    this._btn(col, '返回主菜单', null, () => this.game.toMenu(), 'kenney-btn-ghost');

    // Banner 已整体下线（AdManager.BANNER_ENABLED = false）
  }

  /* ------------------------------------------------------------------ */

  /**
   * Phase 16 §56：ARMORY 军械库
   * 展示 CORE / WEAPON / POWER 的解锁状态、使用次数，未解锁项可用 Blueprint 购买。
   */
  showArmory() {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;
    const lo = g.loadout;
    const s = this._screen();

    // 三段式布局：头部 / 可滚动内容区 / 固定底栏（尺寸由 _panel 实测，勿用 %/vw）
    const { head, body, foot } = this._panel(s, { width: 760 });

    const render = () => {
      body.innerHTML = '';
      head.innerHTML = `
        <div class="frame-header">军械库 · ARMORY</div>
        <div class="title" style="font-size:26px;line-height:1.1">构型收集<small>${g.bpSummary()} · 通关 / 挑战 / 发现 / 精通均可获得</small></div>
      `;
      for (const slot of LOADOUT_SLOTS) {
        const label = SLOT_LABEL[slot];
        const sec = document.createElement('div');
        sec.innerHTML = `<div style="font-size:12px;letter-spacing:1px;opacity:.75;margin:10px 0 6px;">${label}</div>`;
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
        for (const opt of lo.options(slot)) {
          const used = (g.meta.useCount && g.meta.useCount[`${slot}:${opt.id}`]) || 0;
          const card = document.createElement('div');
          if (opt.soon) card.dataset.soon = '1';
          const border = opt.soon ? 'rgba(255,255,255,.06)'
            : (opt.unlocked ? 'rgba(57,215,255,.35)' : 'rgba(255,255,255,.10)');
          card.style.cssText = 'border:1px solid ' + border + ';border-radius:8px;padding:8px 10px;'
            + 'background:rgba(255,255,255,.03);'
            + (opt.soon ? 'opacity:.4;' : (opt.unlocked ? '' : 'opacity:.7;'));
          card.innerHTML = `
            <div style="font-size:13px;font-weight:700;color:${opt.selected ? '#ffd166' : '#cfe9ff'};">${opt.def.short}${opt.selected ? ' ·装备中' : ''}</div>
            <div style="font-size:10px;opacity:.75;line-height:1.3;margin:3px 0;">${opt.def.desc}</div>
            <div style="font-size:10px;opacity:.6;">使用 ${used} 次</div>
          `;
          if (opt.soon) {
            // 待更新：不给解锁入口（蓝图/广告都不行），避免玩家白花资源
            const t = document.createElement('div');
            t.style.cssText = 'margin-top:6px;font-size:11px;color:#ffd166;';
            t.textContent = `🔧 ${opt.reqText}`;
            card.appendChild(t);
          } else if (!opt.unlocked) {
            const b = document.createElement('button');
            b.className = 'ad-btn kenney-btn-ad';
            b.style.cssText = 'margin-top:6px;padding:5px 8px;font-size:11px;';
            b.textContent = `🔓 ${opt.cost} 蓝图`;
            b.disabled = opt.cost <= 0 || (g.meta.blueprint || 0) < opt.cost;
            b.addEventListener('click', (e) => {
              e.stopPropagation(); g.audio.click();
              const r = g.unlockWithBlueprint(slot, opt.id);
              if (r.ok) { this.toast(`解锁 ${opt.def.short}`, 'good'); render(); }
              else this.toast(r.why || '无法解锁', 'warn');
            });
            card.appendChild(b);

            // 比赛版：已移除「广告解锁」（后期内容靠通关推进 + 蓝图买断）
          }
          grid.appendChild(card);
        }
        sec.appendChild(grid);
        body.appendChild(sec);
      }

      // ---- Phase 19 §48：武器收集树 + §50 武器精通 ----
      const wcSec = document.createElement('div');
      wcSec.innerHTML = '<div style="font-size:12px;letter-spacing:1px;opacity:.75;margin:12px 0 6px;">武器收集与精通</div>';
      const wcGrid = document.createElement('div');
      wcGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;';
      for (const w of WEAPON_COLLECTION) {
        const owned = g.weapons && g.weapons.all[w.id] ? g.weapons.has(w.id) : false;
        const mlv = g.masteryLevel ? g.masteryLevel(w.id) : 0;
        const label = MASTERY.labels[Math.min(15, Math.max(...Object.keys(MASTERY.labels).filter((k) => mlv >= Number(k)).map(Number), 0))];
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid ' + (owned ? 'rgba(57,215,255,.35)' : 'rgba(255,255,255,.10)')
          + ';border-radius:8px;padding:8px 10px;background:rgba(255,255,255,.03);';
        card.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:${owned ? '#cfe9ff' : '#9fb4c7'};">${owned ? '✓' : '???'} ${w.name}</div>
          <div style="font-size:10px;opacity:.7;margin:2px 0;">${w.desc}</div>
          <div style="font-size:10px;color:#ffd166;">精通 Lv${mlv}${label ? ' · ' + label : ''}</div>
          <div style="font-size:9px;opacity:.55;margin-top:2px;">精通只给图纸，不给属性（§51）</div>
        `;
        wcGrid.appendChild(card);
      }
      wcSec.appendChild(wcGrid);
      body.appendChild(wcSec);

      // 进化图鉴
      const evSec = document.createElement('div');
      evSec.innerHTML = '<div style="font-size:12px;letter-spacing:1px;opacity:.75;margin:12px 0 6px;">武器进化</div>';
      for (const ev of EVOLUTIONS) {
        const p = g.evolution ? g.evolution.progress(ev) : { weaponLevel: 0, moduleLevel: 0 };
        const d = document.createElement('div');
        d.style.cssText =
          'border:1px solid rgba(255,209,102,.25);border-radius:8px;padding:7px 10px;margin-bottom:6px;background:rgba(255,209,102,.05);';
        d.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:#ffd166;">${ev.name} · ${recipeText(ev)}</div>
          <div style="font-size:11px;opacity:.8;">${ev.desc}</div>
        `;
        evSec.appendChild(d);
      }
      body.appendChild(evSec);

      // ---- Phase 18 §52：BUILDS 图鉴（不显示最优答案，鼓励研究）----
      const bdSec = document.createElement('div');
      const bdScore = g.build ? g.build.score() : 0;
      bdSec.innerHTML = '<div style="font-size:12px;letter-spacing:1px;opacity:.75;margin:12px 0 6px;">'
        + `BUILDS · 流派图鉴 <span style="color:#ffd166;">（最高完成度 ${Math.round((g.build ? g.build.bestProgress : 0) * 100)}%）</span></div>`;
      for (const a of [...ARCHETYPES, ...CROSS_BUILDS]) {
        const disc = g.build ? g.build.isDiscovered(a.id) : false;
        const rec = disc && g.build.meta.discovered[a.id];
        const d = document.createElement('div');
        d.style.cssText = 'border:1px solid rgba(77,255,166,.22);border-radius:8px;padding:7px 10px;margin-bottom:6px;background:rgba(77,255,166,.04);';
        const req = Object.keys(a.req).map((t) => `${TAG_NAMES[t] || t} ${a.req[t]}`).join(' + ');
        d.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:${disc ? '#4dffa6' : '#9fb4c7'};">${disc ? '✓ ' : '??? '}${a.name}${a.sub ? ' · ' + a.sub : ''}</div>
          <div style="font-size:11px;opacity:.78;">${disc ? a.desc : '需要 Tag：' + req}</div>
          ${disc && rec ? `<div style="font-size:10px;opacity:.6;">通关 ${rec.clears} 次 · 最高 D${rec.bestD} · 最高 WAVE ${rec.bestWave}</div>` : ''}
          ${a.evolution ? `<div style="font-size:10px;color:#ffd166;opacity:.85;">Evolution：${a.evolution}</div>` : ''}
          ${disc && a.strong ? `<div style="font-size:10px;opacity:.7;">优势 ${a.strong} · 短板 ${a.weak}</div>` : ''}
        `;
        bdSec.appendChild(d);
      }
      body.appendChild(bdSec);

      foot.innerHTML = '';
      this._btn(foot, '出击构型', null, () => this.showLoadout(), 'ad-btn-primary');
      this._btn(foot, '返回基地', null, () => this.game.toBase(), 'kenney-btn-ghost');
    };
    render();
  }

  /* ------------------------------------------------------------------ */

  /**
   * 补给商店（Phase G · GDD §17.5）：波次 rest 期间打开。
   * 四槽商品 · 购买 / 刷新（递增费用）/ 锁定槽位。
   */
  showShop(waveN) {
    const g = this.game;
    this.clear();
    const s = this._screen();
    const shop = g.shop;
    const snap = shop.snapshot();

    const { head, body, foot } = this._panel(s, {
      width: 760,
      headHtml: `
        <div class="frame-header">补给商店${waveN ? ` · 第 ${waveN} 波间隙` : ''}</div>
        <div class="sub" style="font-size:12px;">
          Credits <b style="color:#ffcf6b;font-size:16px;">${snap.credits}</b>
          <span style="opacity:.7;">（击杀 +1 · 精英 +8 · Boss +60 · 清波 +12）</span>
        </div>
      `,
    });

    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;';
    body.appendChild(grid);

    const rerender = () => this.showShop(waveN);

    snap.slots.forEach((slot, i) => {
      const good = slot.good;
      const card = document.createElement('div');
      card.style.cssText = `width:160px;padding:10px;border:1px solid rgba(255,255,255,.15);border-radius:8px;` +
        `background:rgba(255,255,255,.05);position:relative;` +
        (slot.locked ? 'outline:2px solid #ffcf6b;' : '');
      if (!good) {
        card.innerHTML = `
          <div style="font-size:26px;text-align:center;opacity:.35;">▢</div>
          <div style="font-size:12px;text-align:center;opacity:.6;margin-top:6px;">已售罄</div>`;
      } else {
        const chk = shop.canBuy(i);
        card.innerHTML = `
          <div style="font-size:26px;text-align:center;">${good.icon}</div>
          <div style="font-size:13px;font-weight:800;text-align:center;margin-top:4px;">${good.name}</div>
          <div style="font-size:11px;opacity:.75;margin-top:4px;min-height:30px;">${good.desc}</div>
          <div style="font-size:12px;text-align:center;color:#ffcf6b;font-weight:800;">${good.price} Credits</div>`;
        const buyBtn = document.createElement('button');
        buyBtn.className = 'ad-btn ' + (chk.ok ? 'ad-btn-primary' : 'kenney-btn-ghost');
        buyBtn.style.cssText = 'width:100%;margin-top:8px;font-size:12px;padding:8px 0;';
        buyBtn.textContent = chk.ok ? '购买' : (chk.reason || '不可购买');
        buyBtn.disabled = !chk.ok;
        buyBtn.onclick = () => {
          const r = shop.buy(i);
          if (r.ok) { g.audio.reward && g.audio.reward(); g.screens.toast(`${good.name} · ${r.done}`, 'good'); }
          else g.screens.toast(chk.reason || '无法购买', 'warn');
          rerender();
        };
        const lockBtn = document.createElement('button');
        lockBtn.className = 'kenney-btn-ghost';
        lockBtn.style.cssText = 'width:100%;margin-top:6px;font-size:11px;padding:5px 0;';
        lockBtn.textContent = slot.locked ? '🔒 已锁定（点击解锁）' : '🔒 锁定该槽位';
        lockBtn.onclick = () => { shop.toggleLock(i); rerender(); };
        card.appendChild(buyBtn);
        card.appendChild(lockBtn);
      }
      grid.appendChild(card);
    });

    foot.innerHTML = '';
    const refreshBtn = this._btn(foot,
      `↻ 刷新商品（${snap.refreshCost} Credits）`, null, () => {}, 'kenney-btn-ghost');
    refreshBtn.disabled = snap.credits < snap.refreshCost;
    refreshBtn.onclick = (e) => {
      e.stopPropagation();
      if (shop.credits < shop.refreshCost) return;
      g.run.credits = shop.credits - shop.refreshCost;
      shop.roll();
      g.audio.ui && g.audio.ui();
      rerender();
    };
    this._btn(foot, '开始下一波 ▶', null, () => g._closeShop(), 'ad-btn-primary');
  }

  /* ------------------------------------------------------------------ */

  /** 暂停 */
  showPause() {
    this.clear();
    const s = this._screen();
    const frame = document.createElement('div');
    frame.className = 'screen-frame';
    frame.innerHTML = `<div class="frame-header">已暂停</div>`;
    s.appendChild(frame);
    const col = document.createElement('div');
    col.className = 'btn-col';
    frame.appendChild(col);
    this._btn(col, '继续', null, () => this.game.togglePause(), 'ad-btn-primary');
    this._btn(col, '构筑总览', null, () => this.showBuildPanel(), 'kenney-btn-ghost');
    this._btn(col, '放弃任务', null, () => this.game.toMenu(), 'kenney-btn-ghost');
  }

  /* ------------------------------------------------------------------ */

  /**
   * 构筑总览（Phase F · GDD §14.3）：
   * 武器研发/部署/改装、协同进度、流派里程碑、关键统计，一屏看完本局 Build。
   */
  showBuildPanel() {
    const g = this.game;
    const s = this._screen();
    const { head, body, foot } = this._panel(s, {
      width: 760,
      headHtml: `
        <div class="frame-header">构筑总览</div>
        <div class="sub" style="font-size:12px;">研发等级在部署后继承 · 改装在获得武器后生效</div>
      `,
    });

    const secTitle = (t) =>
      `<div style="font-size:13px;font-weight:800;letter-spacing:2px;color:#ffcf6b;margin:10px 0 6px;">${t}</div>`;

    /* ---------- 1. 武器：研发 / 部署 / 改装 ---------- */
    let wHtml = secTitle('武器 · 研发与部署');
    const prog = (g.weapons && g.weapons.progression) ? g.weapons.progression : null;
    for (const id of ACQUIRABLE_WEAPONS) {
      const def = WEAPONS[id];
      if (!def) continue;
      const p = prog ? prog.progress[id] : null;
      const lv = p ? p.level : 1;
      const owned = !!(p && p.owned);
      const unlocked = !!(p && p.unlocked);
      const mods = (prog && prog.modsOf(id))
        .map((m) => (WEAPON_MODS[m] ? WEAPON_MODS[m].name : m)).join(' · ');
      const state = owned
        ? '<span style="color:#8be26b;">● 已部署</span>'
        : (unlocked ? '<span style="color:#ffcf6b;">○ 已解锁 · 未部署</span>'
                    : '<span style="color:#888;">✕ 未解锁</span>');
      wHtml += `
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);">
          <div style="font-size:13px;font-weight:700;">${def.name}
            <span style="font-size:11px;opacity:.75;margin-left:6px;">Lv${lv}/6</span></div>
          <div style="font-size:11px;">${state}${mods ? `<span style="opacity:.85;margin-left:8px;">⚙ ${mods}</span>` : ''}</div>
        </div>`;
    }
    body.innerHTML = wHtml;

    /* ---------- 2. 协同 ---------- */
    let sHtml = secTitle('协同（点亮 / 全部）');
    const lit = new Set(g.synergy ? g.synergy.list().map((x) => x.id) : []);
    for (const sy of SYNERGIES) {
      const on = lit.has(sy.id);
      sHtml += `
        <div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);">
          <span style="font-size:12px;font-weight:700;color:${on ? '#8be26b' : '#777'};">${on ? '✔' : '·'} ${sy.icon || ''} ${sy.name}</span>
          <span style="font-size:10px;opacity:.7;margin-left:8px;">${sy.desc}</span>
        </div>`;
    }
    body.insertAdjacentHTML('beforeend', sHtml);

    /* ---------- 3. 流派进度 ---------- */
    let aHtml = secTitle('流派进度');
    const b = g.build;
    if (b) {
      for (const a of [...ARCHETYPES, ...CROSS_BUILDS]) {
        const pr = b.progressOf(a.id);
        const pct = Math.round(pr * 100);
        aHtml += `
          <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.08);">
            <span style="font-size:12px;">${a.name}</span>
            <span style="font-size:11px;opacity:.8;">${pct}%${b.bestId === a.id ? ' <span style="color:#ffcf6b;">★ 主流派</span>' : ''}</span>
          </div>`;
      }
      const distinct = Object.keys(b.tags).filter((t) => b.tags[t] > 0).length;
      aHtml += `<div style="font-size:11px;opacity:.75;margin-top:8px;">Tag 种类 ${distinct} · BuildScore ${b.score()}/100</div>`;
    } else {
      aHtml += '<div style="font-size:11px;opacity:.7;">非战斗状态</div>';
    }
    body.insertAdjacentHTML('beforeend', aHtml);

    /* ---------- 4. 关键统计 ---------- */
    const run = g.run || {};
    const stats = g.stats || {};
    let kHtml = secTitle('本局统计');
    kHtml += `
      <div style="font-size:12px;opacity:.85;">
        等级 Lv${g.level ? g.level.level : 1} · 击杀 ${run.kills || 0} · 升级选择 ${(stats.totalTaken && stats.totalTaken()) || 0} 次
        · 碎料 ${run.scrap || 0} · 废弃 ${(g.upgradeMgr && g.upgradeMgr.banished.size) || 0} 张
      </div>`;
    body.insertAdjacentHTML('beforeend', kHtml);

    foot.innerHTML = '';
    this._btn(foot, '返回暂停', null, () => this.showPause(), 'ad-btn-primary');
  }

  /* ------------------------------------------------------------------ */

  /**
   * 结算：广告点 ② REVIVE / ③ RESULT_DOUBLE
   */
  showResult(win) {
    this.clear();
    this.showPauseButton(false);
    const g = this.game;

    // Phase 17：难度结算（幂等，胜利时 WaveManager.onDone 已经跑过）
    g._settleRun(win);

    // Phase 9：先把本局钢材入库（幂等；RESULT_DOUBLE 广告会再次调用补差额）
    g.bankRun();

    const s = this._screen();

    const frame = document.createElement('div');
    frame.className = 'screen-frame';
    // 无尽模式：展示波次 / 新纪录 / 榜单排名
    const endlessInfo = g.run.endless ? (g.lastSettleInfo || {}) : null;
    const endlessBanner = endlessInfo ? `
      <div style="font-size:12px;color:#ffd166;letter-spacing:1px;text-align:center;line-height:1.6;">
        无尽模式 · 抵达第 <b>${endlessInfo.wave || 0}</b> 波
        ${endlessInfo.newRecord ? '<br><b style="color:#4dffa6;">★ 新纪录</b>' : ''}
        ${endlessInfo.rank ? `<br>榜单第 ${endlessInfo.rank} 名` : ''}
      </div>` : '';
    frame.innerHTML = `
      <div class="frame-header ${win ? 'ok' : 'danger'}">${endlessInfo ? '无尽模式结束' : (win ? '任务完成' : '防线失守')}</div>
      ${endlessBanner}
      <div class="result-grid">
        ${endlessInfo ? `<span>抵达波次</span><span>${endlessInfo.wave || 0}</span>` : ''}
        <span>击落敌机</span><span>${g.run.kills}</span>
        <span>本局得分</span><span id="res-score">${g.run.score}</span>
        <span>获得钢材</span><span id="res-steel">${g.run.steel}</span>
        <span>存活时间</span><span>${g.run.time.toFixed(1)}s</span>
        <span>最终等级</span><span>${g.level.level}</span>
      </div>
      <div class="stat-line">仓库钢材 <b id="res-total">${g.meta.steel || 0}</b></div>
    `;
    s.appendChild(frame);

    const col = document.createElement('div');
    col.className = 'btn-col';
    frame.appendChild(col);

    // 比赛版：已移除「广告 · 原地复活」与「广告 · 双倍奖励」按钮

    this._btn(col, win ? '再来一次' : '重新部署', null, () => {
      g.startRun();
    }, 'ad-btn-primary');

    this._btn(col, '返回主菜单', null, () => {
      g.toMenu();
    }, 'kenney-btn-ghost');

    // 保存最高分
    if (g.run.score > (g.meta.bestScore || 0)) {
      g.meta.bestScore = g.run.score;
      g.saveMeta();
    }
  }

  /* ------------------------------------------------------------------ */

  toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    this._toastBox.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 320);
    }, 1800);
  }
}

export default Screens;
