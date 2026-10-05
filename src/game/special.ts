import { drawFrame } from '../core/anim';
import { sfx } from '../core/sfx';
import { GRID } from './config';
import { EGG_CHART, EGG_RHYTHM, eggRhythmPhase } from './eggrhythm';
import type { Game } from './game';
import { rowFootY } from './grid';
import { DEFENDERS } from './units';
import { drawUnitTooltip, menuButtonRect } from './ui';

export interface RollingEgg {
  x: number;
  y: number;
  age: number;
  height: number;
  frequency: number;
  phase: number;
  angle: number;
  speed: number;
  shattered: boolean;
  shatterT: number;
  targetAt: number;
  number: number;
}
export interface EggInvasion {
  spawned: number;
  broken: number;
  missed: number;
  total: number;
  timer: number;
  eggs: RollingEgg[];
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  score: number;
  feedback: { x: number; y: number; label: string; at: number }[];
}
export interface BeltCard {
  token: number;
  id: string;
  x: number;
}
export interface Conveyor {
  cards: BeltCard[];
  timer: number;
  sequence: number;
  nextToken: number;
  selected: number | null;
  credits: number;
}

export const BELT = {
  x: 232,
  y: 50,
  w: 1090,
  h: 138,
  cardW: 78,
  cardH: 114,
  pitch: 96,
  capacity: 8,
  interval: 4.6,
};
export const EGG_ZONE = { left: GRID.colX[2], right: GRID.colX[3] };
export function inEggZone(x: number): boolean {
  return x >= EGG_ZONE.left && x < EGG_ZONE.right;
}
// 固定循环保障持续火力，特殊单位穿插；不会因为连续抽到辅助卡而无解。
const DELIVERY = [
  'douxian_shooter',
  'tangbao_doubao',
  'douxian_shooter',
  'yizhen_doubao',
  'zhaxin_doubao',
  'luanhui_doubao',
  'kaimen_doubao',
  'douxian_shooter',
  'moyu_doubao',
  'buraowan_doubao',
  'yizhen_doubao',
  'fudu_doubao',
  'hemian_doubao',
  'luanhui_doubao',
];

export function newConveyor(): Conveyor {
  const belt: Conveyor = {
    cards: [],
    timer: BELT.interval,
    sequence: 0,
    nextToken: 0,
    selected: null,
    credits: 0,
  };
  for (let i = 0; i < 3; i++) deliverCard(belt, BELT.x + 22 + i * BELT.pitch);
  return belt;
}
function deliverCard(belt: Conveyor, x: number): void {
  belt.cards.push({
    token: belt.nextToken++,
    id: DELIVERY[belt.sequence++ % DELIVERY.length],
    x,
  });
}
export function updateConveyor(game: Game, dt: number): void {
  const belt = game.conveyor!;
  // 和面豆包、糖包产出的补给在传送带关换成加送卡；队列满时保留补给。
  for (const dough of game.doughs) {
    if (!dough.dead && !dough.counts) {
      dough.dead = true;
      belt.credits++;
    }
  }
  for (let i = 0; i < belt.cards.length; i++) {
    const stop = i === 0 ? BELT.x + 22 : belt.cards[i - 1].x + BELT.pitch;
    belt.cards[i].x = Math.max(stop, belt.cards[i].x - 145 * dt);
  }
  if (belt.cards.length >= BELT.capacity) return;
  belt.timer -= dt;
  const tail = belt.cards.at(-1);
  if ((belt.timer <= 0 || belt.credits > 0) && (!tail || tail.x <= BELT.x + BELT.w - BELT.pitch * 2)) {
    deliverCard(belt, BELT.x + BELT.w - BELT.pitch);
    if (belt.credits > 0) belt.credits--;
    belt.timer = BELT.interval;
  }
}
export function beltCardAt(game: Game, p: { x: number; y: number }): BeltCard | undefined {
  return game.conveyor?.cards.find((c) => p.x >= c.x && p.x <= c.x + BELT.cardW && p.y >= BELT.y + 12 && p.y <= BELT.y + 12 + BELT.cardH);
}

