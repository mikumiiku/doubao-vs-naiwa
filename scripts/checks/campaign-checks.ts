import type { Assets } from '../../src/core/assets';
import { Game } from '../../src/game/game';
import { CAMPAIGN_CARDS, ENEMY_ORDER, LEVELS, RESOURCE, levelKind } from '../../src/game/config';
import { Attacker, Defender, Projectile } from '../../src/game/entities';
import { cellCenterX, rowFootY } from '../../src/game/grid';
import { ATTACKERS, DEFENDERS } from '../../src/game/units';
import { hurtDefender, updateAttackers, updateDefenders, updateProjectiles, updateWaves } from '../../src/game/systems';
import { BELT, EGG_ZONE, eggCenter, inEggZone } from '../../src/game/special';
import { EGG_STORY } from '../../src/game/eggstory';
import { EGG_CHART, EGG_RHYTHM } from '../../src/game/eggrhythm';
import { loadBattleSave, restoreBattle, saveBattle } from '../../src/game/save';
import type { CheckResult } from './reward-flow-entry';

export function campaignChecks(assets: Assets): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (name: string, ok: boolean) => out.push({ name, ok });
  const plant = (g: Game, id: string, row = 2, col = 2) => {
    const d = new Defender(
      DEFENDERS.find((u) => u.id === id)!,
      col,
      row,
      cellCenterX(col),
      rowFootY(row),
      assets,
    );
    g.defenders.push(d);
    g.occupied[row][col] = d;
    return d;
  };
  const enemy = (g: Game, row = 2, x = 640, id = 'ordinary_frog') => {
    const a = new Attacker(ATTACKERS[id], row, x, rowFootY(row), assets);
    a.speedMul = 1;
    g.attackers.push(a);
    return a;
  };
  check(
    '每关恰好增加一张豆包，奖励接到下一关',
    LEVELS.every(
      (l, i) => l.cards.length === i + 1 && l.cards[i] === CAMPAIGN_CARDS[i] && (i === 9 || l.unlocks?.[0] === LEVELS[i + 1].cards[i + 1]),
    ),
  );
  check(
    '五种奶蛙严格按1、3、5、7、9关引入',
    ENEMY_ORDER.every((id, i) => LEVELS[i * 2].newEnemy === id) &&
      LEVELS.every((l) => l.waves.every((w) => w.pool?.every((p) => ENEMY_ORDER.indexOf(p.type) * 2 + 1 <= l.id))),
  );
  check(
    '第5关只刷奶蛋且孵化奶蛋从第7关进入草坪',
    LEVELS[4].waves.every((w) => w.pool?.every((p) => p.type === 'nai_egg')) &&
      !LEVELS[5].waves.some((w) => w.pool?.some((p) => p.type === 'nai_egg')),
  );
  check(
    '5/15/25小游戏与10/20/30传送带分类',
    [5, 15, 25].every((id) => levelKind(id) === 'egg-invasion') && [10, 20, 30].every((id) => levelKind(id) === 'conveyor'),
  );
  const battles = LEVELS.filter((l) => l.kind !== 'egg-invasion');
  check(
    '总出怪数平缓增加，波内间隔逐渐缩短',
    battles.every((l, i) => i === 0 || l.waves.reduce((n, w) => n + w.count, 0) > battles[i - 1].waves.reduce((n, w) => n + w.count, 0)) &&
      battles.every((l, i) => i === 0 || l.waves[0].interval <= battles[i - 1].waves[0].interval),
  );
  check('面团降为每12秒一团', RESOURCE.doughInterval === 12);
  {
    const g = new Game(assets, {
      ...LEVELS[0],
      waves: [
        { count: 1, interval: 1, delay: 0 },
        { count: 1, interval: 1, delay: 4 },
      ],
    });
    g.firstFrogAt = 0;
    for (let i = 0; i < 6 * 120; i++) {
      g.time += 1 / 120;
      updateWaves(g, 1 / 120);
    }
    check('上一波怪仍存活时下一波按时到来', g.attackers.length === 2 && g.waveIndex >= 1);
    check('刷完所有波次仍须清掉存活怪才胜利', g.state === 'playing');
  }
  {
    const g = new Game(assets, LEVELS[3]),
      d = plant(g, 'tangbao_doubao');
    hurtDefender(g, d, 239);
    check('糖包未到掉糖阈值不会产出', g.doughs.length === 0);
    hurtDefender(g, d, 500);
    check('糖包累计伤害跨阈值最多掉三团', g.doughs.length === 3 && d.candyDrops === 3);
    hurtDefender(g, d, 300);
    check('糖包掉糖有上限', g.doughs.length === 3);
    saveBattle(g);
    const r = restoreBattle(assets, loadBattleSave()!);
    check('糖包掉糖次数存档保留', r.defenders[0].candyDrops === 3);
  }
  {
    const g = new Game(assets, LEVELS[5]);
    const victims = [enemy(g, 2, 600), enemy(g, 2, 650), enemy(g, 2, 700), enemy(g, 2, 750)];
    const p = new Projectile(2, 550, 600, 600, 32);
    p.remainingHits = 3;
    g.projectiles.push(p);
    updateProjectiles(g, 0.4);
    check(
      '一针连续碰撞穿过三只且不伤第四只',
      victims.slice(0, 3).every((a) => a.hp === a.def.hp - 32) && victims[3].hp === victims[3].def.hp && p.dead,
    );
    const g2 = new Game(assets, LEVELS[5]),
      a = enemy(g2, 2, 600),
      p2 = new Projectile(2, 590, 600, 20, 32);
    p2.remainingHits = 3;
    g2.projectiles.push(p2);
    updateProjectiles(g2, 0.1);
    saveBattle(g2);
    const restored = restoreBattle(assets, loadBattleSave()!);
    updateProjectiles(restored, 0.1);
    check('穿透弹存档不重复打同一只', restored.attackers[0].hp === a.hp && restored.projectiles[0].remainingHits === 2);
  }
  {
    const g = new Game(assets, LEVELS[5]),
      d = plant(g, 'zhaxin_doubao');
    const a = enemy(g, 1, d.x + 80),
      b = enemy(g, 3, d.x + 80),
      far = enemy(g, 4, d.x + 80);
    updateDefenders(g, 1.2);
    check('扎心爆破有完整前摇', a.hp === a.def.hp);
    updateDefenders(g, 0.06);
    check(
      '扎心伤害邻近三行并释放自己格子',
      a.state === 'dying' && b.state === 'dying' && far.hp === far.def.hp && g.occupied[2][2] === null,
    );
  }
  {
    const g = new Game(assets, LEVELS[6]),
      d = plant(g, 'douxian_shooter');
    enemy(g, 2, 900);
    plant(g, 'fudu_doubao', 1, 2);
    updateDefenders(g, 0.1);
    check('复读加快邻近射击动画', Math.abs(d.anim.t - 0.135) < 1e-8);
    plant(g, 'fudu_doubao', 3, 2);
    updateDefenders(g, 0.1);
    check('复读效果不叠加', Math.abs(d.anim.t - 0.27) < 1e-8);
  }
  {
    const g = new Game(assets, LEVELS[7]),
      d = plant(g, 'moyu_doubao');
    const a = enemy(g, 1, d.x + 100),
      b = enemy(g, 3, d.x + 100);
    updateDefenders(g, 0.9);
    updateDefenders(g, 0.01);
    check('摸鱼覆盖上下邻行', a.slowTimer > 0 && b.slowTimer > 0 && a.hp < a.def.hp);
    const g2 = new Game(assets, LEVELS[8]);
    plant(g2, 'luanhui_doubao');
    enemy(g2, 1, 900);
    updateDefenders(g2, 0.9);
    updateDefenders(g2, 0.01);
    check('已读乱回在邻行有怪时向三行开火', g2.projectiles.map((p) => p.row).join(',') === '1,2,3');
  }
  {
    const g = new Game(assets, LEVELS[9]),
      d = plant(g, 'kaimen_doubao');
    const a = enemy(g, 2, d.x + 70),
      b = enemy(g, 2, d.x + 100);
    updateDefenders(g, 0.9);
    updateDefenders(g, 0.01);
    check('木门群体伤害和低跳击退', !!a.hop && !!b.hop && a.hp === a.def.hp - 65 && b.hp === b.def.hp - 65);
    const g2 = new Game(assets, LEVELS[8]),
      shout = enemy(g2, 2, 800, 'hoola_frog'),
      ally = enemy(g2, 1, 810),
      far = enemy(g2, 4, 810);
    updateAttackers(g2, 1.1);
    check('吼啦只加速附近同伴', ally.rallyBuff > 0 && far.rallyBuff === 0 && shout.rallyFx > 0);
  }
  {
    const g = new Game(assets, LEVELS[4]);
    g.update(8);
    check('开场对话冻结计时与奶蛋出场', g.time === 0 && g.invasion!.eggs.length === 0 && g.eggDialogue === 0);
    g.advanceEggDialogue();
    saveBattle(g);
    const introRestore = restoreBattle(assets, loadBattleSave()!);
    check('对话中存档保留页码且续战暂停', introRestore.eggDialogue === 1 && introRestore.pauseOpen);
    g.advanceEggDialogue(true);
    check('上一句回到第一页', g.eggDialogue === 0);
    for (const _page of EGG_STORY) g.advanceEggDialogue();
    g.update(3.01);
    const egg = g.invasion!.eggs[0],
      p = eggCenter(egg);
    check('第一只奶蛋速度从424.5起步', egg.speed === 424.5);
    const previousX = egg.x;
    g.update(0.01);
    check('加速保持连续滚动', Math.abs(previousX - egg.x - 4.245) < 1e-8);
    const score = g.invasion!.broken;
    egg.x = EGG_ZONE.right + 45;
    g.onPointerDown(eggCenter(egg));
    check('第三列外点击奶蛋本体无效', !egg.shattered && g.invasion!.broken === score);
    egg.x = EGG_ZONE.right + 10;
    g.onPointerDown({ x: EGG_ZONE.right - 5, y: eggCenter(egg).y });
    check('鼠标在第三列不能提前击碎列外奶蛋', !egg.shattered);
    egg.x = (EGG_ZONE.left + EGG_ZONE.right) / 2;
    const targetAt = egg.targetAt;
    egg.targetAt = g.time + EGG_RHYTHM.hitWindow + 0.001;
    g.onPointerDown(eggCenter(egg));
    check('第三列内点中心但过早不能击碎', !egg.shattered);
    egg.targetAt = targetAt;
    g.onPointerDown({ x: egg.x + EGG_RHYTHM.radius + 1, y: eggCenter(egg).y });
    check('大蛋外壳不再属于小圆圈命中区', !egg.shattered);
    g.onPointerDown({ x: p.x, y: egg.y + 110 });
    check('点击奶蛋影子不能打碎空中奶蛋', g.invasion!.broken === score);
    g.onPointerDown({ x: egg.x, y: egg.y + 110 });
    check('第三列内点影子也不能打碎空中奶蛋', !egg.shattered);
    egg.x = EGG_ZONE.left + 5;
    g.onPointerDown({ x: EGG_ZONE.left - 1, y: eggCenter(egg).y });
    check('蛋已进框但鼠标出框不能击碎', !egg.shattered);
    g.onPointerDown(eggCenter(egg));
    g.onPointerDown(eggCenter(egg));
    check('实际跳动位置单击打碎且不重复计分', g.invasion!.broken === 1 && egg.shattered);
    check('准时命中增加精准、连击与得分', g.invasion!.perfect === 1 && g.invasion!.combo === 1 && g.invasion!.score === 300);
    check('第三列左边界包含、右边界不包含', inEggZone(EGG_ZONE.left) && !inEggZone(EGG_ZONE.right));
    const time = g.time;
    g.pauseOpen = true;
    g.update(5);
    check('小游戏暂停冻结计时', g.time === time);
    g.pauseOpen = false;
    saveBattle(g);
    const r = restoreBattle(assets, loadBattleSave()!);
    check(
      '小游戏存档保留分数、弹跳、碎壳且不重播对话',
      r.invasion!.broken === 1 && r.invasion!.eggs[0].shattered && r.pauseOpen && r.eggDialogue === null,
    );
    r.pauseOpen = false;
    r.eggDialogue = 0;
    const frozenX = r.invasion!.eggs[0].x,
      frozenT = r.time;
    r.update(3);
    check('重看对话冻结已有奶蛋与关卡时间', r.invasion!.eggs[0].x === frozenX && r.time === frozenT);
    const legacy = loadBattleSave()!;
    delete legacy.eggRulesVersion;
    const oldSpeed = legacy.invasion!.eggs[0].speed;
    const migrated = restoreBattle(assets, legacy);
    check(
      '旧短版小游戏存档从三分钟谱面重新进入',
      migrated.eggDialogue === 0 && migrated.time === 0 && migrated.pauseOpen && migrated.invasion!.total === EGG_CHART.length,
    );
    const migratedAgain = restoreBattle(assets, legacy);
    check(
      '恢复旧档不会修改原档或恢复旧规则横幅',
      migratedAgain.invasion!.eggs.length === 0 && migratedAgain.banner === '' && legacy.invasion!.eggs[0].speed === oldSpeed,
    );
    const win = new Game(assets, LEVELS[4]);
    for (const _page of EGG_STORY) win.advanceEggDialogue();
    for (let i = 0; i < 181 * 60 && win.state === 'playing'; i++) {
      win.update(1 / 60);
      for (const egg of win.invasion!.eggs)
        if (!egg.shattered && inEggZone(egg.x) && Math.abs(win.time - egg.targetAt) <= EGG_RHYTHM.perfectWindow)
          win.onPointerDown(eggCenter(egg));
    }
    check(
      '三分钟完整谱面逐只瞄准准时击碎后正常胜利',
      win.state === 'win' &&
        win.invasion!.broken === EGG_CHART.length &&
        win.attackers.length === 0 &&
        win.defenders.length === 0 &&
        Math.abs(win.time - 180) < 0.02,
    );
    check(
      '完美模拟全连且所有判定精准',
      win.invasion!.maxCombo === EGG_CHART.length && win.invasion!.perfect === EGG_CHART.length && win.invasion!.missed === 0,
    );
    win.update(1.3);
    check('小游戏胜利仍有奖励卡', win.rewardPhase === 'reward' && win.reward?.def.id === 'zhaxin_doubao');
    const lose = new Game(assets, LEVELS[4]);
    for (const _page of EGG_STORY) lose.advanceEggDialogue();
    for (let i = 0; i < 60 * 60 && lose.state === 'playing'; i++) lose.update(1 / 60);
    check('奶蛋入侵漏五只进入失败', lose.state === 'lose' && lose.invasion!.missed === 5);
    const timing = new Game(assets, LEVELS[4]);
    for (const _page of EGG_STORY) timing.advanceEggDialogue();
    timing.update(3.07);
    const hit = timing.invasion!.eggs[0];
    timing.onPointerMove(eggCenter(hit));
    check('Z键可在命中窗内击碎，偏拍记普通命中', timing.onRhythmKey('Z') && timing.invasion!.good === 1 && timing.invasion!.perfect === 0);
    check('按住连发与无关键不能触发', !timing.onRhythmKey('x', true) && !timing.onRhythmKey('a'));
    timing.update(0.6);
    check('错过下一拍马上记漏蛋并断连击', timing.invasion!.missed === 1 && timing.invasion!.combo === 0);
    timing.pauseOpen = true;
    check('暂停阻止节奏键输入', !timing.onRhythmKey('x'));
    saveBattle(timing);
    const timingRestore = restoreBattle(assets, loadBattleSave()!);
    check(
      '三分钟谱面存档保留判定、连击、分数及位置',
      timingRestore.invasion!.score === 100 &&
        timingRestore.invasion!.good === 1 &&
        timingRestore.invasion!.missed === 1 &&
        timingRestore.time === timing.time,
    );
    check('谱面超过600蛋且全部落在三分钟内', EGG_CHART.length > 600 && EGG_CHART.every((n) => n.at > 0 && n.at < 180));
    check(
      '谱面生成和到达时刻严格递增，不出现同帧双蛋必点',
      EGG_CHART.every((n, i) => i === 0 || (n.at > EGG_CHART[i - 1].at && n.spawnAt > EGG_CHART[i - 1].spawnAt)),
    );
    check(
      '终段保持200毫秒连打且速度不超过680',
      EGG_CHART.filter((n) => n.at > 126 && n.at < 175).every((n, i, a) => i === 0 || Math.abs(n.at - a[i - 1].at - 0.2) < 1e-8) &&
        EGG_CHART.every((n) => n.speed <= 680),
    );
    check(
      '到达中心的180毫秒窗始终位于第三列内',
      EGG_CHART.every(
        (n) =>
          inEggZone(EGG_RHYTHM.targetX - n.speed * EGG_RHYTHM.hitWindow) && inEggZone(EGG_RHYTHM.targetX + n.speed * EGG_RHYTHM.hitWindow),
      ),
    );
  }
  {
    const g = new Game(assets, LEVELS[9]);
    g.dough = 0;
    const belt = g.conveyor!,
      c = belt.cards[0],
      n = belt.cards.length;
    g.onPointerDown({ x: c.x + 20, y: BELT.y + 40 });
    g.onPointerDown({ x: cellCenterX(0), y: rowFootY(0) - 40 });
    check(
      '传送带零面团可种且消耗一张实体卡',
      g.defenders.length === 1 && belt.cards.length === n - 1 && g.dough === 0 && g.cooldowns.size === 0,
    );
    const next = belt.cards[0];
    g.onPointerDown({ x: next.x + 20, y: BELT.y + 40 });
    g.onPointerDown({ x: cellCenterX(0), y: rowFootY(0) - 40 });
    check('传送带无效种植不吞卡', belt.cards.length === n - 1 && belt.selected === next.token);
    g.onCancel();
    check('取消种植保留卡且取消选中', belt.cards.length === n - 1 && belt.selected === null);
    for (let i = 0; i < 90 * 60; i++) {
      g.time += 1 / 60;
      const previous = g.firstFrogAt;
      g.firstFrogAt = Infinity;
      g.update(1 / 60);
      g.firstFrogAt = previous;
    }
    check('传送带满槽停止加送且没有空投面团', belt.cards.length === BELT.capacity && g.doughsThrown === 0);
    const tokens = belt.cards.map((c) => c.token);
    g.update(1);
    check('传送带满槽不丢未用卡', belt.cards.map((c) => c.token).join(',') === tokens.join(','));
    saveBattle(g);
    const r = restoreBattle(assets, loadBattleSave()!);
    check('传送带恢复卡序、供卡进度并暂停', r.conveyor!.cards.length === 8 && r.conveyor!.sequence === belt.sequence && r.pauseOpen);
  }
  return out;
}
