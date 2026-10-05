import { DESIGN_H, DESIGN_W, MOWER } from './config';
import { sfx } from '../core/sfx';
import type { Assets } from '../core/assets';
import type { Game } from './game';
import type { Mower } from './entities';
import { DEFENDERS } from './units';
import { drawUiArt } from '../core/uiart';

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

export function loseButtonsRect(): {
  restart: { x: number; y: number; w: number; h: number };
  back: { x: number; y: number; w: number; h: number };
} {
  return {
    restart: { x: DESIGN_W / 2 - 370, y: 750, w: 350, h: 130 },
    back: { x: DESIGN_W / 2 + 20, y: 750, w: 350, h: 130 },
  };
}

export function exitToLevelsButton(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W / 2 - 90, y: DESIGN_H / 2 + 102, w: 180, h: 56 };
}

/** 右上角菜单按钮（素材 trim 后约 2.45:1；命中区与绘制区一致） */
export function menuButtonRect(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W - 150, y: 8, w: 140, h: 58 };
}

/** 暂停面板几何；绘制、内容布局和命中判定共用。 */
export function pausePanelRect(): { x: number; y: number; w: number; h: number } {
  return { x: DESIGN_W / 2 - 245, y: DESIGN_H / 2 - 305, w: 490, h: 600 };
}

/** 铲子道具按钮（卡牌栏右侧, 与卡槽同排同高；PvZ 的铲子位） */
export function shovelButtonRect(): { x: number; y: number; w: number; h: number } {
  return { x: 1380, y: 83, w: 76, h: 116 };
}

/** 面板奶油内容区（框素材的木纹边框以内，标题/滑条/按钮都排在这里） */
function panelInner(panel: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  return { x: panel.x + panel.w * 0.14, y: panel.y + panel.h * 0.17, w: panel.w * 0.72, h: panel.h * 0.72 };
}

export function volumeSliderRect(): { x: number; y: number; w: number; h: number } {
  const inner = panelInner(pausePanelRect());
  return { x: inner.x + 24, y: inner.y + 108, w: inner.w - 48, h: 14 };
}

