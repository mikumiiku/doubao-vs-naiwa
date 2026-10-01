// 在新战场图上叠加候选网格线，供目视校准 GRID 常量
// 用法: node scripts/overlay-grid.mjs [left top cellW cellH cols rows]
import sharp from 'sharp';

const SRC = 'assets/battle_field/白天战场.png';
const [left = 340, top = 222, cellW = 140, cellH = 120, cols = 9, rows = 5] =
  process.argv.slice(2).map(Number);

const img = sharp(SRC);
const { width: W, height: H } = await img.metadata();

const lines = [];
for (let c = 0; c <= cols; c++) {
  const x = Math.round(left + c * cellW);
  lines.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + rows * cellH}" stroke="red" stroke-width="2"/>`);
}
for (let r = 0; r <= rows; r++) {
  const y = Math.round(top + r * cellH);
  lines.push(`<line x1="${left}" y1="${y}" x2="${left + cols * cellW}" y2="${y}" stroke="red" stroke-width="2"/>`);
}
// 每格中心点
const dots = [];
for (let c = 0; c < cols; c++)
  for (let r = 0; r < rows; r++)
    dots.push(`<circle cx="${Math.round(left + (c + 0.5) * cellW)}" cy="${Math.round(top + (r + 0.5) * cellH)}" r="4" fill="yellow"/>`);

const svg = `<svg width="${W}" height="${H}">${lines.join('')}${dots.join('')}</svg>`;
await img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile('/tmp/sv/grid_overlay.png');
console.log(`left=${left} top=${top} cellW=${cellW} cellH=${cellH} cols=${cols} rows=${rows} right=${left + cols * cellW} bottom=${top + rows * cellH}`);
