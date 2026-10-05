import { readyBattle } from './battle-fixture';
/**
 * 通关奖励流程的校验入口（被 scripts/checks/check-reward-flow.mjs 调用）。
 * 在 Node + 浏览器 API 垫片下跑真实的 Game 类，断言整条奖励链路。
 * 以 .ts 形式放在 scripts/ 下，是为了能直接 import src/ 的源码。
 */
import { Game } from '../../src/game/game';
import { HOME_LINE_X, LEVELS, MOWER } from '../../src/game/config';
import { Assets, type Manifest } from '../../src/core/assets';
import { Anim } from '../../src/core/anim';
import { rowFootY } from '../../src/game/grid';
import { hurtAttacker } from '../../src/game/systems';
import { ATTACKERS } from '../../src/game/units';
import { cardDetailBackButton, cardDetailNextButton } from '../../src/game/carddetail';
import { exitToLevelsButton } from '../../src/game/ui';
import { loseButtonsRect, pauseButtonsRect, volumeSliderRect, menuButtonRect, shovelButtonRect } from '../../src/game/ui';
import { sfx } from '../../src/core/sfx';
import { loadBattleSave, restoreBattle, saveBattle } from '../../src/game/save';
import { combatChecks } from './combat-checks';
import { campaignChecks } from './campaign-checks';
import { campaignPlaythroughChecks } from './campaign-playthrough';
import { fanChecks } from './fan-checks';
import { storyChecks } from './story-checks';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export function runRewardFlowCheck(manifest: Manifest): CheckResult[] {
  const out: CheckResult[] = [];
  const push = (name: string, ok: boolean, detail?: string): void => {
    out.push({ name, ok, detail });
  };

  const assets = new Assets();
  // 使用实际切片产物的帧数、帧率与轨道，跳过图片加载。
  assets.manifest = manifest;
  out.push(...combatChecks(assets), ...campaignChecks(assets), ...campaignPlaythroughChecks(assets), ...fanChecks(assets), ...storyChecks(assets));

  {
    const drawn: number[] = [];
    const originalFrame = assets.tintedFrame;
    assets.tintedFrame = (_unit, _anim, index) => {
      drawn.push(index);
      return { width: 200, height: 220 } as HTMLImageElement;
    };
    const ctx = document.createElement('canvas').getContext('2d')!;
    try {
      const walking = new Anim(assets, 'laugh_frog', 'walk');
      walking.t = walking.duration() - 0.01;
      walking.draw(ctx, 0, 220, 220);
      push('走路末帧能过渡回首帧', drawn.join(',') === `${assets.meta('laugh_frog', 'walk')!.frames - 1},0`, drawn.join(','));
      walking.update(0.02);
      push('走路循环越界后回到首帧', walking.currentIndex() === 0 && walking.loops === 1);
      drawn.length = 0;
      const dying = new Anim(assets, 'laugh_frog', 'death_b', false);
      dying.update(dying.duration() + 0.1);
      dying.draw(ctx, 0, 220, 220);
      push('断手倒地播放完成后保持末帧', dying.finished && drawn.join(',') === '4');
    } finally {
      assets.tintedFrame = originalFrame;
    }
    const battle = readyBattle(assets, { ...LEVELS[0], rows: [0, 1, 2, 3, 4] });
    battle.spawnAttacker(0, 'laugh_frog');
    const frog = battle.attackers[0];
    hurtAttacker(battle, frog, frog.def.hp * 0.4);
    battle.update(1 / 60);
    push('受伤后切换断手走路', frog.broken && frog.anim.name === 'walk_b');
    battle.dough = 200;
    battle.placing = 'douxian_shooter';
    battle.onPointerDown({ x: 290, y: 300 });
    frog.x = battle.defenders[0].x + 20;
    battle.update(1 / 60);
    push('断手走路进入大笑时保持断手', frog.broken && frog.anim.name === 'laugh_b');
    hurtAttacker(battle, frog, frog.hp);
    push('断手啃咬致命伤进入断手倒地', frog.broken && frog.anim.name === 'death_b' && !frog.anim.loop);
    saveBattle(battle);
    const saved = loadBattleSave()!;
    saved.attackers[0].anim.name = 'death';
    push('旧存档死亡动作恢复为同侧断手倒地', restoreBattle(assets, saved).attackers[0].anim.name === 'death_b');
  }

  // 与真实产物对齐（scripts/assets/slice-sprites.mjs 里写的 fps）
  const SHIPPED_FPS: Record<string, number> = {
    'laugh_frog/walk': 8,
    'laugh_frog/walk_b': 8,
    'laugh_frog/chew': 6,
    'laugh_frog/laugh_b': 6,
    'laugh_frog/death': 4,
    'laugh_frog/death_b': 4,
    'douxian_shooter/attack': 4,
    'buraowan_doubao/walk': 5,
    'buraowan_doubao/attack': 5,
    'naiji/walk': 5,
    'naiji/attack': 5,
  };
  for (const [k, fps] of Object.entries(SHIPPED_FPS)) {
    const [u, a] = k.split('/');
    push(`产物帧率: ${k}`, assets.manifest.units[u][a].fps === fps, `${assets.manifest.units[u][a].fps} vs ${fps}`);
  }
  for (const name of ['walk', 'walk_b']) {
    const meta = assets.meta('laugh_frog', name)!;
    push(`奶蛙 ${name} 每次换脚含四个姿势且不少于半秒`, meta.frames === 8 && meta.frames / meta.fps / 2 >= 0.5);
  }
  {
    const game = readyBattle(assets, { ...LEVELS[0], rows: [0, 1, 2, 3, 4] });
    const originalLose = sfx.lose;
    let sounds = 0,
      restarts = 0,
      exits = 0;
    sfx.lose = () => {
      sounds++;
    };
    game.onRestart = () => {
      restarts++;
    };
    game.onExit = () => {
      exits++;
    };
    try {
      game.spawnAttacker(0);
      game.mowers[0].state = 'gone';
      game.attackers[0].x = HOME_LINE_X - 1;
      game.update(1 / 60);
      push('奶蛙突破无推车的家园后进入失败演出', game.state === 'lose' && sounds === 1);
      const x = game.attackers[0].x;
      for (let i = 0; i < 60 * 5; i++) game.update(1 / 60);
      push('失败咀嚼持续循环且战场停止推进', game.loseAnim.loops >= 3 && game.attackers[0].x === x);
      push('失败音效只播放一次', sounds === 1);
      const elapsed = game.loseElapsed;
      const phase = game.loseAnim.t;
      game.pauseOpen = true;
      game.update(1);
      push('暂停时失败演出同步停止', game.loseElapsed === elapsed && game.loseAnim.t === phase);
      game.pauseOpen = false;
      game.onPointerDown({ x: 1, y: 1 });
      push('失败画面按钮外点击无效', restarts === 0 && exits === 0);
      const buttons = loseButtonsRect();
      game.onPointerDown({ x: buttons.restart.x + buttons.restart.w / 2, y: buttons.restart.y + buttons.restart.h / 2 });
      push('失败画面重新开始按钮可用', restarts === 1 && exits === 0);
      game.onPointerDown({ x: buttons.back.x + buttons.back.w / 2, y: buttons.back.y + buttons.back.h / 2 });
      push('失败画面返回选关按钮可用', restarts === 1 && exits === 1);
    } finally {
      sfx.lose = originalLose;
    }
  }

  const level = { ...LEVELS[0], rows: [0, 1, 2, 3, 4], waves: [{ count: 1, interval: 1, delay: 0 }] };
  {
    const opening = readyBattle(assets, { ...LEVELS[0], rows: [0, 1, 2, 3, 4] });
    for (let frame = 0; frame < 60 * 30; frame++) opening.update(1 / 60);
    push(
      '新开局前 30 秒所有小推车保持待命',
      opening.mowers.every((m) => m.state === 'idle' && m.x === MOWER.restX),
    );
    opening.spawnAttacker(0);
    const invader = opening.attackers[opening.attackers.length - 1];
    invader.x = HOME_LINE_X + 2;
    opening.update(1 / 60);
    push('第一行敌人尚未越线时小推车不触发', opening.mowers[0].state === 'idle');
    invader.x = HOME_LINE_X;
    opening.update(1 / 60);
    push('第一行敌人越线后小推车正常触发', opening.mowers[0].state === 'active' && invader.state === 'dying');
    push(
      '第一行触发不影响其他行小推车',
      opening.mowers.slice(1).every((m) => m.state === 'idle'),
    );

    const battle = readyBattle(assets, { ...LEVELS[0], rows: [0, 1, 2, 3, 4] });
    battle.spawnAttacker(0, 'laugh_frog');
    battle.spawnAttacker(1, 'naiji');
    battle.attackers.forEach((a) => {
      a.hp = a.def.hp / 2;
    });
    saveBattle(battle);
    const saved = loadBattleSave()!;
    const restored = restoreBattle(assets, saved);
    push('续战先暂停，等待明确点继续', restored.pauseOpen);
    push(
      '新版存档反复恢复不会重复降低血量',
      restored.attackers.every((a) => a.hp === a.def.hp / 2),
    );
    saved.attackers.forEach((a) => {
      delete a.maxHp;
      a.hp = (a.id === 'laugh_frog' ? 260 : 87) / 2;
    });
    const migrated = restoreBattle(assets, saved);
    push(
      '旧版奶蛙和奶鸡存档按剩余血量比例降 15%',
      migrated.attackers.every((a) => a.hp === a.def.hp / 2),
    );
    battle.mowers[2].state = 'active';
    saveBattle(battle);
    const resuming = restoreBattle(assets, loadBattleSave()!);
    resuming.update(1);
    push('进入续战后小推车不会自动冲锋移动', resuming.mowers[0].x === battle.mowers[2].x);
    resuming.onPointerDown({ x: pauseButtonsRect().cont.x + 20, y: pauseButtonsRect().cont.y + 20 });
    resuming.update(1 / 60);
    push('明确继续后已触发的小推车恢复冲锋', resuming.mowers[0].x > battle.mowers[2].x);
  }
  const game = readyBattle(assets, level);
  let nextCalled = 0;
  let exitCalled = 0;
  game.onNext = () => {
    nextCalled++;
  };
  game.onExit = () => {
    exitCalled++;
  };

  // 让波次按正常流程刷出奶蛙
  game.firstFrogAt = 0;
  game.update(1 / 60); // 开首波
  game.update(1 / 60); // 刷出第一只
  const frog = game.attackers[0];
  if (!frog) {
    push('波次能刷出奶蛙', false);
    return out;
  }
  const FROG_X = 700;
  frog.x = FROG_X;
  frog.y = rowFootY(0);
  hurtAttacker(game, frog, 9999); // 一击致死

  const dt = 1 / 60;
  let steps = 0;
  let clicked = false;
  let popupPos: { x: number; y: number } | null = null;
  let forcedWaveEnd = false;
  let missWasIgnored = false;
  const phases: string[] = [];
  const record = (): void => {
    const p = game.rewardPhase + (game.reward ? ':' + game.reward.phase : '');
    if (phases[phases.length - 1] !== p) phases.push(p);
  };
  record();

  while (steps++ < 60 * 30) {
    // 奶蛙死透后把波次推到末尾，模拟"最后一波已清空"
    if (!forcedWaveEnd && game.lastDeath) {
      game.waveIndex = game.waves.length;
      forcedWaveEnd = true;
    }
    if (!clicked && game.reward && game.reward.phase === 'idle') {
      const hit = game.rewardHitRect();
      popupPos = { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
      // 点卡片以外应当无效
      game.onPointerDown({ x: 5, y: 5 });
      missWasIgnored = game.reward.phase === 'idle';
      record();
      game.onPointerDown(popupPos);
      clicked = true;
    }
    record();
    if (game.rewardPhase === 'detail') break;
    game.update(dt);
    record();
  }

  const death = game.lastDeath;
  push('奶蛙阵亡位置被记录', !!death, death ? `(${death.x.toFixed(0)}, ${death.y.toFixed(0)})` : '无');
  push('清空最后一波后判定胜利', game.state === 'win', `state=${game.state}`);
  push(
    '奖励卡在最后阵亡奶蛙处弹出',
    !!popupPos && !!death && Math.abs(death.x - FROG_X) < 1,
    popupPos ? `奶蛙 x=${FROG_X} / 卡片 x=${popupPos.x.toFixed(0)}` : '未弹出',
  );
  push(
    '奖励卡弹出位置在可视区内',
    !!popupPos && popupPos.x > 60 && popupPos.x < 1585 - 60 && popupPos.y > 150 && popupPos.y < 992 - 180,
    popupPos ? `(${popupPos.x.toFixed(0)}, ${popupPos.y.toFixed(0)})` : '未弹出',
  );
  push('点到卡片外不触发', missWasIgnored);
  push(
    '演出顺序: 弹出 → 飞行 → 闪光 → 介绍页',
    phases.includes('reward:pop') && phases.includes('reward:fly') && phases.includes('reward:flash') && game.rewardPhase === 'detail',
    phases.join(' → '),
  );

  // 介绍页按钮
  const hasNext = game.hasNextLevel();
  push('介绍页存在「下一关」按钮', hasNext, `hasNextLevel=${hasNext}`);
  if (hasNext) {
    const n = cardDetailNextButton();
    game.onPointerDown({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
    push('点「下一关」触发回调', nextCalled === 1, `调用 ${nextCalled} 次`);
  }
  const b = cardDetailBackButton();
  const backBtn = hasNext ? b : { ...b, x: (1585 - b.w) / 2 };
  game.onPointerDown({ x: backBtn.x + backBtn.w / 2, y: backBtn.y + backBtn.h / 2 });
  push('点「返回选关」触发回调', exitCalled === 1, `调用 ${exitCalled} 次`);

  // 关卡奖励表：豆馅射手开局就有，不该是任何一关的奖励
  const rewardOf = (id: number): string[] => LEVELS.find((l) => l.id === id)?.unlocks ?? [];
  push('第 1 关奖励 = 和面豆包', JSON.stringify(rewardOf(1)) === '["hemian_doubao"]', JSON.stringify(rewardOf(1)));
  push('第 2 关奖励 = 不绕弯豆包', JSON.stringify(rewardOf(2)) === '["buraowan_doubao"]', JSON.stringify(rewardOf(2)));
  // 最后一关后面没有新关卡，不应挂奖励（否则胜利后会弹一张无处可去的卡）
  const lastLevel = LEVELS[LEVELS.length - 1];
  push('最后一关暂无奖励', rewardOf(lastLevel.id).length === 0, JSON.stringify(rewardOf(lastLevel.id)));
  push(
    '豆馅射手不在任何一关的奖励里',
    LEVELS.every((l) => !(l.unlocks ?? []).includes('douxian_shooter')),
  );
  // 数值平衡：进攻方血量降低 15%、射手射速保持原节奏。
  const frogDef = ATTACKERS.laugh_frog;
  push('奶蛙血量降低 15%：260 → 221', frogDef.hp === 260 * 0.85, `hp=${frogDef.hp}`);
  push('奶鸡血量降低 15%：87 → 73.95', ATTACKERS.naiji.hp === 87 * 0.85, `hp=${ATTACKERS.naiji.hp}`);
  const atk = assets.manifest.units.douxian_shooter.attack;
  const cycle = atk.frames / atk.fps;
  push('射手射速降到 80%（一轮攻击动画 1.75s）', Math.abs(cycle - 1.4 / 0.8) < 1e-6, `${atk.frames}帧@${atk.fps}fps = ${cycle}s`);
  const biteAnim = assets.manifest.units.laugh_frog.laugh_b;
  const biteCycle = biteAnim.frames / biteAnim.fps;
  push(
    '大笑感染前摇覆盖完整三轮大笑动画',
    Math.abs(frogDef.infectionSeconds! - biteCycle * 3) < 1e-3,
    `biteInterval=${frogDef.biteInterval}s vs 动画 ${biteCycle}s`,
  );

  // 走路手感：瞬时速度要有动画驱动的变化（不是匀速平移），平均速度不能漂，起伏与迈步同步
  {
    const g3 = readyBattle(assets, level);
    g3.firstFrogAt = 0;
    g3.update(1 / 60);
    g3.update(1 / 60);
    const f3 = g3.attackers[0];
    if (f3) {
      f3.x = 1400;
      f3.y = rowFootY(0);
      f3.speedMul = 1; // 去掉个体随机，单独量根位移轨道带来的速度变化
      const speeds: number[] = [];
      let minBob = 0;
      let maxBob = 0;
      let prevX = f3.x;
      const x0 = f3.x;
      const t0 = g3.time;
      for (let i = 0; i < 60 * 8; i++) {
        g3.update(1 / 60);
        speeds.push((prevX - f3.x) * 60);
        prevX = f3.x;
        minBob = Math.min(minBob, f3.bobOffset);
        maxBob = Math.max(maxBob, f3.bobOffset);
      }
      const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const min = Math.min(...speeds);
      const max = Math.max(...speeds);
      const longRun = (x0 - f3.x) / (g3.time - t0);
      push(
        '行走瞬时速度有变化（不是匀速平移）',
        max - min > 6,
        `${min.toFixed(1)}..${max.toFixed(1)} px/s（峰谷差 ${(max - min).toFixed(1)}）`,
      );
      push('速度变化幅度不过分（峰谷差 ≤ 平均的 80%）', max - min <= avg * 0.8, `平均 ${avg.toFixed(1)}，峰谷差 ${(max - min).toFixed(1)}`);
      push('长期平均速度不被轨道带偏', Math.abs(longRun - f3.def.speed) < 1.0, `实测 ${longRun.toFixed(2)} px/s vs 设定 ${frogDef.speed}`);
      push(
        '上下起伏来自素材轨道且幅度适中',
        maxBob - minBob > 2 && Math.max(Math.abs(minBob), Math.abs(maxBob)) <= Game.BOB_AMPLITUDE + 0.01,
        `bob ${minBob.toFixed(1)}..${maxBob.toFixed(1)} px`,
      );
    }
  }

  // 个体差异：同批奶蛙不应完全同速同帧
  {
    const g4 = readyBattle(assets, level);
    g4.firstFrogAt = 0;
    for (let i = 0; i < 12; i++) g4.spawnAttacker(0, 'laugh_frog');
    const muls = g4.attackers.map((a) => a.speedMul);
    const phases = g4.attackers.map((a) => a.phaseOffset);
    const uniqMul = new Set(muls.map((m) => m.toFixed(3))).size;
    const uniqPhase = new Set(phases).size;
    push('每只奶蛙速度有个体差异', uniqMul > 1, `${uniqMul} 种速度（如 ${muls[0].toFixed(2)} / ${muls[1].toFixed(2)}）`);
    push('每只奶蛙起步相位不同', uniqPhase > 1, `${uniqPhase} 种相位`);
    const inRange = muls.every((m) => Math.abs(m - 1) <= frogDef.speedJitter + 1e-9);
    push('个体速度浮动在 speedJitter 范围内', inRange, `speedJitter=±${frogDef.speedJitter}`);
  }

  // 无奖励关（最后一关）通关后应停在胜利遮罩（有「返回选关」），不进卡片介绍页、不弹空卡
  const lvLast = { ...LEVELS[LEVELS.length - 1], kind: 'battle' as const, waves: [{ count: 1, interval: 1, delay: 0 }] };
  const g2 = readyBattle(assets, lvLast);
  g2.firstFrogAt = 0;
  g2.update(1 / 60);
  g2.update(1 / 60);
  const f2 = g2.attackers[0];
  if (f2) {
    f2.x = 700;
    f2.y = rowFootY(0);
    hurtAttacker(g2, f2, 9999);
    for (let i = 0; i < 60 * 20; i++) {
      if (g2.lastDeath) g2.waveIndex = g2.waves.length;
      if (g2.state === 'win') {
        // 胜利后再多跑 3 秒，确认不会冒出奖励卡
        for (let k = 0; k < 60 * 3; k++) g2.update(1 / 60);
        break;
      }
      g2.update(1 / 60);
    }
  }
  push(
    '无奖励关卡：停在胜利遮罩、不弹卡不进介绍页',
    g2.state === 'win' && g2.rewardPhase === 'none' && !g2.reward,
    `state=${g2.state} rewardPhase=${g2.rewardPhase} reward=${g2.reward ? '有' : '无'}`,
  );
  // 遮罩上的「返回选关」要能点（命中区与绘制共用 exitToLevelsButton）
  let exit2 = 0;
  g2.onExit = () => {
    exit2++;
  };
  const eb = exitToLevelsButton();
  g2.onPointerDown({ x: eb.x + eb.w / 2, y: eb.y + eb.h / 2 });
  push('胜利遮罩「返回选关」可点', exit2 === 1, `调用 ${exit2} 次`);

  // 出怪节奏：验证 delay 的计时基准 = "上一波刷完"(不是"上一波开始")。
  // 取每关第 2 波：它的首只奶蛙应与第 1 波末只奶蛙相隔 delay 秒。
  {
    for (const level of LEVELS.filter((l) => l.kind !== 'egg-invasion')) {
      const gp = readyBattle(assets, level);
      const spawns: number[] = [];
      const orig = gp.spawnAttacker.bind(gp);
      gp.spawnAttacker = (row: number): void => {
        spawns.push(gp.time);
        orig(row);
      };
      const w1Count = level.waves[0].count;
      const w2Delay = level.waves[1].delay;
      for (let i = 0; i < 60 * 120; i++) {
        gp.update(1 / 60);
        // 单独隔离波次时间表；存活怪交叠由 campaignChecks 覆盖。
        if (gp.spawnQueue === 0) gp.attackers.length = 0;
        if (spawns.length > w1Count) break;
      }
      const lastOfW1 = spawns[w1Count - 1];
      const firstOfW2 = spawns[w1Count];
      const gap = firstOfW2 - lastOfW1;
      push(
        `第 ${level.id} 关 delay 从"上一波刷完"计时`,
        Math.abs(gap - w2Delay) < 0.1,
        `第1波末只 ${lastOfW1.toFixed(1)}s → 第2波首只 ${firstOfW2.toFixed(1)}s，间隔 ${gap.toFixed(1)}s（配置 delay=${w2Delay}）`,
      );
      const waveGap = level.waves[1].delay - level.waves[0].delay;
      void waveGap;
    }
  }

  // Real damage entry point: lethal hits play once, repeated hits and chickens stay silent.
  {
    const battle = readyBattle(assets, { ...LEVELS[0], rows: [0, 1, 2, 3, 4] });
    const originalDeath = sfx.frogDeath;
    let calls = 0;
    sfx.frogDeath = () => {
      calls++;
    };
    try {
      battle.spawnAttacker(0, 'laugh_frog');
      const frog = battle.attackers[0];
      hurtAttacker(battle, frog, 1);
      push('奶蛙非致命受击不播放死亡音效', calls === 0);
      hurtAttacker(battle, frog, 9999);
      push('奶蛙进入死亡动画时播放安迪音效', calls === 1 && frog.state === 'dying');
      hurtAttacker(battle, frog, 9999);
      push('同一只奶蛙的死亡音效只触发一次', calls === 1);
      battle.spawnAttacker(1, 'naiji');
      hurtAttacker(battle, battle.attackers[1], 9999);
      push('奶鸡死亡不播放奶蛙音效', calls === 1 && battle.attackers[1].dead);
    } finally {
      sfx.frogDeath = originalDeath;
    }

    battle.pauseOpen = true;
    const vs = volumeSliderRect();
    const originalVolume = sfx.getVolume();
    battle.onPointerDown({ x: vs.x, y: vs.y });
    push('重绘音量条左端可静音', sfx.getVolume() === 0);
    battle.onPointerMove({ x: vs.x + vs.w, y: vs.y });
    battle.onPointerUp();
    push('重绘音量条拖至右端为满音量', sfx.getVolume() === 1);
    sfx.setVolume(originalVolume);
    const { cont, quit } = pauseButtonsRect();
    battle.onPointerDown({ x: cont.x + cont.w / 2, y: cont.y + cont.h / 2 });
    push('重绘继续按钮解除暂停', !battle.pauseOpen);
    battle.pauseOpen = true;
    let exited = false;
    battle.onExit = () => {
      exited = true;
    };
    battle.onPointerDown({ x: quit.x + quit.w / 2, y: quit.y + quit.h / 2 });
    push('重绘退出本关按钮返回模式页面', exited);
    const menu = menuButtonRect(),
      clip = shovelButtonRect();
    push('菜单与夹子点击范围没有重叠', clip.x + clip.w < menu.x || menu.y + menu.h < clip.y);
  }
  return out;
}
