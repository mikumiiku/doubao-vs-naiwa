/**
 * 单位注册表：新增防守/进攻单位 = 在 public/assets/sprites/<id>/ 备好序列帧
 * （scripts/assets/slice-sprites.mjs 切片）+ 在这里加一条定义。
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
  /** 获得卡片的介绍页文案（新卡登场时展示） */
  describe: string;
  effect: string;
  blocker?: { dropEvery: number; maxDrops: number };
  pierce?: number;
  blast?: { fuse: number; radius: number; rows: number };
  boost?: { radius: number; factor: number };
  slow?: { range: number; rows: number; interval: number; factor: number; duration: number };
  lanes?: number;
  slam?: { range: number; interval: number; knockback: number };
  /** 生产型单位：周期性产出可拾取的面团 */
  producer?: {
    /** 首次产出时间范围（秒，区间内随机） */
    first: [number, number];
    /** 之后产出间隔范围（秒，区间内随机） */
    interval: [number, number];
  };
  /**
   * 移动型单位(不绕弯豆包): 放置后不占地(occupiesCell=false), 沿所在行向右走,
   * 每轮推搡只锁一个目标，向后低弧线跳移；不造成伤害，其他进攻方直接穿行。
   */
  mover?: {
    /** 行走/推搡速度 px/s */
    speed: number;
    /** 锁敌距离：前方 gap 小于该值开始推搡 */
    reach: number;
    /** 每次推搡把目标强制后移(向右)的像素 — 约半格 */
    knockback: number;
  };
  /** false = 放置需要格子但放置后不占用(移动型单位), 其他植物仍可种在同格 */
  occupiesCell?: boolean;
}

export interface AttackerDef {
  kind: 'attacker';
  id: string;
  name: string;
  hp: number;
  /** 移动速度 px/s（平均值；瞬时速度由动画的根位移轨道调制） */
  speed: number;
  /** 每只个体的速度随机浮动比例（0.1 = ±10%），避免一群怪整齐划一像复制粘贴 */
  speedJitter: number;
  /** 根位移轨道对瞬时速度的调制强度（0 = 匀速平移；0.3 左右即有明显步感又不抽搐） */
  groundTrackStrength: number;
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
  rally?: { radius: number; factor: number; interval: number; duration: number };
  infectionSeconds?: number;
  egg?: { reach: number; distance: number; duration: number; height: number };
  fan?: { cells: number; duration: number; castAt: number; slideDuration: number };
}

