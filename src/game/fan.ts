import { GRID } from './config';
import type { FanWind } from './entities';

export const FAN_WIND = { speed: 500, life: 0.8, halfWidth: 26, halfHeight: 43, damageFactor: 0.7 };

/** 非等宽草坪用连续格坐标计距离；草坪外沿用边缘格宽。 */
export function gridCoordinate(x: number): number {
  let col = GRID.colX.findIndex((edge, i) => i > 0 && x < edge) - 1;
  if (col < 0) col = x < GRID.colX[0] ? 0 : GRID.cols - 1;
  return col + (x - GRID.colX[col]) / (GRID.colX[col + 1] - GRID.colX[col]);
}

export function advanceGridCells(x: number, cells: number): number {
  const coordinate = gridCoordinate(x) - cells;
  const col = Math.max(0, Math.min(GRID.cols - 1, Math.floor(coordinate)));
  return GRID.colX[col] + (coordinate - col) * (GRID.colX[col + 1] - GRID.colX[col]);
}

/** 返回本帧内相遇时刻，避免高速豆馅或风刃跨帧漏判。 */
export function windContact(wind: FanWind, previousX: number, x: number, y: number): number | null {
  if (Math.abs(y - wind.y) > FAN_WIND.halfHeight) return null;
  const start = previousX - wind.previousX;
  const end = x - wind.x;
  if (start > FAN_WIND.halfWidth || end < -FAN_WIND.halfWidth) return null;
  if (Math.abs(start) <= FAN_WIND.halfWidth) return 0;
  const relativeDistance = end - start;
  if (relativeDistance <= 0) return null;
  const t = (-FAN_WIND.halfWidth - start) / relativeDistance;
  return t >= 0 && t <= 1 ? t : null;
}

export function drawFanWind(ctx: CanvasRenderingContext2D, wind: FanWind): void {
  ctx.save();
  ctx.translate(wind.x, wind.y);
  ctx.globalAlpha = Math.min(1, (FAN_WIND.life - wind.age) / 0.15);
  ctx.shadowColor = '#ff74bd';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffadd8';
  ctx.beginPath();
  ctx.moveTo(18, -42);
  ctx.quadraticCurveTo(-60, 0, 18, 42);
  ctx.quadraticCurveTo(-13, 0, 18, -42);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffe4f3';
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(15, i * 17);
    ctx.quadraticCurveTo(42, i * 20 - 8, 77, i * 24);
    ctx.stroke();
  }
  ctx.restore();
}
