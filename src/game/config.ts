import { EGG_CHART } from './eggrhythm';

export const DESIGN_W = 1585;
export const DESIGN_H = 992;

/** 作战区网格（1585x992 设计分辨率下的像素坐标）
 *  5 行 × 9 列；边界为 2026-10 重绘版战场图(横平竖直、末行略高)逐缝实测值,
 *  测量脚本: 对归一化后的 bg 做梯度能量峰值检测(scripts/tools/overlay-grid.mjs 可视化核对) */
export const GRID = {
  cols: 9,
  rows: 5,
  /** 10 条列边界（递增）：贴合背景棋盘格的实测分界线 */
  colX: [228, 363, 495, 620, 748, 876, 1008, 1132, 1261, 1393],
  /** 6 条行边界（递增）；末行 771-909 比中间行(126-136)略高 */
  rowY: [241, 380, 506, 635, 771, 909],
};

/** 等待区出生点 x 坐标（右侧土路），y 直接用各行脚底线（见 game.rowFootY） */
export const SPAWN_X = 1500;

/** 奶蛙越过这条竖线即判负（家园区入口：草坪左缘再让 25px） */
export const HOME_LINE_X = 203;

export const RESOURCE = {
  name: '面团',
  start: 50,
  /** 每个面团的面值（与 PvZ 天上掉落的阳光 25 对齐） */
  doughValue: 25,
  /** 首团抛入时间（秒） */
  firstDoughAt: 3,
  /** 之后每隔多少秒抛入一团 */
  doughInterval: 12,
  /** 抛物线飞行时长（秒） */
  doughFlyTime: 1.3,
  /** 落地后可拾取时长（秒），最后 2 秒淡出 */
  doughTTL: 12,
};

/** 第一只奶蛙在第二团面团落地（或被接住）后多少秒出现 */
export const FIRST_FROG_AFTER_SECOND_DOUGH = 5;

/** 大肥鱼小推车 */
export const MOWER = {
  /** 待命位置（家园区界线左側的院子石板路上） */
  restX: HOME_LINE_X - 40,
  /** 触发后冲锋速度 px/s */
  speed: 380,
  /** 鱼身完全驶出战场右缘即消失（中心点超过 右缘+半宽） */
  exitX: 1585 + 85,
  /** 绘制宽度（素材 2:1） */
  w: 170,
};

export interface WaveDef {
  /** 本波数量 */
  count: number;
  /** 同波相邻出生间隔（秒） */
  interval: number;
  /** 上一波全部出场后到本波开始的等待（秒），场上存活的奶蛙不阻塞后续波次。 */
  delay: number;
  /** 大波：到来时屏幕中央横幅提示 + 进度条升旗（最后一波恒按大波处理，升大王旗） */
  big?: boolean;
  /** 特殊波固定怪种；常规波使用 pool 权重混编。 */
  type?: string;
  pool?: { type: string; weight: number }[];
  /** 保证每波前几只为普通奶蛙；指定 type 的特殊波除外。 */
  ordinaryFirst?: number;
  featured?: string;
}

export interface LevelDef {
  id: number;
  name: string;
  kind?: 'battle' | 'egg-invasion' | 'conveyor';
  intro?: string;
  newEnemy?: string;
  trial?: boolean;
  rows?: number[];
  startDough?: number;
  /** 本关可用的防守卡牌（id 列表，决定卡牌栏） */
  cards: string[];
  /**
   * 通关本关后**新获得**的卡牌（id 列表）；选关界面只展示这一关「刚拿到」的卡。
   * 注意是"本关新增"，不是"本关可用"：豆馅射手开局就有，所以它不是任何一关的奖励。
   * 后面关卡还没做时留空（选关界面会显示"奖励筹备中"占位）。
   */
  unlocks?: string[];
  waves: WaveDef[];
}

/** 每关一张新豆包；1/3/5/7/9 关依次引入奶蛙。 */
export const CAMPAIGN_CARDS = [
  'douxian_shooter',
  'hemian_doubao',
  'buraowan_doubao',
  'tangbao_doubao',
  'yizhen_doubao',
  'zhaxin_doubao',
  'fudu_doubao',
  'moyu_doubao',
  'luanhui_doubao',
  'kaimen_doubao',
];
export const ENEMY_ORDER = ['ordinary_frog', 'laugh_frog', 'nai_egg', 'naiji', 'hoola_frog'];
export function levelKind(id: number): NonNullable<LevelDef['kind']> {
  return id % 10 === 5 ? 'egg-invasion' : id % 10 === 0 ? 'conveyor' : 'battle';
}
function openingRows(id: number): number[] {
  if (id === 1) return [2];
  if (id <= 3) return [1, 2, 3];
  if (id === 4) return [0, 1, 2, 3];
  return [0, 1, 2, 3, 4];
}
function openingDough(id: number): number {
  if (id <= 2) return 50;
  if (id === 3) return 100;
  if (id === 4) return 150;
  if (id === 9) return 250;
  return 200;
}

