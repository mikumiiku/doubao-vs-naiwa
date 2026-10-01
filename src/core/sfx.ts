/**
 * 程序化音效（WebAudio 合成，无音频素材）。
 * 音量持久化到 localStorage，主音量用 v² 曲线（感知线性）。
 * 首次用户手势时惰性创建 AudioContext。
 */

const STORAGE_KEY = 'dvn.volume';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = Number(localStorage.getItem(STORAGE_KEY) ?? 0.7);

  getVolume(): number {
    return this.volume;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem(STORAGE_KEY, String(this.volume));
    if (this.master) this.master.gain.value = this.volume * this.volume;
  }

  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 单音：频率 f0→f1 滑音，type 波形，dur 秒，gain 峰值 */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.volume <= 0) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 拾取面团 */
  collect(): void {
    this.tone('sine', 880, 1318, 0.12, 0.16);
  }

  /** 种下单位 */
  plant(): void {
    this.tone('triangle', 200, 100, 0.14, 0.22);
  }

  /** 发射豆馅（轻） */
  shoot(): void {
    this.tone('square', 330, 240, 0.05, 0.045);
  }

  /** 大肥鱼冲锋（滑哨） */
  mower(): void {
    this.tone('sawtooth', 180, 820, 0.55, 0.1);
  }

  win(): void {
    this.tone('sine', 523, 523, 0.16, 0.18);
    this.tone('sine', 659, 659, 0.16, 0.18, 0.14);
    this.tone('sine', 784, 784, 0.3, 0.2, 0.28);
  }

  lose(): void {
    this.tone('triangle', 392, 370, 0.25, 0.2);
    this.tone('triangle', 330, 262, 0.5, 0.2, 0.22);
  }
}

export const sfx = new Sfx();
