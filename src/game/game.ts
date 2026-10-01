import { drawFrame } from '../core/anim';
import type { Assets } from '../core/assets';
import { sfx } from '../core/sfx';
import { DEBUG, DESIGN_H, DESIGN_W, GRID, HOME_LINE_X, MOWER, RESOURCE, SPAWN_X, type LevelDef } from './config';
import { Attacker, Defender, DoughBall, Mower, Projectile, doughPos } from './entities';
import { cellAt, cellCenterX, cellLeft, cellTop, cellW, cellH, rowFootY } from './grid';
import {
  cleanup,
  resolveThrownDough,
  updateAttackers,
  updateDefenders,
  updateDoughs,
  updateMowers,
  updateProjectiles,
  updateWaves,
  type BattleState,
} from './systems';
import { ATTACKERS, DEFENDERS, type DefenderDef } from './units';
import { cardAt, drawDough, drawHud, drawOverlay, drawMower, drawPause, exitToLevelsButton, menuButtonRect, PANEL_MEDALLION, pausePanelRect, restartButton, volumeSliderRect, DOUGH_PANEL } from './ui';

/** 被点击的面团飞向左上角计数框的动画 */
interface DoughFlyer {
  x0: number;
  y0: number;
  t: number;
  dur: number;
  value: number;
  dead?: boolean;
}

/** 面团飞向左上角计数牌 medallion 的落点（实测 medallion 中心） */
const FLY_TARGET = {
  x: DOUGH_PANEL.x + DOUGH_PANEL.h * 3 * PANEL_MEDALLION.cx,
  y: DOUGH_PANEL.y + DOUGH_PANEL.h * PANEL_MEDALLION.cy,
};

export class Game implements BattleState {
  time = 0;
  dough = RESOURCE.start;
  doughs: DoughBall[] = [];
  doughTimer = 0;
  doughsThrown = 0;
  doughsResolved = 0;
  firstFrogAt: number | null = null;
  mowers: Mower[] = [];
  defenders: Defender[] = [];
  attackers: Attacker[] = [];
  projectiles: Projectile[] = [];
  occupied: (Defender | null)[][];
  waveIndex = 0;
  waveActive = false;
  waveTimer = 0;
  waveStartedAt = 0;
  spawnQueue = 0;
  spawnTimer = 0;
  banner = '';
  bannerT = 0;
  state: 'playing' | 'win' | 'lose' = 'playing';
  waves: LevelDef['waves'];

  cooldowns = new Map<string, number>();
  placing: string | null = null;
  mouse = { x: -1, y: -1 };
  pauseOpen = false;
  volumeDragging = false;
  flyers: DoughFlyer[] = [];

  /** 退出本关（回选关界面），由 main.ts 注入 */
  onExit: (() => void) | null = null;
  /** 重新开始本关，由 main.ts 注入 */
  onRestart: (() => void) | null = null;
  /** 通关时回调（解锁下一关），由 main.ts 注入 */
  onWin: (() => void) | null = null;

  constructor(
    public assets: Assets,
    public level: LevelDef,
  ) {
    this.waves = level.waves;
    this.occupied = Array.from({ length: GRID.rows }, () => Array<Defender | null>(GRID.cols).fill(null));
    for (let r = 0; r < GRID.rows; r++) {
      this.mowers.push(new Mower(r, MOWER.restX, rowFootY(r)));
    }
  }

  spawnAttacker(row: number): void {
    const def = ATTACKERS.laugh_frog;
    const y = rowFootY(row);
    this.attackers.push(new Attacker(def, row, SPAWN_X + Math.random() * 24, y, this.assets));
  }