/** 暂停面板按钮（继续/退出），绘制与点击判定共用 */
export function pauseButtonsRect(): {
  cont: { x: number; y: number; w: number; h: number };
  quit: { x: number; y: number; w: number; h: number };
} {
  const inner = panelInner(pausePanelRect());
  return {
    cont: { x: inner.x, y: inner.y + 148, w: inner.w, h: 135 },
    quit: { x: inner.x, y: inner.y + 294, w: inner.w, h: 135 },
  };
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

/** 画夹子按钮（卡牌栏右侧, 与卡槽同排同高；承接 PvZ 的铲子位，素材 assets/props/夹子.png） */
export function drawShovelButton(ctx: CanvasRenderingContext2D, assets: Assets, selected: boolean): void {
  const img = assets.clipImg;
  const r = shovelButtonRect();
  ctx.save();
  ctx.shadowColor = 'rgba(40, 20, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(assets.ui['clip-frame'], r.x, r.y, r.w, r.h);
  ctx.restore();
  // 夹子图（素材本身是斜放的开口造型, 直接居中 contain 绘制）
  if (img) {
    const pad = 10;
    const s = Math.min((r.w - pad * 2) / img.width, (r.h - pad * 2) / img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, r.x + r.w / 2 - w / 2, r.y + r.h / 2 - h / 2, w, h);
  }
  // 选中黄框（与卡牌选中一致）
  if (selected) {
    rr(ctx, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 12);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd54a';
    ctx.stroke();
  }
}

/** 把夹子图标画到任意位置（光标跟随 / 挖掘动作用）；(x,y) 为中心，size 为图标高度 */
export function drawShovelIconAt(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  squeezeX = 1,
): void {
  if (!img) return;
  const s = (size / img.height) * squeezeX;
  const sY = size / img.height;
  const w = img.width * s;
  const h = img.height * sY;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
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
  if (!game.invasion && !game.conveyor) {
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

      // 组合卡牌(卡片框+立绘+面团值)整张贴进卡槽
      // 三态: 冷却中=整体"黑"+次黑从底到顶覆盖(已恢复部分); 面团不足=次黑; 可用=亮
      const art = game.assets.card(def.id, def.cost);
      const semi = game.assets.cardDimmed(def.id, def.cost);
      const dark = game.assets.cardDark(def.id, def.cost);
      if (!art || !semi || !dark) continue;
      const ah = card.h * 0.94;
      const aw = (ah * art.width) / art.height;
      const dx = card.x + card.w / 2 - aw / 2;
      const dy = card.y + card.h / 2 - ah / 2;
      if (cd > 0) {
        const left = Math.min(1, cd / def.cooldown);
        const cut = dy + ah * left;
        // 上下两段分别裁剪绘制、互不重叠: 立绘窗在变暗卡里仍是半透明像素,
        // 若"次黑"整层叠在"黑"上, 窗区会被叠两层多黑一截, 回满时又会突变回单态灰度
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, aw, ah * left); // 上部"黑"(尚未恢复)
        ctx.clip();
        ctx.drawImage(dark, dx, dy, aw, ah);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, cut, aw, ah * (1 - left)); // 下部"次黑"(已恢复, 自底向上推进)
        ctx.clip();
        ctx.drawImage(semi, dx, dy, aw, ah);
        ctx.restore();
      } else if (!affordable) {
        ctx.drawImage(semi, dx, dy, aw, ah);
      } else {
        ctx.drawImage(art, dx, dy, aw, ah);
      }

      // 选中高亮框贴着卡牌外缘画(而不是卡槽)
      if (selected) {
        rr(ctx, dx - 1.5, dy - 1.5, aw + 3, ah + 3, 8);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffd54a';
        ctx.stroke();
      }
    }

    // 悬浮在卡牌上时显示名字(提示框跟随鼠标, 夹在设计区内)
    for (const card of cardLayout(game.level.cards)) {
      if (game.mouse.x < card.x || game.mouse.x > card.x + card.w || game.mouse.y < card.y || game.mouse.y > card.y + card.h) continue;
      const def = DEFENDERS.find((d) => d.id === card.defId);
      if (!def) break;
      drawUnitTooltip(ctx, def.name, def.effect, game.mouse.x + 18, game.mouse.y - 76);
      break;
    }
  }

  // 夹子道具（卡牌栏右侧；选中时黄框高亮, 与卡牌选中同款）
  if (!game.invasion) drawShovelButton(ctx, game.assets, game.shoveling);

  // 波次横幅（屏幕中央，如"一大波奶蛙即将到来"）
  if (game.bannerT > 0 && game.banner) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, game.bannerT / 0.5);
    ctx.font = `bold 56px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.strokeText(game.banner, DESIGN_W / 2, DESIGN_H / 2);
    ctx.fillStyle = '#ffe28a';
    ctx.fillText(game.banner, DESIGN_W / 2, DESIGN_H / 2);
    ctx.restore();
  }

  // 右上角菜单按钮（素材图自带"菜单"字样）
  const mb = menuButtonRect();
  drawUiArt(ctx, game.assets.ui.menu, mb);

  drawProgress(ctx, game);
  if (!game.invasion && !game.conveyor && game.level.intro) {
    ctx.save();
    ctx.fillStyle = 'rgba(253,243,216,.92)';
    ctx.strokeStyle = '#8a5a28';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(935, 79, 430, 143, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5b2d12';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 21px ${FONT}`;
    ctx.fillText(game.level.trial ? game.level.name : `第${game.level.id}关 · ${game.level.name}`, 951, 104, 400);
    ctx.font = `18px ${FONT}`;
    const lines = game.level.intro.match(/.{1,21}/g) ?? [];
    lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, 951, 135 + i * 23, 400));
    ctx.restore();
  }
}

