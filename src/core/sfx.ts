/**
 * WebAudio 程序化音效与素材音效。
 * 音量持久化到 localStorage，主音量用 v² 曲线（感知线性）。
 * 首次用户手势时惰性创建 AudioContext。
 */

const STORAGE_KEY = 'dvn.volume';

/** 梗音频素材: 二创作品, 版权归原权利人, 放在 public/(被 gitignore) 不入版本库, 需自行放置。
 *  文件缺失时静默降级为无声, 不影响运行; 来源见 README「素材说明」。 */
const MUSIC_URL = 'assets/audio/hachimi.m4a';
const LAUGH_URL = 'assets/audio/nailong-laugh.m4a';
const DEATH_URL = 'assets/audio/andy.m4a';
const LOSE_URL = 'assets/audio/naiwa-chew.m4a';
const FAN_URL = 'assets/audio/shiranui-fan.m4a';
/** 大笑只取前 N 秒(素材多为循环剪辑版, 防冗长) */
const LAUGH_SECONDS = 4;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = Number(localStorage.getItem(STORAGE_KEY) ?? 0.7);
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private musicStarted = false;

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

  /** 加载音频素材并解码(WebAudio 走主音量, 素材缺失/解码失败返回 null 静默降级) */
  private buffer(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = (async () => {
        const ctx = this.ensure();
        if (!ctx) return null;
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          return await ctx.decodeAudioData(await r.arrayBuffer());
        } catch {
          return null;
        }
      })();
      this.buffers.set(url, p);
    }
    return p;
  }

  /** BGM(哈基米)循环播放。需在首次用户手势后调用; 重复调用无副作用 */
  startMusic(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    void this.buffer(DEATH_URL);
    void this.buffer(LOSE_URL);
    void this.buffer(FAN_URL);
    void this.buffer(MUSIC_URL).then((buf) => {
      if (!buf || !this.ctx || !this.master) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0.4; // 音乐压低些, 别盖过音效
      src.connect(g);
      g.connect(this.master);
      src.start();
    });
  }

  /** 暂停/恢复整个音频上下文（暂停面板、失焦自动暂停时调用，BGM 随之一起停/起） */
  syncPause(paused: boolean): void {
    if (!this.ctx) return;
    if (paused && this.ctx.state === 'running') void this.ctx.suspend();
    if (!paused && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 调试：当前 AudioContext 状态 */
  get debugState(): string {
    return this.ctx?.state ?? 'none';
  }

  /** 奶龙大笑: 大波奶蛙进攻的提示音(单次, 取前 LAUGH_SECONDS 秒) */
  laugh(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.volume <= 0) return;
    void this.buffer(LAUGH_URL).then((buf) => {
      if (!buf || !this.ctx || !this.master) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 0.9;
      src.connect(g);
      g.connect(this.master);
      src.start(0, 0, Math.min(LAUGH_SECONDS, buf.duration));
    });
  }

  /** 完整播放一次素材，不按动画时长截断。 */
  private playClip(url: string, gainValue: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.volume <= 0) return;
    void this.buffer(url).then((buf) => {
      if (!buf || !this.ctx || !this.master) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(gain);
      gain.connect(this.master);
      src.start();
    });
  }

  /** 大笑奶蛙死亡：“安迪～”，原速播放，保留原片结尾完整升调尾音。 */
  frogDeath(): void {
    this.playClip(DEATH_URL, 0.9);
  }

  fan(): void {
    this.playClip(FAN_URL, 0.9);
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
    this.playClip(LOSE_URL, 0.95);
  }
}

export const sfx = new Sfx();
