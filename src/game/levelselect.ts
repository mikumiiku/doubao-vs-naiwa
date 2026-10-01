import { DESIGN_H, DESIGN_W, LEVELS, type LevelDef } from './config';
import type { Assets } from '../core/assets';
import { drawHomeBackdrop } from './menu';
import { unlockedLevel } from './progress';
import { DEFENDERS } from './units';

/**
 * 选关界面：开始菜单之后、进入战场之前。
 * 复用主菜单的背景与主体立绘（同一动态裁剪），关卡以卡牌形式横排。
 */

const FONT = 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

const CARD_W = 260;
const CARD_H = 300;

interface LevelCard {
  level: LevelDef;
  x: number;
  y: number;
}

export class LevelSelect {
  private t = 0;
  private hover: number | null = null;
  private cards: LevelCard[] = [];

  constructor(
    private assets: Assets,
    private onSelect: (level: LevelDef) => void,
    private onBack: () => void,
  ) {
    const gap = 60;
    const totalW = LEVELS.length * CARD_W + (LEVELS.length - 1) * gap;
    LEVELS.forEach((level, i) => {
      this.cards.push({ level, x: DESIGN_W / 2 - totalW / 2 + i * (CARD_W + gap), y: 330 });
    });
  }

  update(dt: number): void {
    this.t += dt;
  }

  onPointerMove(p: { x: number; y: number }): void {
    this.hover = this.cardAt(p.x, p.y);
  }

  onPointerDown(p: { x: number; y: number }): void {
    if (p.x < 130 && p.y < 64) {
      this.onBack();
      return;
    }
    const i = this.cardAt(p.x, p.y);
    if (i !== null && this.cards[i].level.id <= unlockedLevel()) this.onSelect(this.cards[i].level);
  }

  private cardAt(x: number, y: number): number | null {
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      if (x >= c.x && x <= c.x + CARD_W && y >= c.y && y <= c.y + CARD_H) return i;
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawHomeBackdrop(ctx, this.assets.home);
    // 压暗一点突出关卡卡
    ctx.fillStyle = 'rgba(20, 16, 10, 0.45)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 72px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5b2d12';
    ctx.strokeText('选择关卡', DESIGN_W / 2, 170);
    const grad = ctx.createLinearGradient(0, 130, 0, 210);
    grad.addColorStop(0, '#fff7d6');
    grad.addColorStop(1, '#f5a623');
    ctx.fillStyle = grad;
    ctx.fillText('选择关卡', DESIGN_W / 2, 170);

    this.cards.forEach((c, i) => this.drawCard(ctx, c, i));
    // 返回
    ctx.textAlign = 'left';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText('‹ 返回', 30, 40);
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: LevelCard, i: number): void {
    const locked = c.level.id > unlockedLevel();
    const hovered = this.hover === i && !locked;
    const s = hovered ? 1.04 : 1;
    ctx.save();
    ctx.translate(c.x + CARD_W / 2, c.y + CARD_H / 2);
    ctx.scale(s, s);
    ctx.translate(-CARD_W / 2, -CARD_H / 2);

    ctx.beginPath();
    ctx.roundRect(0, 0, CARD_W, CARD_H, 16);
    ctx.fillStyle = locked ? '#d8cdb4' : '#fdf3d8';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = locked ? '#9a8a6a' : hovered ? '#ffd54a' : '#8a5a28';
    ctx.stroke();

    if (locked) {
      // 锁定：灰卡 + 挂锁 + 提示
      ctx.fillStyle = 'rgba(60, 50, 35, 0.45)';
      ctx.beginPath();
      ctx.roundRect(0, 0, CARD_W, CARD_H, 16);
      ctx.fill();
      const lx = CARD_W / 2, ly = 130;
      ctx.strokeStyle = '#e8dfc8';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(lx, ly - 12, 22, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#e8dfc8';
      ctx.beginPath();
      ctx.roundRect(lx - 32, ly - 14, 64, 50, 9);
      ctx.fill();
      ctx.fillStyle = '#8a7a5a';
      ctx.beginPath();
      ctx.arc(lx, ly + 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold 24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f3ecd8';
      ctx.fillText(`第 ${c.level.id} 关`, CARD_W / 2, 210);
      ctx.font = `20px ${FONT}`;
      ctx.fillText(`通关第 ${c.level.id - 1} 关解锁`, CARD_W / 2, 246);
      ctx.restore();
      return;
    }

    ctx.fillStyle = '#5b2d12';
    ctx.font = `bold 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`第 ${c.level.id} 关`, CARD_W / 2, 42);
    ctx.font = `22px ${FONT}`;
    ctx.fillStyle = '#8a6435';
    ctx.fillText(c.level.name, CARD_W / 2, 78);

    // 本关可用单位预览
    const ids = c.level.cards;
    const previewH = 110;
    const pw = 70;
    const gap = 16;
    const startX = CARD_W / 2 - (ids.length * pw + (ids.length - 1) * gap) / 2;
    ids.forEach((id, k) => {
      const def = DEFENDERS.find((d) => d.id === id);
      const portrait = def ? this.assets.card(id, def.cost) : undefined;
      const img = portrait ?? this.assets.frame(id, 'idle', 0);
      if (!img) return;
      const th = portrait ? previewH : 96;
      const tw = (th * img.width) / img.height;
      ctx.drawImage(img, startX + k * (pw + gap) + pw / 2 - tw / 2, 100 + (previewH - th) / 2, tw, th);
    });

    ctx.fillStyle = '#4a3a1f';
    ctx.font = `20px ${FONT}`;
    const total = c.level.waves.reduce((n, w) => n + w.count, 0);
    ctx.fillText(`${c.level.waves.length} 波 · ${total} 只奶蛙`, CARD_W / 2, 246);

    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = hovered ? '#b97917' : '#8a6435';
    ctx.fillText('点击开战 ›', CARD_W / 2, 276);
    ctx.restore();
  }
}