export function drawUnitTooltip(ctx: CanvasRenderingContext2D, name: string, effect: string, x: number, y: number): void {
  ctx.save();
  ctx.font = `bold 22px ${FONT}`;
  const tw = Math.max(ctx.measureText(name).width, ctx.measureText(effect).width);
  const pw = tw + 28;
  const ph = 66;
  let tx = x;
  let ty = y;
  tx = Math.min(Math.max(4, tx), DESIGN_W - pw - 4);
  ty = Math.min(Math.max(4, ty), DESIGN_H - ph - 4);
  ctx.shadowColor = 'rgba(40, 20, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  rr(ctx, tx, ty, pw, ph, 10);
  ctx.fillStyle = '#fdf3d8';
  ctx.fill();
  ctx.restore();
  rr(ctx, tx, ty, pw, ph, 10);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a5a28';
  ctx.stroke();
  ctx.fillStyle = '#5b2d12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText(name, tx + pw / 2, ty + 21);
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = '#776044';
  ctx.fillText(effect, tx + pw / 2, ty + 47);
  ctx.restore();
}

/**
 * 进度条素材只是一圈木框，中间是**透明洞**，填充必须画在这个洞里。
 * 洞的位置不能写死（换个素材尺寸就错位，历史上就出现过填充跑到条顶、只有一条细线的问题），
 * 这里直接从素材像素里扫出来并缓存。
 * @returns 归一化矩形 { x, y, w, h }（相对素材尺寸）
 */
const barHoleCache = new WeakMap<HTMLImageElement, { x: number; y: number; w: number; h: number } | null>();

function progressBarHole(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  const hit = barHoleCache.get(img);
  if (hit !== undefined) return hit;
  let res: { x: number; y: number; w: number; h: number } | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d');
    if (cx) {
      cx.drawImage(img, 0, 0);
      const { data } = cx.getImageData(0, 0, img.width, img.height);
      const W = img.width;
      const H = img.height;
      const open = (x: number, y: number): boolean => data[(y * W + x) * 4 + 3] < 24;
      // 从画面正中央向外找洞的左右边界（中央一定是洞，不会误判成画布外的透明区）
      const midY = H >> 1;
      let x0 = W >> 1;
      while (x0 > 0 && open(x0 - 1, midY)) x0--;
      let x1 = W >> 1;
      while (x1 < W - 1 && open(x1 + 1, midY)) x1++;
      // 在洞的水平中点上下扫出洞的上下边界
      const midX = (x0 + x1) >> 1;
      let y0 = midY;
      while (y0 > 0 && open(midX, y0 - 1)) y0--;
      let y1 = midY;
      while (y1 < H - 1 && open(midX, y1 + 1)) y1++;
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (w > W * 0.4 && h > H * 0.1) res = { x: x0 / W, y: y0 / H, w: w / W, h: h / H };
    }
  } catch {
    res = null;
  }
  barHoleCache.set(img, res);
  return res;
}

