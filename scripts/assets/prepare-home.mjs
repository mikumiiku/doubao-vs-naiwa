/**
 * prepare-home.mjs — 把 assets/home/ 的开始菜单素材处理到 public/assets/home/。
 *
 * 用法: pnpm assets:home
 *
 * 背景与主体是同构图的两层（1672x941），绘制时用同一 cover 变换对齐；
 * 背景无透明通道转 jpg 省体积，主体保留 alpha，按钮统一缩到 960 宽。
 */
import sharp from 'sharp';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets/home';
const OUT = 'public/assets/home';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 背景: opaque → jpg
await sharp(path.join(SRC, '背景.png'))
  .jpeg({ quality: 88 })
  .toFile(path.join(OUT, 'bg.jpg'));
console.log('bg.jpg ✓');

// 主体: 保留 alpha 原尺寸
await sharp(path.join(SRC, '主体.png'))
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT, 'heroes.png'));
console.log('heroes.png ✓');

// 按钮: 2172x724 → 960 宽
for (const [src, dst] of [
  ['开始游戏按钮.png', 'btn_start.png'],
]) {
  await sharp(path.join(SRC, src))
    .resize(960, null, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, dst));
  console.log(`${dst} ✓`);
}
