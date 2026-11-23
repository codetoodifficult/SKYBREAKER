import { Enemy } from './Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { CONFIG } from '../data/config.js';
import { TAU, rand } from '../core/utils.js';
const W = CONFIG.WORLD.WIDTH;
function r_safe(rules) { return !!(rules && rules.bossCoreShield); }

/**
 * 天穹轰炸舰 —— 多阶段 Boss
 *   进入 enter：从天顶降落到位
 *   阶段一（HP 100%~70%）：投弹轰炸城市
 *   阶段二（HP 70%~40%）：向基地发射追踪导弹
 *   阶段三（HP 40%~15%）：释放战斗机群
 *   核心暴露（HP <15%）：停止攻击、核心闪烁、受到 2 倍伤害
 *   击毁：分段大爆炸 + 慢动作（由 Game.onBossDeath 处理）
 */
export class Boss extends Enemy {
  constructor() {
    super();
    this.type = 'boss';
    this.isBoss = true;
    this.state = 'enter';
    this.phase = 1;
    this.timer = 0;
    this.dir = 1;
    this.coreFlash = 0;
  }

  init(cfg, x, y) {
    super.init(cfg || ENEMIES.boss, x, y);
    this.state = 'enter';
    this.phase = 1;
    this.timer = 1.6;
    this.dir = 1;
    this.coreFlash = 0;
    this.y = -90;              // 从天顶进入
    this.vy = 70;              // 降落速度
    this.vx = 0;
    this.angle = 0;
    // Phase 20：难度规则在首帧 update 时套用（init 拿不到 world）
    this._rulesApplied = false;
    this.coreShieldMax = 0;
    this.coreShield = 0;
    this.shieldUp = false;
    this.shieldCooldown = 0;
    this.escortClearTime = 0;
    return this;
  }

  /** Phase 20 §41/§42：按难度套用 Boss 强化 */
  _applyRules(world) {
    const r = world.difficultyRules;
    this._rulesApplied = true;
    if (!r) return;
    this.rules = r;
    // §42 D8+：核心护盾 —— 击毁护卫才能关闭
    if (r.bossCoreShield) {
      this.coreShieldMax = Math.round(this.maxHp * (r.skybreaker ? 0.22 : 0.16));
      this.coreShield = this.coreShieldMax;
      this.shieldUp = true;
      if (world.onBossPhase) world.onBossPhase(1, 'BOSS CORE SHIELD · 击毁护卫以关闭护盾');
    }
  }

  /** 核心暴露时 2 倍易伤；Phase 20：核心护盾开启时完全无敌（必须先杀护卫） */
  takeDamage(dmg, world, source = null) {
    if (this.state === 'core') dmg *= 2;
    if (this.shieldUp && this.coreShield > 0) {
      this.coreShield -= dmg;
      this.hitFlash = 0.09;
      // 护盾被打爆：短暂过载后关闭
      if (this.coreShield <= 0) {
        this.coreShield = 0;
        this.shieldUp = false;
        this.shieldCooldown = r_safe(this.rules) ? 16 : 999;
        if (world.onBossPhase) world.onBossPhase(this.phase, 'SHIELD DOWN · 核心暴露');
        if (world.particles) world.particles.explosion(this.x, this.y, 2.2, [127, 209, 255]);
        if (world.audio) world.audio.explosion(1.4);
      }
      return false;
    }
    return super.takeDamage(dmg, world, source);
  }

  update(dt, world) {
    super.update(dt, world);
    if (!this.alive) return;
    if (!this._rulesApplied) this._applyRules(world);

    // Phase 20 §42：护盾周期（被打爆后 16s 重新展开，除非已进入核心暴露阶段）
    if (this.rules && this.rules.bossCoreShield && !this.shieldUp && this.state !== 'core') {
      this.shieldCooldown -= dt;
      if (this.shieldCooldown <= 0 && this.hp > this.maxHp * 0.15) {
        this.coreShield = Math.round(this.coreShieldMax * 0.6);
        this.shieldUp = true;
        if (world.onBossPhase) world.onBossPhase(this.phase, 'SHIELD RE-ENGAGED');
      }
    }
    if (this.shieldUp) this.affixShield = this.coreShield;   // 复用护盾血条渲染
    else this.affixShield = 0;

    // 阶段判定
    const ratio = this.hp / this.maxHp;
    if (ratio < 0.15) this._setPhase(4, world);
    else if (ratio < 0.40) this._setPhase(3, world);
    else if (ratio < 0.70) this._setPhase(2, world);
    else this._setPhase(1, world);

    this.timer -= dt;

    if (this.state === 'enter') {
      this.y += this.vy * dt;
      if (this.y >= 120) { this.y = 120; this.state = 'patrol'; this.vy = 0; }
    } else if (this.state === 'patrol') {
      this._patrol(dt);
      this._act(dt, world);
    } else if (this.state === 'core') {
      this.coreFlash += dt * 6;
      this._patrol(dt, 0.5);
    }
    this._updateFacing();
  }

  _patrol(dt, speedScale = 1) {
    this.x += this.vx * dt;
    if (this.x > 920) this.dir = -1;
    if (this.x < 360) this.dir = 1;
    this.vx = this.dir * this.cfg.speed * speedScale;
    this.angle = this.dir > 0 ? 0 : Math.PI;
  }

