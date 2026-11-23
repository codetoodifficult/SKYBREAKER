import { CATEGORY_COLOR, CATEGORY_NAME } from '../data/upgrades.js';

/**
 * 三选一升级 UI（DOM + Kenney UI Pack 背景）
 * 核心交互（比赛版已移除广告刷新）：
 *   - 选卡 → onPick(upgrade)
 *   - 换一组（免费 2 次）→ onReroll()
 *   - 换一组（消耗废料）→ onRerollScrap()
 *   - 跳过：未提供 —— Prompt 规定"必须选择"
 */
const CARD_W = 200, CARD_H = 320;

const ICON = {
  damage:'⚔', fireRate:'⫸', bulletSpd:'➤', crit:'✦', critDmg:'✧', penetr:'➥', multishot:'⫶⫶',
  heatCap:'♨', coolRate:'❄',
  maxAmmo:'▤', reload:'↻',
  radar:'◎', pickup:'✜', lockSpd:'⌖', targeting:'⨁',
  // Phase 13：武器
  flakCannon:'✦', missile:'➤', railCannon:'⌁', pulseLaser:'≋', machineGun:'≡',
  baseHP:'❤', shield:'◈', repair:'✚', armor:'▣',
  xpGain:'✯',
  missileDmg:'➤✸', missileCnt:'✸⫶', missileCD:'⏱', missileSpd:'➶',
};

export class UpgradeUI {
  constructor() {
    this.root = null;
  }

  /**
   * @param {object} args
   * @param {Array}  args.choices           3 个升级
   * @param {number} args.freeLeft          剩余免费次数
   * @param {number} args.freeCap
   * @param {Function} args.onPick(upgrade)
   * @param {Function} args.onReroll()      免费
   * @param {import('../audio/AudioManager.js').AudioManager} args.audio
   */
  show({ choices, freeLeft, freeCap, onPick, onReroll, audio,
         scrap = 0, rerollCost = 0, rerollLeft = 0, banishLeft = 0,
         onRerollScrap, onBanish, stackOf = null }) {
    this.hide();
    this._choices = choices;
    this._onPick = onPick;
    this._onReroll = onReroll;
    this._onRerollScrap = onRerollScrap;
    this._onBanish = onBanish;
    this._banishMode = false;
    const scrapTxt = `废料 <b style="color:var(--neon)">${scrap}</b>`;
    const rerollLbl = freeLeft > 0
      ? `↻ 换一组（免费 ${freeLeft}/${freeCap}）`
      : (rerollLeft > 0 ? `↻ 换一组（${rerollCost} 废料 · 剩 ${rerollLeft}）` : '↻ 换一组（废料不足）');
    const canScrapReroll = freeLeft <= 0 && rerollLeft > 0 && scrap >= rerollCost;

    const overlay = document.createElement('div');
    overlay.className = 'screen';
    overlay.id = 'upgrade-screen';
    overlay.style.background = 'rgba(3, 6, 12, .86)';

    overlay.innerHTML = `
      <div class="title" style="font-size:38px">升级 · 三选一</div>
      <div class="sub">选择一项强化 · 重选 <b style="color:var(--neon)">${freeLeft}</b>/${freeCap} · ${scrapTxt} · 排除 <b style="color:var(--neon)">${banishLeft}</b></div>
      <div id="upgrade-cards" style="display:flex;gap:28px;justify-content:center;"></div>
      <div style="display:flex;gap:12px;margin-top:4px;">
        <button class="ad-btn ${freeLeft>0?'kenney-btn-ghost':'kenney-btn-ad'}" id="up-reroll">${rerollLbl}</button>
        <button class="ad-btn kenney-btn-red" id="up-banish" ` + (banishLeft > 0 ? '' : 'disabled') + `>✕ 排除（${banishLeft}）</button>
      </div>
      <div id="up-hint" style="font-size:12px;opacity:.7;height:16px;"></div>
    `;
    const cardsEl = overlay.querySelector('#upgrade-cards');

    choices.forEach((u, i) => {
      const color = CATEGORY_COLOR[u.cat] || 'Blue';
      // Phase B：研发卡（未部署）加醒目标记，避免玩家误以为已经生效
      const researchBadge = u.researching
        ? '<div class="uc-research" style="font-size:11px;color:#ffcf6b;font-weight:800;letter-spacing:1px;margin-bottom:4px;">⚗ 研发中 · 尚未部署</div>'
        : '';
      // Phase C：显示当前层数 / 上限（GDD §14.1）
      let stackText = '';
      if (stackOf && !u.kind && u.maxStacks != null) {
        const cur = stackOf(u.id) || 0;
        stackText = `<span style="font-size:11px;opacity:.85;">层数 ${cur}/${u.maxStacks}</span>`;
      } else if (stackOf && !u.kind && stackOf(u.id) > 0) {
        stackText = `<span style="font-size:11px;opacity:.85;">已选 ${stackOf(u.id)} 次</span>`;
      }
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="uc-header" style="background-image:url('img/UI/${color}/Double/button_square_header_large_rectangle.png');">
          <div class="uc-cat">${CATEGORY_NAME[u.cat] || ''}</div>
          <div class="uc-name">${u.name}</div>
        </div>
        <div class="uc-body">
          <div class="uc-icon">${ICON[u.id] || ICON[u.weaponId] || (u.kind === 'weaponMod' ? '⚙' : '◆')}</div>
          ${researchBadge}
          <div class="uc-desc">${u.desc}</div>
          <div class="uc-stack" id="uc-stack-${i}">${stackText}</div>
        </div>
      `;
      card.addEventListener('click', (e) => {
        e.stopPropagation(); audio && audio.click();
        if (this._banishMode && this._onBanish) { this._onBanish(choices[i]); return; }
        this._pick(i);
      });
      cardsEl.appendChild(card);
    });

    overlay.querySelector('#up-reroll').addEventListener('click', (e) => {
      e.stopPropagation(); audio && audio.click();
      if (freeLeft > 0) { this._onReroll && this._onReroll(); return; }
      if (canScrapReroll) { this._onRerollScrap && this._onRerollScrap(); return; }
      if (this._hint) this._hint('废料不足（需要 ' + rerollCost + '）');
    });

    const hintEl = overlay.querySelector('#up-hint');
    this._hint = (t) => { if (hintEl) hintEl.textContent = t; };
    const banishBtn = overlay.querySelector('#up-banish');
    if (banishBtn) {
      banishBtn.addEventListener('click', (e) => {
        e.stopPropagation(); audio && audio.click();
        this._banishMode = !this._banishMode;
        banishBtn.textContent = this._banishMode ? '点击一张卡以排除' : `✕ 排除（${banishLeft}）`;
        this._hint(this._banishMode ? '选择要永久移除的升级（本局不再出现）' : '');
      });
    }

    document.getElementById('ui-layer').appendChild(overlay);
    this.root = overlay;
  }

  _pick(i) {
    const choices = this._choices || [];
    if (this._onPick) this._onPick(choices[i]);
    this.hide();
  }

  /** 重新渲染 3 张卡（reroll 后） */
  rerender(a) { this.show(a); }

  hide() {
    if (this.root) { this.root.remove(); this.root = null; }
  }
}

export default UpgradeUI;
