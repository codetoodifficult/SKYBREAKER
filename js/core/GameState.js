/** 游戏状态机（显式状态，禁止用一堆 if 管理生命周期） */
export const GameState = {
  MENU: 'MENU',
  PREPARE: 'PREPARE',
  PLAYING: 'PLAYING',
  LEVEL_UP: 'LEVEL_UP',
  PAUSED: 'PAUSED',
  BOSS: 'BOSS',
  SHOP: 'SHOP',           // Phase G：波次间补给商店
  VICTORY: 'VICTORY',
  GAME_OVER: 'GAME_OVER',
  RESULT: 'RESULT',
  BASE: 'BASE',
};

export default GameState;
