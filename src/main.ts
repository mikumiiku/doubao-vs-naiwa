import { Assets } from './core/assets';
import { sfx } from './core/sfx';
import { DESIGN_H, DESIGN_W, LEVELS } from './game/config';
import { Game } from './game/game';
import { LevelSelect } from './game/levelselect';
import { Menu } from './game/menu';
import { unlockThrough } from './game/progress';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  view.dpr = dpr;
  view.scale = Math.min(w / DESIGN_W, h / DESIGN_H);
  view.ox = (w - DESIGN_W * view.scale) / 2;
  view.oy = (h - DESIGN_H * view.scale) / 2;
}

window.addEventListener('resize', resize);
resize();

function drawLoading(text: string): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#1a2027';
  ctx.fillRect(0, 0, canvas.width / view.dpr, canvas.height / view.dpr);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '28px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / view.dpr / 2, canvas.height / view.dpr / 2);
}

function toDesign(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - view.ox) / view.scale,
    y: (e.clientY - rect.top - view.oy) / view.scale,
  };
}

async function boot(): Promise<void> {
  drawLoading('加载中…');
  const assets = new Assets();
  await assets.load((done, total) => drawLoading(`加载素材 ${done} / ${total}`));

  type Scene = 'menu' | 'levels' | 'game';
  let scene: Scene = 'menu';
  let game: Game | null = null;

  const menu = new Menu(assets.home, () => {
    scene = 'levels';
  });
  (window as unknown as { __menu: Menu }).__menu = menu;

  const levels = new LevelSelect(
    assets,
    (level) => startLevel(level.id),
    () => {
      scene = 'menu';
    },
  );
  (window as unknown as { __levels: LevelSelect }).__levels = levels;

  function startLevel(id: number): void {
    const level = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
    game = new Game(assets, level);
    (window as unknown as { __game: Game | null }).__game = game;
    game.onExit = () => {
      scene = 'levels';
      game = null;
      (window as unknown as { __game: Game | null }).__game = null;
    };
    game.onRestart = () => startLevel(level.id);
    game.onWin = () => unlockThrough(level.id + 1);
    scene = 'game';
  }

  canvas.addEventListener('pointerdown', (e) => {
    sfx.setVolume(sfx.getVolume()); // 首次手势时确保 AudioContext 可恢复（由各音效方法惰性创建）
    const p = toDesign(e);
    if (scene === 'menu') menu.onPointerDown(p);
    else if (scene === 'levels') levels.onPointerDown(p);
    else game?.onPointerDown(p);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (scene === 'menu') menu.onPointerUp(toDesign(e));
    else if (scene === 'game') game?.onPointerUp();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toDesign(e);
    if (scene === 'menu') menu.onPointerMove(p);
    else if (scene === 'levels') levels.onPointerMove(p);
    else game?.onPointerMove(p);
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    game?.onCancel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (scene === 'levels') scene = 'menu';
      else game?.onCancel();
    }
  });

  // 失焦自动暂停（切标签页/最小化/失去窗口焦点）
  const autoPause = () => {
    if (scene === 'game' && game && game.state === 'playing') game.pauseOpen = true;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // 调试钩子：window.__paused = true 时冻结逻辑，仍持续绘制
    const paused = (window as unknown as { __paused?: boolean }).__paused;
    if (!paused) {
      if (scene === 'menu') menu.update(dt);
      else if (scene === 'levels') levels.update(dt);
      else if (game) game.update(dt);
    }
    // 整屏清底：设计区外（信箱区）不清理会残留上一帧/上一场景的像素
    // （小推车驶出战场、homepage cover 溢出等都曾在这里留残影）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      view.dpr * view.scale,
      0,
      0,
      view.dpr * view.scale,
      view.dpr * view.ox,
      view.dpr * view.oy,
    );
    if (scene === 'menu') menu.draw(ctx);
    else if (scene === 'levels') levels.draw(ctx);
    else if (game) game.draw(ctx);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err: unknown) => {
  console.error(err);
  drawLoading(`加载失败：${err instanceof Error ? err.message : String(err)}`);
});
