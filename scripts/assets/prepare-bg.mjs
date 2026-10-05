// 把 assets/ 里的战场原图复制为运行时背景，并归一化到设计分辨率 1585x992。
// 战场图历次重绘尺寸不一(本次 1666x944)，统一 resize 保证网格实测值与绘制一致。
// 用法: node scripts/assets/prepare-bg.mjs （或 pnpm assets:bg）
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'assets/backgrounds/白天战场.png';
const OUT = 'public/assets/bg/day.png';

await mkdir('public/assets/bg', { recursive: true });

await sharp(SRC).resize(1585, 992, { kernel: 'lanczos3' }).png().toFile(OUT);
const m = await sharp(OUT).metadata();
console.log(`${OUT} ✓ (${m.width}x${m.height})`);
