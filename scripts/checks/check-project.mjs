import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const failures = [];
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''));

function filesIn(relative) {
  return readdirSync(path.join(root, relative), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const name = path.join(relative, entry.name);
    return entry.isDirectory() ? filesIn(name) : [name];
  });
}

function checkFile(relative) {
  if (!existsSync(path.join(root, relative))) failures.push(`Missing file: ${relative}`);
}

const markdown = [
  'README.md',
  'DESIGN.md',
  ...filesIn('assets').filter((file) => file.endsWith('.md')),
  'scripts/README.md',
  ...filesIn('docs').filter((file) => file.endsWith('.md')),
];
for (const file of markdown) {
  checkFile(file);
  if (!existsSync(path.join(root, file))) continue;
  const text = readFileSync(path.join(root, file), 'utf8');
  for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:[a-z]+:|#)/i.test(target)) continue;
    const link = decodeURIComponent(target.split('#')[0]);
    if (link) checkFile(path.join(path.dirname(file), link));
  }
}

const catalog = readJson('assets/characters/catalog.json');
const ids = new Set();
for (const unit of catalog) {
  checkFile(unit.file);
  if (ids.has(unit.id)) failures.push(`Duplicate catalog id: ${unit.id}`);
  ids.add(unit.id);
  if (!unit.file.startsWith('assets/characters/')) failures.push(`Catalog source outside characters: ${unit.file}`);
  if (!(unit.width > 0 && unit.height > 0 && unit.rows > 0)) failures.push(`Invalid atlas dimensions: ${unit.id}`);
}
for (const portrait of ['greeting', 'teaching', 'ready']) {
  checkFile(`assets/dialogue/${portrait}.png`);
  checkFile(`public/assets/dialogue/${portrait}.png`);
}

const manifest = readJson('public/assets/sprites/manifest.json');
let frames = 0;
for (const [unit, animations] of Object.entries(manifest.units)) {
  if (unit === 'garlic_doubao' || unit === 'split_frog') failures.push(`Retired runtime unit: ${unit}`);
  for (const [animation, meta] of Object.entries(animations)) {
    for (let i = 0; i < meta.frames; i++) {
      checkFile(`public/assets/sprites/${unit}/${animation}/${i}.png`);
      frames++;
    }
  }
}
for (const unit of catalog) {
  if (!manifest.units[unit.id]) failures.push(`Catalog unit missing from manifest: ${unit.id}`);
  if (!unit.file.includes('/attackers/')) checkFile(`public/assets/cards/${unit.id}.png`);
}

// PNG 与音频搬迁前后逐文件核对，不依赖文件名或大小推断内容未变。
let preserved = 0;
if (process.argv.includes('--verify-moves')) {
  const moves = readJson('docs/reports/directory-moves.json');
  for (const move of moves) {
    checkFile(move.to);
    if (!/\.(png|m4a)$/i.test(move.to) || !existsSync(path.join(root, move.to))) continue;
    const hash = createHash('sha256')
      .update(readFileSync(path.join(root, move.to)))
      .digest('hex');
    if (hash !== move.sha256.toLowerCase()) failures.push(`Moved media content changed: ${move.to}`);
    preserved++;
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Project check passed: ${markdown.length} documents, ${frames} sprite frames${preserved ? `, ${preserved} preserved media files` : ''}.`,
  );
}
