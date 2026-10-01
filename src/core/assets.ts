export interface AnimMeta {
  frames: number;
  fps: number;
  /** 动画首帧相对参考动画首帧的注册偏移(输出像素, 绘制时乘 h/refHeight)，消除状态切换的主体跳动 */
  anchor?: [number, number];
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
  manifest!: Manifest;
  home!: { bg: HTMLImageElement; heroes: HTMLImageElement; btnStart: HTMLImageElement; btnSettings: HTMLImageElement; btnQuit: HTMLImageElement };
  doughImg!: HTMLImageElement;
  mowerImg!: HTMLImageElement;
  flagSmallImg!: HTMLImageElement;
  flagBigImg!: HTMLImageElement;
  progressBarImg!: HTMLImageElement;
  cardBarImg!: HTMLImageElement;
  doughPanelImg!: HTMLImageElement;
  private images = new Map<string, HTMLImageElement[]>();
  private cardFrameImg!: HTMLImageElement;
  private cardPortraits = new Map<string, HTMLImageElement>();
  private composedCards = new Map<string, HTMLCanvasElement>();
  private tintCache = new Map<string, HTMLCanvasElement>();

  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    const [bg, manifest, homeBg, heroes, btnStart, btnSettings, btnQuit, doughImg, mowerImg, flagSmallImg, flagBigImg, progressBarImg, cardBarImg, doughPanelImg] =
      await Promise.all([
        loadImage('assets/bg/day.png'),
        fetch('assets/sprites/manifest.json').then((r) => {
          if (!r.ok) throw new Error('assets/sprites/manifest.json 加载失败，请先运行 pnpm assets:slice');
          return r.json() as Promise<Manifest>;
        }),
        loadImage('assets/home/bg.jpg'),
        loadImage('assets/home/heroes.png'),
        loadImage('assets/home/btn_start.png'),
        loadImage('assets/home/btn_settings.png'),
        loadImage('assets/home/btn_quit.png'),
        loadImage('assets/others/dough.png'),
        loadImage('assets/mower/fish.png'),
        loadImage('assets/others/flag_small.png'),
        loadImage('assets/others/flag_big.png'),
        loadImage('assets/others/progress_bar.png'),
        loadImage('assets/others/card_bar.png'),
        loadImage('assets/others/dough_panel.png'),
      ]);
    this.bg = bg;
    this.manifest = manifest;
    this.home = { bg: homeBg, heroes, btnStart, btnSettings, btnQuit };
    this.doughImg = doughImg;
    this.mowerImg = mowerImg;
    this.flagSmallImg = flagSmallImg;
    this.flagBigImg = flagBigImg;
    this.progressBarImg = progressBarImg;
    this.cardBarImg = cardBarImg;
    this.doughPanelImg = doughPanelImg;

    // 卡牌：卡片框 + 豆包立绘运行时组合(填面团值与名字), 立绘缺失的跳过
    this.cardFrameImg = await loadImage('assets/cards/frame.png');
    await Promise.all(
      Object.keys(manifest.units).map(async (unit) => {
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
    // 底部牌匾: 面团值(深色大字, 这是卡片的"价格区")
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `bold ${Math.round(128 * k)}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
    x.fillStyle = '#7a3c17';
    x.fillText(String(cost), 512 * k, 1218 * k);
    this.composedCards.set(key, c);
    return c;
  }

  /** 变暗版卡牌(费用不足/冷却中): 整体压暗, 形状与卡片严格一致 */
  cardDimmed(unit: string, cost = 0): HTMLCanvasElement | undefined {
    const key = `${unit}|${cost}|dim`;
    const hit = this.composedCards.get(key);
    if (hit) return hit;
    const src = this.card(unit, cost);
    if (!src) return undefined;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext('2d')!;
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(10, 12, 16, 0.55)';
    x.fillRect(0, 0, c.width, c.height);
    this.composedCards.set(key, c);
    return c;
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
