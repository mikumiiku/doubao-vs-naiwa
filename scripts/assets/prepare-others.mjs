/**
 * prepare-others.mjs — 处理杂项单图素材到 public/。
 *
 * 用法: pnpm assets:others
 *
 * 面团: 资源单位图(HUD 图标 + 定时抛入的可拾取物), 缩到 320 宽。
 * 大肥鱼: 每行一台的小推车(触发后沿行冲锋秒杀奶蛙), 缩到 900 宽。
 * 关卡旗帜/进度条: 用户画好的 UI 件; 旗帜图含大小两面, 先粗裁再按 alpha 包围盒精裁。
 */
import sharp from 'sharp';
import { rm, mkdir, rename, readFile } from 'node:fs/promises';

// Windows 的开发服务器可能短暂持有目录句柄，替换时等待它释放。
async function replaceDirectory(source, destination) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try { await rename(source, destination); return; }
    catch (error) {
      if (error.code !== 'EPERM' || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

async function trimAlpha(input, pad = 4) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const a = (x, y) => data[(y * W + x) * 4 + 3];
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (a(x, y) > 10) {
        if (x < x0) x0 = x;
        if (x >= x1) x1 = x + 1;
        if (y < y0) y0 = y;
        if (y >= y1) y1 = y + 1;
      }
  if (x1 <= 0) throw new Error('粗裁区域内没有内容');
  return sharp(input).extract({
    left: Math.max(0, x0 - pad),
    top: Math.max(0, y0 - pad),
    width: Math.min(W, x1 + pad) - Math.max(0, x0 - pad),
    height: Math.min(H, y1 + pad) - Math.max(0, y0 - pad),
  });
}

// 产物先全部写进临时目录, 最后再一次性改名替换。
// 别直接清空 public/assets 再重写 —— dev 服务器正在跑的时候, 清空那一瞬间页面会 404。
const TMP_ROOT = 'public/.tmp-assets';
const TMP_OTHERS = `${TMP_ROOT}/others`;
const TMP_MOWER = `${TMP_ROOT}/mower`;
const TMP_CARDS = `${TMP_ROOT}/cards`;
await rm(TMP_ROOT, { recursive: true, force: true });
await mkdir(TMP_OTHERS, { recursive: true });
await mkdir(TMP_MOWER, { recursive: true });
await mkdir(TMP_CARDS, { recursive: true });

await sharp('assets/props/面团.png')
  .resize(320, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/dough.png');
console.log('others/dough.png ✓');

await sharp('assets/props/大肥鱼.png')
  .resize(900, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/mower/fish.png');
console.log('mower/fish.png ✓');

await (await trimAlpha(await sharp('assets/ui/关卡旗帜.png').extract({ left: 100, top: 370, width: 520, height: 660 }).toBuffer()))
  .resize(240, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/flag_small.png');
console.log('others/flag_small.png ✓');

await (await trimAlpha(await sharp('assets/ui/关卡旗帜.png').extract({ left: 620, top: 0, width: 828, height: 1040 }).toBuffer()))
  .resize(340, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/flag_big.png');
console.log('others/flag_big.png ✓');

await sharp('assets/ui/关卡进度条.png')
  .resize(720, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/progress_bar.png');
console.log('others/progress_bar.png ✓');

// 选卡框: 顶部卡牌栏容器(9 个卡槽), 缩到 1448 宽
await sharp('assets/ui/豆包选卡框.png')
  .resize(1448, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/card_bar.png');
console.log('others/card_bar.png ✓');

// 卡牌框(1024x1536)与豆包立绘(1024x1536): 运行时组合成卡牌(框+立绘+面团值+名字)
await sharp('assets/ui/豆包卡片框.png')
  .resize(512, 768, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/cards/frame.png');
console.log('cards/frame.png ✓');

for (const [src, id] of [
  ['assets/portraits/豆馅射手.png', 'douxian_shooter'],
  ['assets/portraits/和面豆包.png', 'hemian_doubao'],
  ['assets/portraits/不绕弯豆包.png', 'buraowan_doubao'],
]) {
  await sharp(src)
    .resize(512, 768, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(`public/.tmp-assets/cards/${id}.png`);
  console.log(`cards/${id}.png ✓`);
}

const campaignCatalog = JSON.parse(await readFile('assets/characters/catalog.json', 'utf8'));
for (const unit of campaignCatalog.filter(u => !u.file.includes('/attackers/'))) {
  const firstFrame = await sharp(unit.file).extract({ left: 0, top: 0,
    width: Math.round(unit.width / 4), height: Math.round(unit.height / unit.rows) }).toBuffer();
  await (await trimAlpha(firstFrame)).resize(512, 768, { fit: 'contain', background: '#00000000' }).png()
    .toFile(`public/.tmp-assets/cards/${unit.id}.png`);
}

// 面团值: 左上角资源计数牌(左 medallion 右数字标签), 缩到 1000 宽
await sharp('assets/ui/面团值.png')
  .resize(1000, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/dough_panel.png');
console.log('others/dough_panel.png ✓');

// 夹子(铲子职能的道具): 透明边粗裁后缩到 360 宽
await (await trimAlpha('assets/props/夹子.png'))
  .resize(360, null, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile('public/.tmp-assets/others/clip.png');
console.log('others/clip.png ✓');

// 全部产物就绪后一次性替换（先删旧目录再改名, 同盘 rename 是瞬时操作）
await rm('public/assets/others', { recursive: true, force: true });
await rm('public/assets/mower', { recursive: true, force: true });
await rm('public/assets/cards', { recursive: true, force: true });
await replaceDirectory(TMP_OTHERS, 'public/assets/others');
await replaceDirectory(TMP_MOWER, 'public/assets/mower');
await replaceDirectory(TMP_CARDS, 'public/assets/cards');
await rm(TMP_ROOT, { recursive: true, force: true });
console.log('public/assets 替换完成 ✓');
