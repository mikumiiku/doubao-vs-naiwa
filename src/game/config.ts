export const DESIGN_W = 1585;
export const DESIGN_H = 992;

/** 作战区网格（1585x992 设计分辨率下的像素坐标）
 *  5 行 × 9 列；边界为 2026-10 重绘版战场图(横平竖直、末行略高)逐缝实测值,
 *  测量脚本: 对归一化后的 bg 做梯度能量峰值检测(scripts/overlay-grid.mjs 可视化核对) */
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
  doughInterval: 8,
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
  /** 上一波结束后到本波开始的等待（秒）；上一波提前清空则 4 秒后即来 */
  delay: number;
}

export interface LevelDef {
  id: number;
  name: string;
  /** 本关可用的防守卡牌（id 列表，决定卡牌栏与选关界面预览） */
  cards: string[];
  waves: WaveDef[];
}

// 出怪节奏对齐 PvZ 冒险模式前期(1-1 仅 4 波无大波、单只出场、波间 20s+ 大空隙,
// 参考 PvZ wiki「关卡1-1」与无尽模式"每波倒计时 25~31s"的规律):
// 数量少、间隔长、逐波缓增, 给面团经济留足时间——旧版一波 4-5 只必然丢车。
export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: '初来乍到',
    cards: ['douxian_shooter'],
    waves: [
      { count: 1, interval: 1, delay: 0 }, // 首波: 由 firstFrogAt(第二团面团落地+5s)门控, delay 无效
      { count: 1, interval: 1, delay: 20 },
      { count: 1, interval: 1, delay: 24 },
      { count: 1, interval: 1, delay: 26 },
    ],
  },
  {
    id: 2,
    name: '面和起来',
    cards: ['douxian_shooter', 'hemian_doubao'],
    waves: [
      { count: 1, interval: 1, delay: 0 },
      { count: 1, interval: 1, delay: 18 },
      { count: 1, interval: 1, delay: 20 },
      { count: 2, interval: 8, delay: 22 },
      { count: 2, interval: 7, delay: 22 },
      { count: 3, interval: 5, delay: 24 }, // 最后一波: 大波, 横幅+大旗
    ],
  },
];

export const DEBUG = new URLSearchParams(location.search).has('debug');
