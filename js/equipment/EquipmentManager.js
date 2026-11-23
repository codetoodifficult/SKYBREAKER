import { TACTICAL_EQUIPMENT, PASSIVE_EQUIPMENT, EQUIP_LEVELS } from '../data/equipment.js';
import { computeEffFrom, levelOf } from '../weapons/WeaponLevel.js';
import { SLOT_CAP } from '../weapons/WeaponSlot.js';
import { rand } from '../core/utils.js';

/**
 * EquipmentManager —— 战术槽（C）与被动槽（D）（Phase 14，设计文档 §12）
 *
 * Tactical（最多 2）：按冷却自动施放。本作只有"按住开火"一个操作，
 *   再塞主动按键会破坏移动端手感，所以战术技能做成"冷却到了就自动打"，
 *   但每次都有明确的横幅 / 音效 / 视觉反馈，绝不静默生效。
 * Passive（最多 6）：每次获得或升级都往 PlayerStats 叠加一层增量（不替换、不覆盖）。
 */
export class EquipmentManager {
  constructor(game) {
    this.game = game;
    this.tactical = new Map();   // id -> { def, level, eff, cd }
    this.passive = new Map();    // id -> { def, level }
    this.pendingStrikes = [];    // 空袭预约队列 { x, y, t, damage, radius }
    this.empRings = [];          // EMP 视觉环
    this.reset();
  }

  reset() {
    this.tactical.clear();
    this.passive.clear();
    this.pendingStrikes.length = 0;
    this.empRings.length = 0;
  }

  /* ---------------- 槽位 ---------------- */

  has(id) { return this.tactical.has(id) || this.passive.has(id); }
  get(id) { return this.tactical.get(id) || this.passive.get(id) || null; }
  get tacticalCount() { return this.tactical.size; }
  get passiveCount() { return this.passive.size; }

  /** 获得一件装备；槽位满 / 已拥有 → null */
  acquire(id) {
    if (this.has(id)) return null;
    if (TACTICAL_EQUIPMENT[id]) {
      if (this.tactical.size >= SLOT_CAP.tactical) return null;
      const def = TACTICAL_EQUIPMENT[id];
      const item = { def, id, name: def.name, slot: 'tactical', level: 1, maxLevel: def.maxLevel, acquired: true, cd: def.cooldown * 0.55 };
      item.eff = computeEffFrom(EQUIP_LEVELS, def, 1);
      this.tactical.set(id, item);
      return item;
    }
    if (PASSIVE_EQUIPMENT[id]) {
      if (this.passive.size >= SLOT_CAP.passive) return null;
      const def = PASSIVE_EQUIPMENT[id];
      const item = { def, id, name: def.name, slot: 'passive', level: 1, maxLevel: def.maxLevel, acquired: true };
      this.passive.set(id, item);
      this._applyPassiveLevel(def, 1);
      return item;
    }
    return null;
  }

  /** 升一级 */
  upgrade(id) {
    const item = this.get(id);
    if (!item || item.level >= item.maxLevel) return false;
    item.level += 1;
    if (item.slot === 'tactical') item.eff = computeEffFrom(EQUIP_LEVELS, item.def, item.level);
    else this._applyPassiveLevel(item.def, 1);
    return true;
  }

  /** 被动每级往 stats 叠加一层增量 */
  _applyPassiveLevel(def, times = 1) {
    const g = this.game;
    if (!g || !g.stats) return;
    for (let i = 0; i < times; i++) g.stats.apply(def.perLevel || {});
  }

  list() { return [...this.tactical.values(), ...this.passive.values()]; }

  /** 下一级描述（用于卡片） */
  nextLevelDesc(id) {
    const item = this.get(id);
    if (!item) return levelOf(id, 2).short || '';
    const t = EQUIP_LEVELS[id];
    if (!t) return (item.def.perLevel ? '属性提升' : '');
    const d = t[Math.min(t.length - 1, item.level)];   // item.level 即下一级的索引
    return (d && d.short) || '属性提升';
  }

  /* ---------------- 每帧 ---------------- */

  update(dt, world) {
    // 空袭预约
    for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
      const s = this.pendingStrikes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this._detonate(s, world);
      this.pendingStrikes.splice(i, 1);
    }
    // EMP 视觉环
    for (let i = this.empRings.length - 1; i >= 0; i--) {
      this.empRings[i].t -= dt;
      if (this.empRings[i].t <= 0) this.empRings.splice(i, 1);
    }

