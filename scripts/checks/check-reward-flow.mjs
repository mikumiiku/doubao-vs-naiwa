/**
 * check-reward-flow.mjs — 通关奖励流程的自动化校验（纯逻辑，无浏览器）。
 *
 * 用 tsc 把 src 编译到临时目录，配上最小浏览器 API 垫片，跑真实的 Game 类，
 * 验证：胜利 → 最后阵亡奶蛙处弹出奖励卡 → 点卡（点卡外无效）→ 飞向中央闪光
 *      → 卡片介绍页 → 「下一关」/「返回选关」命中区可用。
 *
 * 用法: node scripts/checks/check-reward-flow.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const work = await mkdtemp(path.join(tmpdir(), 'dvn-flow-'));
let runStatus = 1;
try {
  // 1) 编译 src 到临时目录（stdio 用 inherit：某些沙箱下管道式子进程会 EPERM）
  const tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const compile = spawnSync(
    process.execPath,
    [
      tscJs,
      path.join(root, 'scripts', 'checks', 'reward-flow-entry.ts'),
      '--outDir',
      path.join(work, 'build'),
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--moduleResolution',
      'node',
      '--skipLibCheck',
      '--lib',
      'es2022,dom',
      '--esModuleInterop',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (compile.status !== 0) {
    throw new Error(`tsc 编译失败 (status=${compile.status}${compile.error ? ', ' + compile.error.message : ''})`);
  }
  await writeFile(path.join(work, 'build', 'package.json'), '{"type":"commonjs"}');

  // 2) 垫片 + 断言
  const runner = `
const listeners = () => ({ addEventListener() {}, removeEventListener() {} });
class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  cancelScheduledValues() { return this; }
  cancelAndHoldAtTime() { return this; }
}
class FakeCtx {
  constructor() {
    this.canvas = { width: 1585, height: 992 };
    this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
    this.textAlign = 'left'; this.textBaseline = 'alphabetic'; this.font = '';
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1;
    this.lineJoin = 'miter'; this.shadowColor = ''; this.shadowBlur = 0; this.shadowOffsetY = 0;
  }
  save() {} restore() {} beginPath() {} closePath() {} moveTo() {} lineTo() {} arc() {} ellipse() {} arcTo() {}
  rect() {} roundRect() {} clip() {} fill() {} stroke() {} fillRect() {} strokeRect() {} clearRect() {}
  translate() {} scale() {} rotate() {} setTransform() {} resetTransform() {}
  drawImage() {} fillText() {} strokeText() {}
  measureText(t) { return { width: String(t).length * 12 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
}
class FakeImage {
  constructor() { this.width = 200; this.height = 300; }
  set src(v) { this._src = v; setImmediate(() => this.onload && this.onload()); }
  get src() { return this._src; }
}
class FakeAudioCtx {
  constructor() { this.destination = {}; this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; }
  createGain() { return { connect() {}, disconnect() {}, gain: new FakeParam() }; }
  createOscillator() { return { connect() {}, disconnect() {}, start() {}, stop() {}, frequency: new FakeParam(), detune: new FakeParam(), type: 'sine', onended: null }; }
  createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {}, buffer: null, loop: false, playbackRate: new FakeParam(), onended: null }; }
  createBuffer(c, l) { return { getChannelData: () => new Float32Array(l), duration: l / 44100, length: l, numberOfChannels: c }; }
  createBiquadFilter() { return { connect() {}, disconnect() {}, frequency: new FakeParam(), Q: new FakeParam(), type: 'lowpass' }; }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
const store = new Map();
globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => (tag === 'canvas'
    ? { width: 1, height: 1, getContext: () => new FakeCtx(), style: {} }
    : { style: {} }),
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1585, innerHeight: 992, ...listeners() };
globalThis.Image = FakeImage;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { search: '' };
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;
globalThis.AudioContext = FakeAudioCtx;
globalThis.webkitAudioContext = FakeAudioCtx;
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const { runRewardFlowCheck } = require(${JSON.stringify(path.join(work, 'build', 'scripts', 'checks', 'reward-flow-entry.js'))});
const manifest = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(path.join(root, 'public', 'assets', 'sprites', 'manifest.json'))}, 'utf8'));
const results = runRewardFlowCheck(manifest);
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(\`  \${r.ok ? '✓' : '✗'} \${r.name}\${r.detail ? '  — ' + r.detail : ''}\`);
}
console.log(failed === 0 ? '\\n奖励流程校验通过' : \`\\n奖励流程校验失败: \${failed} 项\`);
process.exit(failed === 0 ? 0 : 1);
`;
  const runnerPath = path.join(work, 'runner.cjs');
  await writeFile(runnerPath, runner);
  const run = spawnSync(process.execPath, [runnerPath], { cwd: root, stdio: 'inherit' });
  if (run.error) throw run.error;
  runStatus = run.status ?? 1;
} finally {
  const temporaryRoot = path.resolve(tmpdir()) + path.sep;
  if (!work.startsWith(temporaryRoot) || !path.basename(work).startsWith('dvn-flow-')) throw new Error('Invalid test temporary directory');
  await rm(work, { recursive: true, force: true });
}
process.exit(runStatus);
