import { GRID } from './config';

export interface Cell {
  col: number;
  row: number;
}

/** 每列左缘 x（colX 长度 = cols+1） */
export function cellLeft(col: number): number {
  return GRID.colX[col];
}

/** 每行顶缘 y（rowY 长度 = rows+1） */
export function cellTop(row: number): number {
  return GRID.rowY[row];
}

export function cellW(col: number): number {
  return GRID.colX[col + 1] - GRID.colX[col];
}

export function cellH(row: number): number {
  return GRID.rowY[row + 1] - GRID.rowY[row];
}

/** 命中测试：边界数组二分（图片里的格子大小不均，以实测边界为准） */
export function cellAt(x: number, y: number): Cell | null {
  const col = findIdx(GRID.colX, x);
  const row = findIdx(GRID.rowY, y);
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  return { col, row };
}

/** 在递增边界数组中找坐标所在区间下标；越界返回 -1 或 末尾越界由调用方按 cols/rows 判定 */
function findIdx(bound: number[], v: number): number {
  if (v < bound[0]) return -1;
  for (let i = 0; i < bound.length - 1; i++) {
    if (v >= bound[i] && v < bound[i + 1]) return i;
  }
  return bound.length - 1; // 右/下越界：返回 cols/rows，由调用方判负
}

export function cellCenterX(col: number): number {
  return (GRID.colX[col] + GRID.colX[col + 1]) / 2;
}

/** 精灵脚底锚点 y（该行格子底部略上） */
export function rowFootY(row: number): number {
  const top = GRID.rowY[row];
  const h = GRID.rowY[row + 1] - top;
  return top + h - h * 0.08;
}
