import { Anim, drawFrame, drawWalkingFrog, sampleTrack } from '../core/anim';
import type { Assets } from '../core/assets';
import { sfx } from '../core/sfx';
import { DESIGN_H, DESIGN_W, DEBUG, GRID, HOME_LINE_X, LEVELS, MOWER, RESOURCE, SPAWN_X, type LevelDef } from './config';
import { Attacker, Defender, DoughBall, Mower, Projectile, doughPos, type FanWind } from './entities';
import { drawFanWind } from './fan';
import { cellAt, cellCenterX, cellLeft, cellTop, cellW, cellH, rowFootY } from './grid';
import { cardDetailArtRect, cardDetailBackButton, cardDetailNextButton, drawCardDetail, inRect as inRectOf } from './carddetail';
import {
  cleanup,
  pickUpDefender,
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
import { battleStory, type StoryPage } from './story';
import {
  beltCardAt,
  drawInvasion,
  drawSpecialHud,
  hitInvasionEgg,
  newConveyor,
  updateConveyor,
  updateInvasion,
  type Conveyor,
  type EggInvasion,
} from './special';
import {
  cardAt,
  drawDough,
  drawHud,
  drawOverlay,
  drawMower,
  drawPause,
  drawShovelIconAt,
  exitToLevelsButton,
  menuButtonRect,
  PANEL_MEDALLION,
  pauseButtonsRect,
  loseButtonsRect,
  shovelButtonRect,
  volumeSliderRect,
  DOUGH_PANEL,
} from './ui';

/** 被点击的面团飞向左上角计数框的动画 */
interface DoughFlyer {
  x0: number;
  y0: number;
  t: number;
  dur: number;
  value: number;
  dead?: boolean;
}

/**
 * 通关奖励卡：从最后阵亡的奶蛙处蹦出来 → 点一下飞向屏幕中央并闪光 →
 * 进入卡片介绍页。phase 决定当前演到哪一段。
 */
export interface RewardPopup {
  def: DefenderDef;
  x: number;
  y: number;
  t: number;
  phase: 'pop' | 'idle' | 'fly' | 'flash';
  /** pop 起点（最后一只奶蛙的阵亡位置） */
  fromX: number;
  fromY: number;
  /** fly 起点 = 点击时的画面位置 */
  flyX0: number;
  flyY0: number;
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
  fanWinds: FanWind[] = [];
  hitFx: { x: number; y: number; t: number; radius?: number }[] = [];
  invasion: EggInvasion | null = null;
  /** 对话页码；null 表示演出结束。它与关卡暂停分别保存。 */
  eggDialogue: number | null = 0;
  readonly story: readonly StoryPage[];
  conveyor: Conveyor | null = null;
  occupied: (Defender | null)[][];
  waveIndex = 0;
  waveActive = false;
  waveTimer = 0;
  waveStartedAt = 0;
  spawnQueue = 0;
  spawnTimer = 0;
  banner = '';
  bannerT = 0;
  /** 进度条显示进度 0..1（朝目标平滑推进，波次切换不突变） */
  progressShown = 0;
  state: 'playing' | 'win' | 'lose' = 'playing';
  loseElapsed = 0;
  readonly loseAnim: Anim;
  waves: LevelDef['waves'];
  activeRows: number[];

  /** 通关奖励流程：'none' 无；'reward' 卡片弹出待点；'detail' 卡片介绍页 */
  rewardPhase: 'none' | 'reward' | 'detail' = 'none';
  reward: RewardPopup | null = null;
  /** 最后一只奶蛙的阵亡位置（奖励卡从这里蹦出来） */
  lastDeath: { x: number; y: number; at: number } | null = null;
  /** 胜利后等结算遮罩/死亡动画播完再弹卡 */
  private winPopupDelay = 0;

  cooldowns = new Map<string, number>();
  placing: string | null = null;
  /** 持铲状态(夹子道具): true 时点击格子挖掉植物 */
  shoveling = false;
  /** 夹子的挖掘动作演出（夹取点 + 植物高度 + 进度秒，0.55s 与豆包上提同步） */
  clipFx: { x: number; y: number; h: number; t: number }[] = [];
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
  /** 卡片介绍页点「下一关」，由 main.ts 注入（切换到下一关） */
  onNext: (() => void) | null = null;

  constructor(
    public assets: Assets,
    public level: LevelDef,
  ) {
    this.loseAnim = new Anim(assets, 'laugh_frog', 'chew');
    this.story = battleStory(level);
    this.waves = level.waves;
    this.activeRows = level.rows ?? [0, 1, 2, 3, 4];
    this.dough = level.startDough ?? RESOURCE.start;
    if (level.trial) this.firstFrogAt = 3;
    if (level.kind === 'egg-invasion') {
      this.invasion = { spawned: 0, broken: 0, missed: 0, total: level.waves[0].count, timer: 3, eggs: [], combo: 0, maxCombo: 0, perfect: 0, good: 0, score: 0, feedback: [] };
      this.eggDialogue = 0;
    }
    if (level.kind === 'conveyor') {
      this.conveyor = newConveyor();
      this.firstFrogAt = 16;
    }
    this.occupied = Array.from({ length: GRID.rows }, () => Array<Defender | null>(GRID.cols).fill(null));
    for (const r of this.activeRows) {
      if (!this.invasion) this.mowers.push(new Mower(r, MOWER.restX, rowFootY(r)));
    }
  }

  spawnAttacker(row: number, type?: string): void {
    const def = ATTACKERS[type ?? 'ordinary_frog'] ?? ATTACKERS.ordinary_frog;
    const y = rowFootY(row);
    this.attackers.push(new Attacker(def, row, SPAWN_X + Math.random() * 24, y, this.assets));
  }

  /** 身体起伏幅度（px）：轨道是 ±1，所以这就是最大抬高/压低量 */
  static readonly BOB_AMPLITUDE = 3.0;

  advanceEggDialogue(back = false): void {
    if (this.eggDialogue === null || this.pauseOpen) return;
    if (back) this.eggDialogue = Math.max(0, this.eggDialogue - 1);
    else this.eggDialogue = this.eggDialogue + 1 < this.story.length ? this.eggDialogue + 1 : null;
  }

  onRhythmKey(key: string, repeat = false): boolean {
    if (!this.invasion || this.state !== 'playing' || this.pauseOpen || this.eggDialogue !== null || repeat || !['z', 'x'].includes(key.toLowerCase())) return false;
    return hitInvasionEgg(this, this.mouse);
  }

  onPointerDown(p: { x: number; y: number }): void {
    // 卡片介绍页：只响应「下一关 / 返回选关」
    if (this.rewardPhase === 'detail') {
      const def = this.rewardCard();
      if (def && this.hasNextLevel() && inRectOf(p, cardDetailNextButton())) {
        this.onNext?.();
        return;
      }
      if (inRectOf(p, cardDetailBackButton())) this.onExit?.();
      return;
    }
    if (this.pauseOpen) {
      this.handlePauseClick(p);
      return;
    }
    // 奖励卡弹出后：只有它可点（飞向中央并闪光 → 卡片介绍页）
    if (this.rewardPhase === 'reward' && this.reward) {
      this.clickReward(p);
      return;
    }
    if (this.state !== 'playing') {
      // 没有奖励卡的胜利（例如末关）：遮罩上只有「返回选关」可点
      if (this.state === 'win') {
        if (this.rewardCard()) return;
        const e = exitToLevelsButton();
        if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) this.onExit?.();
        return;
      }
      const { restart: b, back: e } = loseButtonsRect();
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) this.onRestart?.();
      if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) this.onExit?.();
      return;
    }
    // 右上角菜单按钮 → 暂停
    const mb = menuButtonRect();
    if (p.x >= mb.x && p.x <= mb.x + mb.w && p.y >= mb.y && p.y <= mb.y + mb.h) {
      this.pauseOpen = true;
      return;
    }
    if (this.eggDialogue !== null) return;
    if (this.invasion) {
      hitInvasionEgg(this, p);
      return;
    }
    if (this.conveyor) {
      const card = beltCardAt(this, p);
      if (card) {
        this.conveyor.selected = card.token;
        this.placing = card.id;
        this.shoveling = false;
        return;
      }
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
    // 铲子道具: 点击取放; 持铲时点击格子挖掉植物(不绕弯豆包不占格, 按所在列命中也算)
    const sb = shovelButtonRect();
    if (p.x >= sb.x && p.x <= sb.x + sb.w && p.y >= sb.y && p.y <= sb.y + sb.h) {
      this.shoveling = !this.shoveling;
      this.placing = null;
      return;
    }
    if (this.shoveling) {
      const cell = cellAt(p.x, p.y);
      if (cell && this.activeRows.includes(cell.row)) {
        const target =
          this.occupied[cell.row][cell.col] ??
          this.defenders.find(
            (d) =>
              d.def.mover &&
              d.row === cell.row &&
              d.state !== 'dying' &&
              d.x >= cellLeft(cell.col) &&
              d.x < cellLeft(cell.col) + cellW(cell.col),
          );
        if (target) {
          pickUpDefender(this, target); // 夹起移除: 上提缩小消失, 立即释放占地(无返还, 同 PvZ 铲子)
          this.clipFx.push({ x: target.x, y: target.y - target.def.spriteH * 0.5, h: target.def.spriteH, t: 0 });
          this.shoveling = false;
        }
      }
      return;
    }
    if (this.placing) {
      const cell = cellAt(p.x, p.y);
      if (cell) this.tryPlace(cell.col, cell.row);
      return;
    }
    if (this.conveyor) return;
    const card = cardAt(p.x, p.y, this.level.cards);
    if (card) {
      const def = DEFENDERS.find((d) => d.id === card.defId);
      if (!def) return;
      const cd = this.cooldowns.get(def.id) ?? 0;
      if (cd <= 0 && this.dough >= def.cost) {
        this.placing = def.id;
        this.shoveling = false;
      }
    }
  }

  private handlePauseClick(p: { x: number; y: number }): void {
    // 音量滑条（按下即拖）
    const vs = volumeSliderRect();
    if (p.x >= vs.x && p.x <= vs.x + vs.w && p.y >= vs.y - 12 && p.y <= vs.y + vs.h + 12) {
      this.setVolumeFromX(p.x, vs);
      this.volumeDragging = true;
      return;
    }
    // 继续 / 退出本关（矩形与 ui.ts 绘制共用）
    const { cont, quit } = pauseButtonsRect();
    if (inRect(p, cont)) {
      this.pauseOpen = false;
      return;
    }
    if (inRect(p, quit)) {
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
    this.shoveling = false;
    if (this.conveyor) this.conveyor.selected = null;
  }

  private tryPlace(col: number, row: number): void {
    if (!this.activeRows.includes(row)) return;
    const def = DEFENDERS.find((d) => d.id === this.placing);
    if (!def) {
      this.placing = null;
      return;
    }
    if (this.occupied[row][col]) return;
    if (this.conveyor) {
      const index = this.conveyor.cards.findIndex((c) => c.token === this.conveyor!.selected && c.id === def.id);
      if (index < 0) return;
      this.conveyor.cards.splice(index, 1);
      this.conveyor.selected = null;
    } else {
      if (this.dough < def.cost) return;
      this.dough -= def.cost;
      this.cooldowns.set(def.id, def.cooldown);
    }
    const d = new Defender(def, col, row, cellCenterX(col), rowFootY(row), this.assets);
    this.defenders.push(d);
    // 移动型单位(occupiesCell=false)放置后不占地, 同格还能种别的
    if (def.occupiesCell !== false) this.occupied[row][col] = d;
    this.placing = null;
    sfx.plant();
  }

  update(dt: number): void {
    if (this.pauseOpen) return;
    if (this.eggDialogue !== null) return;
    this.time += dt;
    if (this.state === 'lose') {
      this.loseElapsed += dt;
      this.loseAnim.update(dt);
    }
    this.bannerT = Math.max(0, this.bannerT - dt);
    for (const [id, left] of this.cooldowns) {
      if (left > 0) this.cooldowns.set(id, Math.max(0, left - dt));
    }
    if (this.state === 'playing') {
      if (this.invasion) updateInvasion(this, dt);
      else {
        if (this.conveyor) updateConveyor(this, dt);
        else updateDoughs(this, dt);
        updateWaves(this, dt);
        updateDefenders(this, dt);
        updateAttackers(this, dt);
        updateMowers(this, dt);
        updateProjectiles(this, dt);
        // 记录本帧阵亡的奶蛙位置（奖励卡要从"最后一只倒下的奶蛙"处蹦出来）
        for (const a of this.attackers) {
          if (a.dead && (!this.lastDeath || a.diedAt >= this.lastDeath.at)) {
            this.lastDeath = { x: a.x, y: a.y, at: a.diedAt };
          }
        }
        cleanup(this);
      }
      // 豆馅命中特效推进（0.25s 扩散淡出）
      for (const f of this.hitFx) f.t += dt;
      this.hitFx = this.hitFx.filter((f) => f.t < 0.25);
      // 夹子挖掘动作推进（0.55s, 与豆包上提消失同步）
      for (const f of this.clipFx) f.t += dt;
      this.clipFx = this.clipFx.filter((f) => f.t < 0.55);
      // 奶蛙入场后平滑对齐到网格行；行走时叠一个步态起伏，别让整只蛙像贴纸一样平移
      for (const a of this.attackers) {
        if (a.state !== 'walk') {
          a.bobOffset = 0;
          continue;
        }
        const targetY = rowFootY(a.row);
        a.y += (targetY - a.y) * Math.min(1, dt * 2.5);
        // 起伏直接查素材烘出来的 bobTrack(身体质心高低), 不是拿正弦猜相位 ——
        // 相位与迈步严格同步, 抬腿时抬身、落地时压低, 由素材自己决定节奏。
        const meta = this.assets.meta(a.def.id, a.anim.name);
        const frames = meta?.frames ?? 0;
        const fps = meta?.fps ?? 0;
        a.bobOffset = -sampleTrack(meta?.bobTrack, a.anim, frames, fps) * Game.BOB_AMPLITUDE;
      }
    } else if (this.state === 'win' && this.rewardPhase === 'none' && !this.reward && this.winPopupDelay > 0) {
      // 胜利结算：先让遮罩与死亡动画演完，再在最后阵亡的奶蛙处弹出奖励卡
      this.winPopupDelay -= dt;
      if (this.winPopupDelay <= 0) this.popupReward();
    }
    this.updateReward(dt);
    // 进度条平滑推进: 目标值按波次+已刷出比例计算, 显示值指数趋近(约 2s 追上), 波次切换不突变
    {
      const total = this.waves.length;
      let target = this.waveIndex;
      if (this.state === 'win') target = total;
      else if (this.waveActive && this.waveIndex < total) {
        const wv = this.waves[this.waveIndex];
        target += (wv.count - this.spawnQueue) / wv.count;
      }
      target = Math.max(0, Math.min(1, target / total));
      if (!this.invasion) this.progressShown += (target - this.progressShown) * Math.min(1, dt * 1.5);
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
        // 等结算遮罩与死亡动画演完，再弹奖励卡（约 1.2s）
        this.winPopupDelay = 1.2;
      }
      if (this.state === 'lose') sfx.lose();
      this.prevState = this.state;
    }
  }

  private prevState: 'playing' | 'win' | 'lose' = 'playing';

  /** 通关奖励卡：卡片介绍页里的立绘位置（也是飞行动画终点） */
  private rewardCenter(): { x: number; y: number } {
    const a = cardDetailArtRect();
    return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  }

  /** 本关通关奖励的卡（unlocks 里第一张还没拿到的）；没有就返回 null */
  rewardCard(): DefenderDef | null {
    for (const id of this.level.unlocks ?? []) {
      const def = DEFENDERS.find((d) => d.id === id);
      if (def) return def;
    }
    return null;
  }

  /** 是否还有下一关（决定介绍页按钮） */
  hasNextLevel(): boolean {
    return LEVELS.some((l) => l.id > this.level.id);
  }

  /** 在最后阵亡的奶蛙处弹出奖励卡 */
  private popupReward(): void {
    const def = this.rewardCard();
    if (!def) {
      // 本关没有新卡可奖励（例如末关）：不走奖励流程，保留胜利遮罩 + 「返回选关」。
      // 把延迟置空，避免每帧反复重试弹卡。
      this.winPopupDelay = 0;
      this.rewardPhase = 'none';
      return;
    }
    const from = this.lastDeath ?? { x: DESIGN_W * 0.7, y: DESIGN_H * 0.7 };
    // 奶蛙可能倒在屏幕最左/最右，卡片要夹回可视区内，别让"点击领取"跑到屏幕外
    const CARD_HALF_W = 78;
    const x = Math.max(20 + CARD_HALF_W, Math.min(DESIGN_W - 20 - CARD_HALF_W, from.x));
    const y = Math.max(210, Math.min(DESIGN_H - 250, from.y));
    this.reward = {
      def,
      x,
      y,
      t: 0,
      phase: 'pop',
      fromX: x,
      fromY: y,
      flyX0: x,
      flyY0: y,
    };
    this.rewardPhase = 'reward';
    sfx.collect();
  }

  /** 奖励卡位置/生命周期推进 */
  private updateReward(dt: number): void {
    const r = this.reward;
    if (!r) return;
    r.t += dt;
    if (r.phase === 'pop') {
      // 蹦出来：0.5s 从奶蛙处弹到上方一点的位置
      const k = Math.min(1, r.t / 0.5);
      const ease = 1 - (1 - k) * (1 - k);
      const target = { x: r.fromX, y: r.fromY - 96 };
      r.x = r.fromX + (target.x - r.fromX) * ease;
      r.y = r.fromY + (target.y - r.fromY) * ease;
      if (k >= 1) {
        r.phase = 'idle';
        r.t = 0;
      }
    } else if (r.phase === 'idle') {
      // 待点：轻微上下浮动
      r.y += Math.sin(r.t * 3.4) * 12 * dt;
    } else if (r.phase === 'fly') {
      // 飞向屏幕中央并放大，2 次贝塞尔，控制点在上方
      const k = Math.min(1, r.t / 0.62);
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const c = this.rewardCenter();
      const cx = (r.flyX0 + c.x) / 2;
      const cy = Math.min(r.flyY0, c.y) - 150;
      const mt = 1 - ease;
      r.x = mt * mt * r.flyX0 + 2 * mt * ease * cx + ease * ease * c.x;
      r.y = mt * mt * r.flyY0 + 2 * mt * ease * cy + ease * ease * c.y;
      if (k >= 1) {
        r.phase = 'flash';
        r.t = 0;
        sfx.collect();
      }
    } else if (r.phase === 'flash') {
      r.x = this.rewardCenter().x;
      r.y = this.rewardCenter().y;
      if (r.t >= 0.62) {
        this.reward = null;
        this.rewardPhase = 'detail';
      }
    }
  }

  /** 奖励卡当前缩放（飞行/闪光阶段放大） */
  private rewardScale(): number {
    const r = this.reward;
    if (!r) return 1;
    if (r.phase === 'pop') return 0.4 + 0.6 * Math.min(1, r.t / 0.5);
    if (r.phase === 'fly') {
      const k = Math.min(1, r.t / 0.62);
      return 1 + 0.55 * k;
    }
    if (r.phase === 'flash') {
      const k = Math.min(1, r.t / 0.62);
      return 1.55 + 0.35 * Math.sin(Math.PI * k);
    }
    return 1;
  }

  /** 奖励卡命中区（未缩放前的半宽/半高） */
  rewardHitRect(): { x: number; y: number; w: number; h: number } {
    const r = this.reward;
    const w = 118;
    const h = 168;
    const sc = this.rewardScale();
    const x = r ? r.x : 0;
    const y = r ? r.y : 0;
    const ww = w * sc;
    const hh = h * sc;
    return { x: x - ww / 2, y: y - hh / 2, w: ww, h: hh };
  }

  /** 点奖励卡：进入飞向中央 + 闪光 */
  private clickReward(p: { x: number; y: number }): boolean {
    const r = this.reward;
    if (!r || r.phase !== 'idle') return false;
    if (!inRectOf(p, this.rewardHitRect())) return false;
    r.phase = 'fly';
    r.flyX0 = r.x;
    r.flyY0 = r.y;
    r.t = 0;
    sfx.plant();
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.assets.backgroundForRows(this.activeRows), 0, 0, DESIGN_W, DESIGN_H);
    if (DEBUG) this.drawDebug(ctx);

    // 大肥鱼小推车（待命与冲锋都在单位下层）
    for (const m of this.mowers) drawMower(ctx, this.assets, m);

    this.drawGhost(ctx);

    for (let row = 0; row < GRID.rows; row++) {
      for (const d of this.defenders) if (d.row === row) this.drawDefender(ctx, d);
      for (const a of this.attackers) if (a.row === row) this.drawAttacker(ctx, a);
    }
    if (this.invasion) drawInvasion(ctx, this);
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
    for (const wind of this.fanWinds) drawFanWind(ctx, wind);

    // 豆馅命中特效（子弹侧溅射：0.25s 内扩散淡出，不影响奶蛙本体）
    for (const f of this.hitFx) {
      const k = f.t / 0.25;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#8a3324';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 6 + k * (f.radius ?? 20), 4 + k * (f.radius ? f.radius * 0.55 : 10), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 235, 200, 0.85)';
      ctx.beginPath();
      ctx.ellipse(f.x - 3, f.y - 3, 2 + k * 6, 1.5 + k * 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 面团（落地后剩余 3 秒内闪烁提示，到点消失）
    for (const b of this.doughs) {
      const bp = doughPos(b);
      const blinking = b.landed && b.ttl <= 3;
      const alpha = blinking ? (Math.floor(b.ttl * 5) % 2 === 0 ? 1 : 0.15) : 1;
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
    if (this.invasion || this.conveyor) drawSpecialHud(ctx, this);
    drawOverlay(ctx, this);
    // 夹子的挖掘动作: 先张→合(前 40%), 随后夹着豆包一起上提淡出(与豆包提起曲线同步)
    for (const f of this.clipFx) {
      const k = Math.min(1, f.t / 0.55);
      const lift = (1 - (1 - k) * (1 - k)) * f.h * 1.05;
      const pinch = 1 - 0.32 * Math.sin(Math.PI * Math.min(1, k / 0.4));
      drawShovelIconAt(ctx, this.assets.clipImg, f.x, f.y - lift, 104, 1 - k * k, pinch);
    }
    // 持铲时的光标图标压在单位之上(HUD 层), 不然会被格子里的立绘盖住
    if (this.shoveling && this.state === 'playing' && !this.pauseOpen) {
      drawShovelIconAt(ctx, this.assets.clipImg, this.mouse.x, this.mouse.y - 12, 110, 0.92);
    }
    // 通关奖励卡：在结算遮罩之上画，弹出来时最显眼
    this.drawReward(ctx);
    if (this.pauseOpen) drawPause(ctx, this.assets);
    // 卡片介绍页压在最上层
    if (this.rewardPhase === 'detail') {
      const def = this.rewardCard();
      if (def) drawCardDetail(ctx, this.assets, def, this.hasNextLevel());
    }
  }

  /** 画通关奖励卡（弹出 / 待点浮动 / 飞向中央 / 闪光） */
  private drawReward(ctx: CanvasRenderingContext2D): void {
    const r = this.reward;
    if (!r) return;
    const card = this.assets.card(r.def.id, r.def.cost);
    const img = card ?? this.assets.frame(r.def.id, 'idle', 0);
    if (!img) return;
    const rect = this.rewardHitRect();
    const sc = this.rewardScale();
    // 底座光晕：越接近中央越亮，闪光阶段全屏泛白
    ctx.save();
    const glow = ctx.createRadialGradient(r.x, r.y, 4, r.x, r.y, Math.max(rect.w, rect.h) * 0.75);
    glow.addColorStop(0, `rgba(255, 235, 150, ${0.55 * Math.min(1, sc)})`);
    glow.addColorStop(1, 'rgba(255, 235, 150, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(rect.w, rect.h) * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 卡片本体（带阴影弹起）
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 18 * sc;
    ctx.shadowOffsetY = 6 * sc;
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    // 待点提示：呼吸白框 + 文字
    if (r.phase === 'idle') {
      const pulse = 0.5 + 0.5 * Math.sin(r.t * 4);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + pulse * 0.5})`;
      ctx.lineWidth = 3 + pulse * 2;
      ctx.beginPath();
      ctx.roundRect(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10, 14);
      ctx.stroke();
      ctx.font = `bold 24px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.strokeText('点击查看新卡片', r.x, rect.y + rect.h + 26);
      ctx.fillStyle = '#ffe28a';
      ctx.fillText('点击查看新卡片', r.x, rect.y + rect.h + 26);
      ctx.restore();
    }

    // 飞抵中央的闪光
    if (r.phase === 'flash') {
      const k = Math.min(1, r.t / 0.62);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      const fl = ctx.createRadialGradient(r.x, r.y, 10, r.x, r.y, 260 + k * 420);
      fl.addColorStop(0, 'rgba(255, 255, 255, 1)');
      fl.addColorStop(0.35, 'rgba(255, 240, 170, 0.85)');
      fl.addColorStop(1, 'rgba(255, 240, 170, 0)');
      ctx.fillStyle = fl;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
      ctx.restore();
    }
  }

  private drawGhost(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'playing' || this.pauseOpen) return;
    // 持铲: 高亮命中的格子(有植物才标红); 光标跟随的铲子图标画在单位层之上(见 draw)
    if (this.shoveling) {
      const cell = cellAt(this.mouse.x, this.mouse.y);
      if (cell) {
        const hasTarget =
          this.occupied[cell.row][cell.col] != null ||
          this.defenders.some(
            (d) =>
              d.def.mover &&
              d.row === cell.row &&
              d.state !== 'dying' &&
              d.x >= cellLeft(cell.col) &&
              d.x < cellLeft(cell.col) + cellW(cell.col),
          );
        ctx.fillStyle = hasTarget ? 'rgba(255, 107, 107, 0.35)' : 'rgba(200, 200, 200, 0.2)';
        ctx.fillRect(cellLeft(cell.col), cellTop(cell.row), cellW(cell.col), cellH(cell.row));
      }
      return;
    }
    if (!this.placing) return;
    const def = DEFENDERS.find((d) => d.id === this.placing);
    if (!def) return;
    const cell = cellAt(this.mouse.x, this.mouse.y);
    if (!cell || !this.activeRows.includes(cell.row)) return;
    const valid = !this.occupied[cell.row][cell.col] && this.dough >= def.cost;
    const cx = cellCenterX(cell.col);
    const cy = rowFootY(cell.row);
    ctx.fillStyle = valid ? 'rgba(155, 225, 93, 0.3)' : 'rgba(255, 107, 107, 0.3)';
    ctx.fillRect(cellLeft(cell.col), cellTop(cell.row), cellW(cell.col), cellH(cell.row));
    // 没有待机行的单位(不绕弯豆包)用走姿首帧当放置预览
    const anim = this.assets.meta(def.id, 'idle')?.frames ? 'idle' : 'walk';
    drawFrame(this.assets, ctx, def.id, anim, 0, cx, cy, def.spriteH, def.flipX, 0.6);
  }

  private drawDefender(ctx: CanvasRenderingContext2D, d: Defender): void {
    if ((d.abilityFx > 0 || d.def.boost) && d.state !== 'dying') {
      ctx.save();
      ctx.globalAlpha = d.def.boost ? 0.18 : d.abilityFx * 0.4;
      ctx.strokeStyle = d.def.boost ? '#a07de0' : '#69c9ca';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(
        d.x + (d.def.slow ? 90 : 0),
        d.y - 25,
        d.def.boost?.radius ?? d.def.slow?.range ?? 100,
        d.def.boost || d.def.slow ? 120 : 35,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
    // 被夹子夹起: 上提 + 缩小 + 淡出(0.55s), 与夹子的张合演出同步
    if (d.state === 'dying' && d.lifted) {
      const k = Math.min(1, d.dieT / 0.55);
      const lift = (1 - (1 - k) * (1 - k)) * d.def.spriteH * 1.05;
      const scale = 1 - 0.6 * k;
      ctx.save();
      ctx.translate(d.x, d.y - lift);
      ctx.scale(scale, scale);
      ctx.translate(-d.x, -d.y);
      d.anim.draw(ctx, d.x, d.y, d.def.spriteH, d.def.flipX, 1 - k * k);
      ctx.restore();
      return;
    }
    // 无死亡动画的单位(新版豆包)被吃掉时原地淡出溶解
    const dissolve = d.state === 'dying' && !this.assets.meta(d.def.id, 'death')?.frames;
    const alpha = dissolve ? Math.max(0, 1 - d.dieT / 0.55) : 1;
    if (!this.drawHitFrame(ctx, d.def, d.x, d.y, d.hitFlash, 0.3, 0)) {
      d.anim.draw(ctx, d.x, d.y, d.def.spriteH, d.def.flipX, alpha);
    }
  }

  private drawAttacker(ctx: CanvasRenderingContext2D, a: Attacker): void {
    // 受击反馈(红闪与 hit 帧)对奶蛙整体关闭: 子弹密集时染色闪烁影响观感; 受伤外观由断手动画承担
    // 死亡动画按需水平翻转（素材倒地方向与前进方向相反时）
    const flip = a.def.flipX !== (a.state === 'dying' && a.def.flipDeath);
    const y = a.y + a.bobOffset + a.hopOffset + a.vaultOffset;
    if (a.def.egg && (a.state === 'walk' || a.state === 'vault')) {
      const centerY = y - a.def.spriteH * 0.5;
      ctx.save();
      ctx.translate(a.x, centerY);
      ctx.rotate(a.rollAngle);
      ctx.translate(-a.x, -centerY);
      drawFrame(this.assets, ctx, a.def.id, 'walk', 0, a.x, y, a.def.spriteH, flip);
      ctx.restore();
    } else if (a.def.id === 'ordinary_frog' && a.state === 'walk') {
      const meta = this.assets.meta(a.def.id, 'walk')!;
      const phase = ((a.anim.t * meta.fps) / meta.frames) * Math.PI * 2;
      drawWalkingFrog(this.assets, ctx, a.def.id, phase, a.x, y, a.def.spriteH, flip);
    } else {
      a.anim.draw(ctx, a.x, y, a.def.spriteH, flip);
    }
    if (a.def.rally && a.rallyFx > 0 && a.state !== 'dying') {
      ctx.save();
      ctx.fillStyle = '#fdf3d8';
      ctx.strokeStyle = '#8a5a28';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(a.x - 105, y - a.def.spriteH - 45, 210, 36, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5b2d12';
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px "Microsoft YaHei",sans-serif';
      ctx.fillText('吼啦，刚把爹！', a.x, y - a.def.spriteH - 20);
      ctx.restore();
    }
    if (a.def.infectionSeconds && a.target && a.biteTimer > 0 && a.state === 'eat') {
      ctx.save();
      ctx.strokeStyle = '#b07de0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(
        a.target.x,
        a.target.y - 50,
        39,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, a.biteTimer / a.def.infectionSeconds),
      );
      ctx.stroke();
      ctx.restore();
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
    if (p.windWeakened) {
      ctx.globalAlpha = 0.65;
      ctx.scale(0.72, 0.72);
    }
    const dir = Math.sign(p.vx) || 1;
    // 尾迹
    ctx.fillStyle = 'rgba(138, 51, 36, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-dir * 26, 0, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 豆馅弹体
    ctx.fillStyle = p.remainingHits > 1 ? '#ddd9ed' : '#8a3324';
    ctx.beginPath();
    ctx.ellipse(0, 0, p.remainingHits > 1 ? 28 : 20, p.remainingHits > 1 ? 5 : 16, 0, 0, Math.PI * 2);
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
