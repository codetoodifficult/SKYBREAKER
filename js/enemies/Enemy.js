import { CONFIG } from '../data/config.js';
import { clamp } from '../core/utils.js';
import { EnemyAffix } from './EnemyAffix.js';

let _uid = 1;

/**
 * 敌人基类
 * 所有敌人共用：hp / 移动 / 受伤 / 死亡表现
 * 子类实现 update() 与 draw()
 */
export class Enemy {
  constructor() {
    this.id = 0;
    this.type = 'enemy';
    this.cfg = null;

    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.angle = 0;

    this.hp = 1; this.maxHp = 1;
    this.radius = 12;
    this.alive = false;

    this.hitFlash = 0;
    this.smokeT = 0;
    this.age = 0;
    this.isBoss = false;
    this.frozen = 0;       // Phase 14：EMP 瘫痪剩余秒数

    // Phase 17：词缀运行时（EnemyAffix.attach 填充）
    this.affixes = null;
    this.affixShield = 0;
    this.affixDodgeLeft = 0;
    this.affixBerserkOn = false;
    this.affixPendingEscort = null;
    this.affixSpeedBuff = 1;
  }

  /** 从对象池取出时的初始化（替代 constructor 传参） */
  init(cfg, x, y) {
    this.id = _uid++;
    this.type = cfg.id;
    this.cfg = cfg;

    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = 0;

    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.radius = cfg.radius;
    this.alive = true;
    this.isElite = !!cfg.isElite;   // Phase G：商店 Credits 精英收益标记

    this.hitFlash = 0;
    this.smokeT = 0;
    this.age = 0;
    this.frozen = 0;

    // Phase 17：每次从池里取出都要清干净，避免上一只的词缀残留
    this.affixes = null;
    this.affixShield = 0;
    this.affixDodgeLeft = 0;
    this.affixBerserkOn = false;
    this.affixPendingEscort = null;
    this.affixSpeedBuff = 1;
    // Phase E：对象池复用时清空状态容器，杜绝跨敌人残留 / 无限 Timer
    this._status = null;
    this._burn = null;
    this._burnAcc = 0;
    return this;
  }

  /**
   * @param {number} dmg
   * @param {object} world
   * @param {object} [source] Phase E：伤害来源 {kind,status,weaponId,source}（可选，兼容旧调用）
   * @returns {boolean} 是否被这一击击杀
   */
  takeDamage(dmg, world, source = null) {
    if (!this.alive) return false;

    // Phase E：状态易伤（腐蚀 / 标记）—— 在词缀改伤之后、扣血之前统一结算
    if (world && world.statusEffects) {
      dmg *= world.statusEffects.damageMul(this);
    }

    // Phase 17：词缀改伤（护盾吸收 / 老练闪避）
    if (this.affixes && this.affixes.length) {
      const r = EnemyAffix.onDamaged(this, dmg, world);
      if (r.dodged) return false;
      dmg = r.dmg;
      this.hitFlash = 0.09;
      if (dmg <= 0) return false;
    }

    this.hp -= dmg;
    this.hitFlash = 0.09;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.die(world, true, source);
      return true;
    }
    return false;
  }

  /** 死亡表现（爆炸 / 碎片 / 音效 / 震动）。被玩家击杀 or 撞击自毁都会走这里 */
  die(world, byPlayer, source = null) {
    // Phase 17：词缀死亡效果（分裂 / 弹头爆炸）—— 必须在 alive=false 之后、结算之前
    EnemyAffix.onDeath(this, world);
    const s = this.radius / 16;
    world.particles.explosion(this.x, this.y, s, [255, 170, 70]);
    world.audio.explosion(s);
    world.shake.shake(2 * s, 60);
    if (world.onEnemyDeath) world.onEnemyDeath(this, byPlayer, source);
  }

  update(dt, world) {
    this.age += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // 残血冒烟
    if (this.hp < this.maxHp * 0.45 && this.alive) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.09;
        world.particles.smokePuff(this.x, this.y);
      }
    }
  }

  /** 供子类在 update 末尾调用：更新朝向 + 越界/触地检测 */
  _updateFacing() {
    if (this.vx !== 0 || this.vy !== 0) this.angle = Math.atan2(this.vy, this.vx);
  }

  draw(ctx) {
    // 子类实现
  }

  /**
   * Phase E：状态图标（燃烧/电击/冰缓/腐蚀/标记），画在血条上方。
   * 由 EnemyManager.render 调用，即使满血也能看到状态。
   */
  drawStatus(ctx) {
    const st = this._status;
    if (!st) return;
    const ICON = { burn: '火', shock: '电', chill: '冰', corrosion: '腐', mark: '标' };
    const COLOR = { burn: '#ff823c', shock: '#82c8ff', chill: '#96dcff', corrosion: '#b4ff6e', mark: '#ff6ebe' };
    let i = 0;
    for (const k in ICON) {
      const s = st[k];
      if (!s || s.left <= 0) continue;
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = COLOR[k];
      ctx.fillText(`${ICON[k]}${s.stacks > 1 ? s.stacks : ''}`, this.x - 12 + i * 7, this.y - this.radius - 14);
      i++;
    }
  }

  /** 血条（受伤后才显示；Phase 17：有词缀或护盾时一并显示护盾条） */
  drawHpBar(ctx) {
    const shield = this.affixShield || 0;
    const tagged = this.affixes && this.affixes.length;
    if (this.hp >= this.maxHp && !shield && !tagged) return;
    const w = Math.max(20, this.radius * 2);
    const h = 3;
    const x = this.x - w / 2;
    const y = this.y - this.radius - 10;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    const p = clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = p > 0.5 ? '#4dffa6' : (p > 0.22 ? '#ffd166' : '#ff3b5c');
    ctx.fillRect(x, y, w * p, h);

    // 护盾条（血条上方）
    if (shield > 0) {
      const sp = clamp(shield / 90, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(x - 1, y - 6, w + 2, 3);
      ctx.fillStyle = '#7fd1ff';
      ctx.fillRect(x, y - 5, w * sp, 2);
    }
  }
}

export default Enemy;