const chapters = [
  {
    name: '第一口豆馅',
    intro: '豆馅射手就位。先看奶蛙走哪一行，再把豆包种在后排。',
    counts: [1, 2, 2, 4],
    gap: 8,
    weights: [100, 0, 0, 0, 0],
  },
  { name: '先和面再开火', intro: '和面豆包会生产面团。后排管饭，前排管打。', counts: [2, 3, 4, 5], gap: 7.3, weights: [100, 0, 0, 0, 0] },
  {
    name: '笑一个？别过来',
    intro: '大笑奶蛙会把豆包笑成同类。不绕弯豆包能把它推离豆包。',
    counts: [2, 4, 5, 8],
    gap: 6.5,
    weights: [92, 8, 0, 0, 0],
  },
  {
    name: '糖包也能顶事',
    intro: '糖包听不懂战术，但扛得住。挨打时还会掉三次面团。',
    counts: [3, 5, 7, 9],
    gap: 5.8,
    weights: [88, 12, 0, 0, 0],
  },
  { name: '奶蛋入侵', intro: '三分钟节奏挑战：第三列内点准收缩圈，鼠标或Z/X击碎奶蛋。漏五只失败。', counts: [EGG_CHART.length], gap: 1, weights: [0, 0, 100, 0, 0] },
  {
    name: '最扎心的一句话',
    intro: '扎心豆包落地后爆开，清掉附近三行奶蛙。一针见血能穿过一串怪。',
    counts: [4, 6, 8, 12],
    gap: 5.1,
    weights: [84, 16, 0, 0, 0],
  },
  {
    name: '蛋里真的有鸡',
    intro: '奶鸡跑得快，奶蛋会跳过第一个豆包再孵出奶鸡。复读豆包给附近队友加速。',
    counts: [4, 7, 9, 14],
    gap: 4.7,
    weights: [70, 10, 8, 12, 0],
  },
  {
    name: '上班摸鱼，下班打蛙',
    intro: '摸鱼豆包把附近三行都喷得滑溜溜，给火力争取时间。',
    counts: [5, 8, 10, 15],
    gap: 4.4,
    weights: [60, 10, 13, 17, 0],
  },
  {
    name: '吼啦，刚把爹',
    intro: '吼啦奶蛙滑着轮滑给附近同伴打气。已读乱回一次照顾三行。',
    counts: [5, 9, 11, 15],
    gap: 4.1,
    weights: [50, 9, 15, 19, 7],
  },
  {
    name: '开门，送豆包啦',
    intro: '传送带送来的豆包直接种，不花面团。开门见山把近处一群奶蛙拍退。',
    counts: [6, 10, 13, 19],
    gap: 3.8,
    weights: [35, 9, 21, 25, 10],
  },
];

export const LEVELS: LevelDef[] = chapters.map((chapter, index) => {
  const id = index + 1;
  const kind = levelKind(id);
  const pool = ENEMY_ORDER.map((type, i) => ({ type, weight: chapter.weights[i] })).filter((e) => e.weight > 0);
  const newEnemy = id % 2 === 1 ? ENEMY_ORDER[index / 2] : undefined;
  return {
    id,
    name: chapter.name,
    kind,
    intro: chapter.intro,
    newEnemy,
    rows: openingRows(id),
    startDough: openingDough(id),
    cards: CAMPAIGN_CARDS.slice(0, id),
    unlocks: id < 10 ? [CAMPAIGN_CARDS[id]] : [],
    waves: chapter.counts.map((count, waveIndex) => ({
      count,
      pool:
        waveIndex === 0 && kind === 'battle'
          ? [{ type: 'ordinary_frog', weight: 100 }]
          : kind === 'battle'
            ? pool.map((p) => ({
                ...p,
                weight: p.weight * (p.type === 'ordinary_frog' ? 1 : waveIndex === 1 ? 0.35 : waveIndex === 2 ? 0.7 : 1),
              }))
            : pool,
      ordinaryFirst: waveIndex === 0 && kind === 'battle' ? 1 : 0,
      interval: kind === 'egg-invasion' ? 1 : Math.max(2.4, chapter.gap - waveIndex * 0.45),
      delay: waveIndex === 0 ? 0 : Math.max(4, 7 - index * 0.25),
      big: waveIndex === chapter.counts.length - 1,
      featured: newEnemy && kind !== 'egg-invasion' && waveIndex === 1 ? newEnemy : undefined,
    })),
  };
});

export const DEBUG_TRIALS: LevelDef[] = [{
  id: 101, name: '不知火蛙试炼', trial: true, kind: 'battle', rows: [2],
  newEnemy: 'shiranui_frog', startDough: 1000, cards: [...CAMPAIGN_CARDS], unlocks: [],
  intro: '生命200 · 速度38 · 啃咬30。行进三格挥扇，粉色风刃削弱直射豆馅30%，随后滑步一格。',
  waves: [
    { count: 2, interval: 10, delay: 0, type: 'shiranui_frog' },
    { count: 4, interval: 5, delay: 6, type: 'shiranui_frog', big: true },
  ],
}];

export const DEBUG = /^\/debug\/?$/.test(location.pathname ?? '') || new URLSearchParams(location.search).has('debug');