/** 关卡进度条（右下角）：边框素材 + 面团黄填充 + 领跑的小奶蛙；仅大波升旗（最后一波用大旗）。 */
function drawProgress(ctx: CanvasRenderingContext2D, game: Game): void {
  const img = game.assets.progressBarImg;
  if (!img) return;
  const bw = 300;
  const bh = (bw * img.height) / img.width; // 300x100
  const bx = DESIGN_W - bw - 14;
  const by = DESIGN_H - bh - 8;

  // 填充槽 = 素材中间的透明洞（扫不出来时才退回一组保守默认值）
  const hole = progressBarHole(img);
  const inset = 3;
  const fx = hole ? bx + hole.x * bw : bx + bw * 0.05;
  const fy = hole ? by + hole.y * bh : by + bh * 0.16;
  const fw = (hole ? hole.w * bw : bw * 0.9) - inset * 2;
  const fh = (hole ? hole.h * bh : bh * 0.68) - inset * 2;

  // 进度用 game.progressShown（update 里朝目标平滑推进，不突变）
  const total = game.waves.length;
  const prog = game.progressShown;

  // 旗帜（先画，让边框压住旗杆底部，有“从条上升起”的效果）
  // 只有大波有旗(最后一波恒有大旗), 小波不升旗
  for (let i = 0; i < total; i++) {
    const isLast = i === total - 1;
    if (!isLast && !game.waves[i].big) continue;
    const flagImg = isLast ? game.assets.flagBigImg : game.assets.flagSmallImg;
    if (!flagImg) continue;
    const raised = game.waveIndex > i || game.state === 'win' || (game.waveIndex === i && game.waveActive);
    let rise = raised ? 1 : 0;
    if (game.waveIndex === i && game.waveActive) {
      rise = Math.min(1, Math.max(0, (game.time - game.waveStartedAt) / 0.5));
    }
    const fh2 = isLast ? 58 : 42;
    const fw2 = (fh2 * flagImg.width) / flagImg.height;
    // 进度从右往左推进(奶蛙自右向左进犯): 首波旗靠右, 末波大旗靠左
    const cx = fx + fw - ((i + 0.5) / total) * fw;
    const baseY = fy + fh * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.35 + rise * 0.65;
    ctx.drawImage(flagImg, cx - fw2 / 2, baseY - fh2 + (1 - rise) * 24, fw2, fh2);
    ctx.restore();
  }

  // 填充（面团黄渐变，从右端向左推进）
  const fillW = fw * prog;
  if (fillW > 1) {
    const grad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    grad.addColorStop(0, '#ffe082');
    grad.addColorStop(1, '#ffb300');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(fx + fw - fillW, fy, fillW, fh, fh / 2);
    ctx.fill();
  }

  // 边框素材压在填充之上（旗杆底部被框挡住，有"从条里升起来"的效果）
  ctx.drawImage(img, bx, by, bw, bh);

  // 领跑的奶蛙：画在**所有图层之上**（含边框），否则会被框的下沿切掉一半。
  // 站在填充前端（填充左端）朝左领跑，脚踩在条面上。
  // 进度条不关心本关奶蛙的血量，固定用断手前的完整走姿按时间轮播。
  const frogWalk = game.assets.meta('laugh_frog', 'walk');
  const frogIndex = frogWalk?.frames ? Math.floor(game.time * frogWalk.fps) % frogWalk.frames : 0;
  const frogImg = game.assets.frame('laugh_frog', 'walk', frogIndex) ?? game.assets.frame('laugh_frog', 'walk', 0);
  if (frogImg && frogImg.height > 0 && fw > 1) {
    // 比填充条高出一截，整体比之前放大约 1.3 倍，站在条面上更显眼
    const fh3 = fh * 1.25 * 1.3;
    const fw3 = (fh3 * frogImg.width) / frogImg.height;
    // 脚线在填充条内偏下：整体略微下移，视觉上落在条里居中
    const footY = fy + fh * 0.92 + 3;
    const bob = Math.abs(Math.sin(game.time * 6.5)) * 2.6;
    // 蛙身贴住填充左端；再夹住不让它探出条框
    const off = Math.max(0, Math.min(fw3 * 0.5, fw + fw3 * 0.5 - fillW));
    const cx3 = fx + fw - fillW - off + fw3 * 0.5;
    const cy3 = footY - fh3 - bob;
    ctx.save();
    // 素材整表朝右，与"朝左前进"相反，统一水平翻转（与战场里 flipX: true 一致）
    ctx.translate(cx3, cy3);
    ctx.scale(-1, 1);
    ctx.drawImage(frogImg, -fw3 / 2, 0, fw3, fh3);
    ctx.restore();
  }
}

