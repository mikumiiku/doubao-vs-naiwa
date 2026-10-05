// 把 assets/ 里的战场原图复制为运行时背景，并归一化到设计分辨率 1585x992。
// 战场图历次重绘尺寸不一(本次 1666x944)，统一 resize 保证网格实测值与绘制一致。
// 用法: node scripts/assets/prepare-bg.mjs （或 pnpm assets:bg）
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'assets/backgrounds/白天战场.png';
const OUT = 'public/assets/bg/day.png';

await mkdir('public/assets/bg', { recursive: true });

const base = await sharp(SRC).resize(1585, 992, { kernel: 'lanczos3' }).png().toBuffer();
await sharp(base).toFile(OUT);

// 新草坪只替换花园内部；注册到原网格，房屋、外沿和点击坐标保持一致。
const lawn = { left: 228, width: 1165 };
async function strip(source, top, height, targetTop, targetHeight = height) {
  const input = await sharp(source).extract({ ...lawn, top, height })
    .resize(lawn.width, targetHeight, { kernel: 'lanczos3' }).png().toBuffer();
  return { input, left: lawn.left, top: targetTop };
}
const one = 'assets/backgrounds/一行草坪.png';
const three = 'assets/backgrounds/三行草坪.png';
const variants = [
  ['day-one', await Promise.all([
    strip(one, 241, 202, 241, 265),
    strip(one, 443, 159, 506, 129),
    strip(one, 602, 307, 635, 274),
  ])],
  ['day-three', [await strip(three, 241, 668, 241)]],
  ['day-four', [await strip(three, 771, 138, 771)]],
];
for (const [name, patches] of variants) {
  await sharp(base).composite(patches).png().toFile(`public/assets/bg/${name}.png`);
}
console.log('战场背景已生成：五行、一行、三行、四行（1585x992）');
