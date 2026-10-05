import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';

const SRC = 'assets/ui';
const OUT = 'public/assets/ui';
await mkdir(OUT, { recursive: true });

// Atlas rectangles are measured from the generated source art, before alpha trim.
const sheets = {
  'modes.png': {
    'mode-title': [0, 0, 768, 354],
    'mode-adventure': [768, 0, 768, 354],
    'mode-puzzle': [0, 354, 768, 330],
    'mode-minigame': [768, 354, 768, 330],
    'mode-survival': [0, 684, 768, 340],
    back: [768, 684, 768, 340],
  },
  'pause.png': {
    'pause-panel': [40, 0, 450, 512],
    continue: [495, 150, 515, 285],
    quit: [1010, 165, 526, 260],
    'clip-frame': [135, 515, 265, 495],
    'volume-track': [505, 565, 510, 140],
    'volume-fill': [510, 708, 510, 125],
    'volume-knob': [655, 835, 185, 140],
    menu: [1070, 520, 400, 190],
    'pause-title': [1065, 708, 400, 160],
    'volume-label': [1130, 875, 265, 105],
  },
  'title.png': { title: null },
  'lose.png': {
    'lose-title': [0, 0, 1536, 512],
    'lose-restart': [0, 512, 768, 512],
    'lose-back': [768, 512, 768, 512],
  },
};

for (const [sheet, entries] of Object.entries(sheets)) {
  for (const [name, rect] of Object.entries(entries)) {
    let pipeline = sharp(`${SRC}/${sheet}`);
    if (rect) {
      const [left, top, width, height] = rect;
      pipeline = pipeline.extract({ left, top, width, height });
    }
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 20) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    }
    if (x1 <= x0) throw new Error(`Empty UI asset: ${name}`);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
      .extend({ top: 3, bottom: 3, left: 3, right: 3, background: '#00000000' })
      .png().toFile(`${OUT}/${name}.png`);
    console.log(`${name}.png ✓`);
  }
}
await mkdir('public/assets/audio', { recursive: true });
for (const name of ['andy', 'naiwa-chew', 'hachimi', 'nailong-laugh', 'shiranui-fan']) {
  await copyFile(`assets/audio/${name}.m4a`, `public/assets/audio/${name}.m4a`);
}
await mkdir('public/assets/dialogue', { recursive: true });
for (const name of ['greeting', 'teaching', 'ready']) {
  await sharp(`assets/dialogue/${name}.png`).resize({ height: 1100, withoutEnlargement: true }).png().toFile(`public/assets/dialogue/${name}.png`);
}
