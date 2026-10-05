import { UI_ART, type UiArt } from './uiart';
import type { HomeAssets } from '../game/menu';
import { DEFENDERS } from '../game/units';
import { EGG_PORTRAITS } from '../game/eggstory';

export interface AnimMeta {
  frames: number;
  fps: number;
  /** 动画首帧相对参考动画首帧的注册偏移(输出像素, 绘制时乘 h/refHeight)，消除状态切换的主体跳动 */
  anchor?: [number, number];
  /**
   * 根位移轨道（PvZ 的 `_ground` 的等价物）：每帧的"身体推进量"，去均值后归一化到 ±1。
   * 走姿类动画才有；运行时按动画进度插值查表，用来调制瞬时横向速度
   * （长期平均速度不变，但每一步有快有慢，不匀速平移）。由 scripts/assets/slice-sprites.mjs 烘出。
   */
  groundTrack?: number[];
  /** 身体上下起伏轨道（同样归一化到 ±1，正值=抬高）；与 groundTrack 一起烘出 */
  bobTrack?: number[];
}

export interface Manifest {
  /** 站立参考帧高度(px)——绘制时 drawScale = 期望站立高度 / refHeight */
  refHeight: number;
  units: Record<string, Record<string, AnimMeta>>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

/** 图片 alpha 包围盒(阈值 10), 用于立绘适配卡牌窗户 */
function alphaBBox(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const data = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width,
    y0 = c.height,
    x1 = -1,
    y1 = -1;
  for (let p = 0; p < c.width * c.height; p++) {
    if (data[p * 4 + 3] > 10) {
      const px = p % c.width;
      const py = (p / c.width) | 0;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 + 1 - x0, h: y1 + 1 - y0 };
}

export class Assets {
  bg!: HTMLImageElement;
  private battleBackgrounds = new Map<string, HTMLImageElement>();
  manifest!: Manifest;
  home!: HomeAssets;
  ui!: UiArt;
  doughImg!: HTMLImageElement;
  mowerImg!: HTMLImageElement;
  flagSmallImg!: HTMLImageElement;
  flagBigImg!: HTMLImageElement;
  progressBarImg!: HTMLImageElement;
  cardBarImg!: HTMLImageElement;
  doughPanelImg!: HTMLImageElement;
  menuButtonImg!: HTMLImageElement;
  menuPanelImg!: HTMLImageElement;
  /** 夹子道具图（承接铲子职能：挖掉植物） */
  clipImg!: HTMLImageElement;
  dialoguePortraits = new Map<string, HTMLImageElement>();
  private images = new Map<string, HTMLImageElement[]>();
  private cardFrameImg!: HTMLImageElement;
  private cardPortraits = new Map<string, HTMLImageElement>();
  private composedCards = new Map<string, HTMLCanvasElement>();
  private tintCache = new Map<string, HTMLCanvasElement>();

  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    const [bg, manifest, homeBg, heroes, btnStart, doughImg, mowerImg, flagSmallImg, flagBigImg, progressBarImg, cardBarImg, doughPanelImg, clipImg] =
      await Promise.all([
        loadImage('assets/bg/day.png'),
        fetch('assets/sprites/manifest.json').then((r) => {
          if (!r.ok) throw new Error('assets/sprites/manifest.json 加载失败，请先运行 pnpm assets:slice');
          return r.json() as Promise<Manifest>;
        }),
        loadImage('assets/home/bg.jpg'),
        loadImage('assets/home/heroes.png'),
        loadImage('assets/home/btn_start.png'),
        loadImage('assets/others/dough.png'),
        loadImage('assets/mower/fish.png'),
        loadImage('assets/others/flag_small.png'),
        loadImage('assets/others/flag_big.png'),
        loadImage('assets/others/progress_bar.png'),
        loadImage('assets/others/card_bar.png'),
        loadImage('assets/others/dough_panel.png'),
        loadImage('assets/others/clip.png'),
      ]);
    this.bg = bg;
    await Promise.all([
      ['2', 'day-one'],
      ['1,2,3', 'day-three'],
      ['0,1,2,3', 'day-four'],
    ].map(async ([rows, name]) => {
      this.battleBackgrounds.set(rows, await loadImage(`assets/bg/${name}.png`));
    }));
    this.manifest = manifest;
    this.ui = Object.fromEntries(await Promise.all(UI_ART.map(async (name) => [name, await loadImage(`assets/ui/${name}.png`)]))) as UiArt;
    this.home = { bg: homeBg, heroes, btnStart, title: this.ui.title };
    this.doughImg = doughImg;
    this.mowerImg = mowerImg;
    this.flagSmallImg = flagSmallImg;
    this.flagBigImg = flagBigImg;
    this.progressBarImg = progressBarImg;
    this.cardBarImg = cardBarImg;
    this.doughPanelImg = doughPanelImg;
    this.menuButtonImg = this.ui.menu;
    this.menuPanelImg = this.ui['pause-panel'];
    this.clipImg = clipImg;
    await Promise.all(EGG_PORTRAITS.map(async (name) => {
      this.dialoguePortraits.set(name, await loadImage(`assets/dialogue/${name}.png`));
    }));

    // 卡牌：卡片框 + 豆包立绘运行时组合(填面团值与名字), 立绘缺失的跳过
    this.cardFrameImg = await loadImage('assets/cards/frame.png');
    await Promise.all(
      DEFENDERS.map(async ({ id: unit }) => {
        const img = await loadImage(`assets/cards/${unit}.png`).catch(() => null);
        if (img) this.cardPortraits.set(unit, img);
      }),
    );

    const jobs: { unit: string; anim: string; index: number; src: string }[] = [];
    for (const [unit, anims] of Object.entries(manifest.units)) {
      for (const [anim, meta] of Object.entries(anims)) {
        for (let i = 0; i < meta.frames; i++) {
          jobs.push({ unit, anim, index: i, src: `assets/sprites/${unit}/${anim}/${i}.png` });
        }
      }
    }
    let done = 0;
    await Promise.all(
      jobs.map(async (job) => {
        const img = await loadImage(job.src);
        const key = `${job.unit}/${job.anim}`;
        let arr = this.images.get(key);
        if (!arr) {
          arr = [];
          this.images.set(key, arr);
        }
        arr[job.index] = img;
        done++;
        onProgress?.(done, jobs.length);
      }),
    );
  }

  backgroundForRows(rows: readonly number[]): HTMLImageElement {
    return this.battleBackgrounds.get([...rows].sort((a, b) => a - b).join(',')) ?? this.bg;
  }

  meta(unit: string, anim: string): AnimMeta | undefined {
    return this.manifest.units[unit]?.[anim];
  }

  frame(unit: string, anim: string, index: number): HTMLImageElement | undefined {
    return this.images.get(`${unit}/${anim}`)?.[index];
  }

  /** 组合卡牌：卡片框 + 立绘(适配中间奶油窗) + 底部牌匾的面团值，结果缓存。
   *  顶部小匾是面团图标(素材自带), 不放字; 名字不在卡上(PvZ 卡只靠头像认)。 */
  card(unit: string, cost = 0): HTMLCanvasElement | undefined {
    const key = `${unit}|${cost}`;
    const hit = this.composedCards.get(key);
    if (hit) return hit;
    const portrait = this.cardPortraits.get(unit);
    if (!portrait) return undefined;
    const W = this.cardFrameImg.width;
    const H = this.cardFrameImg.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.drawImage(this.cardFrameImg, 0, 0, W, H);
    // 中间奶油窗(框素材 1024x1536 的 [38,337]-[982,1044], 按输出尺寸等比)
    const k = W / 1024;
    const win = { x: 38 * k, y: 337 * k, w: 944 * k, h: 707 * k };
    const bb = alphaBBox(portrait);
    if (bb) {
      const s = Math.min(win.w / bb.w, win.h / bb.h);
      const dw = portrait.width * s;
      const dh = portrait.height * s;
      // 内容 bbox 水平居中于窗户、脚底贴窗底(留 4px 边)
      const dx = win.x + win.w / 2 - (bb.x + bb.w / 2) * s;
      const dy = win.y + win.h - 4 * k - (bb.y + bb.h) * s;
      x.drawImage(portrait, dx, dy, dw, dh);
    }
    // 底部牌匾(1024x1536 坐标系, 按 512x768 框素材实测奶油区 [72,560]-[437,679] x2):
    // 左侧面团图标 + 右侧加大的面团值, 整组水平居中、垂直居中
    const plq = { x: 144, y: 1120, w: 730, h: 238 };
    const iconS = 200 * k;
    const gap = 36 * k;
    const label = String(cost);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `bold ${Math.round(170 * k)}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
    const tw = x.measureText(label).width;
    const cy = (plq.y + plq.h / 2) * k;
    const g0 = (plq.x + plq.w / 2) * k - (iconS + gap + tw) / 2;
    x.drawImage(this.doughImg, g0, cy - iconS / 2, iconS, iconS);
    x.fillStyle = '#7a3c17';
    x.fillText(label, g0 + iconS + gap + tw / 2, cy);
    this.composedCards.set(key, c);
    return c;
  }

  /** 卡牌高精度遮罩: 以卡片框外轮廓为界、立绘窗等被围住的透明区也包含在内。
   *  做法: 从画布四边对近透明像素泛洪、标记"卡片之外", 取反即遮罩, 再外扩 1px 盖住外框抗锯齿。
   *  比 source-atop 剪影或矩形/圆角近似精确: 剪影盖不住窗内透明区, 近似图形会漏边或溢出。 */
  private cardMask(): HTMLCanvasElement {
    const KEY = '#card-mask';
    const hit = this.composedCards.get(KEY);
    if (hit) return hit;
    const W = this.cardFrameImg.width;
    const H = this.cardFrameImg.height;
    const t = document.createElement('canvas');
    t.width = W;
    t.height = H;
    const tx = t.getContext('2d')!;
    tx.drawImage(this.cardFrameImg, 0, 0, W, H);
    const data = tx.getImageData(0, 0, W, H).data;
    const isOpen = (i: number): boolean => data[i * 4 + 3] < 64;
    // 泛洪: 从四边的近透明像素出发, 蔓延标记卡片之外的区域
    const outside = new Uint8Array(W * H);
    const stack: number[] = [];
    const seed = (i: number): void => {
      if (isOpen(i) && !outside[i]) {
        outside[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < W; x++) {
      seed(x);
      seed((H - 1) * W + x);
    }
    for (let y = 0; y < H; y++) {
      seed(y * W);
      seed(y * W + W - 1);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      if (x > 0 && isOpen(i - 1) && !outside[i - 1]) {
        outside[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x < W - 1 && isOpen(i + 1) && !outside[i + 1]) {
        outside[i + 1] = 1;
        stack.push(i + 1);
      }
      if (y > 0 && isOpen(i - W) && !outside[i - W]) {
        outside[i - W] = 1;
        stack.push(i - W);
      }
      if (y < H - 1 && isOpen(i + W) && !outside[i + W]) {
        outside[i + W] = 1;
        stack.push(i + W);
      }
    }
    // 遮罩 = 非外侧(框体 + 被围住的立绘窗), 外扩 1px 覆盖外框抗锯齿边缘
    const m = document.createElement('canvas');
    m.width = W;
    m.height = H;
    const mx = m.getContext('2d')!;
    const img = mx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let inCard = !outside[i];
        for (let dy = -1; dy <= 1 && !inCard; dy++) {
          for (let dx = -1; dx <= 1 && !inCard; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && !outside[ny * W + nx]) inCard = true;
          }
        }
        if (inCard) {
          img.data[i * 4] = 255;
          img.data[i * 4 + 1] = 255;
          img.data[i * 4 + 2] = 255;
          img.data[i * 4 + 3] = 255;
        }
      }
    }
    mx.putImageData(img, 0, 0);
    this.composedCards.set(KEY, m);
    return m;
  }

  /** 压暗变体: 彩色卡 + 遮罩内均匀暗层(alpha 决定黑度) */
  private cardShade(unit: string, cost: number, alpha: number): HTMLCanvasElement | undefined {
    const key = `${unit}|${cost}|shade${alpha}`;
    const hit = this.composedCards.get(key);
    if (hit) return hit;
    const src = this.card(unit, cost);
    if (!src) return undefined;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext('2d')!;
    x.drawImage(src, 0, 0);
    // 暗层先填满再用遮罩裁到卡片轮廓(destination-in)
    const ov = document.createElement('canvas');
    ov.width = src.width;
    ov.height = src.height;
    const ox = ov.getContext('2d')!;
    ox.fillStyle = `rgba(6, 8, 12, ${alpha})`;
    ox.fillRect(0, 0, ov.width, ov.height);
    ox.globalCompositeOperation = 'destination-in';
    ox.drawImage(this.cardMask(), 0, 0);
    x.drawImage(ov, 0, 0);
    this.composedCards.set(key, c);
    return c;
  }

  /** 次黑卡牌(面团不足 / 冷却中已恢复的底部) */
  cardDimmed(unit: string, cost = 0): HTMLCanvasElement | undefined {
    return this.cardShade(unit, cost, 0.5);
  }

  /** 黑卡牌(冷却中尚未恢复的上部); 冷却推进时次黑从底部向上将其覆盖 */
  cardDark(unit: string, cost = 0): HTMLCanvasElement | undefined {
    return this.cardShade(unit, cost, 0.75);
  }

  /**
   * 受伤染色帧：按剪影（source-atop）叠加半透明暗红，离屏 canvas 缓存。
   * stage 1 = 轻伤，stage 2 = 重伤；stage 0 直接返回原帧。
   */
  tintedFrame(unit: string, anim: string, index: number, stage: number): HTMLImageElement | HTMLCanvasElement | undefined {
    const img = this.frame(unit, anim, index);
    if (!img || stage <= 0) return img;
    const key = `${unit}/${anim}/${index}#t${stage}`;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cctx = c.getContext('2d')!;
      cctx.drawImage(img, 0, 0);
      cctx.globalCompositeOperation = 'source-atop';
      cctx.fillStyle = stage === 1 ? 'rgba(150, 60, 30, 0.25)' : 'rgba(160, 30, 20, 0.42)';
      cctx.fillRect(0, 0, c.width, c.height);
      this.tintCache.set(key, c);
    }
    return c;
  }
}