  _setPhase(p, world) {
    if (this.phase === p) return;
    this.phase = p;
    this.timer = 0;
    if (p === 4) this.state = 'core';
    if (p >= 2 && world.onBossPhase) {
      const names = { 2: '阶段二 · 导弹来袭', 3: '阶段三 · 释放战机', 4: '核心暴露！' };
      world.onBossPhase(p, names[p]);
    }
  }

  _act(dt, world) {
    switch (this.phase) {
      case 1: // 投弹
        if (this.timer <= 0) {
          this.timer = 0.85;
          if (world.onCityDamage) world.onCityDamage(this.cfg.damage, this);
          world.particles.explosion(this.x, this.y + 44, 1.0, [255, 140, 60]);
          world.audio.explosion(0.9);
          world.shake.shake(5, 100);
        }
        break;
      case 2: // 向基地发射导弹（§41 D5+：额外无人机；D7+ 攻速提升）
        if (this.timer <= 0) {
          this.timer = this.rules && this.rules.eliteDoubleAffix ? 1.0 : 1.3;
          if (this.rules && this.rules.hardEvents && world.spawnEnemy) {
            world.spawnEnemy('drone', this.x + rand(-60, 60), this.y + 40);
          }
          if (world.spawnMissile) {
            const bx = world.gun.x, by = world.gun.y;
            world.spawnMissile(this.x, this.y + 30, null, {
              damage: 26, radius: 62, speed: 380, turnRate: 2.2,
              angle: Math.atan2(by - this.y, bx - this.x), life: 6,
            });
          }
          world.audio.missile && world.audio.missile();
        }
        break;
      case 3: // 释放战斗机（§41 D3+ 额外援军；D9+ 援军为精英；D10 多方向）
        if (this.timer <= 0) {
          this.timer = this.rules && this.rules.eliteDoubleAffix ? 1.15 : 1.5;
          if (!world.spawnEnemy) break;
          if (this.rules && this.rules.eliteFormation) {
            world.spawnEnemy('aceFighter', this.x + rand(-60, 60), this.y + 34);
          } else {
            world.spawnEnemy('fighter', this.x + rand(-46, 46), this.y + 34);
            if (this.rules && this.rules.eliteBoost) {
              world.spawnEnemy('fighter', this.x + rand(-90, 90), this.y + 46);
            }
          }
          // §41 D10 最终形态：多方向援军
          if (this.rules && this.rules.skybreaker) {
            world.spawnEnemy('drone', rand(80, W - 80), -40);
            world.spawnEnemy('fighter', -50, rand(80, 220));
            world.spawnEnemy('fighter', W + 50, rand(80, 220));
          }
        }
        break;
      default: break;
    }
  }

  /** 击毁：分段大爆炸 + 通知 Game 触发慢动作 */
  die(world, byPlayer) {
    world.particles.explosion(this.x, this.y, 3.4, [255, 170, 70]);
    world.audio.explosion(2.0);
    world.shake.shake(18, 500);
    for (let i = 1; i <= 8; i++) {
      const dx = rand(-60, 60), dy = rand(-30, 30);
      const delay = i * 110;
      setTimeout(() => {
        world.particles.explosion(this.x + dx, this.y + dy, 1.5 + rand(0, 1), [255, 150, 60]);
        world.audio.explosion(1.1);
      }, delay);
    }
    if (world.onBossDeath) world.onBossDeath(this, byPlayer);
    if (world.onEnemyDeath) world.onEnemyDeath(this, byPlayer);
  }

  draw(ctx) {
    const flip = Math.abs(this.angle) > Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (flip) ctx.scale(1, -1);
    const c = this.cfg;
    const f = this.hitFlash > 0;

    // 巨型长机身
    ctx.fillStyle = f ? '#fff' : c.color;
    ctx.strokeStyle = f ? '#fff' : 'rgba(160,120,220,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(56, 0);
    ctx.lineTo(30, -16);
    ctx.lineTo(-34, -12);
    ctx.lineTo(-42, 0);
    ctx.lineTo(-34, 12);
    ctx.lineTo(30, 16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 宽机翼
    ctx.fillStyle = f ? '#fff' : '#3a2456';
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-14, -32);
    ctx.lineTo(-28, -28);
    ctx.lineTo(-2, -2);
    ctx.lineTo(-2, 2);
    ctx.lineTo(-28, 28);
    ctx.lineTo(-14, 32);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 引擎光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ex of [-18, 18]) {
      const g = ctx.createRadialGradient(ex, 0, 0, ex, 0, 8);
      g.addColorStop(0, 'rgba(255,160,80,.9)');
      g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, 0, 8, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // 核心：核心暴露阶段闪烁发光
    if (this.state === 'core') {
      const a = 0.5 + 0.5 * Math.sin(this.coreFlash);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20 + a * 8);
      g.addColorStop(0, `rgba(255,80,120,${0.85 + a * 0.15})`);
      g.addColorStop(1, 'rgba(255,40,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 20 + a * 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff5f6d';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    } else if (this.phase >= 2) {
      // 阶段指示灯
      ctx.fillStyle = this.phase === 3 ? '#ffb03d' : '#39d7ff';
      ctx.fillRect(-30, -4, 3, 8);
    }

    ctx.restore();
  }
}

export default Boss;
