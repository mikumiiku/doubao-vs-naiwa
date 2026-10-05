import type { Assets } from '../../src/core/assets';
import type { LevelDef } from '../../src/game/config';
import { Game } from '../../src/game/game';

/** 战斗校验先通过真实的翻页入口读完开场；小游戏教学另有独立校验。 */
export function readyBattle(assets: Assets, level: LevelDef): Game {
  const game = new Game(assets, level);
  if (!game.invasion) while (game.eggDialogue !== null) game.advanceEggDialogue();
  return game;
}
