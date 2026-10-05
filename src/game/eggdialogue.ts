import type { Assets } from '../core/assets';
import type { Game } from './game';
import { EGG_STORY } from './eggstory';
import './eggdialogue.css';

/** 演出只管理DOM与焦点；冻结、进度和读档归Game负责。 */
export class EggDialogueView {
  private game: Game | null = null;
  private shownStep: number | null = null;
  private previousFocus: HTMLElement | null = null;
  private readonly root = document.createElement('section');
  private readonly replay = document.createElement('button');
  private readonly portrait: HTMLImageElement;
  private readonly title: HTMLElement;
  private readonly line: HTMLElement;
  private readonly cue: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly next: HTMLButtonElement;

  constructor(
    private assets: Assets,
    private canvas: HTMLCanvasElement,
  ) {
    this.root.className = 'egg-dialogue';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'egg-story-title');
    this.root.setAttribute('aria-describedby', 'egg-story-line');
    this.root.innerHTML = `<div class="egg-dialogue-stage">
      <img class="egg-dialogue-portrait" alt="豆包" width="1024" height="1536">
      <div class="egg-dialogue-heading"><span>第五关 · 奶蛋入侵</span><h1 id="egg-story-title"></h1><p class="egg-dialogue-cue"></p></div>
      <div class="egg-dialogue-paper"><strong class="egg-dialogue-name">豆包</strong>
        <p id="egg-story-line" aria-live="polite"></p>
        <div class="egg-dialogue-actions"><span class="egg-dialogue-counter"></span><button type="button" data-back>上一句</button><button type="button" data-next>下一句</button></div>
      </div></div>`;
    this.portrait = this.root.querySelector('img')!;
    this.title = this.root.querySelector('h1')!;
    this.line = this.root.querySelector('#egg-story-line')!;
    this.cue = this.root.querySelector('.egg-dialogue-cue')!;
    this.counter = this.root.querySelector('.egg-dialogue-counter')!;
    this.back = this.root.querySelector('[data-back]')!;
    this.next = this.root.querySelector('[data-next]')!;
    this.back.addEventListener('click', () => {
      this.game?.advanceEggDialogue(true);
      this.sync(this.game);
    });
    this.next.addEventListener('click', () => {
      this.game?.advanceEggDialogue();
      this.sync(this.game);
    });
    this.root.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.game!.pauseOpen = true;
        this.sync(this.game);
      } else if (event.key === 'Tab') {
        const buttons = [this.back, this.next].filter((b) => !b.disabled);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    });
    this.replay.type = 'button';
    this.replay.className = 'egg-dialogue-replay';
    this.replay.textContent = '和豆包聊聊';
    this.replay.hidden = true;
    this.replay.addEventListener('click', () => {
      if (this.game?.invasion && !this.game.pauseOpen) this.game.eggDialogue = 0;
      this.sync(this.game);
    });
    document.body.append(this.replay, this.root);
  }

  sync(game: Game | null): void {
    this.game = game;
    const step = game?.invasion && game.state === 'playing' && !game.pauseOpen ? game.eggDialogue : null;
    this.replay.hidden = !game?.invasion || game.state !== 'playing' || game.pauseOpen || step !== null;
    if (step === this.shownStep) return;
    const wasOpen = this.shownStep !== null;
    this.shownStep = step;
    this.root.hidden = step === null;
    this.canvas.inert = step !== null;
    if (step === null) {
      if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
      this.previousFocus = null;
      return;
    }
    const page = EGG_STORY[step];
    this.portrait.src = this.assets.dialoguePortraits.get(page.portrait)!.src;
    this.title.textContent = page.title;
    this.line.textContent = page.line;
    this.cue.textContent = page.cue;
    this.counter.textContent = `${step + 1} / ${EGG_STORY.length}`;
    this.back.disabled = step === 0;
    this.next.textContent = step === EGG_STORY.length - 1 ? '开打！' : '下一句';
    if (!wasOpen) this.previousFocus = document.activeElement as HTMLElement;
    if (!wasOpen || this.back.disabled) this.next.focus({ preventScroll: true });
  }
}
