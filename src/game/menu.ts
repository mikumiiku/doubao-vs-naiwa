import { DESIGN_H, DESIGN_W } from './config';

/**
 * 开始菜单：背景 + 主体立绘（assets/homepage 同构图两层，cover 绘制）+
 * 标题 + 开始/设置/退出按钮。设置与退出目前弹出说明面板。
 */

const FONT = 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 素材原始尺寸（背景与主体同构图） */
const SRC_W = 1672;
const SRC_H = 941;

/**
 * 动态裁剪：按设计区宽高比从素材中部取源矩形，精确铺满设计区（不溢出），
 * 保证开始游戏后 homepage 不会残留在游戏主体之外。
 */
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

interface MenuButton {
  id: 'start' | 'settings' | 'quit';
  img: 'btnStart' | 'btnSettings' | 'btnQuit';
  /** 中心坐标与宽度（设计坐标）；高 = 宽 / 3（素材 2172x724） */
  cx: number;
  cy: number;
  w: number;
}

const BUTTONS: MenuButton[] = [
  { id: 'start', img: 'btnStart', cx: DESIGN_W / 2, cy: 668, w: 460 },
  { id: 'settings', img: 'btnSettings', cx: DESIGN_W / 2 - 160, cy: 838, w: 280 },
  { id: 'quit', img: 'btnQuit', cx: DESIGN_W / 2 + 160, cy: 838, w: 280 },
];

export interface HomeAssets {
  bg: HTMLImageElement;
  heroes: HTMLImageElement;
  btnStart: HTMLImageElement;
  btnSettings: HTMLImageElement;
  btnQuit: HTMLImageElement;
}

type Panel = 'settings' | 'quit' | null;

export class Menu {
  private t = 0;
  private hover: string | null = null;
  private pressed: string | null = null;
  private panel: Panel = null;

  constructor(
    private home: HomeAssets,
    private onStart: () => void,
  ) {}

  update(dt: number): void {
    this.t += dt;
  }

  onPointerMove(p: { x: number; y: number }): void {
    this.hover = this.panel ? null : (this.buttonAt(p.x, p.y)?.id ?? null);
  }

  onPointerDown(p: { x: number; y: number }): void {
    if (this.panel) {
      this.panel = null;
      return;
    }
    const b = this.buttonAt(p.x, p.y);
    if (b) this.pressed = b.id;
  }

  onPointerUp(p: { x: number; y: number }): void {
    if (!this.pressed) return;
    const b = this.buttonAt(p.x, p.y);
    const id = this.pressed;
    this.pressed = null;
    if (!b || b.id !== id) return;
    if (id === 'start') this.onStart();
    else this.panel = id;
  }

  private buttonAt(x: number, y: number): MenuButton | null {
    for (const b of BUTTONS) {
      const h = b.w / 3;
      const s = this.visualScale(b);
      const hw = (b.w * s) / 2;
      const hh = (h * s) / 2;
      if (x >= b.cx - hw && x <= b.cx + hw && y >= b.cy - hh && y <= b.cy + hh) return b;
    }
    return null;
  }

  private visualScale(b: MenuButton): number {
    if (this.pressed === b.id) return 0.96;
    if (this.hover === b.id) return 1.06;
    return 1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawHomeBackdrop(ctx, this.home);
    this.drawTitle(ctx);
    for (const b of BUTTONS) this.drawButton(ctx, b);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('非商用整活 · MIT 开源', DESIGN_W - 18, DESIGN_H - 14);

    if (this.panel) this.drawPanel(ctx, this.panel);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    const float = Math.sin(this.t * 1.6) * 6;
    ctx.save();
    ctx.translate(DESIGN_W / 2, 128 + float);
    ctx.font = `900 96px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(60, 20, 0, 0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.lineWidth = 14;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5b2d12';
    ctx.strokeText('豆包大战奶蛙', 0, 0);
    ctx.shadowColor = 'transparent';
    const grad = ctx.createLinearGradient(0, -48, 0, 48);
    grad.addColorStop(0, '#fff7d6');
    grad.addColorStop(0.55, '#ffd94d');
    grad.addColorStop(1, '#f5a623');
    ctx.fillStyle = grad;
    ctx.fillText('豆包大战奶蛙', 0, 0);
    ctx.restore();
  }

  private drawButton(ctx: CanvasRenderingContext2D, b: MenuButton): void {
    const h = b.w / 3;
    const s = this.visualScale(b);
    const wob = b.id === 'start' && this.pressed !== b.id ? Math.sin(this.t * 2.2) * 0.012 : 0;
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.scale(s + wob, s + wob);
    if (this.hover === b.id && this.pressed !== b.id) ctx.filter = 'brightness(1.12)';
    ctx.shadowColor = 'rgba(40, 20, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(this.home[b.img], -b.w / 2, -h / 2, b.w, h);
    ctx.restore();
  }

  private drawPanel(ctx: CanvasRenderingContext2D, kind: Exclude<Panel, null>): void {
    ctx.save();
    ctx.fillStyle = 'rgba(20, 14, 8, 0.6)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    const w = 620;
    const h = kind === 'settings' ? 380 : 240;
    const x = (DESIGN_W - w) / 2;
    const y = (DESIGN_H - h) / 2;
    ctx.fillStyle = '#fdf3d8';
    ctx.strokeStyle = '#8a5a28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5b2d12';
    ctx.font = `bold 40px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(kind === 'settings' ? '设置' : '退出', DESIGN_W / 2, y + 30);

    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = '#4a3a1f';
    const lines =
      kind === 'settings'
        ? ['点击卡牌 → 点击草坪种下豆包', '点击抛入/产出的面团拾取（价值 25）', '右键 / Esc 取消种植', '网址加 ?debug 显示调试网格', '', '更多设置敬请期待～']
        : ['网页版没有进程可退～', '直接关闭浏览器标签页即可。'];
    lines.forEach((line, i) => {
      ctx.fillText(line, DESIGN_W / 2, y + 100 + i * 40);
    });

    ctx.font = `22px ${FONT}`;
    ctx.fillStyle = 'rgba(91, 45, 18, 0.6)';
    ctx.fillText('（点击任意处关闭）', DESIGN_W / 2, y + h - 40);
    ctx.restore();
  }
}
