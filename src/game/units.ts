/**
 * 单位注册表：新增防守/进攻单位 = 在 public/assets/sprites/<id>/ 备好序列帧
 * （scripts/slice-sprites.mjs 切片）+ 在这里加一条定义。
 */

export interface DefenderDef {
  kind: 'defender';
  /** 与 sprites 目录名、manifest key 一致 */
  id: string;
  name: string;
  cost: number;
  /** 种植冷却（秒） */
  cooldown: number;
  hp: number;
  damage: number;
  /** 开火帧：攻击动画播到该帧（0 起）时生成弹丸，一轮动画一发，射速 = 动画时长 */
  fireFrame: number;
  projectileSpeed: number;
  /** 战场上的绘制高度（px，脚底锚定） */
  spriteH: number;
  /** 素材朝向不是朝右时置 true */
  flipX: boolean;
  /** 生产型单位：周期性产出可拾取的面团 */
  producer?: {
    /** 首次产出时间范围（秒，区间内随机） */
    first: [number, number];
    /** 之后产出间隔范围（秒，区间内随机） */
    interval: [number, number];
  };
}

export interface AttackerDef {
  kind: 'attacker';
  id: string;
  name: string;
  hp: number;
  /** 移动速度 px/s */
  speed: number;
  biteDamage: number;
  /** 啃咬间隔（秒） */
  biteInterval: number;
  /** 与防守方的距离小于该值时停下啃咬 */
  biteReach: number;
  spriteH: number;
  /** 素材朝向不是朝左时置 true */
  flipX: boolean;
  /** 死亡动画需要水平翻转（素材倒向与前进方向相反时） */
  flipDeath: boolean;
  /** 受伤外观阈值（hp 比例降序）：低于第一个值为轻伤外观，低于第二个为重伤外观 */
  damageStages: [number, number];
}

export const DEFENDERS: DefenderDef[] = [
  {
    kind: 'defender',
    id: 'douxian_shooter',
    name: '豆馅射手',
    cost: 100,
    cooldown: 7.5,
    hp: 300,
    damage: 20,
    fireFrame: 4, // 新版攻击 7 帧: f4 是吐豆馅帧
    projectileSpeed: 420,
    spriteH: 100,
    flipX: false,
  },
  {
    kind: 'defender',
    id: 'hemian_doubao',
    name: '和面豆包',
    cost: 50,
    cooldown: 7.5,
    hp: 300,
    damage: 0,
    fireFrame: 0,
    projectileSpeed: 0,
    spriteH: 96,
    flipX: false,
    producer: { first: [3, 12.5], interval: [23.5, 25] },
  },
];

export const ATTACKERS: Record<string, AttackerDef> = {
  laugh_frog: {
    kind: 'attacker',
    id: 'laugh_frog',
    name: '大笑奶蛙',
    hp: 200,
    speed: 26,
    biteDamage: 40,
    biteInterval: 1.0,
    biteReach: 56,
    spriteH: 112,
    flipX: false,
    flipDeath: false, // 新 act 表死亡为朝行进方向(左)前方趴倒, 无需翻转
    damageStages: [0.66, 0.33],
  },
};
