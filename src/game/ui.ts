import { DESIGN_H, DESIGN_W, MOWER } from './config';
import { sfx } from '../core/sfx';
import type { Assets } from '../core/assets';
import type { Game } from './game';
import type { Mower } from './entities';
import { DEFENDERS } from './units';

const FONT = 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

export interface Card {
  defId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 左上角面团计数牌（素材 1000x333, 3:1） */
export const DOUGH_PANEL = { x: 14, y: 8, h: 66 };
/** 牌内标签区中心(分数, y 含 26px 字体墨迹偏置 ~2.6px)与左侧面团 medallion 中心(分数, 飞行落点用) */
export const PANEL_PLAQUE = { cx: 0.6635, cy: 0.583 };
export const PANEL_MEDALLION = { cx: 0.2515, cy: 0.4685 };
/** 顶部选卡框（素材 2172x724） */
export const CARD_BAR = { x: 190, y: 4, w: 712, h: 237 };

/** 卡槽几何（源图 2172x724 逐像素实测的分数坐标，2026-10 版豆包选卡框）：首槽中心 + 槽尺寸 + 间距 */
const SLOT = {
  cx0: 216 / 2172,
  cy: 338 / 724,
  w: 182 / 2172,
  h: 353 / 724,
  pitch: 218 / 2172,
};

export function cardLayout(cards: string[]): Card[] {
  return cards.map((defId, i) => {
    const cx = CARD_BAR.x + (SLOT.cx0 + i * SLOT.pitch) * CARD_BAR.w;
    const cy = CARD_BAR.y + SLOT.cy * CARD_BAR.h;
    const w = SLOT.w * CARD_BAR.w;
    const h = SLOT.h * CARD_BAR.h;
    return { defId, x: cx - w / 2, y: cy - h / 2, w, h };
  });
}

export function cardAt(x: number, y: number, cards: string[]): Card | null {
  for (const c of cardLayout(cards)) {
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
  }
  return null;
}

export function restartButton(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W / 2 - 90, y: DESIGN_H / 2 + 30, w: 180, h: 56 };
}

export function exitToLevelsButton(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W / 2 - 90, y: DESIGN_H / 2 + 102, w: 180, h: 56 };
}

/** 右上角菜单按钮 */
export function menuButtonRect(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W - 116, y: 10, w: 100, h: 40 };
}

/** 暂停面板与内部控件（与 game.ts 的点击判定共用） */
export function pausePanelRect(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W / 2 - 140, y: DESIGN_H / 2 - 170, w: 280, h: 340 };
}

export function volumeSliderRect(): { x: number; y: number; w: number; h: number } {
  const panel = pausePanelRect();
  return { x: panel.x + 40, y: panel.y + 96, w: 200, h: 10 };
}

/** 画一团和好的面团。(x,y) 为底部锚点，size 为宽度（素材方形） */
export function drawDough(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  shadow = false,
): void {
  const img = assets.doughImg;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (shadow) {
    ctx.beginPath();
    ctx.ellipse(x, y + 2, size * 0.42, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 30, 20, 0.28)';
    ctx.fill();
  }
  if (img) ctx.drawImage(img, x - size / 2, y - size, size, size);
  ctx.restore();
}

