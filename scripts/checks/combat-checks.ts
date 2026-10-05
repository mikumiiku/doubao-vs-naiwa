import { Assets } from '../../src/core/assets';
import { walkLegPose } from '../../src/core/anim';
import { Game } from '../../src/game/game';
import { LEVELS } from '../../src/game/config';
import { Defender, Projectile } from '../../src/game/entities';
import { ATTACKERS, DEFENDERS } from '../../src/game/units';
import { chooseWaveAttacker, hurtAttacker, updateAttackers, updateDefenders, updateProjectiles } from '../../src/game/systems';
import { loadBattleSave, restoreBattle, saveBattle } from '../../src/game/save';
import type { CheckResult } from './reward-flow-entry';

export function combatChecks(assets: Assets): CheckResult[] {
  const results: CheckResult[] = [];
  function check(name: string, ok: boolean): void {
    results.push({ name, ok });
  }
  function plant(game: Game, id: string, x = 500, col = 2): Defender {
    const d = new Defender(
      DEFENDERS.find((def) => def.id === id)!,
      col,
      0,
      x,
      370,
      assets,
    );
    game.defenders.push(d);
    if (d.def.occupiesCell !== false) game.occupied[0][col] = d;
    return d;
  }
  function step(game: Game, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      updateDefenders(game, 1 / 120);
      updateAttackers(game, 1 / 120);
    }
  }
  check('普通奶蛙血量是大笑奶蛙的80%', ATTACKERS.ordinary_frog.hp === ATTACKERS.laugh_frog.hp * 0.8);
  {
    const phases = Array.from({ length: 120 }, (_, i) => (i / 120) * Math.PI * 2);
    check(
      '普通奶蛙两脚始终反相交替，摆动脚抬起时支撑脚接地',
      phases.every((phase) => {
        const near = walkLegPose(phase, true),
          far = walkLegPose(phase, false);
        return Math.abs(near.angle + far.angle) < 1e-10 && Math.min(near.lift, far.lift) < 1e-10;
      }),
    );
    check(
      '普通奶蛙半周后换为另一脚迈前，循环接缝连续',
      walkLegPose(0, true).angle < 0 &&
        walkLegPose(Math.PI, true).angle > 0 &&
        walkLegPose(Math.PI, false).angle < 0 &&
        Math.abs(walkLegPose(0, true).angle - walkLegPose(Math.PI * 2, true).angle) < 1e-10,
    );
  }
  check('十关冒险与糖包奖励', LEVELS.length === 10 && LEVELS[2].unlocks?.includes('tangbao_doubao') === true);
  check(
    '常规关卡每波都有普通奶蛙',
    LEVELS.filter((level) => level.kind !== 'egg-invasion').every((level) =>
      level.waves.every((wave) => wave.pool?.some((p) => p.type === 'ordinary_frog' && p.weight > 0)),
    ),
  );
  const wave = { count: 4, interval: 1, delay: 0 };
  check('每波首只保证普通奶蛙', chooseWaveAttacker(wave, 0, [], 0.99) === 'ordinary_frog');
  check(
    '大笑奶蛙仅占默认随机权重10%',
    chooseWaveAttacker(wave, 1, [], 0.89) === 'ordinary_frog' && chooseWaveAttacker(wave, 1, [], 0.91) === 'laugh_frog',
  );
  check('特殊关卡仍可指定单一怪种', chooseWaveAttacker({ ...wave, type: 'naiji' }, 0, []) === 'naiji');
  {
    const game = new Game(assets, LEVELS[0]);
    game.spawnAttacker(0, 'laugh_frog');
    game.spawnAttacker(1, 'laugh_frog');
    check('自然刷新限制场上大笑奶蛙数量', chooseWaveAttacker(wave, 1, game.attackers, 0.99) === 'ordinary_frog');
  }
  {
    const game = new Game(assets, LEVELS[2]);
    const mover = plant(game, 'buraowan_doubao');
    game.spawnAttacker(0);
    game.spawnAttacker(0);
    const [target, other] = game.attackers;
    target.x = 540;
    other.x = 546;
    const hp = target.hp,
      otherX = other.x;
    step(game, 0.7);
    check(
      '推搡只锁一只怪且其余怪正常穿行',
      mover.pushTarget === target && other.x < otherX && other.target !== mover && other.pushedBy === null && mover.hp === mover.def.hp,
    );
    step(game, 0.55);
    check('推搡启动时是跳移且没有伤害', !!target.hop && target.hopOffset < 0 && target.x > 540 && target.x < 605 && target.hp === hp);
    const firstX = target.x;
    step(game, 0.05);
    const firstDelta = target.x - firstX;
    step(game, 0.12);
    const secondX = target.x;
    step(game, 0.05);
    const secondDelta = target.x - secondX;
    check('跳移水平速度非匀速且高度低', firstDelta > secondDelta && target.hopOffset >= -12);
    saveBattle(game);
    const saved = loadBattleSave()!;
    const restored = restoreBattle(assets, saved);
    check(
      '跳移途中存档可恢复锁定与弧线',
      restored.attackers[0].hop?.elapsed === target.hop?.elapsed && restored.defenders[0].pushTarget === restored.attackers[0],
    );
    step(game, 0.15);
    check('一次推搡结束后释放目标且不扣血', !target.hop && !target.pushedBy && target.hp === hp && target.hopOffset === 0);
  }
  {
    const game = new Game(assets, LEVELS[3]);
    const d = plant(game, 'hemian_doubao');
    game.spawnAttacker(0, 'laugh_frog');
    const frog = game.attackers[0];
    frog.x = d.x + 30;
    step(game, 2.8);
    check('笑声感染有三秒前摇且不啃咬扣血', d.hp === d.def.hp && game.attackers.length === 1 && frog.anim.name === 'laugh');
    saveBattle(game);
    const restored = restoreBattle(assets, loadBattleSave()!);
    check(
      '感染途中存档保留目标与进度',
      restored.attackers[0].target === restored.defenders[0] && restored.attackers[0].biteTimer === frog.biteTimer,
    );
    step(game, 0.3);
    check(
      '感染在豆包原地生成大笑奶蛙且释放格子',
      d.dead &&
        game.attackers.length === 2 &&
        game.attackers[1].def.id === 'laugh_frog' &&
        game.attackers[1].x <= d.x &&
        game.occupied[0][d.col] === null,
    );
    step(game, 0.4);
    check('同一豆包只转换一次', game.attackers.length === 2);
    const old = loadBattleSave()!;
    old.attackers[0].anim.name = 'attack';
    check('旧啃咬存档迁移为大笑动作', restoreBattle(assets, old).attackers[0].anim.name === 'laugh');
  }
  {
    const game = new Game(assets, LEVELS[0]);
    const d = plant(game, 'hemian_doubao');
    game.spawnAttacker(0);
    game.attackers[0].x = 530;
    d.hp = 1;
    step(game, 1.1);
    check('普通奶蛙咬死豆包不会产生感染怪', d.state === 'dying' && game.attackers.length === 1);
  }
  {
    const game = new Game(assets, LEVELS[6]);
    game.spawnAttacker(0, 'nai_egg');
    const a = game.attackers[0];
    a.x = 900;
    a.speedMul = 1;
    updateAttackers(game, 0.25);
    check(
      '奶蛋按实际移动距离连续滚动',
      a.def.id === 'nai_egg' && a.x === 889 && Math.abs(a.rollAngle + 11 / (a.def.spriteH * 0.48)) < 1e-8,
    );
    game.projectiles = [new Projectile(0, a.x, 320, 0, 20)];
    updateProjectiles(game, 0);
    check('奶蛋正常承受弹丸伤害', a.hp === a.def.hp - 20);
    const slow = plant(game, 'moyu_doubao', a.x - 100);
    const hp = a.hp;
    step(game, 1.1);
    check('摸鱼减速对奶蛋有效', a.hp < hp && a.slowTimer > 0 && a.slowFactor === slow.def.slow!.factor);
    saveBattle(game);
    const restored = restoreBattle(assets, loadBattleSave()!);
    check('存档保留减速与连续滚动角度', restored.attackers[0].slowTimer === a.slowTimer && restored.attackers[0].rollAngle === a.rollAngle);
  }
  {
    const game = new Game(assets, LEVELS[6]);
    const first = plant(game, 'hemian_doubao', 500, 2),
      second = plant(game, 'hemian_doubao', 360, 1);
    game.spawnAttacker(0, 'nai_egg');
    const a = game.attackers[0];
    a.x = 580;
    a.speedMul = 1;
    a.hp *= 0.5;
    updateAttackers(game, 1 / 120);
    step(game, 0.4);
    check(
      '奶蛋越过最先遇到的豆包且高点足够离地',
      a.state === 'vault' && a.x < first.x && a.vaultOffset < -140 && first.hp === first.def.hp && second.hp === second.def.hp,
    );
    saveBattle(game);
    const restored = restoreBattle(assets, loadBattleSave()!);
    check(
      '跳跃中途存档恢复弧线和转角',
      restored.attackers[0].vault?.elapsed === a.vault?.elapsed &&
        restored.attackers[0].vaultOffset === a.vaultOffset &&
        restored.attackers[0].rollAngle === a.rollAngle,
    );
    step(restored, 0.41);
    const resumed = restored.attackers[0];
    check(
      '落地后才裂壳，尚未生成奶鸡',
      resumed.state === 'hatch' && resumed.def.id === 'nai_egg' && resumed.x < first.x && restored.attackers.length === 1,
    );
    step(restored, 0.2);
    saveBattle(restored);
    const hatchSaved = restoreBattle(assets, loadBattleSave()!);
    step(hatchSaved, 0.6);
    const chicken = hatchSaved.attackers[0];
    check(
      '裂壳存档继续后只转换一只奶鸡并保留半血',
      chicken.def.id === 'naiji' &&
        chicken.anim.unit === 'naiji' &&
        chicken.hp === chicken.def.hp * 0.5 &&
        hatchSaved.attackers.length === 1 &&
        chicken.vault === null,
    );
    step(hatchSaved, 2);
    check(
      '奶鸡继续攻击第二个豆包且不重复越障',
      hatchSaved.defenders[1].hp < second.def.hp &&
        hatchSaved.defenders[0].hp === first.def.hp &&
        chicken.def.id === 'naiji' &&
        chicken.state !== 'vault',
    );
  }
  for (const phase of ['walk', 'vault', 'hatch'] as const) {
    const game = new Game(assets, LEVELS[6]);
    game.spawnAttacker(0, 'nai_egg');
    const a = game.attackers[0];
    a.x = 580;
    if (phase !== 'walk') {
      plant(game, 'hemian_doubao');
      updateAttackers(game, 1 / 120);
      step(game, phase === 'vault' ? 0.4 : 0.81);
    }
    hurtAttacker(game, a, a.hp);
    step(game, 1);
    check(
      `奶蛋${phase}时被打碎不会孵化`,
      a.dead && a.def.id === 'nai_egg' && a.anim.name === 'death' && !a.anim.loop && game.attackers.length === 1,
    );
  }
  {
    const game = new Game(assets, LEVELS[6]);
    game.spawnAttacker(0, 'nai_egg');
    saveBattle(game);
    const old = loadBattleSave()!;
    old.attackers[0].id = 'split_frog';
    old.attackers[0].maxHp = 320;
    old.attackers[0].hp = 160;
    old.attackers[0].anim.name = 'attack';
    const migrated = restoreBattle(assets, old).attackers[0];
    check(
      '已移除怪种的旧存档迁移为半血奶蛋',
      migrated.def.id === 'nai_egg' && migrated.hp === migrated.def.hp / 2 && migrated.anim.name === 'walk',
    );
    check(
      '怪种与波次均移除旧怪，第五关保证奶蛋登场',
      !ATTACKERS.split_frog &&
        LEVELS[4].name === '奶蛋入侵' &&
        LEVELS[4].kind === 'egg-invasion' &&
        LEVELS.every((l) => l.waves.every((w) => !w.pool?.some((p) => p.type === 'split_frog'))),
    );
  }
  return results;
}
