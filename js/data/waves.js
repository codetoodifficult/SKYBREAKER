/**
 * 10 波编成（Phase 12 数值重构，设计文档 §39 / §3）
 * W1 Training → W5 首个精英 → W9 Final Assault（最大压力波）→ W10 Boss
 *
 * { comp: [{ type, count, delay, interval }], maxSec }
 *   delay    = 该组第一只的延迟秒数（相对本波开战）
 *   interval = 组内每只之间的间隔秒数
 *   maxSec   = 本波最长持续时间（设计文档 §3："清空敌人 + 最长持续时间，二者取先到者"）
 *
 * 出怪节奏按 §3 的每波时长目标反推，并用 tools/phase12-run-sim.mjs 实测校准：
 *   波次时长 ≈ 准备 2.5 + 出怪窗口 + 清场尾巴 + 结算 2.2 + 间歇 2.0
 *   目标：W1 30–40s / W4 45–55s / W9 65–85s / Boss 30–45s，单局合计 8–12 分钟。
 * 战线刻意拉长、同屏密度压低：压力来自"持续不断的混合兵种"，而不是"一次性糊脸"。
 *
 * maxSec 是安全阀：EW Plane 会在顶部无限巡逻，若玩家打不掉它，
 * 没有 maxSec 的波次将永远无法结束（Game.onTimeout 会让残敌撤离）。
 */
export const WAVES = [
  // W1 — Training：学会瞄准（目标 30–40s）
  { id: 1, maxSec: 55, comp: [
      { type: 'fighter', count: 8, delay: 0, interval: 3.75 },
  ] },

  // W2 — Pressure：无人机第一次考验预瞄（目标 35–45s）
  { id: 2, maxSec: 60, comp: [
      { type: 'fighter', count: 12, delay: 0,    interval: 2.75 },
      { type: 'drone',   count: 3,  delay: 10.0, interval: 3.75 },
  ] },

  // W3 — Heavy Target：轰炸机出现，开始有目标优先级（目标 40–50s）
  { id: 3, maxSec: 60, comp: [
      { type: 'fighter', count: 10, delay: 0,    interval: 3.3 },
      { type: 'drone',   count: 4,  delay: 6.25, interval: 2.5 },
      { type: 'bomber',  count: 2,  delay: 18.0, interval: 7.5 },
  ] },

  // W4 — Formation：运输机（战略目标）登场（目标 45–55s）
  { id: 4, maxSec: 65, comp: [
      { type: 'fighter',   count: 12, delay: 0,    interval: 3.2 },
      { type: 'bomber',    count: 3,  delay: 10.0, interval: 8.75 },
      { type: 'transport', count: 1,  delay: 19.5, interval: 0 },
  ] },

  // W5 — Midboss Wave：波末出现首个精英 Ace Fighter（目标 45–60s）
  { id: 5, maxSec: 70, comp: [
      { type: 'fighter',   count: 12, delay: 0,    interval: 3.5 },
      { type: 'drone',     count: 5,  delay: 7.5,  interval: 3.1 },
      { type: 'bomber',    count: 3,  delay: 12.5, interval: 8.75 },
      { type: 'aceFighter',count: 1,  delay: 25.0, interval: 0 },
  ] },

  // W6 — Electronic Warfare：EW 干扰雷达（目标 50–65s）
  { id: 6, maxSec: 75, comp: [
      { type: 'ewPlane',   count: 1,  delay: 0,    interval: 0 },
      { type: 'fighter',   count: 12, delay: 1.25, interval: 3.9 },
      { type: 'drone',     count: 5,  delay: 10.0, interval: 3.1 },
      { type: 'transport', count: 1,  delay: 22.5, interval: 0 },
  ] },

  // W7 — Interception：两只 Ace 同时压迫（目标 50–70s）
  { id: 7, maxSec: 80, comp: [
      { type: 'fighter',   count: 15, delay: 0,    interval: 3.25 },
      { type: 'bomber',    count: 3,  delay: 12.5, interval: 10.0 },
      { type: 'aceFighter',count: 2,  delay: 20.0, interval: 10.0 },
  ] },

  // W8 — Saturation：数量峰值（目标 55–75s）
  { id: 8, maxSec: 85, comp: [
      { type: 'fighter',   count: 18, delay: 0,    interval: 2.9 },
      { type: 'drone',     count: 8,  delay: 7.5,  interval: 2.5 },
      { type: 'bomber',    count: 4,  delay: 12.5, interval: 8.75 },
      { type: 'transport', count: 1,  delay: 25.0, interval: 0 },
  ] },

  // W9 — Final Assault：最大压力波，Heavy Bomber 首次出场（目标 65–85s）
  { id: 9, maxSec: 105, comp: [
      { type: 'fighter',      count: 20, delay: 0,    interval: 3.1 },
      { type: 'drone',        count: 10, delay: 7.5,  interval: 2.5 },
      { type: 'bomber',       count: 5,  delay: 15.0, interval: 8.75 },
      { type: 'transport',    count: 2,  delay: 20.0, interval: 10.0 },
      { type: 'ewPlane',      count: 1,  delay: 2.5,  interval: 0 },
      { type: 'heavyBomber',  count: 1,  delay: 32.5, interval: 0 },
  ] },

  // W10 — Boss：Boss 按阶段自行召唤援军（目标 30–45s）
  { id: 10, maxSec: 80, comp: [
      { type: 'boss',    count: 1, delay: 0,    interval: 0 },
      { type: 'drone',   count: 8, delay: 3.75, interval: 1.25 },
      { type: 'fighter', count: 4, delay: 7.5,  interval: 1.5 },
  ] },
];

export default WAVES;
