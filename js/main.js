import Game from './core/Game.js';
import { CONFIG } from './data/config.js';

/**
 * 入口
 * 注意：项目使用原生 ES Modules，浏览器安全策略不允许 file:// 直接加载模块。
 * 请用任意静态服务器打开，例如：
 *     python -m http.server 8000
 * 然后访问 http://localhost:8000
 */
const canvas = document.getElementById('game');

if (!canvas) {
  throw new Error('#game canvas 未找到');
}

const game = new Game(canvas);
await game.init();

// 开发期全局句柄：控制台里可以用 __SB__ 直接调 ads.show('REVIVE') 等
window.__SB__ = game;

if (CONFIG.DEBUG) {
  console.log('%c破空者 ＳＫＹＢＲＥＡＫＥＲ', 'color:#39d7ff;font-size:20px;font-weight:800');
  console.log('Phase 0-2 已启动。F1 打开调试面板；__SB__ 为 Game 实例。');
}
