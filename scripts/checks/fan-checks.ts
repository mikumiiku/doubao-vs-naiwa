import { readyBattle } from './battle-fixture';
import type { Assets } from '../../src/core/assets';
import { sfx } from '../../src/core/sfx';
import { DEBUG_TRIALS, HOME_LINE_X, LEVELS } from '../../src/game/config';
import { Attacker, Defender, Projectile } from '../../src/game/entities';
import { advanceGridCells, gridCoordinate } from '../../src/game/fan';
import { Game } from '../../src/game/game';
import { rowFootY } from '../../src/game/grid';
import { loadBattleSave, restoreBattle, saveBattle } from '../../src/game/save';
import { hurtAttacker, updateAttackers, updateProjectiles } from '../../src/game/systems';
import { ATTACKERS, DEFENDERS } from '../../src/game/units';
import type { CheckResult } from './reward-flow-entry';

export function fanChecks(assets: Assets): CheckResult[] {
  const results: CheckResult[] = [];
  const check = (name: string, ok: boolean): void => { results.push({ name, ok }); };
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.001;
  function battle(x = 1000): { game: Game; frog: Attacker } {
    const game = readyBattle(assets, LEVELS[9]);
    const frog = new Attacker(ATTACKERS.shiranui_frog, 2, x, rowFootY(2), assets);
    game.attackers.push(frog);
    return { game, frog };
  }
  function step(game: Game, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 120); i++) updateAttackers(game, 1 / 120);
  }
  function blocker(game: Game, x: number): Defender {
    const d = new Defender(DEFENDERS.find((def) => def.id === 'tangbao_doubao')!, 3, 2, x, rowFootY(2), assets);
    game.defenders.push(d);
    game.occupied[2][3] = d;
    return d;
  }
  check('不知火蛙基础属性为200血、38速度、30啃咬', ATTACKERS.shiranui_frog.hp === 200 && ATTACKERS.shiranui_frog.speed === 38 && ATTACKERS.shiranui_frog.biteDamage === 30);
  check('不知火蛙八帧完整步态及挥扇啃咬倒地素材齐全', assets.meta('shiranui_frog', 'walk')?.frames === 8 && ['fan', 'attack', 'death'].every((id) => assets.meta('shiranui_frog', id)?.frames === 4));
  check('不知火蛙试炼固定使用新敌人并独立于正式十关', DEBUG_TRIALS[0].waves.every((w) => w.type === 'shiranui_frog') && LEVELS.length === 10);
  {
    const { game, frog } = battle();
    let fanSounds = 0;
    const originalFan = sfx.fan;
    sfx.fan = () => { fanSounds++; };
    step(game, 1);
    check('不知火蛙实际步行一秒38像素且未提前挥扇', near(frog.x, 962) && frog.state === 'walk');
    while (frog.state === 'walk') updateAttackers(game, 1 / 120);
    check('不等宽草坪精确累计三格步行后挥扇', near(frog.fanProgress, gridCoordinate(1000) - gridCoordinate(frog.x) - 3));
    const from = frog.x;
    step(game, 0.4);
    check('挥扇原地站定且出刃只发一次', near(frog.x, from) && game.fanWinds.length === 1 && frog.fanCast);
    step(game, 0.4);
    check('挥扇结束后进入滑步', frog.state === 'slide' && game.fanWinds.length === 1);
    const progress = frog.fanProgress;
    step(game, 0.425);
    check('滑步平滑前进完整一格而不计入下次挥扇距离', near(frog.x, advanceGridCells(from, 1)) && String(frog.state) === 'walk' && near(progress, frog.fanProgress));
    check('一轮挥扇只触发一次嘎嘎滴辣虾音效', fanSounds === 1);
    sfx.fan = originalFan;
  }
  {
    const { game, frog } = battle();
    frog.state = 'slide';
    frog.slide = { from: frog.x, to: advanceGridCells(frog.x, 1), duration: 0.42, elapsed: 0 };
    const d = blocker(game, 940);
    step(game, 0.45);
    check('滑步遇到豆包停止，既不穿越也不倒退', frog.x >= d.x + frog.def.biteReach - 1 && frog.x <= 1000 && String(frog.state) === 'eat');
    const hp = d.hp;
    frog.biteTimer = 0;
    step(game, 1.01);
    check('不知火蛙一次啃咬伤害30', d.hp === hp - 30);
  }
  {
    const { game, frog } = battle();
    frog.state = 'slide';
    frog.slide = { from: 1000, to: 872, duration: 0.42, elapsed: 0.1 };
    frog.hop = { from: 1000, to: 1100, elapsed: 0, duration: 0.38 };
    step(game, 0.4);
    check('推退打断滑步且不会拉回旧滑步起点', frog.slide === null && String(frog.state) === 'walk' && frog.x > 1099);
    hurtAttacker(game, frog, 999);
    step(game, 1.1);
    check('不知火蛙播放完整倒地动画后移除', frog.dead && frog.anim.name === 'death');
  }
  {
    const { game, frog } = battle(HOME_LINE_X + 10);
    frog.state = 'slide';
    frog.slide = { from: frog.x, to: frog.x - 130, duration: 0.42, elapsed: 0 };
    step(game, 0.1);
    check('滑步越界同样触发大肥鱼保险', game.mowers[2].state === 'active' && String(frog.state) === 'dying');
  }
  function windShot(options: { light?: boolean; row?: number; vx?: number; winds?: number; targetX?: number; windX?: number } = {}): { frog: Attacker; p: Projectile; game: Game } {
    const { game, frog } = battle(options.targetX ?? 700);
    const p = new Projectile(options.row ?? 2, 500, rowFootY(2) - 55, options.vx ?? 420, 20);
    p.lightweight = options.light ?? true;
    game.projectiles.push(p);
    for (let i = 0; i < (options.winds ?? 1); i++) game.fanWinds.push({ row: 2, x: options.windX ?? 600, previousX: options.windX ?? 600, y: p.y, age: 0 });
    updateProjectiles(game, 0.5);
    return { frog, p, game };
  }
  {
    const { frog, p } = windShot();
    check('迎面轻型豆馅先过风刃后命中伤害由20降到14', p.windWeakened && frog.hp === 186);
    check('多个风刃不叠乘削弱', windShot({ winds: 2 }).frog.hp === 186);
    check('穿透针形弹保持完整伤害', windShot({ light: false }).frog.hp === 180);
    check('其他行与反向弹丸不被削弱', !windShot({ row: 1 }).p.windWeakened && !windShot({ vx: -420 }).p.windWeakened);
    check('先命中前排怪再遇风刃时保持原伤害', windShot({ targetX: 600, windX: 700 }).frog.hp === 180);
    const { game, p: faded } = windShot({ targetX: 1000, windX: 900 });
    step(game, 0.81);
    check('粉色风刃按时消散', game.fanWinds.length === 0 && !faded.windWeakened);
  }
  {
    const { game, frog } = battle();
    frog.state = 'fan'; frog.fanTimer = 0.5; frog.fanCast = true; frog.fanProgress = 0.02; frog.anim.set('fan', false); frog.anim.t = 0.5;
    game.fanWinds.push({ row: 2, x: 900, previousX: 904, y: frog.y - 55, age: 0.2 });
    const p = new Projectile(2, 650, frog.y - 55, 420, 14);
    p.windWeakened = true; game.projectiles.push(p);
    saveBattle(game);
    const restored = restoreBattle(assets, loadBattleSave()!);
    check('续战恢复挥扇时刻、风刃及被削弱的豆馅', restored.attackers[0].fanCast && restored.attackers[0].fanTimer === 0.5 && restored.fanWinds[0].age === 0.2 && restored.projectiles[0].windWeakened);
    const x = restored.attackers[0].x;
    restored.update(1);
    check('暂停续战时不知火蛙与风刃保持静止', restored.attackers[0].x === x && restored.fanWinds[0].age === 0.2);
    step(restored, 0.1);
    check('恢复已出刃的挥扇不会额外发出第二道风刃', restored.fanWinds.length === 1);
    restored.attackers[0].state = 'slide';
    restored.attackers[0].slide = { from: x, to: advanceGridCells(x, 1), elapsed: 0.2, duration: 0.42 };
    saveBattle(restored);
    const sliding = restoreBattle(assets, loadBattleSave()!);
    step(sliding, 0.225);
    check('续战可从滑步中途恢复并正确抵达终点', near(sliding.attackers[0].x, advanceGridCells(x, 1)) && sliding.attackers[0].slide === null);
  }
  return results;
}