/** 画大肥鱼小推车：待命时趴在院子边上，冲锋时上下扑腾 */
export function drawMower(ctx: CanvasRenderingContext2D, assets: Assets, m: Mower): void {
  if (m.state === 'gone') return;
  const img = assets.mowerImg;
  if (!img) return;
  const w = MOWER.w;
  const h = w / 2;
  const bob = m.state === 'active' ? Math.abs(Math.sin(m.t * 12)) * 10 : 0;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(m.x, m.y + 2, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 30, 20, 0.25)';
  ctx.fill();
  // 素材头朝右，与冲锋方向一致
  ctx.drawImage(img, m.x - w / 2, m.y - h - bob, w, h);
  ctx.restore();
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

export function drawHud(ctx: CanvasRenderingContext2D, game: Game): void {
  // 面团计数牌（左 medallion 是面团图标，右侧标签区画数量）
  const dp = DOUGH_PANEL;
  const dw = dp.h * 3;
  ctx.drawImage(game.assets.doughPanelImg, dp.x, dp.y, dw, dp.h);
  ctx.fillStyle = '#5b2d12';
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(game.dough), dp.x + dw * PANEL_PLAQUE.cx, dp.y + dp.h * PANEL_PLAQUE.cy);

  // 选卡框容器 + 卡槽里的卡牌
  ctx.drawImage(game.assets.cardBarImg, CARD_BAR.x, CARD_BAR.y, CARD_BAR.w, CARD_BAR.h);
  for (const card of cardLayout(game.level.cards)) {
    const def = DEFENDERS.find((d) => d.id === card.defId)!;
    const cd = game.cooldowns.get(def.id) ?? 0;
    const affordable = game.dough >= def.cost;
    const selected = game.placing === def.id;

    // 组合卡牌(卡片框+立绘+面团值)整张贴进卡槽; 不可用/冷却中直接换成整体变暗版(与卡片形状严格一致)
    const dimmed = !affordable || cd > 0;
    const art = dimmed ? game.assets.cardDimmed(def.id, def.cost) : game.assets.card(def.id, def.cost);
    if (art) {
      const ah = card.h * 0.94;
      const aw = (ah * art.width) / art.height;
      ctx.drawImage(art, card.x + card.w / 2 - aw / 2, card.y + card.h / 2 - ah / 2, aw, ah);
    }

    if (selected) {
      rr(ctx, card.x - 2, card.y - 2, card.w + 4, card.h + 4, 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd54a';
      ctx.stroke();
    }

    if (!affordable || cd > 0) {
      if (cd > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cd.toFixed(1), card.x + card.w / 2, card.y + card.h / 2);
      }
    }
  }

  // 波次横幅（右上空档：卡牌栏右侧 ~ 菜单按钮左侧）
  if (game.bannerT > 0 && game.banner) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, game.bannerT / 0.5);
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.strokeText(game.banner, 1150, 110);
    ctx.fillStyle = '#ffe28a';
    ctx.fillText(game.banner, 1150, 110);
    ctx.restore();
  }

  // 右上角菜单按钮
  const mb = menuButtonRect();
  rr(ctx, mb.x, mb.y, mb.w, mb.h, 10);
  ctx.fillStyle = 'rgba(20, 24, 30, 0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('菜单', mb.x + mb.w / 2, mb.y + mb.h / 2 + 1);

  drawProgress(ctx, game);
}

/** 关卡进度条（右下角）：边框素材 + 绿色填充；每波旗帜到点时升起，最后一波用大旗 */
function drawProgress(ctx: CanvasRenderingContext2D, game: Game): void {
  const img = game.assets.progressBarImg;
  if (!img) return;
  const bw = 300;
  const bh = (bw * img.height) / img.width; // 300x100
  const bx = DESIGN_W - bw - 14;
  const by = DESIGN_H - bh - 8;

  // 填充槽（原图 2172x724 中内槽约 [272,278]-[1901,420]，向内收缩防溢边）
  const sx = 272 / 2172, sy = 278 / 724, sw = (1901 - 272) / 2172, sh = (420 - 278) / 724;
  const inset = 5;
  const fx = bx + sx * bw + inset;
  const fy = by + sy * bh + inset;
  const fw = sw * bw - inset * 2;
  const fh = sh * bh - inset * 2;

  // 进度：波次推进 + 当前波已刷出比例；胜利时填满
  const total = game.waves.length;
  let prog = game.waveIndex;
  if (game.state === 'win') {
    prog = total;
  } else if (game.waveActive && game.waveIndex < total) {
    const wv = game.waves[game.waveIndex];
    prog += (wv.count - game.spawnQueue) / wv.count;
  }
  prog = Math.max(0, Math.min(1, prog / total));

  // 旗帜（先画，让边框压住旗杆底部，有“从条上升起”的效果）
  for (let i = 0; i < total; i++) {
    const isLast = i === total - 1;
    const flagImg = isLast ? game.assets.flagBigImg : game.assets.flagSmallImg;
    if (!flagImg) continue;
    const raised = game.waveIndex > i || game.state === 'win' || (game.waveIndex === i && game.waveActive);
    let rise = raised ? 1 : 0;
    if (game.waveIndex === i && game.waveActive) {
      rise = Math.min(1, Math.max(0, (game.time - game.waveStartedAt) / 0.5));
    }
    const fh2 = isLast ? 92 : 58;
    const fw2 = (fh2 * flagImg.width) / flagImg.height;
    const cx = fx + (i / total) * fw + fw / total / 2;
    const baseY = fy + fh * 0.55;
    ctx.save();
    ctx.globalAlpha = 0.35 + rise * 0.65;
    ctx.drawImage(flagImg, cx - fw2 / 2, baseY - fh2 + (1 - rise) * 30, fw2, fh2);
    ctx.restore();
  }

  // 填充（柔和草绿渐变）
  const fillW = fw * prog;
  if (fillW > 1) {
    const grad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    grad.addColorStop(0, '#aed581');
    grad.addColorStop(1, '#7cb342');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(fx, fy, fillW, fh, fh / 2);
    ctx.fill();
  }

  // 边框素材压在最上
  ctx.drawImage(img, bx, by, bw, bh);
}

