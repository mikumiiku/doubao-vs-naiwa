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
  /** 被夹子夹起移除中: 上提+缩小消失(夹子道具的挖除演出), 与啃咬致死的原地溶解区分 */
  lifted = false;
  /** 移动型单位锁住的推搡目标(同时目标端 pushedBy 指回来, 形成双向互锁) */
  pushTarget: Attacker | null = null;
  /** 已发起跳移的推搡动画轮数 */
  pushLoop = -1;
  abilityTimer = 0;
  abilityFx = 0;
  candyDrops = 0;

  constructor(
    public def: DefenderDef,
    public col: number,
    public row: number,
    public x: number,
    public y: number,
    assets: Assets,
  ) {
    this.hp = def.hp;
    // 移动型单位(不绕弯豆包)没有待机行, 出场即走姿
    this.anim = new Anim(assets, def.id, def.mover ? 'walk' : 'idle');
    this.produceTimer = def.producer ? def.producer.first[0] + Math.random() * (def.producer.first[1] - def.producer.first[0]) : 0;
  }
}

export class Attacker {
  hp: number;
  state: 'walk' | 'eat' | 'fan' | 'slide' | 'vault' | 'hatch' | 'dying' = 'walk';
  anim: Anim;
  biteTimer = 0;
  hitFlash = 0;
  target: Defender | null = null;
  dead = false;
  /** 断手状态(血量掉过第一档受伤阈值后动作换用 *_b 断手动画) */
  broken = false;
  /** 倒下时刻（秒，BattleState.time）：结算奖励卡要挑"最后一只阵亡的奶蛙" */
  diedAt = 0;
  /**
   * 行走时的身体起伏偏移（px，负值抬高）。
   * 只影响绘制：y 仍是脚底所在行的逻辑坐标，被啃咬/大肥鱼等逻辑不受影响。
   */
  bobOffset = 0;
  /** 个体速度系数（含 speedJitter 的随机量），长期平均速度 = def.speed × speedMul */
  speedMul = 1;
  /** 入场时的动画相位偏移（帧），让同批奶蛙不同手同脚 */
  phaseOffset = 0;
  /** 推它走的移动型豆包(被不绕弯豆包推搡期间自身动画与移动被冻结) */
  pushedBy: Defender | null = null;
  hop: { from: number; to: number; elapsed: number; duration: number } | null = null;
  hopOffset = 0;
  slowTimer = 0;
  slowFactor = 1;
  rollAngle = 0;
  vault: { from: number; to: number; elapsed: number; duration: number; height: number } | null = null;
  vaultOffset = 0;
  rallyTimer = 1;
  rallyFx = 0;
  rallyBuff = 0;
  rallyFactor = 1;
  fanProgress = 0;
  fanTimer = 0;
  fanCast = false;
  slide: { from: number; to: number; elapsed: number; duration: number } | null = null;

  constructor(
    public def: AttackerDef,
    public row: number,
    public x: number,
    public y: number,
    assets: Assets,
  ) {
    this.hp = def.hp;
    this.anim = new Anim(assets, def.id, 'walk');
    // 个体差异: 速度上下浮动一点 + 随机起步相位。
    // 一群奶蛙若速度相同、动画同帧, 走起来会像复制粘贴(PvZ 也是这么处理的: PickRandomSpeed)。
    this.speedMul = 1 + (Math.random() * 2 - 1) * def.speedJitter;
    const meta = assets.meta(def.id, 'walk');
    this.phaseOffset = meta && meta.frames > 0 ? Math.floor(Math.random() * meta.frames) : 0;
    this.anim.t = meta && meta.fps > 0 ? this.phaseOffset / meta.fps : 0;
  }
}

export class Projectile {
  dead = false;
  remainingHits = 1;
  hit = new Set<Attacker>();
  lightweight = true;
  windWeakened = false;

  constructor(
    public row: number,
    public x: number,
    public y: number,
    public vx: number,
    public damage: number,
  ) {}
}

export interface FanWind {
  row: number;
  x: number;
  previousX: number;
  y: number;
  age: number;
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