export function eggCenter(egg: RollingEgg): { x: number; y: number } {
  return {
    x: egg.x,
    y: egg.y - 60 - Math.abs(Math.sin(egg.age * egg.frequency + egg.phase)) * egg.height,
  };
}
export function hitInvasionEgg(game: Game, p: { x: number; y: number }): boolean {
  const invasion = game.invasion!;
  if (!inEggZone(p.x)) return false;
  const candidates = invasion.eggs.slice().sort((a, b) => Math.abs(game.time - a.targetAt) - Math.abs(game.time - b.targetAt));
  for (const egg of candidates) {
    if (egg.shattered) continue;
    const center = eggCenter(egg);
    const error = Math.abs(game.time - egg.targetAt);
    if (!inEggZone(center.x) || error > EGG_RHYTHM.hitWindow) continue;
    const dx = p.x - center.x,
      dy = p.y - center.y;
    if (dx * dx + dy * dy > EGG_RHYTHM.radius ** 2) continue;
    egg.shattered = true;
    egg.shatterT = 0;
    egg.y = center.y + 60;
    egg.height = 0;
    invasion.broken++;
    invasion.combo++;
    invasion.maxCombo = Math.max(invasion.maxCombo, invasion.combo);
    const perfect = error <= EGG_RHYTHM.perfectWindow;
    if (perfect) invasion.perfect++;
    else invasion.good++;
    invasion.score += (perfect ? 300 : 100) * (1 + Math.min(4, Math.floor(invasion.combo / 20)));
    invasion.feedback.push({ x: center.x, y: center.y, label: perfect ? '精准' : '命中', at: game.time });
    game.lastDeath = { x: center.x, y: center.y + 60, at: game.time };
    sfx.shoot();
    return true;
  }
  return false;
}
export function updateInvasion(game: Game, dt: number): void {
  const invasion = game.invasion!;
  for (const egg of invasion.eggs) {
    if (egg.shattered) {
      egg.shatterT += dt;
      continue;
    }
    egg.age += dt;
    const distance = egg.speed * dt;
    egg.x -= distance;
    egg.angle -= distance / 54;
  }
  // 依绝对到达时间生成，掉帧不会吞拍或把整段谱面拖慢。
  while (invasion.spawned < invasion.total && EGG_CHART[invasion.spawned].spawnAt <= game.time) {
    const note = EGG_CHART[invasion.spawned];
    const age = game.time - note.spawnAt;
    invasion.eggs.push({
      x: EGG_RHYTHM.startX - note.speed * age,
      y: rowFootY(note.row),
      age,
      height: note.height,
      frequency: note.frequency,
      phase: note.phase,
      angle: (-note.speed * age) / 54,
      speed: note.speed,
      shattered: false,
      shatterT: 0,
      targetAt: note.at,
      number: invasion.spawned + 1,
    });
    invasion.spawned++;
  }
  invasion.timer = invasion.spawned < invasion.total ? EGG_CHART[invasion.spawned].spawnAt - game.time : 0;
  for (const egg of invasion.eggs) {
    if (!egg.shattered && game.time - egg.targetAt > EGG_RHYTHM.hitWindow) {
      const center = eggCenter(egg);
      egg.shattered = true;
      egg.shatterT = 1;
      invasion.missed++;
      invasion.combo = 0;
      invasion.feedback.push({ x: center.x, y: center.y, label: '漏蛋', at: game.time });
    }
  }
  invasion.eggs = invasion.eggs.filter((e) => !e.shattered || e.shatterT < 0.85);
  invasion.feedback = invasion.feedback.filter((f) => game.time - f.at < 0.65);
  game.progressShown = Math.min(1, game.time / EGG_RHYTHM.duration);
  if (invasion.missed >= EGG_RHYTHM.missLimit) game.state = 'lose';
  else if (game.time >= EGG_RHYTHM.duration && invasion.spawned === invasion.total && invasion.eggs.length === 0) game.state = 'win';
}

