import type { Assets } from './assets';

/**
 * 把某一帧以「脚底中心」为锚点画到 (x, y)。
 * h 是单位的站立高度(spriteH)，帧按统一比例 h/manifest.refHeight 缩放——
 * 躺地帧等非常态帧会保持角色真实大小，不会被拉伸回站立高度。
 */
export function drawFrame(
  assets: Assets,
  ctx: CanvasRenderingContext2D,
  unit: string,
  anim: string,
  index: number,
  x: number,
  y: number,
  h: number,
  flipX = false,
  alpha = 1,
  tintStage = 0,
): void {
  const img = assets.tintedFrame(unit, anim, index, tintStage);
  if (!img || img.height === 0) return;
  const scale = h / assets.manifest.refHeight;
  const anchor = assets.meta(unit, anim)?.anchor;
  // 翻转绘制时锚点的 x 偏移同步取反（注册在原始朝向的帧上计算）
  const ax = (anchor ? anchor[0] * scale : 0) * (flipX ? -1 : 1);
  const ay = anchor ? anchor[1] * scale : 0;
  const w = img.width * scale;
  const hd = img.height * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (flipX) {
    ctx.translate(x + ax, y + ay);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -hd, w, hd);
  } else {
    ctx.drawImage(img, x + ax - w / 2, y + ay - hd, w, hd);
  }
  ctx.restore();
}

/** 时间驱动的序列帧播放器；单次动画播完后停在最后一帧并置 finished */
export class Anim {
  t = 0;
  finished = false;
  /** loop 动画已完成的循环轮数（set 换动画时归零） */
  loops = 0;

  constructor(
    private assets: Assets,
    public readonly unit: string,
    public name: string,
    public loop = true,
  ) {}

  set(name: string, loop: boolean): void {
    if (this.name === name && this.loop === loop) return;
    this.name = name;
    this.loop = loop;
    this.t = 0;
    this.finished = false;
    this.loops = 0;
  }

  update(dt: number): void {
    const meta = this.assets.meta(this.unit, this.name);
    if (!meta || meta.frames === 0) return;
    const dur = meta.frames / meta.fps;
    this.t += dt;
    if (this.t < dur) return;
    if (this.loop) {
      this.loops++;
      this.t %= dur;
    } else {
      this.t = dur;
      this.finished = true;
    }
  }

  currentIndex(): number {
    const meta = this.assets.meta(this.unit, this.name);
    if (!meta || meta.frames === 0) return 0;
    return Math.min(meta.frames - 1, Math.floor(this.t * meta.fps));
  }

  /** 当前动画一轮的时长（秒） */
  duration(): number {
    const meta = this.assets.meta(this.unit, this.name);
    return meta && meta.frames > 0 ? meta.frames / meta.fps : 0;
  }

  widthFor(h: number): number {
    const img = this.assets.frame(this.unit, this.name, this.currentIndex());
    if (!img) return h;
    return img.width * (h / this.assets.manifest.refHeight);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    flipX = false,
    alpha = 1,
    tintStage = 0,
  ): void {
    drawFrame(this.assets, ctx, this.unit, this.name, this.currentIndex(), x, y, h, flipX, alpha, tintStage);
  }
}
