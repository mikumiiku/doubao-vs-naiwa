/**
 * 关内进度存档：像 PvZ 记住"打到哪一关"一样，这里额外记住"这一关打到哪一刻"。
 * 冒险模式入口读到匹配当前进度的存档就直接续战（单位/波次/面团/冷却原样恢复），
 * 否则开新局。通关/重开时清档。
 *
 * 只序列化 playing 状态的战场（胜负结算与奖励演出不存档）；
 * 推搡互锁(pushedBy/pushTarget)以数组下标引用，读档后按序重建。
 */
import { Anim } from '../core/anim';
import type { Assets } from '../core/assets';
import { LEVELS } from './config';
import { Attacker, Defender, DoughBall, Mower, Projectile } from './entities';
import { Game } from './game';
import { EGG_STORY } from './eggstory';
import { EGG_RHYTHM } from './eggrhythm';
import { ATTACKERS, DEFENDERS } from './units';

const KEY = 'dvn.battle';
const VERSION = 2;
const LEGACY_ATTACKER_HP: Record<string, number> = { laugh_frog: 260, naiji: 87 };

interface SavedAnim {
  name: string;
  loop: boolean;
  t: number;
  loops: number;
  finished: boolean;
}

interface SavedDefender {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
  hp: number;
  state: string;
  anim: SavedAnim;
  lastFireLoop: number;
  produceTimer: number;
  dieT: number;
  /** 对应 attackers 数组下标，-1 = 无 */
  pushTarget: number;
  pushLoop: number;
  abilityTimer?: number;
  candyDrops?: number;
}

interface SavedAttacker {
  id: string;
  row: number;
  x: number;
  y: number;
  hp: number;
  /** 保存时的血量上限，平衡更新后按剩余比例恢复；旧档没有此字段。 */
  maxHp?: number;
  state: string;
  anim: SavedAnim;
  biteTimer: number;
  broken: boolean;
  diedAt: number;
  speedMul: number;
  phaseOffset: number;
  /** 对应 defenders 数组下标，-1 = 无 */
  pushedBy: number;
  target?: number;
  hop?: Attacker['hop'];
  slowTimer?: number;
  slowFactor?: number;
  rollAngle?: number;
  vault?: Attacker['vault'];
  rallyTimer?: number;
  rallyBuff?: number;
  rallyFactor?: number;
  rallyFx?: number;
  fanProgress?: number;
  fanTimer?: number;
  fanCast?: boolean;
  slide?: Attacker['slide'];
}

export interface SavedBattle {
  v: number;
  levelId: number;
  savedAt: number;
  time: number;
  dough: number;
  doughTimer: number;
  doughsThrown: number;
  doughsResolved: number;
  firstFrogAt: number | null;
  mowers: { row: number; x: number; y: number; state: string; t: number }[];
  defenders: SavedDefender[];
  attackers: SavedAttacker[];
  projectiles: { row: number; x: number; y: number; vx: number; damage: number; remainingHits?: number; hit?: number[]; lightweight?: boolean; windWeakened?: boolean }[];
  fanWinds?: Game['fanWinds'];
  doughs: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    arc: number;
    ttl: number;
    t: number;
    landed: boolean;
    resolved: boolean;
    counts: boolean;
  }[];
  flyers: { x0: number; y0: number; t: number; dur: number; value: number }[];
  waveIndex: number;
  waveActive: boolean;
  waveTimer: number;
  waveStartedAt: number;
  spawnQueue: number;
  spawnTimer: number;
  banner: string;
  bannerT: number;
  progressShown: number;
  cooldowns: [string, number][];
  invasion?: Game['invasion'];
  eggDialogue?: Game['eggDialogue'];
  eggRulesVersion?: number;
  conveyor?: Game['conveyor'];
}

function animOf(a: Anim): SavedAnim {
  return { name: a.name, loop: a.loop, t: a.t, loops: a.loops, finished: a.finished };
}

function restoreAnim(assets: Assets, unit: string, s: SavedAnim): Anim {
  const name = unit === 'laugh_frog' && s.name.startsWith('attack') ? s.name.replace('attack', 'laugh') : s.name;
  const anim = new Anim(assets, unit, name, s.loop);
  anim.t = s.t;
  anim.loops = s.loops;
  anim.finished = s.finished;
  return anim;
}