export function drawInvasion(ctx: CanvasRenderingContext2D, game: Game): void {
  drawEggZone(ctx);
  for (const egg of game.invasion!.eggs) {
    const center = eggCenter(egg);
    ctx.save();
    if (!egg.shattered) {
      ctx.fillStyle = 'rgba(20,30,20,.22)';
      ctx.beginPath();
      ctx.ellipse(egg.x, egg.y + 2, 42, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(center.x, center.y);
      ctx.rotate(egg.angle);
      drawFrame(game.assets, ctx, 'nai_egg', 'walk', 0, 0, 60, 120, true);
    } else {
      ctx.globalAlpha = Math.min(1, (0.85 - egg.shatterT) * 5);
      drawFrame(game.assets, ctx, 'nai_egg', 'death', Math.min(3, Math.floor(egg.shatterT * 5)), egg.x, egg.y, 120, true);
    }
    ctx.restore();
    if (!egg.shattered) drawEggTarget(ctx, game, egg);
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 25px "Microsoft YaHei",sans-serif';
  for (const f of game.invasion!.feedback) {
    const age = game.time - f.at;
    ctx.globalAlpha = 1 - age / 0.65;
    ctx.fillStyle = f.label === '漏蛋' ? '#ff645c' : '#fff4a3';
    ctx.strokeStyle = '#422913';
    ctx.lineWidth = 4;
    ctx.strokeText(f.label, f.x, f.y - 35 - age * 55);
    ctx.fillText(f.label, f.x, f.y - 35 - age * 55);
  }
  ctx.restore();
}

function drawEggTarget(ctx: CanvasRenderingContext2D, game: Game, egg: RollingEgg): void {
  const until = egg.targetAt - game.time;
  if (until > 0.85) return;
  const center = eggCenter(egg);
  const ready = Math.abs(until) <= EGG_RHYTHM.hitWindow && inEggZone(center.x);
  ctx.save();
  ctx.strokeStyle = ready ? '#fff4a3' : '#fdf3d8';
  ctx.fillStyle = ready ? 'rgba(255,213,74,.35)' : 'rgba(50,31,22,.35)';
  ctx.lineWidth = ready ? 4 : 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, EGG_RHYTHM.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (until > 0) {
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(center.x, center.y, EGG_RHYTHM.radius + Math.min(1, until / 0.85) * 58, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 23px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(String(((egg.number - 1) % 8) + 1), center.x, center.y);
  ctx.restore();
}

function drawEggZone(ctx: CanvasRenderingContext2D): void {
  const top = GRID.rowY[0],
    bottom = GRID.rowY[GRID.rows];
  ctx.save();
  ctx.fillStyle = 'rgba(255,213,74,.17)';
  ctx.fillRect(EGG_ZONE.left, top, EGG_ZONE.right - EGG_ZONE.left, bottom - top);
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 9]);
  ctx.strokeRect(EGG_ZONE.left + 2, top, EGG_ZONE.right - EGG_ZONE.left - 4, bottom - top);
  ctx.setLineDash([]);
  ctx.fillStyle = '#5b2d12';
  ctx.font = 'bold 24px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('3', (EGG_ZONE.left + EGG_ZONE.right) / 2, bottom + 28);
  ctx.restore();
}

export function drawSpecialHud(ctx: CanvasRenderingContext2D, game: Game): void {
  ctx.save();
  if (game.invasion) {
    ctx.fillStyle = '#fdf3d8';
    ctx.strokeStyle = '#8a5a28';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(245, 60, 430, 140, 12);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 24px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#5b2d12';
    ctx.textAlign = 'left';
    ctx.fillText(`打碎 ${game.invasion.broken} / ${game.invasion.total}`, 268, 96);
    ctx.font = '20px "Microsoft YaHei",sans-serif';
    ctx.fillText(`漏蛋 ${game.invasion.missed} / 5   连击 ${game.invasion.combo}`, 268, 128);
    ctx.fillText(`最高 ${game.invasion.maxCombo}   得分 ${game.invasion.score}`, 268, 156);
    ctx.fillText(`精准 ${game.invasion.perfect}   命中 ${game.invasion.good}`, 268, 184);
    const left = Math.max(0, Math.ceil(EGG_RHYTHM.duration - game.time));
    ctx.font = 'bold 28px "Microsoft YaHei",sans-serif';
    ctx.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}  ·  ${eggRhythmPhase(game.time)}`, 745, 104);
    const mb = menuButtonRect();
    ctx.drawImage(game.assets.ui.menu, mb.x, mb.y, mb.w, mb.h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#fdf3d8';
  ctx.strokeStyle = '#8a5a28';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(232, 12, 1088, 34, 10);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 21px "Microsoft YaHei",sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5b2d12';
  ctx.fillText('开门，送豆包啦   ·   点卡再种，免费送到家   ·   和面与糖包会加送卡', 255, 30);
  ctx.beginPath();
  ctx.roundRect(BELT.x, BELT.y, BELT.w, BELT.h, 18);
  ctx.fillStyle = '#684a31';
  ctx.fill();
  ctx.strokeStyle = '#c89d54';
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(BELT.x + 6, BELT.y + 6, BELT.w - 12, BELT.h - 12);
  ctx.clip();
  ctx.strokeStyle = '#8b6b43';
  ctx.lineWidth = 3;
  for (let x = BELT.x - ((game.time * 145) % 44); x < BELT.x + BELT.w; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, BELT.y);
    ctx.lineTo(x - 35, BELT.y + BELT.h);
    ctx.stroke();
  }
  for (const c of game.conveyor!.cards) {
    const art = game.assets.card(c.id, 0);
    if (art) ctx.drawImage(art, c.x, BELT.y + 12, BELT.cardW, BELT.cardH);
    if (game.conveyor!.selected === c.token) {
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 4;
      ctx.strokeRect(c.x - 2, BELT.y + 10, BELT.cardW + 4, BELT.cardH + 4);
    }
  }
  ctx.restore();
  const hover = beltCardAt(game, game.mouse);
  if (hover) {
    const def = DEFENDERS.find((d) => d.id === hover.id)!;
    drawUnitTooltip(ctx, def.name, def.effect, hover.x - 12, 175);
  }
  const mb = menuButtonRect();
  ctx.drawImage(game.assets.ui.menu, mb.x, mb.y, mb.w, mb.h);
  ctx.restore();
}