  onPointerDown(p: { x: number; y: number }): void {
    if (this.pauseOpen) {
      this.handlePauseClick(p);
      return;
    }
    if (this.state !== 'playing') {
      const b = restartButton();
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) this.onRestart?.();
      const e = exitToLevelsButton();
      if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) this.onExit?.();
      return;
    }
    // 右上角菜单按钮 → 暂停
    const mb = menuButtonRect();
    if (p.x >= mb.x && p.x <= mb.x + mb.w && p.y >= mb.y && p.y <= mb.y + mb.h) {
      this.pauseOpen = true;
      return;
    }
    // 优先判定面团拾取（抛物线飞行中也可接住）；点击后飞向计数框，到达才入账
    for (const b of this.doughs) {
      if (b.dead) continue;
      const bp = doughPos(b);
      const dx = p.x - bp.x;
      const dy = p.y - (bp.y - 20); // 面团中心在落点上方一点
      if (dx * dx + dy * dy <= 38 * 38) {
        b.dead = true;
        if (b.counts) resolveThrownDough(this, b);
        this.flyers.push({ x0: bp.x, y0: bp.y - 20, t: 0, dur: 0.55, value: RESOURCE.doughValue });
        sfx.collect();
        return;
      }
    }
    if (this.placing) {
      const cell = cellAt(p.x, p.y);
      if (cell) this.tryPlace(cell.col, cell.row);
      return;
    }
    const card = cardAt(p.x, p.y, this.level.cards);
    if (card) {
      const def = DEFENDERS.find((d) => d.id === card.defId);
      if (!def) return;
      const cd = this.cooldowns.get(def.id) ?? 0;
      if (cd <= 0 && this.dough >= def.cost) this.placing = def.id;
    }
  }

  private handlePauseClick(p: { x: number; y: number }): void {
    const panel = pausePanelRect();
    // 音量滑条（按下即拖）
    const vs = volumeSliderRect();
    if (p.x >= vs.x && p.x <= vs.x + vs.w && p.y >= vs.y - 12 && p.y <= vs.y + vs.h + 12) {
      this.setVolumeFromX(p.x, vs);
      this.volumeDragging = true;
      return;
    }
    // 继续
    const bContinue = { x: panel.x + 40, y: panel.y + 150, w: 200, h: 52 };
    if (inRect(p, bContinue)) {
      this.pauseOpen = false;
      return;
    }
    // 退出本关
    const bQuit = { x: panel.x + 40, y: panel.y + 220, w: 200, h: 52 };
    if (inRect(p, bQuit)) {
      this.pauseOpen = false;
      this.onExit?.();
    }
  }

  private setVolumeFromX(x: number, vs: { x: number; w: number }): void {
    sfx.setVolume((x - vs.x) / vs.w);
  }

  onPointerMove(p: { x: number; y: number }): void {
    this.mouse = p;
    if (this.volumeDragging) this.setVolumeFromX(p.x, volumeSliderRect());
  }

  onPointerUp(): void {
    this.volumeDragging = false;
  }

  onCancel(): void {
    if (this.pauseOpen) {
      this.pauseOpen = false;
      return;
    }
    this.placing = null;
  }

  private tryPlace(col: number, row: number): void {
    const def = DEFENDERS.find((d) => d.id === this.placing);
    if (!def) {
      this.placing = null;
      return;
    }
    if (this.occupied[row][col] || this.dough < def.cost) return;
    this.dough -= def.cost;
    this.cooldowns.set(def.id, def.cooldown);
    const d = new Defender(def, col, row, cellCenterX(col), rowFootY(row), this.assets);
    this.defenders.push(d);
    this.occupied[row][col] = d;
    this.placing = null;
    sfx.plant();
  }

  update(dt: number): void {
    if (this.pauseOpen) return;
    this.time += dt;
    this.bannerT = Math.max(0, this.bannerT - dt);
    for (const [id, left] of this.cooldowns) {
      if (left > 0) this.cooldowns.set(id, Math.max(0, left - dt));
    }
    if (this.state === 'playing') {
      updateDoughs(this, dt);
      updateWaves(this, dt);
      updateDefenders(this, dt);
      updateAttackers(this, dt);
      updateMowers(this, dt);
      updateProjectiles(this, dt);
      cleanup(this);
      // 奶蛙入场后平滑对齐到网格行
      for (const a of this.attackers) {
        if (a.state !== 'walk') continue;
        const targetY = rowFootY(a.row);
        a.y += (targetY - a.y) * Math.min(1, dt * 2.5);
      }
    }
    // 面团飞向计数框：二次贝塞尔（控制点在终点上方），缩小变浅，到达入账
    for (const f of this.flyers) {
      f.t += dt / f.dur;
      if (f.t >= 1) {
        f.t = 1;
        this.dough += f.value;
        f.dead = true;
      }
    }
    this.flyers = this.flyers.filter((f) => !f.dead);
    // 胜负音效
    if (this.state !== this.prevState) {
      if (this.state === 'win') {
        sfx.win();
        this.onWin?.();
      }
      if (this.state === 'lose') sfx.lose();
      this.prevState = this.state;
    }
  }

  private prevState: 'playing' | 'win' | 'lose' = 'playing';

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.assets.bg, 0, 0, DESIGN_W, DESIGN_H);
    if (DEBUG) this.drawDebug(ctx);

    // 大肥鱼小推车（待命与冲锋都在单位下层）
    for (const m of this.mowers) drawMower(ctx, this.assets, m);

    this.drawGhost(ctx);

    for (let row = 0; row < GRID.rows; row++) {
      for (const d of this.defenders) if (d.row === row) this.drawDefender(ctx, d);
      for (const a of this.attackers) if (a.row === row) this.drawAttacker(ctx, a);
    }
    for (const p of this.projectiles) this.drawProjectile(ctx, p);

    // 面团（落地后最后 2 秒淡出）
    for (const b of this.doughs) {
      const bp = doughPos(b);
      const alpha = b.landed ? Math.min(1, Math.max(0, b.ttl / 2)) : 1;
      drawDough(ctx, this.assets, bp.x, bp.y, 52, alpha, b.landed);
    }

    // 飞行中的面团（点击后飞向左上角）
    for (const f of this.flyers) {
      const t = f.t;
      const mt = 1 - t;
      // 控制点取中点上方，弧线先起后落向计数框
      const cx = (f.x0 + FLY_TARGET.x) / 2;
      const cy = Math.min(f.y0, FLY_TARGET.y) - 120;
      const x = mt * mt * f.x0 + 2 * mt * t * cx + t * t * FLY_TARGET.x;
      const y = mt * mt * f.y0 + 2 * mt * t * cy + t * t * FLY_TARGET.y;
      const size = 52 - t * 28;
      drawDough(ctx, this.assets, x, y + size / 2, size, 1 - t * 0.7, false);
    }

    drawHud(ctx, this);
    drawOverlay(ctx, this);
    if (this.pauseOpen) drawPause(ctx);
  }

  private drawGhost(ctx: CanvasRenderingContext2D): void {
    if (!this.placing || this.state !== 'playing' || this.pauseOpen) return;
    const def = DEFENDERS.find((d) => d.id === this.placing);
    if (!def) return;
    const cell = cellAt(this.mouse.x, this.mouse.y);
    if (!cell) return;
    const valid = !this.occupied[cell.row][cell.col] && this.dough >= def.cost;
    const cx = cellCenterX(cell.col);
    const cy = rowFootY(cell.row);
    ctx.fillStyle = valid ? 'rgba(155, 225, 93, 0.3)' : 'rgba(255, 107, 107, 0.3)';
    ctx.fillRect(cellLeft(cell.col), cellTop(cell.row), cellW(cell.col), cellH(cell.row));
    drawFrame(this.assets, ctx, def.id, 'idle', 0, cx, cy, def.spriteH, def.flipX, 0.6);
  }

  private drawDefender(ctx: CanvasRenderingContext2D, d: Defender): void {
    // 无死亡动画的单位(新版豆包)被吃掉时原地淡出溶解
    const dissolve = d.state === 'dying' && !this.assets.meta(d.def.id, 'death')?.frames;
    const alpha = dissolve ? Math.max(0, 1 - d.dieT / 0.55) : 1;
    if (!this.drawHitFrame(ctx, d.def, d.x, d.y, d.hitFlash, 0.3, 0)) {
      d.anim.draw(ctx, d.x, d.y, d.def.spriteH, d.def.flipX, alpha);
    }
  }

  private drawAttacker(ctx: CanvasRenderingContext2D, a: Attacker): void {
    const ratio = a.hp / a.def.hp;
    const stage = ratio <= a.def.damageStages[1] ? 2 : ratio <= a.def.damageStages[0] ? 1 : 0;
    // 死亡动画按需水平翻转（素材倒地方向与前进方向相反时）
    const flip = a.def.flipX !== (a.state === 'dying' && a.def.flipDeath);
    if (!this.drawHitFrame(ctx, a.def, a.x, a.y, a.hitFlash, 0.2, stage, flip)) {
      a.anim.draw(ctx, a.x, a.y, a.def.spriteH, flip, 1, stage);
    }
  }

  /** 受击瞬间用 hit 帧替换当前动画（不叠加，避免残影）；返回是否已绘制 */
  private drawHitFrame(
    ctx: CanvasRenderingContext2D,
    def: DefenderDef | (typeof ATTACKERS)[string],
    x: number,
    y: number,
    hitFlash: number,
    flashDur: number,
    tintStage: number,
    flipX?: boolean,
  ): boolean {
    if (hitFlash <= 0) return false;
    const meta = this.assets.meta(def.id, 'hit');
    if (!meta || meta.frames === 0) return false;
    const idx = Math.min(meta.frames - 1, Math.floor(((flashDur - hitFlash) / flashDur) * meta.frames));
    drawFrame(this.assets, ctx, def.id, 'hit', idx, x, y, def.spriteH, flipX ?? def.flipX, 1, tintStage);
    return true;
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
    ctx.save();
    ctx.translate(p.x, p.y);
    const dir = Math.sign(p.vx) || 1;
    // 尾迹
    ctx.fillStyle = 'rgba(138, 51, 36, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-dir * 26, 0, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 豆馅弹体
    ctx.fillStyle = '#8a3324';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-6, -6, 7, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDebug(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= GRID.cols; c++) {
      const x = GRID.colX[c];
      ctx.beginPath();
      ctx.moveTo(x, GRID.rowY[0]);
      ctx.lineTo(x, GRID.rowY[GRID.rows]);
      ctx.stroke();
    }
    for (let r = 0; r <= GRID.rows; r++) {
      const y = GRID.rowY[r];
      ctx.beginPath();
      ctx.moveTo(GRID.colX[0], y);
      ctx.lineTo(GRID.colX[GRID.cols], y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.9)';
    for (let r = 0; r < GRID.rows; r++) {
      const y = rowFootY(r);
      ctx.beginPath();
      ctx.moveTo(GRID.colX[0], y);
      ctx.lineTo(GRID.colX[GRID.cols], y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(SPAWN_X, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
    ctx.beginPath();
    ctx.moveTo(HOME_LINE_X, 0);
    ctx.lineTo(HOME_LINE_X, DESIGN_H);
    ctx.stroke();
    for (const a of this.attackers) {
      ctx.strokeRect(a.x - 24, a.y - a.def.spriteH, 60, a.def.spriteH);
    }
    // 大肥鱼位置
    ctx.strokeStyle = 'rgba(255, 160, 60, 0.9)';
    for (const m of this.mowers) {
      if (m.state === 'gone') continue;
      ctx.strokeRect(m.x - MOWER.w / 2, m.y - MOWER.w / 2, MOWER.w, MOWER.w / 2);
    }
    ctx.restore();
  }
}

function inRect(p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
