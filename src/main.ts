import { Assets } from './core/assets';
import { sfx } from './core/sfx';
import { DEBUG, DEBUG_TRIALS, DESIGN_H, DESIGN_W, LEVELS } from './game/config';
import { createDebugLevels } from './game/debuglevels';
import { Game } from './game/game';
import { EggDialogueView } from './game/eggdialogue';
import { ModeSelect } from './game/modeselect';
import { Menu } from './game/menu';
import { grantCards, unlockThrough, unlockedLevel } from './game/progress';
import { clearBattleSave, loadBattleSave, restoreBattle, saveBattle } from './game/save';

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

  type Scene = 'menu' | 'modes' | 'levels' | 'game';
  let scene: Scene = 'menu';
  let game: Game | null = null;
  const eggDialogue = new EggDialogueView(assets, canvas);
  const debugLevels = DEBUG ? createDebugLevels((id) => startLevel(id), () => { scene = 'modes'; }) : null;
  function showLevels(): void {
    scene = 'levels';
    if (debugLevels) debugLevels.style.display = 'block';
  }

  const menu = new Menu(assets.home, () => {
    scene = 'modes';
  });
  (window as unknown as { __menu: Menu }).__menu = menu;
  (window as unknown as { __sfx: typeof sfx }).__sfx = sfx;

  // 模式选择：冒险模式直通最新进度关卡（有关内存档则续战），其余模式暂为占位
  const modes = new ModeSelect(
    assets,
    () => DEBUG ? showLevels() : startLevel(unlockedLevel(), true),
    () => {
      scene = 'menu';
    },
  );
  (window as unknown as { __modes: ModeSelect }).__modes = modes;

  function startLevel(id: number, preferRestore = false): void {
    const level = LEVELS.find((l) => l.id === id) ?? (DEBUG ? DEBUG_TRIALS.find((l) => l.id === id) : undefined) ?? LEVELS[0];
    // 优先恢复未完成的战斗（同关卡的关内存档）；没有就开新局
    const saved = preferRestore && !DEBUG ? loadBattleSave() : null;
    game = saved && saved.levelId === level.id ? restoreBattle(assets, saved) : new Game(assets, level);
    (window as unknown as { __game: Game | null }).__game = game;
    game.onExit = () => {
      // 退出时保留关内进度（胜负/奖励演出不存），回到模式选择
      if (game && !DEBUG) saveBattle(game);
      if (DEBUG) showLevels(); else scene = 'modes';
      game = null;
      (window as unknown as { __game: Game | null }).__game = null;
    };
    // 重开 = 放弃旧档，从头再来
    game.onRestart = () => {
      if (!DEBUG) clearBattleSave();
      startLevel(level.id, false);
    };
    game.onWin = () => {
      if (DEBUG) return;
      // 通关：解锁下一关 + 把本关奖励卡记入已获得 + 清掉本关的关内存档
      unlockThrough(Math.min(level.id + 1, LEVELS[LEVELS.length - 1].id));
      grantCards(level.unlocks ?? []);
      clearBattleSave();
    };
    // 卡片介绍页的「下一关」
    game.onNext = () => {
      if (!DEBUG) clearBattleSave();
      const next = LEVELS.find((l) => l.id > level.id);
      if (next) startLevel(next.id, true);
      else {
        scene = 'modes';
        game = null;
        (window as unknown as { __game: Game | null }).__game = null;
      }
    };
    scene = 'game';
  }

  canvas.addEventListener('pointerdown', (e) => {
    sfx.setVolume(sfx.getVolume()); // 首次手势时确保 AudioContext 可恢复（由各音效方法惰性创建）
    sfx.startMusic(); // 首次手势后启动 BGM 循环（哈基米）
    const p = toDesign(e);
    if (scene === 'menu') menu.onPointerDown(p);
    else if (scene === 'modes') modes.onPointerDown(p);
    else if (e.button === 0) game?.onPointerDown(p); // 仅左键操作; 右键不选中/种下, 由 contextmenu 取消选择
  });
  canvas.addEventListener('pointerup', (e) => {
    if (scene === 'menu') menu.onPointerUp(toDesign(e));
    else if (scene === 'game') game?.onPointerUp();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toDesign(e);
    if (scene === 'menu') menu.onPointerMove(p);
    else if (scene === 'modes') modes.onPointerMove(p);
    else game?.onPointerMove(p);
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    game?.onCancel();
  });
  window.addEventListener('keydown', (e) => {
    if (scene === 'game' && !e.isComposing && ['z', 'x'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      game?.onRhythmKey(e.key, e.repeat);
      return;
    }
    if (e.key === 'Escape') {
      if (scene === 'levels') { if (debugLevels) debugLevels.style.display = 'none'; scene = 'modes'; }
      else if (scene === 'modes') scene = 'menu';
      else game?.onCancel();
    }
  });

  // 失焦自动暂停（切标签页/最小化/失去窗口焦点）；顺便把进度落盘
  const autoPause = () => {
    if (scene === 'game' && game && game.state === 'playing') {
      game.pauseOpen = true;
      if (!DEBUG) saveBattle(game);
      sfx.syncPause(true); // 失焦/切后台时 rAF 会停摆，帧循环里的音乐同步来不及执行，必须立即挂起
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);

  let last = performance.now();
  let saveTick = 0;
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // 调试钩子：window.__paused = true 时冻结逻辑，仍持续绘制
    const paused = (window as unknown as { __paused?: boolean }).__paused;
    // BGM 只在关卡内且未暂停时播放（菜单/模式选择/暂停面板一律挂起音频上下文）
    sfx.syncPause(!(scene === 'game' && game !== null && !game.pauseOpen));
    if (!paused) {
      if (scene === 'menu') menu.update(dt);
      else if (scene === 'modes') modes.update(dt);
      else if (game) game.update(dt);
    }
    // 关内进度定时落盘（每 5 秒；进行中才存，退出/通关/重开另有处理）
    saveTick += dt;
    if (saveTick >= 5) {
      saveTick = 0;
      if (!DEBUG && scene === 'game' && game && game.state === 'playing' && !game.pauseOpen) saveBattle(game);
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
    else if (scene === 'modes' || scene === 'levels') modes.draw(ctx);
    else if (game) game.draw(ctx);
    eggDialogue.sync(scene === 'game' ? game : null);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err: unknown) => {
  console.error(err);
  drawLoading(`加载失败：${err instanceof Error ? err.message : String(err)}`);
});
