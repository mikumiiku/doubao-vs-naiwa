export const UI_ART = [
  'title', 'mode-title', 'mode-adventure', 'mode-puzzle', 'mode-minigame',
  'mode-survival', 'back', 'pause-panel', 'continue', 'quit', 'clip-frame',
  'volume-track', 'volume-fill', 'volume-knob', 'menu', 'pause-title', 'volume-label',
  'lose-title', 'lose-restart', 'lose-back',
] as const;

export type UiArtName = typeof UI_ART[number];
export type UiArt = Record<UiArtName, HTMLImageElement>;
export interface Rect { x: number; y: number; w: number; h: number }

/** Preserve the painted artwork's aspect ratio inside its shared hit rectangle. */
export function drawUiArt(ctx: CanvasRenderingContext2D, image: HTMLImageElement, rect: Rect): void {
  const scale = Math.min(rect.w / image.width, rect.h / image.height);
  const w = image.width * scale, h = image.height * scale;
  ctx.drawImage(image, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
}