export function drawOverlay(ctx: CanvasRenderingContext2D, game: Game): void {
  if (game.state === 'playing') return;
  ctx.fillStyle = 'rgba(8, 10, 14, 0.65)';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillStyle = game.state === 'win' ? '#9be15d' : '#ff7b7b';
  ctx.fillText(
    game.state === 'win' ? '胜利！奶蛙全灭！' : '奶蛙闯进了家园区…',
    DESIGN_W / 2,
    DESIGN_H / 2 - 60,
  );
  const b = restartButton();
  rr(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.fillStyle = '#ffd54a';
  ctx.fill();
  ctx.fillStyle = '#4a3200';
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText('重新开始', b.x + b.w / 2, b.y + b.h / 2 + 2);
  const e = exitToLevelsButton();
  rr(ctx, e.x, e.y, e.w, e.h, 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
  ctx.fillStyle = '#333a45';
  ctx.fillText('返回选关', e.x + e.w / 2, e.y + e.h / 2 + 2);
}

/** 暂停面板：继续 / 音量滑条 / 退出本关 */
export function drawPause(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  const panel = pausePanelRect();
  rr(ctx, panel.x, panel.y, panel.w, panel.h, 18);
  ctx.fillStyle = '#fdf3d8';
  ctx.fill();
  ctx.strokeStyle = '#8a5a28';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5b2d12';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText('已暂停', DESIGN_W / 2, panel.y + 44);

  // 音量
  ctx.font = `22px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#4a3a1f';
  ctx.fillText('音量', panel.x + 40, panel.y + 78);
  const vs = volumeSliderRect();
  rr(ctx, vs.x, vs.y, vs.w, vs.h, 5);
  ctx.fillStyle = '#cbb287';
  ctx.fill();
  const v = sfx.getVolume();
  if (v > 0) {
    rr(ctx, vs.x, vs.y, vs.w * v, vs.h, 5);
    ctx.fillStyle = '#8bc34a';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(vs.x + vs.w * v, vs.y + vs.h / 2, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#5b2d12';
  ctx.fill();
  ctx.fillStyle = 'rgba(91, 45, 18, 0.55)';
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(v * 100)}%`, vs.x + vs.w + 28, vs.y + 6);

  // 继续 / 退出
  const bContinue = { x: panel.x + 40, y: panel.y + 150, w: 200, h: 52 };
  rr(ctx, bContinue.x, bContinue.y, bContinue.w, bContinue.h, 12);
  ctx.fillStyle = '#ffd54a';
  ctx.fill();
  ctx.fillStyle = '#4a3200';
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText('继续', bContinue.x + bContinue.w / 2, bContinue.y + bContinue.h / 2 + 1);

  const bQuit = { x: panel.x + 40, y: panel.y + 220, w: 200, h: 52 };
  rr(ctx, bQuit.x, bQuit.y, bQuit.w, bQuit.h, 12);
  ctx.fillStyle = 'rgba(120, 90, 50, 0.25)';
  ctx.fill();
  ctx.strokeStyle = '#8a5a28';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#5b2d12';
  ctx.fillText('退出本关', bQuit.x + bQuit.w / 2, bQuit.y + bQuit.h / 2 + 1);
}