export const DEFENDERS: DefenderDef[] = [
  {
    kind: 'defender',
    id: 'douxian_shooter',
    name: '豆馅射手',
    effect: '远程吐豆馅',
    cost: 100,
    // 射速 = 一轮攻击动画一发, 动画 7 帧 @4fps = 1.75s(原 5fps = 1.4s, 射速降到 80%),
    // 冷却与动画同长, 攻击节奏才连贯
    cooldown: 7.5,
    hp: 300,
    damage: 20,
    fireFrame: 4, // 新版攻击 7 帧: f4 是吐豆馅帧
    projectileSpeed: 420,
    spriteH: 100,
    flipX: false,
    describe: '向前吐豆馅，打击同行奶蛙。种在后排持续开火，前面留位置给糖包挡怪。',
  },
  {
    kind: 'defender',
    id: 'hemian_doubao',
    name: '和面豆包',
    effect: '生产小面团',
    cost: 50,
    cooldown: 7.5,
    hp: 300,
    damage: 0,
    fireFrame: 0,
    projectileSpeed: 0,
    spriteH: 96,
    flipX: false,
    describe: '隔一会儿揉好一团面团扔在身边，点一下就能收 25 面团。先攒钱，再开火。',
    producer: { first: [3, 12.5], interval: [23.5, 25] },
  },
  {
    kind: 'defender',
    id: 'buraowan_doubao',
    name: '不绕弯豆包',
    effect: '单体推着走',
    cost: 25,
    // 一次性低价单位: 冷却短一点, 频繁补位
    cooldown: 6,
    hp: 250,
    damage: 0,
    fireFrame: 0,
    projectileSpeed: 0,
    spriteH: 102,
    flipX: false,
    occupiesCell: false,
    mover: { speed: 36, reach: 60, knockback: 65 },
    describe: '一路向右走，不占格子。每次只推一只奶蛙，让它向后跳半格；不造成伤害，也不拦住其他怪。走到草坪右端离场。',
  },
  {
    kind: 'defender',
    id: 'tangbao_doubao',
    name: '糖包',
    effect: '挨打掉面团',
    cost: 75,
    cooldown: 12,
    hp: 1400,
    damage: 0,
    fireFrame: 2,
    projectileSpeed: 0,
    spriteH: 108,
    flipX: false,
    blocker: { dropEvery: 240, maxDrops: 3 },
    describe: '“这我真没听懂。”但盾举得很稳。扛住奶蛙，每损失240点血掉一团面团，最多三团；大笑感染仍需及时打断。',
  },
  {
    kind: 'defender',
    id: 'yizhen_doubao',
    name: '一针见血豆包',
    effect: '一针穿三蛙',
    cost: 150,
    cooldown: 9,
    hp: 300,
    damage: 32,
    fireFrame: 2,
    projectileSpeed: 600,
    spriteH: 106,
    flipX: false,
    pierce: 3,
    describe: '“我用最一针见血的话告诉你。”针形豆馅沿直线穿过三只奶蛙，越挤越划算。',
  },
  {
    kind: 'defender',
    id: 'zhaxin_doubao',
    name: '扎心豆包',
    effect: '三行扎心爆',
    cost: 125,
    cooldown: 22,
    hp: 300,
    damage: 260,
    fireFrame: 2,
    projectileSpeed: 0,
    spriteH: 106,
    flipX: false,
    blast: { fuse: 1.25, radius: 225, rows: 1 },
    describe: '“接下来这句话有点扎心。”种下后1.25秒爆开，伤害附近三行奶蛙，然后离场。',
  },
  {
    kind: 'defender',
    id: 'fudu_doubao',
    name: '复读豆包',
    effect: '邻居快一拍',
    cost: 100,
    cooldown: 12,
    hp: 320,
    damage: 0,
    fireFrame: 2,
    projectileSpeed: 0,
    spriteH: 106,
    flipX: false,
    boost: { radius: 150, factor: 1.35 },
    describe: '“好的，好的，好的。”身边一格内的射击和生产节奏加快35%，多个复读不会叠加。',
  },
  {
    kind: 'defender',
    id: 'moyu_doubao',
    name: '摸鱼豆包',
    effect: '三行慢半拍',
    cost: 100,
    cooldown: 10,
    hp: 300,
    damage: 8,
    fireFrame: 2,
    projectileSpeed: 0,
    spriteH: 102,
    flipX: false,
    slow: { range: 190, rows: 1, interval: 2, factor: 0.55, duration: 2.6 },
    describe: '“工作先放一放。”每两秒喷湿附近三行，造成少量伤害并减速，不挑奶蛙种类。',
  },
  {
    kind: 'defender',
    id: 'luanhui_doubao',
    name: '已读乱回豆包',
    effect: '回信打三行',
    cost: 200,
    cooldown: 12,
    hp: 300,
    damage: 20,
    fireFrame: 2,
    projectileSpeed: 420,
    spriteH: 105,
    flipX: false,
    lanes: 1,
    describe: '“收到，但我回哪儿了？”一次把豆馅回信送向本行和上下两行，守住相邻三条路。',
  },
  {
    kind: 'defender',
    id: 'kaimen_doubao',
    name: '开门见山豆包',
    effect: '近处一群退',
    cost: 175,
    cooldown: 12,
    hp: 650,
    damage: 65,
    fireFrame: 2,
    projectileSpeed: 0,
    spriteH: 110,
    flipX: false,
    slam: { range: 175, interval: 2.8, knockback: 32 },
    describe: '“我就开门见山了。”用小木门拍击前方一群奶蛙，造成伤害并让它们向后跳一小步。',
  },
];