/** 把当前战场序列化进 localStorage；非进行中（胜负/奖励演出）不写并返回 false */
export function saveBattle(game: Game): boolean {
  if (game.state !== 'playing' || game.rewardPhase !== 'none') return false;
  const s: SavedBattle = {
    v: VERSION,
    levelId: game.level.id,
    savedAt: Date.now(),
    time: game.time,
    dough: game.dough,
    doughTimer: game.doughTimer,
    doughsThrown: game.doughsThrown,
    doughsResolved: game.doughsResolved,
    firstFrogAt: game.firstFrogAt,
    mowers: game.mowers.map((m) => ({ row: m.row, x: m.x, y: m.y, state: m.state, t: m.t })),
    defenders: game.defenders.map((d) => ({
      id: d.def.id,
      col: d.col,
      row: d.row,
      x: d.x,
      y: d.y,
      hp: d.hp,
      state: d.state,
      anim: animOf(d.anim),
      lastFireLoop: d.lastFireLoop,
      produceTimer: d.produceTimer,
      dieT: d.dieT,
      pushTarget: d.pushTarget ? game.attackers.indexOf(d.pushTarget) : -1,
      pushLoop: d.pushLoop,
      abilityTimer: d.abilityTimer,
      candyDrops: d.candyDrops,
    })),
    attackers: game.attackers.map((a) => ({
      id: a.def.id,
      row: a.row,
      x: a.x,
      y: a.y,
      hp: a.hp,
      maxHp: a.def.hp,
      state: a.state,
      anim: animOf(a.anim),
      biteTimer: a.biteTimer,
      broken: a.broken,
      diedAt: a.diedAt,
      speedMul: a.speedMul,
      phaseOffset: a.phaseOffset,
      pushedBy: a.pushedBy ? game.defenders.indexOf(a.pushedBy) : -1,
      target: a.target ? game.defenders.indexOf(a.target) : -1,
      hop: a.hop ? { ...a.hop } : null,
      slowTimer: a.slowTimer,
      slowFactor: a.slowFactor,
      rollAngle: a.rollAngle,
      vault: a.vault ? { ...a.vault } : null,
      rallyTimer: a.rallyTimer,
      rallyBuff: a.rallyBuff,
      rallyFactor: a.rallyFactor,
      rallyFx: a.rallyFx,
      fanProgress: a.fanProgress,
      fanTimer: a.fanTimer,
      fanCast: a.fanCast,
      slide: a.slide ? { ...a.slide } : null,
    })),
    projectiles: game.projectiles.map((p) => ({
      row: p.row,
      x: p.x,
      y: p.y,
      vx: p.vx,
      damage: p.damage,
      remainingHits: p.remainingHits,
      lightweight: p.lightweight,
      windWeakened: p.windWeakened,
      hit: [...p.hit].map((a) => game.attackers.indexOf(a)).filter((i) => i >= 0),
    })),
    doughs: game.doughs.map((b) => ({
      x0: b.x0,
      y0: b.y0,
      x1: b.x1,
      y1: b.y1,
      arc: b.arc,
      ttl: b.ttl,
      t: b.t,
      landed: b.landed,
      resolved: b.resolved,
      counts: b.counts,
    })),
    flyers: game.flyers.map((f) => ({ x0: f.x0, y0: f.y0, t: f.t, dur: f.dur, value: f.value })),
    waveIndex: game.waveIndex,
    waveActive: game.waveActive,
    waveTimer: game.waveTimer,
    waveStartedAt: game.waveStartedAt,
    spawnQueue: game.spawnQueue,
    spawnTimer: game.spawnTimer,
    banner: game.banner,
    bannerT: game.bannerT,
    progressShown: game.progressShown,
    cooldowns: [...game.cooldowns.entries()],
    invasion: game.invasion,
    eggDialogue: game.eggDialogue,
    eggRulesVersion: EGG_RHYTHM.version,
    conveyor: game.conveyor,
    fanWinds: game.fanWinds.map((wind) => ({ ...wind })),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** 读档（结构与版本不符/关卡已不存在时返回 null） */
export function loadBattleSave(): SavedBattle | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedBattle;
    if (s.v !== VERSION && s.v !== 1) return null;
    if (!LEVELS.some((l) => l.id === s.levelId)) return null;
    if (!Array.isArray(s.defenders) || !Array.isArray(s.attackers)) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearBattleSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}

/** 是否存在可续战的关内存档（模式选择界面显示"继续战斗"用） */
export function hasContinuableBattle(): boolean {
  return loadBattleSave() !== null;
}

/** 从存档重建战场；关卡不匹配时回退到全新的一局 */
export function restoreBattle(assets: Assets, saved: SavedBattle): Game {
  const level = LEVELS.find((l) => l.id === saved.levelId);
  const game = new Game(assets, level ?? LEVELS[0]);
  // 续战需明确点继续，避免旧存档的敌人/冲锋小推车在进入时自行推进。
  game.pauseOpen = true;
  // 旧五关的波次与新章节不同：保留关卡进度，从这一关的新开局继续。
  if (saved.v < VERSION) return game;
  // 短版小游戏没有三分钟谱面，旧对局从新谱面起点进入，正式解锁进度照常保留。
  if (game.invasion && saved.eggRulesVersion !== EGG_RHYTHM.version) return game;
  if (saved.invasion) game.invasion = { ...saved.invasion, eggs: saved.invasion.eggs.map((egg) => ({ ...egg })) };
  if (game.invasion) {
    game.eggDialogue = saved.eggDialogue ?? null;
    if (game.eggDialogue !== null) game.eggDialogue = Math.max(0, Math.min(EGG_STORY.length - 1, Math.floor(game.eggDialogue)));
  }
  game.conveyor = saved.conveyor ?? game.conveyor;
  if (game.conveyor) game.conveyor.selected = null;

  game.time = saved.time;
  game.dough = saved.dough;
  game.doughTimer = saved.doughTimer;
  game.doughsThrown = saved.doughsThrown;
  game.doughsResolved = saved.doughsResolved;
  game.firstFrogAt = saved.firstFrogAt;

  game.mowers = saved.mowers.map((m) => {
    const mower = new Mower(m.row, m.x, m.y);
    mower.state = m.state as Mower['state'];
    mower.t = m.t;
    return mower;
  });

  const defenders: Defender[] = saved.defenders.map((sd) => {
    const def = DEFENDERS.find((d) => d.id === (sd.id === 'garlic_doubao' ? 'tangbao_doubao' : sd.id));
    if (!def) throw new Error(`存档引用未知防守单位 ${sd.id}`);
    const d = new Defender(def, sd.col, sd.row, sd.x, sd.y, assets);
    d.hp = sd.hp;
    d.state = sd.state as Defender['state'];
    d.anim = restoreAnim(assets, def.id, sd.anim);
    d.lastFireLoop = sd.lastFireLoop;
    d.produceTimer = sd.produceTimer;
    d.dieT = sd.dieT;
    d.pushLoop = sd.pushLoop;
    d.abilityTimer = sd.abilityTimer ?? 0;
    d.candyDrops = sd.candyDrops ?? 0;
    return d;
  });

  const attackers: Attacker[] = saved.attackers.map((sa) => {
    // 移除的旧怪种迁移为奶蛋，保持位置和剩余血量比例。
    const unit = sa.id === 'split_frog' ? 'nai_egg' : sa.id;
    const def = ATTACKERS[unit];
    if (!def) throw new Error(`存档引用未知进攻单位 ${sa.id}`);
    const a = new Attacker(def, sa.row, sa.x, sa.y, assets);
    const oldMaxHp = sa.maxHp ?? (sa.id === 'split_frog' ? 320 : LEGACY_ATTACKER_HP[sa.id]) ?? def.hp;
    a.hp = Math.min(def.hp, (sa.hp * def.hp) / oldMaxHp);
    a.state = sa.state as Attacker['state'];
    if (unit !== sa.id) {
      a.state = sa.state === 'dying' ? 'dying' : 'walk';
      a.anim = new Anim(assets, unit, a.state === 'dying' ? 'death' : 'walk', a.state !== 'dying');
    } else a.anim = restoreAnim(assets, unit, sa.anim);
    a.biteTimer = sa.biteTimer;
    a.broken = sa.broken;
    if (a.state === 'dying' && assets.meta(sa.id, 'death_b')?.frames) {
      a.broken = true;
      a.anim = restoreAnim(assets, sa.id, { ...sa.anim, name: 'death_b' });
    }
    a.diedAt = sa.diedAt;
    a.speedMul = sa.speedMul;
    a.phaseOffset = sa.phaseOffset;
    a.hop = sa.hop ? { ...sa.hop } : null;
    if (a.hop) {
      const k = a.hop.elapsed / a.hop.duration;
      a.hopOffset = -48 * k * (1 - k);
    }
    a.slowTimer = sa.slowTimer ?? 0;
    a.slowFactor = sa.slowFactor ?? 1;
    a.rollAngle = sa.rollAngle ?? 0;
    a.rallyTimer = sa.rallyTimer ?? 1;
    a.rallyBuff = sa.rallyBuff ?? 0;
    a.rallyFactor = sa.rallyFactor ?? 1;
    a.rallyFx = sa.rallyFx ?? 0;
    a.fanProgress = sa.fanProgress ?? 0;
    a.fanTimer = sa.fanTimer ?? 0;
    a.fanCast = sa.fanCast ?? false;
    a.slide = sa.slide ? { ...sa.slide } : null;
    a.vault = sa.vault ? { ...sa.vault } : null;
    if (a.vault) {
      const k = a.vault.elapsed / a.vault.duration;
      a.vaultOffset = -4 * a.vault.height * k * (1 - k);
    }
    a.target = defenders[sa.target ?? -1] ?? null;
    return a;
  });

  // 推搡互锁按下标重建
  saved.defenders.forEach((sd, i) => {
    if (sd.pushTarget >= 0) defenders[i].pushTarget = attackers[sd.pushTarget] ?? null;
  });
  saved.attackers.forEach((sa, i) => {
    if (sa.pushedBy >= 0) attackers[i].pushedBy = defenders[sa.pushedBy] ?? null;
  });

  game.defenders = defenders;
  game.attackers = attackers;
  game.projectiles = saved.projectiles.map((savedProjectile) => {
    const p = new Projectile(savedProjectile.row, savedProjectile.x, savedProjectile.y, savedProjectile.vx, savedProjectile.damage);
    p.remainingHits = savedProjectile.remainingHits ?? 1;
    p.lightweight = savedProjectile.lightweight ?? p.remainingHits === 1;
    p.windWeakened = savedProjectile.windWeakened ?? false;
    p.hit = new Set((savedProjectile.hit ?? []).map((i) => attackers[i]).filter(Boolean));
    return p;
  });
  game.doughs = saved.doughs.map((b) => {
    const ball = new DoughBall(b.x0, b.y0, b.x1, b.y1, b.arc, b.ttl, b.counts);
    ball.t = b.t;
    ball.landed = b.landed;
    ball.resolved = b.resolved;
    return ball;
  });
  game.flyers = saved.flyers.map((f) => ({ x0: f.x0, y0: f.y0, t: f.t, dur: f.dur, value: f.value }));

  // 占地表从防守单位重建（不绕弯豆包 occupiesCell=false 不占格）
  for (const d of defenders) {
    if (d.def.occupiesCell !== false && d.state !== 'dying') game.occupied[d.row][d.col] = d;
  }

  game.waveIndex = saved.waveIndex;
  game.waveActive = saved.waveActive;
  game.waveTimer = saved.waveTimer;
  game.waveStartedAt = saved.waveStartedAt;
  game.spawnQueue = saved.spawnQueue;
  game.spawnTimer = saved.spawnTimer;
  game.banner = game.invasion ? '' : saved.banner;
  game.bannerT = game.invasion ? 0 : saved.bannerT;
  game.progressShown = saved.progressShown;
  game.cooldowns = new Map(saved.cooldowns);
  game.fanWinds = (saved.fanWinds ?? []).map((wind) => ({ ...wind }));
  return game;
}
