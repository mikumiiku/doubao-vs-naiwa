/**
 * 模式选择：点击「开始」后进入（类似 PvZ 主界面的模式列表）。
 * 目前只有冒险模式可用，其余三个只留接口入口，标注"敬请期待"。
 * 冒险模式直接进入存档进度所在的最新关卡（有关内进度则续战）。
 */
import { DEBUG, DESIGN_H, DESIGN_W, LEVELS } from './config';
import type { Assets } from '../core/assets';
import { drawHomeBackdrop } from './menu';
import { unlockedLevel } from './progress';
import { hasContinuableBattle } from './save';
import { drawUiArt } from '../core/uiart';

const FONT = 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 关卡序数中文写法（第 1..10 关 → 第一关…第十关） */
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const cnLevel = (id: number): string => `第${CN_NUM[id - 1] ?? String(id)}关`;

interface ModeEntry {
  id: 'adventure' | 'puzzle' | 'minigame' | 'survival';
  /** false = 仅接口占位，点击提示敬请期待 */
  ready: boolean;
}

const MODES: ModeEntry[] = [
  { id: 'adventure', ready: true },
  { id: 'puzzle', ready: false },
  { id: 'minigame', ready: false },
  { id: 'survival', ready: false },
];

/** 竖排按钮几何（PVZ 主菜单也是一列四个） */
const BTN = { w: 420, h: 152, cx: DESIGN_W / 2, y0: 250, gap: 160 };
const BACK = { x: 18, y: 14, w: 130, h: 52 };

export class ModeSelect {
  private t = 0;
  private hover: string | null = null;
  private hintT = 0;

  constructor(
    private assets: Assets,
    private onAdventure: () => void,
    private onBack: () => void,
  ) {}

  update(dt: number): void {
    this.t += dt;
    this.hintT = Math.max(0, this.hintT - dt);
  }

  onPointerMove(p: { x: number; y: number }): void {
    const m = MODES.find((mode) => this.inButton(p.x, p.y, mode.id));
    this.hover = m ? m.id : null;
  }

  onPointerDown(p: { x: number; y: number }): void {
    if (p.x >= BACK.x && p.x <= BACK.x + BACK.w && p.y >= BACK.y && p.y <= BACK.y + BACK.h) {
      this.onBack();
      return;
    }
    const m = MODES.find((mode) => this.inButton(p.x, p.y, mode.id));
    if (!m) return;
    if (m.ready) this.onAdventure();
    else this.hintT = 2.2;
  }

  private inButton(x: number, y: number, id: string): boolean {
    const i = MODES.findIndex((m) => m.id === id);
    const bx = BTN.cx - BTN.w / 2;
    const by = BTN.y0 + i * BTN.gap;
    return x >= bx && x <= bx + BTN.w && y >= by && y <= by + BTN.h;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawHomeBackdrop(ctx, this.assets.home);
    ctx.fillStyle = 'rgba(20, 16, 10, 0.5)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    const float = Math.sin(this.t * 1.6) * 4;
    drawUiArt(ctx, this.assets.ui['mode-title'], { x: DESIGN_W / 2 - 260, y: 62 + float, w: 520, h: 155 });
    drawUiArt(ctx, this.assets.ui.back, BACK);

    for (const m of MODES) this.drawButton(ctx, m);

    // 敬请期待提示（点了未开放的模式）
    if (this.hintT > 0) {
      const a = Math.min(1, this.hintT / 0.3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = `bold 34px ${FONT}`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.strokeText('敬请期待', DESIGN_W / 2, DESIGN_H - 120);
      ctx.fillStyle = '#ffe28a';
      ctx.fillText('敬请期待', DESIGN_W / 2, DESIGN_H - 120);
      ctx.restore();
    }
  }

  private drawButton(ctx: CanvasRenderingContext2D, m: ModeEntry): void {
    const i = MODES.findIndex((v) => v.id === m.id);
    const bx = BTN.cx - BTN.w / 2;
    const by = BTN.y0 + i * BTN.gap;
    const hover = this.hover === m.id;

    ctx.save();
    if (hover) ctx.filter = 'brightness(1.1)';
    if (!m.ready) ctx.globalAlpha = hover ? 0.86 : 0.66;
    drawUiArt(ctx, this.assets.ui[`mode-${m.id}`], { x: bx, y: by, w: BTN.w, h: BTN.h });
    ctx.restore();
    if (!m.ready) {
      ctx.font = `18px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 248, 226, 0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('敬请期待', BTN.cx, by + BTN.h - 4);
    }

    // 冒险模式：当前进度（一行小字，别顶着下一个按钮）
    if (m.ready) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `18px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 248, 226, 0.95)';
      let label = '调试选关 · 全部关卡';
      if (!DEBUG) {
        const lv = LEVELS.find((l) => l.id === unlockedLevel()) ?? LEVELS[0];
        label = hasContinuableBattle() ? `继续战斗 · ${cnLevel(lv.id)}` : cnLevel(lv.id);
      }
      ctx.fillText(label, BTN.cx, by + BTN.h - 4);
    }
  }
}
