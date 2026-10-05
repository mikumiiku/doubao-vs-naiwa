import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile('assets/characters/catalog.json', 'utf8'));
for (const unit of catalog) {
  const { width, height } = await sharp(unit.file).metadata();
  unit.width = width;
  unit.height = height;
}
await writeFile('assets/characters/catalog.json', JSON.stringify(catalog, null, 2));
