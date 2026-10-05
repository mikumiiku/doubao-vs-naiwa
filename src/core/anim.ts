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

/**
 * 按动画播放进度插值查一条循环"轨道"表（长度 = 帧数，取值 ±1）。
 * 用于 groundTrack（根位移 → 瞬时速度）与 bobTrack（身体起伏 → 绘制偏移）。
 * 动画进度与轨道同源，所以速度变化、上下起伏和迈步严格同步，不会出现滑步。
 */
export function sampleTrack(
  track: number[] | undefined,
  anim: Anim,
  frames: number,
  fps: number,
): number {
  if (!track || track.length === 0 || frames <= 0 || fps <= 0) return 0;
  const phase = anim.t * fps;
  const base = Math.floor(phase);
  const frac = phase - base;
  const i0 = ((base % frames) + frames) % frames;
  const i1 = (i0 + 1) % frames;
  return (track[i0] ?? 0) * (1 - frac) + (track[i1] ?? 0) * frac;
}

/** 两条腿使用相反相位，支撑脚贴地、摆动脚抬起，避免帧表重复同侧步态。 */
export function walkLegPose(phase: number, near: boolean): { angle: number; lift: number } {
  const legPhase = phase + (near ? 0 : Math.PI);
  return { angle: -0.5 * Math.cos(legPhase), lift: Math.max(0, -Math.sin(legPhase)) * 0.055 };
}

export function drawWalkingFrog(
  assets: Assets, ctx: CanvasRenderingContext2D, unit: string, phase: number,
  x: number, y: number, h: number, flipX: boolean,
): void {
  const body = assets.frame(unit, 'walk_body', 0);
  const far = assets.frame(unit, 'walk_far', 0);
  const near = assets.frame(unit, 'walk_near', 0);
  if (!body || !far || !near) return;
  ctx.save();
  ctx.translate(x, y);
  if (flipX) ctx.scale(-1, 1);
  function leg(img: HTMLImageElement, front: boolean): void {
    const { angle, lift } = walkLegPose(phase, front);
    const height = h * 0.37;
    const width = height * img.width / img.height;
    const edgeX = angle >= 0 ? width * 0.64 : -width * 0.36;
    const footY = height * Math.cos(angle) + edgeX * Math.sin(angle);
    ctx.save();
    ctx.translate((front ? -0.035 : 0.035) * h, -footY - lift * h);
    ctx.rotate(angle);
    ctx.drawImage(img, -width * 0.36, 0, width, height);
    ctx.restore();
  }
  leg(far, false);
  leg(near, true);
  const bodyH = h * 0.82;
  const bodyW = bodyH * body.width / body.height;
  ctx.drawImage(body, -bodyW / 2, -h, bodyW, bodyH);
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

  /** 相邻帧交叉淡化插帧: 4~6fps 的切片序列直放偏卡, A 帧满画、B 帧按小数进度淡入,
   *  重叠剪影区得到精确线性混合; 循环动画尾帧淡回首帧, 单次动画末帧不外推 */
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    flipX = false,
    alpha = 1,
    tintStage = 0,
  ): void {
    const meta = this.assets.meta(this.unit, this.name);
    if (!meta || meta.frames <= 1) {
      drawFrame(this.assets, ctx, this.unit, this.name, 0, x, y, h, flipX, alpha, tintStage);
      return;
    }
    const phase = this.t * meta.fps;
    const pos = this.loop ? phase % meta.frames : Math.min(meta.frames - 1, phase);
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const i1 = this.loop ? (i0 + 1) % meta.frames : Math.min(meta.frames - 1, i0 + 1);
    if (i1 === i0 || frac <= 0) {
      drawFrame(this.assets, ctx, this.unit, this.name, i0, x, y, h, flipX, alpha, tintStage);
      return;
    }
    // 混合窗口收窄在每帧最末尾(80%~100%): 位移大的关键帧(走路)上较长的溶解窗口会呈现双影拖尾,
    // 只保留一瞬过渡用于抹平硬切跳变
    const BLEND_FROM = 0.8;
    const k = frac <= BLEND_FROM ? 0 : (frac - BLEND_FROM) / (1 - BLEND_FROM);
    if (k <= 0) {
      drawFrame(this.assets, ctx, this.unit, this.name, i0, x, y, h, flipX, alpha, tintStage);
      return;
    }
    drawFrame(this.assets, ctx, this.unit, this.name, i0, x, y, h, flipX, alpha, tintStage);
    drawFrame(this.assets, ctx, this.unit, this.name, i1, x, y, h, flipX, alpha * k, tintStage);
  }
}
