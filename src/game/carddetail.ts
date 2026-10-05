/**
 * 卡片介绍页：通关后在战场中央弹出的「获得新卡片」面板。
 * 版式与命中区由绘制函数和 cardDetail*Rect 共用，保证不同入口看到的是同一个东西。
 */
import { DESIGN_H, DESIGN_W } from './config';
import type { Assets } from '../core/assets';
import type { DefenderDef } from './units';

const FONT = 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 介绍面板版式（绘制与命中共用同一组矩形） */
export const CARD_DETAIL = {
  panel: { w: 720, h: 560 },
  cardW: 210,
  next: { w: 230, h: 62, gapBelow: 0 },
  back: { w: 230, h: 62 },
};

export function cardDetailPanelRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: (DESIGN_W - CARD_DETAIL.panel.w) / 2,
    y: (DESIGN_H - CARD_DETAIL.panel.h) / 2,
    w: CARD_DETAIL.panel.w,
    h: CARD_DETAIL.panel.h,
  };
}

/** 卡片素材（卡片框）宽高比 1024x1536 */
const CARD_ASPECT = 1024 / 1536;

/** 卡片立绘在面板里的绘制矩形 */
export function cardDetailArtRect(): { x: number; y: number; w: number; h: number } {
  const p = cardDetailPanelRect();
  const h = 250;
  return { x: p.x + 54, y: p.y + 116, w: h * CARD_ASPECT, h };
}

/** 面板内容区（卡片立绘 + 右侧文案）的水平中心：按钮对齐到这里才不显得偏左 */
export function cardDetailContentCenterX(): number {
  const p = cardDetailPanelRect();
  const art = cardDetailArtRect();
  return (art.x + (p.x + p.w - 54)) / 2;
}

export function cardDetailNextButton(): { x: number; y: number; w: number; h: number } {
  const p = cardDetailPanelRect();
  const y = p.y + p.h - 92;
  const total = CARD_DETAIL.next.w + CARD_DETAIL.back.w + 24;
  return { x: cardDetailContentCenterX() - total / 2, y, w: CARD_DETAIL.next.w, h: CARD_DETAIL.next.h };
}

export function cardDetailBackButton(): { x: number; y: number; w: number; h: number } {
  const n = cardDetailNextButton();
  return { x: n.x + n.w + 24, y: n.y, w: CARD_DETAIL.back.w, h: CARD_DETAIL.back.h };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function button(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  label: string,
  primary: boolean,
): void {
  rr(ctx, r.x, r.y, r.w, r.h, 14);
  ctx.fillStyle = primary ? '#ffd54a' : 'rgba(255, 255, 255, 0.9)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = primary ? '#c99a12' : '#9a8a6a';
  ctx.stroke();
  ctx.fillStyle = primary ? '#4a3200' : '#333a45';
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
}

/**
 * 画卡片介绍页。
 * hasNext=false（最后一关）时不画「下一关」，主按钮变成「返回」。
 */
export function drawCardDetail(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  def: DefenderDef,
  hasNext: boolean,
): void {
  ctx.fillStyle = 'rgba(10, 12, 16, 0.72)';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  const p = cardDetailPanelRect();
  // 面板：奶油底 + 木纹描边
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  rr(ctx, p.x, p.y, p.w, p.h, 22);
  const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
  g.addColorStop(0, '#fff8e2');
  g.addColorStop(1, '#f2e2bc');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#8a5a28';
  rr(ctx, p.x, p.y, p.w, p.h, 22);
  ctx.stroke();

  // 标题
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 46px ${FONT}`;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#5b2d12';
  ctx.strokeText('获得新卡片！', p.x + p.w / 2, p.y + 62);
  const tg = ctx.createLinearGradient(0, p.y + 36, 0, p.y + 88);
  tg.addColorStop(0, '#fff7d6');
  tg.addColorStop(1, '#f5a623');
  ctx.fillStyle = tg;
  ctx.fillText('获得新卡片！', p.x + p.w / 2, p.y + 62);

  // 卡片立绘（左）+ 文案（右）
  const art = cardDetailArtRect();
  const card = assets.card(def.id, def.cost);
  const img = card ?? assets.frame(def.id, 'idle', 0);
  if (img && card) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 196, 60, 0.9)';
    ctx.shadowBlur = 22;
    ctx.drawImage(img, art.x, art.y, art.w, art.h);
    ctx.restore();
  } else if (img) {
    const tw = (art.h * img.width) / img.height;
    ctx.drawImage(img, art.x + art.w / 2 - tw / 2, art.y, tw, art.h);
  }

  const tx = art.x + art.w + 46;
  const tw2 = p.x + p.w - 54 - tx;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5b2d12';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(def.name, tx, art.y + 30);
  // 面团消耗
  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = '#8a6435';
  ctx.fillText('消耗', tx, art.y + 84);
  const dough = assets.doughImg;
  const iconS = 30;
  const labelX = tx + 62;
  if (dough) ctx.drawImage(dough, labelX, art.y + 84 - iconS / 2, iconS, iconS);
  ctx.fillStyle = '#7a3c17';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(String(def.cost), labelX + iconS + 8, art.y + 86);
  // 介绍
  ctx.font = `22px ${FONT}`;
  ctx.fillStyle = '#4a3a1f';
  wrapText(ctx, def.describe, tx, art.y + 152, tw2, 34);

  // 按钮
  if (hasNext) {
    const n = cardDetailNextButton();
    button(ctx, n, '下一关 ›', true);
    const b = cardDetailBackButton();
    button(ctx, b, '返回', false);
  } else {
    const all = p.x + p.w / 2 - CARD_DETAIL.back.w / 2;
    const b = cardDetailBackButton();
    button(ctx, { ...b, x: all }, '返回', true);
  }
}

/** 按宽度折行的简单文本绘制（中文按字符断行） */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  let line = '';
  let cy = y;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      cy += lineH;
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

export function inRect(
  p: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
