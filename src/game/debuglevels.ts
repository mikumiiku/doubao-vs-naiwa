import { DEBUG_TRIALS, LEVELS } from './config';
import { ATTACKERS, DEFENDERS } from './units';

export function createDebugLevels(start: (id: number) => void, back: () => void): HTMLElement {
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', '调试选关');
  panel.style.cssText =
    'position:fixed;inset:12px;z-index:5;padding:20px;background:#f5f5f5;color:#222;overflow:auto;font:16px system-ui;display:none';
  const title = document.createElement('h1');
  title.textContent = '冒险模式 · 调试选关';
  panel.append(title);
  const tip = document.createElement('p');
  tip.textContent = '任意关卡直接开新局，不读写正式进度。';
  panel.append(tip);
  for (const level of [...LEVELS, ...DEBUG_TRIALS]) {
    const button = document.createElement('button');
    const card = DEFENDERS.find((d) => d.id === level.cards[level.cards.length - 1])!;
    button.textContent = level.trial ? level.name : `第 ${level.id} 关 · ${level.name}`;
    button.style.cssText =
      'display:block;min-height:48px;width:min(100%,480px);margin:10px 0;text-align:left;padding:12px;cursor:pointer;font:inherit';
    button.onclick = () => {
      panel.style.display = 'none';
      start(level.id);
    };
    panel.append(button);
    const hint = document.createElement('p');
    hint.textContent = level.trial ? level.intro! : `新增 ${card.name}${level.newEnemy ? ` / ${ATTACKERS[level.newEnemy].name}` : ''} · ${level.intro}`;
    hint.style.cssText = 'max-width:720px;margin:0 0 18px;color:#555';
    panel.append(hint);
  }
  const button = document.createElement('button');
  button.textContent = '返回模式选择';
  button.style.cssText = 'padding:12px;font:inherit;cursor:pointer';
  button.onclick = () => {
    panel.style.display = 'none';
    back();
  };
  panel.append(button);
  document.body.append(panel);
  return panel;
}
