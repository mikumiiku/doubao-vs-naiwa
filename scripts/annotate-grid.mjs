// 在背景图上叠加候选网格线，人工核对校准结果
// 用法：node scripts/annotate-grid.mjs [left top cw ch] 输出 /tmp/annotated.png
import sharp from 'sharp';

const SRC = 'assets/battle_field/白天战场.png';
const [left = 322, top = 198, cw = 113, ch = 124] = process.argv.slice(2).map(Number);
const COLS = 9;
const ROWS = 5;

let svg = `<svg width="1672" height="941" xmlns="http://www.w3.org/2000/svg">`;
for (let c = 0; c <= COLS; c++) {
  const x = left + c * cw;
  svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + ROWS * ch}" stroke="red" stroke-width="2"/>`;
}
for (let r = 0; r <= ROWS; r++) {
  const y = top + r * ch;
  svg += `<line x1="${left}" y1="${y}" x2="${left + COLS * cw}" y2="${y}" stroke="red" stroke-width="2"/>`;
}
// 行脚点（锚点）
for (let r = 0; r < ROWS; r++) {
  const y = top + (r + 1) * ch - ch * 0.08;
  svg += `<line x1="${left}" y1="${y}" x2="${left + COLS * cw}" y2="${y}" stroke="blue" stroke-width="1" stroke-dasharray="6 4"/>`;
}
// 等待区圆心候选
for (const cy of [250, 390, 530, 670, 805]) {
  svg += `<circle cx="1495" cy="${cy}" r="8" fill="none" stroke="blue" stroke-width="3"/>`;
}
svg += `</svg>`;

await sharp(SRC)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile('/tmp/annotated.png');
console.log(`left=${left} top=${top} cw=${cw} ch=${ch} -> /tmp/annotated.png`);
