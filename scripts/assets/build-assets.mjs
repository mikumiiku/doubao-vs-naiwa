import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pipeline = ['prepare-bg.mjs', 'prepare-home.mjs', 'prepare-others.mjs', 'slice-sprites.mjs', 'prepare-ui.mjs'];

export function buildAssets() {
  // 生成脚本会替换这些目录；先确认它们都位于当前项目中。
  for (const relative of [
    'public/assets/bg',
    'public/assets/home',
    'public/assets/others',
    'public/assets/mower',
    'public/assets/cards',
    'public/assets/sprites',
    'public/assets/ui',
    'public/.tmp-assets',
  ]) {
    const output = path.resolve(root, relative);
    if (!output.startsWith(path.resolve(root) + path.sep)) throw new Error(`Invalid asset output: ${output}`);
  }
  for (const script of pipeline) {
    console.log(`[assets] ${script}`);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Asset generation failed: ${script} (${result.status})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildAssets();
