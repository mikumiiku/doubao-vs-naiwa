// ensure-assets.mjs — pnpm dev 前置检查：运行时素材缺失时自动生成。
// public/assets/ 由 assets/ 原始素材经 pnpm assets:* 管线产出，且不入版本库，
// 裸克隆仓库直接 pnpm dev 会因缺素材启动失败。这里按哨兵文件判断，
// 齐全则跳过（避免每次 dev 都重跑切图），缺失则按依赖顺序跑完整管线。
import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { buildAssets } from './build-assets.mjs';

// 每个 assets:* 脚本各取一个代表性产物做哨兵
const SENTINELS = [
  'public/assets/bg/day.png', // prepare-bg
  'public/assets/bg/day-one.png',
  'public/assets/bg/day-three.png',
  'public/assets/bg/day-four.png',
  'public/assets/home/bg.jpg', // prepare-home
  'public/assets/others/dough.png', // prepare-others
  'public/assets/sprites/manifest.json', // slice-sprites
  'public/assets/sprites/laugh_frog/death_b/4.png',
  'public/assets/sprites/laugh_frog/walk/7.png',
  'public/assets/sprites/laugh_frog/walk_b/7.png',
  'public/assets/ui/title.png', // prepare-ui
  'public/assets/ui/volume-knob.png',
  'public/assets/dialogue/greeting.png',
  'public/assets/dialogue/teaching.png',
  'public/assets/dialogue/ready.png',
  'public/assets/audio/andy.m4a',
  'public/assets/audio/naiwa-chew.m4a',
  'public/assets/audio/hachimi.m4a',
  'public/assets/audio/nailong-laugh.m4a',
  'public/assets/audio/shiranui-fan.m4a',
  'public/assets/ui/lose-title.png',
  'public/assets/ui/lose-restart.png',
  'public/assets/ui/lose-back.png',
  'public/assets/sprites/laugh_frog/chew/7.png',
  'public/assets/sprites/laugh_frog/laugh/5.png',
  'public/assets/sprites/laugh_frog/laugh_b/5.png',
  'public/assets/sprites/ordinary_frog/walk/7.png',
  'public/assets/sprites/ordinary_frog/walk_body/0.png',
  'public/assets/sprites/ordinary_frog/walk_near/0.png',
  'public/assets/sprites/ordinary_frog/walk_far/0.png',
  'public/assets/sprites/nai_egg/walk/0.png',
  'public/assets/sprites/nai_egg/hatch/3.png',
  'public/assets/sprites/nai_egg/death/3.png',
  'public/assets/sprites/hoola_frog/death/3.png',
  'public/assets/sprites/shiranui_frog/walk/7.png',
  'public/assets/sprites/shiranui_frog/fan/3.png',
  'public/assets/sprites/shiranui_frog/death/3.png',
  ...JSON.parse(readFileSync('assets/characters/catalog.json', 'utf8'))
    .filter((u) => !u.file.includes('/attackers/'))
    .flatMap((u) => [`public/assets/sprites/${u.id}/attack/3.png`, `public/assets/cards/${u.id}.png`]),
];

const missing = SENTINELS.filter((f) => !existsSync(f));
// 音效源文件更新后同步运行目录，避免旧文件仍存在时跳过复制。
for (const name of ['andy', 'naiwa-chew', 'hachimi', 'nailong-laugh', 'shiranui-fan']) {
  const source = `assets/audio/${name}.m4a`;
  const runtime = `public/assets/audio/${name}.m4a`;
  if (existsSync(source) && existsSync(runtime) && !readFileSync(source).equals(readFileSync(runtime))) {
    copyFileSync(source, runtime);
  }
}
// 清单存在不代表所有帧都在，切片中断或部分删除时也要重建。
const manifestPath = 'public/assets/sprites/manifest.json';
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const [unit, anims] of Object.entries(manifest.units)) {
      for (const [anim, meta] of Object.entries(anims)) {
        for (let i = 0; i < meta.frames; i++) {
          const framePath = `public/assets/sprites/${unit}/${anim}/${i}.png`;
          if (!existsSync(framePath)) missing.push(framePath);
        }
      }
    }
  } catch {
    missing.push(manifestPath);
  }
}
if (missing.length === 0) {
  console.log('[ensure-assets] 素材齐全，跳过生成');
  process.exit(0);
}

console.log(`[ensure-assets] 缺少 ${missing.length} 项素材，开始生成…`);
buildAssets();
console.log('[ensure-assets] 素材生成完毕');
