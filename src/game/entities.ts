import { Anim } from '../core/anim';
import type { Assets } from '../core/assets';
import type { AttackerDef, DefenderDef } from './units';

export class Defender {
  hp: number;
  state: 'idle' | 'attack' | 'dying' = 'idle';
  anim: Anim;
  /** 已发弹的动画轮数（配合 fireFrame 保证一轮动画只出一发；set() 换动画后需重置为 -1） */
  lastFireLoop = -1;
  /** 生产型单位：距下次产出的剩余秒数 */
  produceTimer: number;
  hitFlash = 0;
  /** 死亡动画播完，等待移除 */
  dead = false;
  /** 无死亡动画的单位(新版豆包没有死亡行): 溶解消失的进度秒数 */
  dieT = 0;

  constructor(
    public def: DefenderDef,
    public col: number,
    public row: number,
    public x: number,
    public y: number,
    assets: Assets,
  ) {
    this.hp = def.hp;
    this.anim = new Anim(assets, def.id, 'idle');
    this.produceTimer = def.producer ? def.producer.first[0] + Math.random() * (def.producer.first[1] - def.producer.first[0]) : 0;
  }
}

export class Attacker {
  hp: number;
  state: 'walk' | 'eat' | 'dying' = 'walk';
  anim: Anim;
  biteTimer = 0;
  hitFlash = 0;
  target: Defender | null = null;
  dead = false;

  constructor(
    public def: AttackerDef,
    public row: number,
    public x: number,
    public y: number,
    assets: Assets,
  ) {
    this.hp = def.hp;
    this.anim = new Anim(assets, def.id, 'walk');
  }
}

export class Projectile {
  dead = false;

  constructor(
    public row: number,
    public x: number,
    public y: number,
    public vx: number,
    public damage: number,
  ) {}
}

/** 从右侧抛入的面团：先沿抛物线飞入战场，落地后等待点击拾取 */
export class DoughBall {
  /** 飞行进度 0..1 */
  t = 0;
  landed = false;
  /** 已计入“落地/被接住”统计（用于首蛙时机门控） */
  resolved = false;
  dead = false;
  ttl: number;

  constructor(
    public x0: number,
    public y0: number,
    public x1: number,
    public y1: number,
    /** 抛物线高度（弧度越深值越大，由落点远近决定，保证弧线不出屏） */
    public arc: number,
    ttl: number,
    /** 是否计入“右侧抛入”统计（首蛙门控）；生产单位产出的面团不计 */
    public counts: boolean,
  ) {
    this.ttl = ttl;
  }
}

/** 面团当前位置（飞行中走抛物线，落地后停在落点） */
export function doughPos(b: DoughBall): { x: number; y: number } {
  const x = b.x0 + (b.x1 - b.x0) * b.t;
  const base = b.y0 + (b.y1 - b.y0) * b.t;
  const y = base - b.arc * 4 * b.t * (1 - b.t);
  return { x, y };
}

/** 大肥鱼小推车：每行一台，待命于家园区界线旁；奶蛙越线时触发，沿行冲锋并秒杀整行 */
export class Mower {
  state: 'idle' | 'active' | 'gone' = 'idle';
  t = 0;

  constructor(
    public row: number,
    public x: number,
    public y: number,
  ) {}
}