export function drawOverlay(ctx: CanvasRenderingContext2D, game: Game): void {
  if (game.state === 'playing') return;
  ctx.fillStyle = 'rgba(8, 10, 14, 0.65)';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 通关进入奖励卡流程后，遮罩与按钮让位给奖励卡（否则"胜利"文字会被飞来的卡片压住）
  if (game.state === 'win') {
    if (game.rewardPhase !== 'none' || game.reward) return;
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillStyle = '#9be15d';
    ctx.fillText('胜利！奶蛙全灭！', DESIGN_W / 2, DESIGN_H / 2 - 60);
    // 本关没有奖励卡（例如末关）时不会有奖励流程接管，这里直接给一个"返回"，
    // 否则通关后画面会卡在遮罩上没有任何可点的东西
    if (!game.rewardCard()) {
      const e = exitToLevelsButton();
      ctx.font = `26px ${FONT}`;
      ctx.fillStyle = 'rgba(230, 240, 220, 0.85)';
      ctx.fillText('后面关卡还在做，敬请期待', DESIGN_W / 2, e.y - 26);
      rr(ctx, e.x, e.y, e.w, e.h, 12);
      ctx.fillStyle = '#ffd54a';
      ctx.fill();
      ctx.fillStyle = '#4a3200';
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText('返回', e.x + e.w / 2, e.y + e.h / 2 + 2);
    }
    return;
  }
  const enter = Math.min(1, game.loseElapsed / 0.45);
  const scale = 0.9 + 0.1 * (1 - Math.pow(1 - enter, 3));
  ctx.save();
  ctx.translate(DESIGN_W / 2, 480);
  ctx.scale(scale, scale);
  drawUiArt(ctx, game.assets.ui['lose-title'], { x: -380, y: -330, w: 760, h: 150 });
  game.loseAnim.draw(ctx, 0, 205, 365, true);
  ctx.restore();
  const buttons = loseButtonsRect();
  for (const [name, rect] of [
    ['lose-restart', buttons.restart],
    ['lose-back', buttons.back],
  ] as const) {
    ctx.save();
    if (game.mouse.x >= rect.x && game.mouse.x <= rect.x + rect.w && game.mouse.y >= rect.y && game.mouse.y <= rect.y + rect.h)
      ctx.filter = 'brightness(1.12)';
    drawUiArt(ctx, game.assets.ui[name], rect);
    ctx.restore();
  }
}

/** 暂停面板：素材外框 + 继续 / 音量滑条 / 退出本关 */
export function drawPause(ctx: CanvasRenderingContext2D, assets: Assets): void {
  ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  const panel = pausePanelRect();
  ctx.drawImage(assets.menuPanelImg, panel.x, panel.y, panel.w, panel.h);
  const inner = panelInner(panel);

  drawUiArt(ctx, assets.ui['pause-title'], { x: inner.x + 30, y: inner.y - 5, w: inner.w - 60, h: 74 });
  drawUiArt(ctx, assets.ui['volume-label'], { x: inner.x + 8, y: inner.y + 48, w: 80, h: 30 });
  const vs = volumeSliderRect();
  const track = { x: inner.x, y: vs.y - 24, w: inner.w, h: 60 };
  ctx.drawImage(assets.ui['volume-track'], track.x, track.y, track.w, track.h);
  const v = sfx.getVolume();
  if (v > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(vs.x, track.y, vs.w * v, track.h);
    ctx.clip();
    ctx.drawImage(assets.ui['volume-fill'], track.x, track.y, track.w, track.h);
    ctx.restore();
  }
  const knob = { x: vs.x + vs.w * v - 20, y: vs.y + vs.h / 2 - 20, w: 40, h: 40 };
  drawUiArt(ctx, assets.ui['volume-knob'], knob);
  const b = pauseButtonsRect();
  drawUiArt(ctx, assets.ui.continue, b.cont);
  drawUiArt(ctx, assets.ui.quit, b.quit);
}
