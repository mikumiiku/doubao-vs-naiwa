import { DESIGN_H, DESIGN_W } from './config';
import { drawUiArt } from '../core/uiart';

const FONT = 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const SRC_W = 1672, SRC_H = 941;
const START = { cx: DESIGN_W / 2, cy: 668, w: 460, h: 460 / 3 };

export interface HomeAssets {
  bg: HTMLImageElement;
  heroes: HTMLImageElement;
  btnStart: HTMLImageElement;
  title: HTMLImageElement;
}

export function drawHomeBackdrop(ctx: CanvasRenderingContext2D, home: HomeAssets): void {
  const aspect = DESIGN_W / DESIGN_H;
  let sw = SRC_W, sh = SRC_H, sx = 0, sy = 0;
  if (SRC_W / SRC_H > aspect) {
    sw = Math.round(SRC_H * aspect);
    sx = Math.round((SRC_W - sw) / 2);
  } else {
    sh = Math.round(SRC_W / aspect);
    sy = Math.round((SRC_H - sh) / 2);
  }
  ctx.drawImage(home.bg, sx, sy, sw, sh, 0, 0, DESIGN_W, DESIGN_H);
  ctx.drawImage(home.heroes, sx, sy, sw, sh, 0, 0, DESIGN_W, DESIGN_H);
}

export class Menu {
  private t = 0;
  private hover = false;
  private pressed = false;
  constructor(private home: HomeAssets, private onStart: () => void) {}
  update(dt: number): void { this.t += dt; }
  onPointerMove(p: { x: number; y: number }): void { this.hover = this.buttonAt(p); }
  onPointerDown(p: { x: number; y: number }): void { this.pressed = this.buttonAt(p); }
  onPointerUp(p: { x: number; y: number }): void {
    const activate = this.pressed && this.buttonAt(p);
    this.pressed = false;
    if (activate) this.onStart();
  }
  private visualScale(): number {
    if (this.pressed) return 0.96;
    return this.hover ? 1.06 : 1;
  }
  private buttonAt(p: { x: number; y: number }): boolean {
    const s = this.visualScale();
    return Math.abs(p.x - START.cx) <= START.w * s / 2 && Math.abs(p.y - START.cy) <= START.h * s / 2;
  }
  draw(ctx: CanvasRenderingContext2D): void {
    drawHomeBackdrop(ctx, this.home);
    const float = Math.sin(this.t * 1.6) * 6;
    drawUiArt(ctx, this.home.title, { x: (DESIGN_W - 850) / 2, y: 45 + float, w: 850, h: 185 });
    ctx.save();
    ctx.translate(START.cx, START.cy);
    const s = this.visualScale() + (this.pressed ? 0 : Math.sin(this.t * 2.2) * 0.012);
    ctx.scale(s, s);
    if (this.hover && !this.pressed) ctx.filter = 'brightness(1.12)';
    ctx.shadowColor = 'rgba(40, 20, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(this.home.btnStart, -START.w / 2, -START.h / 2, START.w, START.h);
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('非商用整活 · MIT 开源', DESIGN_W - 18, DESIGN_H - 14);
  }
}
