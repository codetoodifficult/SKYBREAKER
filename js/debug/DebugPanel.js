import { CONFIG } from '../data/config.js';

/** 开发用调试面板（F1 切换）。上线时把 CONFIG.DEBUG 设为 false 即可整体关闭。 */
export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('debug-panel');
    this.visible = false;
    this._acc = 0;

    if (!this.el) return;
    this.el.innerHTML = `
      <h4>DEBUG · F1</h4>
      <div id="dbg-stats"></div>
      <div class="dbg-btns">
        <button data-act="spawn">刷 5 架</button>
        <button data-act="killall">Kill All</button>
        <button data-act="god">God Mode</button>
        <button data-act="heal">回满血</button>
        <button data-act="score">+1000 分</button>
        <button data-act="dmg">基地 -20</button>
      </div>
    `;
    this.statsEl = this.el.querySelector('#dbg-stats');
    this.el.addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      this._action(act);
      e.stopPropagation();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') { e.preventDefault(); this.toggle(); }
    });
  }

  toggle() {
    if (!this.el || !CONFIG.DEBUG) return;
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  _action(act) {
    const g = this.game;
    switch (act) {
      case 'spawn': for (let i = 0; i < 5; i++) g.enemies.spawn('fighter'); break;
      case 'killall': g.enemies.killAll(g.world); break;
      case 'god': g.godMode = !g.godMode; g.screens.toast('God Mode: ' + (g.godMode ? 'ON' : 'OFF')); break;
      case 'heal': g.base.hp = g.base.maxHp; break;
      case 'score': g.run.score += 1000; break;
      case 'dmg': g.damageBase(20); break;
    }
  }

  update(dt) {
    if (!this.visible || !this.statsEl) return;
    this._acc += dt;
    if (this._acc < 0.2) return;
    this._acc = 0;

    const g = this.game;
    const b = g.bullets.stats(), p = g.particles.stats();
    const rows = [
      ['FPS', g.loop ? g.loop.fps : '-'],
      ['State', g.state],
      ['Enemy', g.enemies.count],
      ['Bullet', `${b.active}/${b.created}`],
      ['Particle', `${p.active}/${p.created}`],
      ['Score', g.run.score],
      ['Kills', g.run.kills],
      ['BaseHP', `${Math.ceil(g.base.hp)}/${g.base.maxHp}`],
      ['Heat', Math.round(g.weapons.primary.heat)],
      ['Mode', '比赛版 · 本地单机'],
    ];
    this.statsEl.innerHTML = rows
      .map(r => `<div class="dbg-row"><span>${r[0]}</span><span>${r[1]}</span></div>`)
      .join('');
  }
}

export default DebugPanel;
