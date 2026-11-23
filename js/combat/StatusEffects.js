/**
 * StatusEffects —— 统一状态效果系统（Phase E，GDD 第 7 章）
 *
 * 五种状态：燃烧 Burn / 电击 Shock / 冰缓 Chill / 腐蚀 Corrosion / 标记 Mark
 * 设计红线（GDD §7.2）：
 *   - 状态存在敌人实例上（e._status），随对象池 init() 清理，不用全局 Timer（杜绝无限堆积）
 *   - DoT 通过 enemy.takeDamage(dmg, world, source) 归属来源；DoT 伤害不再次触发状态（防递归）
 *   - Boss 控制 / DoT 按规则衰减，永不被冻结
 *   - 每目标状态数量有限（叠层上限），状态池不会随战斗时长增长
 *
 * 本模块不 import Enemy / Game，只操作 duck-typed 敌人对象，避免循环依赖。
 */

export const STATUS_DEF = {
  burn:      { maxStacks: 5, duration: 3.0, color: [255, 130, 60],  name: '燃烧' },
  shock:     { maxStacks: 1, duration: 1.0, color: [130, 200, 255], name: '电击' },
  chill:     { maxStacks: 3, duration: 2.0, color: [150, 220, 255], name: '冰缓' },
  corrosion: { maxStacks: 5, duration: 4.0, color: [180, 255, 110], name: '腐蚀' },
  mark:      { maxStacks: 1, duration: 5.0, color: [255, 110, 190], name: '标记' },
};

/** 施加一次状态；重复施加 = 刷新持续时间 + 规则化叠层（不无限创建 Timer） */
export function apply(enemy, type, opts = {}) {
  const def = STATUS_DEF[type];
  if (!def || !enemy || !enemy.alive) return false;
  const boss = !!enemy.isBoss;
  const st = enemy._status || (enemy._status = {});
  const cur = st[type] || (st[type] = { stacks: 0, left: 0, acc: 0, source: null, power: 0, cd: 0 });

  // Boss 控制衰减：冰缓层数上限 1 且减速减半；灼烧/腐蚀层数减半
  const maxStacks = boss && type === 'chill' ? 1
    : boss ? Math.ceil(def.maxStacks / 2) : def.maxStacks;
  const dur = def.duration * (opts.durationMul || 1);
  cur.stacks = Math.min(maxStacks, cur.stacks + (opts.stacks || 1));
  cur.left = Math.max(cur.left, dur);
  cur.power = Math.max(cur.power, opts.power || 0);
  if (opts.source !== undefined) cur.source = opts.source;
  return true;
}

/** 敌人受到的伤害倍率（腐蚀易伤 + 标记易伤，均按 GDD 上限 + Boss 减半） */
export function damageMul(enemy) {
  const st = enemy._status;
  if (!st) return 1;
  const boss = !!enemy.isBoss;
  let mul = 1;
  const cor = st.corrosion;
  if (cor && cor.left > 0) {
    const per = 0.04 * (cor.power || 1);
    mul += Math.min(boss ? 0.10 : 0.20, per * cor.stacks);
  }
  const mark = st.mark;
  if (mark && mark.left > 0) mul += boss ? 0.04 : 0.08;
  return mul;
}

/** 敌人移动速度倍率（冰缓：普通最多 -45%，Boss 最多 -15%） */
export function speedMul(enemy) {
  const ch = enemy._status && enemy._status.chill;
  if (!ch || ch.left <= 0) return 1;
  const boss = !!enemy.isBoss;
  const per = 0.20;
  const slow = Math.min(boss ? 0.15 : 0.45, per * ch.stacks * (ch.power || 1));
  return 1 - slow;
}

/**
 * 每帧结算（由 EnemyManager.update 在 e.update 之前调用）。
 * 返回本帧 DoT 造成的总伤害（供统计 / 反馈）。
 * @param {object} enemy
 * @param {number} dt
 * @param {object} world
 */
export function tick(enemy, dt, world) {
  const st = enemy._status;
  if (!st || !enemy.alive) return 0;
  const boss = !!enemy.isBoss;
  let total = 0;

  // 燃烧：每层每秒 power DPS；Boss 按 50% 效率
  const burn = st.burn;
  if (burn && burn.left > 0) {
    burn.left -= dt;
    const dps = (burn.power || 0) * burn.stacks * (boss ? 0.5 : 1);
    burn.acc += dps * dt;
    if (burn.acc >= 1) {
      const whole = Math.floor(burn.acc);
      burn.acc -= whole;
      // 关键：DoT 伤害不再次触发状态 → 不会递归
      enemy.takeDamage(whole, world, { kind: 'status', status: 'burn', source: burn.source });
      total += whole;
    }
    if (burn.left <= 0) delete st.burn;
  }

  // 其余状态只推进计时；电击的即时伤害在 applyShock 里一次性结算
  for (const type of ['shock', 'chill', 'corrosion', 'mark']) {
    const s = st[type];
    if (!s) continue;
    s.left -= dt;
    if (s.left <= 0) delete st[type];
  }
  return total;
}

/**
 * 电击：一次额外伤害 + 有限传导（内置冷却，绝不无限循环）。
 * @param {object} enemy 命中目标
 * @param {number} dmg 基础电击伤害
 * @param {object} world
 * @param {object} source 来源归属
 * @param {number} jumps 剩余跳跃数（内部递减，外部不要传）
 * @param {Set} visited 已命中 id（防重复传导）
 */
export function shock(enemy, dmg, world, source, jumps = 2, visited = null) {
  if (!enemy || !enemy.alive) return;
  visited = visited || new Set();
  if (visited.has(enemy.id)) return;
  visited.add(enemy.id);
  apply(enemy, 'shock', { source });
  enemy.takeDamage(Math.max(1, Math.round(dmg)), world, { kind: 'status', status: 'shock', source });
  if (jumps <= 0 || !world.enemies || !world.enemies.list) return;
  const boss = !!enemy.isBoss;
  const maxJumps = boss ? Math.max(0, Math.floor(jumps / 2)) : jumps;   // Boss 传导减半
  if (maxJumps <= 0) return;
  // 传导：找最近的未命中目标（范围 200）
  let best = null, bestD = 200 * 200;
  for (const other of world.enemies.list) {
    if (!other.alive || visited.has(other.id)) continue;
    const dx = other.x - enemy.x, dy = other.y - enemy.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = other; }
  }
  if (best) shock(best, dmg * 0.6, world, source, maxJumps - 1, visited);
}

/** 清空敌人身上的状态（对象池 init / clear 时调用） */
export function clear(enemy) {
  if (enemy && enemy._status) enemy._status = null;
}

/** 调试快照 */
export function snapshot(enemy) {
  const out = {};
  const st = enemy._status || {};
  for (const k in st) out[k] = { stacks: st[k].stacks, left: Math.round(st[k].left * 100) / 100 };
  return out;
}

export default { apply, damageMul, speedMul, tick, shock, clear, snapshot, STATUS_DEF };