export const ATTACKERS: Record<string, AttackerDef> = {
  shiranui_frog: {
    kind: 'attacker', id: 'shiranui_frog', name: '不知火蛙',
    hp: 200, speed: 38, speedJitter: 0, groundTrackStrength: 0,
    biteDamage: 30, biteInterval: 1, biteReach: 52,
    spriteH: 120, flipX: false, flipDeath: false, damageStages: [0.66, 0.33],
    fan: { cells: 3, duration: 0.8, castAt: 0.4, slideDuration: 0.42 },
  },
  hoola_frog: {
    kind: 'attacker',
    id: 'hoola_frog',
    name: '吼啦奶蛙',
    hp: 221,
    speed: 31,
    speedJitter: 0.1,
    groundTrackStrength: 0,
    biteDamage: 28,
    biteInterval: 1.1,
    biteReach: 55,
    spriteH: 116,
    flipX: false,
    flipDeath: false,
    damageStages: [0.66, 0.33],
    rally: { radius: 210, factor: 1.15, interval: 8, duration: 2.5 },
  },
  laugh_frog: {
    kind: 'attacker',
    id: 'laugh_frog',
    name: '大笑奶蛙',
    hp: 221, // 260 × 85%
    speed: 30,
    speedJitter: 0.12, // 每只个体 ±12% 速度 + 随机起步相位, 一群蛙不会同手同脚
    groundTrackStrength: 0.3, // 由 walk 动画的根位移轨道调制瞬时速度(见 slice-sprites 的 groundTrack)
    biteDamage: 0,
    infectionSeconds: 3,
    // 感染只由 infectionSeconds 驱动，不造成啃咬伤害。
    biteInterval: 1.0,
    biteReach: 82,
    spriteH: 112,
    flipX: true, // 素材整表朝右(与向左行进相反), 绘制时水平翻转
    flipDeath: false, // 死亡帧头同样朝右, 随 flipX 统一翻转即可
    damageStages: [0.66, 0.33],
  },
  ordinary_frog: {
    kind: 'attacker',
    id: 'ordinary_frog',
    name: '普通奶蛙',
    hp: 221 * 0.8,
    speed: 28,
    speedJitter: 0.12,
    groundTrackStrength: 0.3,
    biteDamage: 35,
    biteInterval: 1,
    biteReach: 52,
    spriteH: 110,
    flipX: true,
    flipDeath: false,
    damageStages: [0.66, 0.33],
  },
  nai_egg: {
    kind: 'attacker',
    id: 'nai_egg',
    name: '奶蛋',
    hp: 160,
    speed: 44,
    speedJitter: 0.1,
    groundTrackStrength: 0,
    biteDamage: 0,
    biteInterval: 1,
    biteReach: 0,
    spriteH: 108,
    flipX: true,
    flipDeath: false,
    damageStages: [0.66, 0.33],
    egg: { reach: 85, distance: 175, duration: 0.8, height: 145 },
  },
  naiji: {
    kind: 'attacker',
    id: 'naiji',
    name: '奶鸡',
    // 血量 = 大笑奶蛙的 1/3, 速度 = 2 倍: 快而脆, 靠数量与速度冲破防线
    hp: 73.95, // 87 × 85%
    speed: 60,
    speedJitter: 0.12,
    groundTrackStrength: 0.3,
    biteDamage: 30,
    biteInterval: 1.0,
    biteReach: 44,
    spriteH: 78,
    flipX: true, // 素材同样整表朝右
    flipDeath: false,
    // 没有断手形态(素材只有走/啄两行), 运行时按元数据缺失自动跳过 *_b 分支
    damageStages: [0.66, 0.33],
  },
};