    // 战术冷却（构型：电容核心 skillCdMul <1 = 充能更快）
    const cdRate = 1 / (this.game && this.game.stats ? (this.game.stats.base.skillCdMul || 1) : 1);
    for (const item of this.tactical.values()) {
      item.cd -= dt * cdRate;
      if (item.cd > 0) continue;
      const e = item.eff;
      if (item.id === 'empBurst') this._castEmp(item, world);
      else if (item.id === 'airstrike') this._castAirstrike(item, world);
      else if (item.id === 'emergencyShield') this._castShield(item, world);
      item.cd = Math.max(1, e.cooldown);
    }
  }

  /* ---------------- 三个战术技能 ---------------- */

  _castEmp(item, world) {
    const g = this.game;
    const e = item.eff;
    const cx = g.gun.x, cy = g.gun.y - 20;
    let hit = 0;
    for (const en of world.enemies.list) {
      if (!en.alive) continue;
      const d = Math.hypot(en.x - cx, en.y - cy);
      if (d > e.radius) continue;
      // 构型：电容核心 EMP / 特殊武器伤害 +15%
      const empMul = g.stats ? (g.stats.base.empDamageMul || 1) : 1;
      en.takeDamage(Math.round(e.damage * empMul), world);
      en.frozen = Math.max(en.frozen || 0, e.freeze);   // 瘫痪由 EnemyManager 消费
      hit++;
    }
    if (!hit) { item.cd = 1.5; return; }                // 没有目标不浪费，1.5s 后再试
    this.empRings.push({ x: cx, y: cy, r: e.radius, t: 0.45, max: 0.45 });
    world.shake.shake(8, 180);
    world.audio.explosion(1.1);
    g.screens.toast(`EMP 脉冲 · 瘫痪 ${hit} 架`, 'good');
  }

  _castAirstrike(item, world) {
    const g = this.game;
    const e = item.eff;
    const list = world.enemies.list.filter((x) => x.alive);
    if (!list.length) { item.cd = 1.5; return; }
    // 每波挑一个"附近敌机最多"的点
    for (let k = 0; k < e.strikes; k++) {
      const seed = list[Math.floor(Math.random() * list.length)];
      let bx = seed.x, by = seed.y;
      let best = -1;
      for (const en of list) {
        let n = 0;
        for (const o of list) if (Math.hypot(o.x - en.x, o.y - en.y) < e.radius) n++;
        if (n > best) { best = n; bx = en.x; by = en.y; }
      }
      this.pendingStrikes.push({ x: bx + rand(-30, 30), y: by + rand(-30, 30), t: 0.5 + k * e.gap, damage: e.damage, radius: e.radius });
    }
    g.screens.toast(`空袭呼叫 · ${e.strikes} 波`, 'warn');
    world.audio.alarm();
  }

  _detonate(s, world) {
    const g = this.game;
    if (g.areaDamage) g.areaDamage(s.x, s.y, s.radius, Math.round(s.damage));
    world.shake.shake(6, 140);
  }

  _castShield(item, world) {
    const g = this.game;
    const e = item.eff;
    const cap = e.shieldCap;
    if (g.run.shield >= cap) { item.cd = 2.0; return; }
    g.run.shield = Math.min(cap, g.run.shield + (item.def.shield || 1));
    if (e.healPct > 0) {
      g.base.hp = Math.min(g.base.maxHp, g.base.hp + g.base.maxHp * e.healPct);
    }
    g.screens.toast(`应急护盾 · 护盾 ${g.run.shield}/${cap}`, 'good');
    if (world.audio.reward) world.audio.reward();
  }

  /* ---------------- 渲染 ---------------- */

  render(ctx) {
    // EMP 环
    if (this.empRings.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const r of this.empRings) {
        const k = 1 - r.t / r.max;
        ctx.strokeStyle = `rgba(120,230,255,${0.8 * (1 - k)})`;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 空袭预警圈
    if (this.pendingStrikes.length) {
      ctx.save();
      for (const s of this.pendingStrikes) {
        const a = 0.25 + 0.35 * Math.abs(Math.sin(s.t * 12));
        ctx.strokeStyle = `rgba(255,120,80,${a})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

export default EquipmentManager;
