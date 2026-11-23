/**
 * 补给商店商品表（Phase G · GDD §17.5）
 *
 * Credits：本局货币，与 Scrap（升级刷新）/ Steel（局外强化）/ Blueprint（解锁）完全分离。
 * 收益：普通击杀 +1 · 精英 +8 · Boss +60 · 每波清空 +12（难度 rewardMul 不放大 Credits，避免滚雪球）。
 *
 * 商品分两类：
 *   kind:'consumable' —— 购买立即生效（一次性）
 *   kind:'buff'       —— 购买写入本局属性（受 maxStacks 限购）
 *
 * effect 由 ShopSystem 统一执行，只使用已接线的系统（base.hp / invuln / statusEffects / 武器热量 / stats.apply），
 * 不允许出现"买了没效果"的商品。
 */

/** 一次性消耗品 */
export const CONSUMABLES = [
  {
    id: 'fieldRepair',
    name: '紧急维修',
    icon: '🔧',
    desc: '立即修复基地 30% 最大生命',
    price: 25,
    kind: 'consumable',
    weight: 20,
  },
  {
    id: 'cryoPayload',
    name: '冰冻弹幕',
    icon: '❄',
    desc: '全场敌机冰缓 6 秒（移动 -55%）',
    price: 30,
    kind: 'consumable',
    weight: 16,
  },
  {
    id: 'airStrike',
    name: '空投轰炸',
    icon: '💥',
    desc: '对全场敌机造成 18% 最大生命伤害（Boss 减半）',
    price: 35,
    kind: 'consumable',
    weight: 12,
  },
  {
    id: 'shieldCell',
    name: '护盾电池',
    icon: '🛡',
    desc: '基地获得 6 秒无敌',
    price: 30,
    kind: 'consumable',
    weight: 14,
  },
  {
    id: 'coolantPurge',
    name: '冷却剂冲刷',
    icon: '💧',
    desc: '全部武器热量清零并解除过热',
    price: 20,
    kind: 'consumable',
    weight: 18,
  },
];

/** 本局属性商品（限购） */
export const BUFF_GOODS = [
  {
    id: 'dmgBoost',
    name: '火力强化协议',
    icon: '▲',
    desc: '本局伤害 +8%（最多买 3 次）',
    price: 45,
    kind: 'buff',
    weight: 10,
    maxStacks: 3,
    mods: { damageMul: 1.08 },
  },
  {
    id: 'hpBoost',
    name: '装甲强化协议',
    icon: '⬢',
    desc: '基地最大生命 +10%，并立即修复同等数值（最多买 2 次）',
    price: 40,
    kind: 'buff',
    weight: 10,
    maxStacks: 2,
    mods: { maxHpMul: 1.10 },
  },
  {
    id: 'xpBoost',
    name: '分析模块',
    icon: '◈',
    desc: '本局经验获取 +15%（最多买 2 次）',
    price: 40,
    kind: 'buff',
    weight: 8,
    maxStacks: 2,
    mods: { xpMul: 1.15 },
  },
];

/** 击杀收益（§17.5） */
export const CREDIT_EARN = {
  normal: 1,
  elite: 8,
  boss: 60,
  waveClear: 12,
};

/** 商店参数 */
export const SHOP_CONFIG = {
  slotCount: 4,
  refreshBaseCost: 2,        // 刷新费用（每次 +1，封顶 5）
  refreshCostCap: 5,
  // 消耗品 : 属性商品 = 3 : 1 的权重基调（消耗品是雪中送炭，属性商品是 Build 方向）
  buffEveryNPicks: 1,        // 每次刷新至少 1 个属性商品槽位（若还有可买的）
};
