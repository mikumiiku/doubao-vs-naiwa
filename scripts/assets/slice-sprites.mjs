/**
 * slice-sprites.mjs — 把「设计稿式」sprite sheet 切成游戏可用的透明 PNG 序列帧。
 *
 * 用法: pnpm assets:slice
 *
 * 流程: 按下方校准矩形切格 → 边界 BFS flood-fill 抠背景 → 去灰边 → 手动擦除区
 *       → alpha 包围盒 trim(留 padding) → 按单位统一缩放(参考动画的中位高度 → 220px)
 *       → 输出 PNG + manifest.json
 *
 * 注意: 同一单位的所有帧使用同一缩放系数(以 refAnim 的站立帧为基准),
 *       否则逐帧归一化会导致角色大小跳动(闪烁)/ 躺地死亡帧被放大。
 */
import sharp from 'sharp';
import { rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

// ==================== 校准常量 ====================

const OUT_ROOT = 'public/assets/sprites';
const TARGET_H = 220; // 站立参考帧的输出高度(px)
const TRIM_PAD = 3; // trim 后四周留白(px)
const BG_MIN_CHANNEL = 125; // 背景判定: 最暗通道 > 此值(亮度下限)
const BG_MAX_SPREAD = 25; // 背景判定: 通道极差 < 此值(低饱和度)
const BG_ALPHA = 10; // 背景判定: alpha < 此值(奶蛙图自带透明区)
const DEFRINGE_PASSES = 3; // 去边次数: 与透明区相邻且仍像背景的像素继续抠掉
const FROG_FIXED = 'assets/characters/attackers/大笑奶蛙-动作修复.png';
const FROG_WALK = 'assets/characters/attackers/大笑奶蛙-流畅行走.png';
const FROG_WALK_BROKEN = 'assets/characters/attackers/大笑奶蛙-流畅断手行走.png';
function frogWalkCells() {
  const columns = [[0, 414], [414, 798], [798, 1133], [1133, 1536]];
  // 两张表的伸脚姿势在第 4/8 格，交换后形成左右交替的 contact/down/passing/up。
  return [0, 1, 2, 7, 4, 5, 6, 3].map((cell) => ({
    x: columns[cell % 4], row: cell < 4 ? [0, 512] : [512, 1024],
    normalizeHeight: 230, bodyMatte: true,
  }));
}
const FROG_DEATH_CELLS = [[20, 292], [292, 590], [590, 916], [916, 1216], [1216, 1530]].map((x) => ({ x, bodyMatte: true }));
// 补绘保持头部稳定，接触相位由脚步顺序定义，避免从近乎静止的头部推导噪声位移。
const FROG_WALK_MOTION = { ground: [1, 0, -1, 0, 1, 0, -1, 0], bob: [-0.7, 0, 0.7, 0, -0.7, 0, 0.7, 0] };

function gridCells(start, count, cellW = 320, cellH = 320, columns = 4, normalizeHeight) {
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    return { x: [(n % columns) * cellW, (n % columns + 1) * cellW],
      row: [Math.floor(n / columns) * cellH, (Math.floor(n / columns) + 1) * cellH],
      bodyMatte: true, normalizeHeight };
  });
}
function ordinaryFrogSheet() {
  const src = 'assets/characters/attackers/普通奶蛙.png';
  const unit = 'ordinary_frog';
  const rig = 'assets/characters/attackers/普通奶蛙-步态部件.png';
  return { src, unit, refAnim: 'walk', preKeyed: true, erase: [], anims: [
    { name: 'walk', fps: 8, stabilizeBody: true, groundTrack: true, motion: FROG_WALK_MOTION,
      row: [0, 320], cells: gridCells(0, 8, 320, 320, 4, 250) },
    { name: 'attack', fps: 4, stabilizeBody: true, row: [640, 960], cells: gridCells(8, 4) },
    { name: 'death', fps: 4, row: [960, 1280], cells: gridCells(12, 4) },
    ...['body', 'far', 'near'].map((part, i) => ({ name: `walk_${part}`, src: rig, fps: 1,
      row: [0, 881], cells: [{ x: [[0, 800], [800, 1260], [1260, 1763]][i], bodyMatte: true }] })),
  ] };
}

const campaignCatalog = JSON.parse(await readFile('assets/characters/catalog.json', 'utf8'));
function campaignSheet(unit) {
  const cellW = unit.width / 4, cellH = unit.height / unit.rows;
  const cells = (row) => Array.from({ length: 4 }, (_, col) => ({
    x: [Math.round(col * cellW), Math.round((col + 1) * cellW)],
    row: [Math.round(row * cellH), Math.round((row + 1) * cellH)],
    bodyMatte: true,
  }));
  if (unit.id === 'shiranui_frog') {
    return { src: unit.file, unit: unit.id, refAnim: 'walk', preKeyed: true, erase: [],
      alignRegion: [0.25, 0.4], anims: [
        { name: 'walk', fps: 8, row: [0, Math.round(cellH * 2)], cells: [...cells(0), ...cells(1)], stabilizeBody: true, alignFace: true },
        { name: 'fan', src: 'assets/characters/attackers/不知火蛙-挥扇.png', fps: 5, scaleMul: 0.6,
          row: [0, 724], cells: [[0, 475], [475, 1019], [1019, 1649], [1649, 2172]], stabilizeBody: true, alignFace: true },
        { name: 'attack', fps: 4, row: [Math.round(cellH * 3), Math.round(cellH * 4)], cells: cells(3), stabilizeBody: true, alignFace: true },
        { name: 'death', fps: 4, row: [Math.round(cellH * 4), unit.height], cells: cells(4) },
      ] };
  }
  const frog = unit.kind === 'attacker' || unit.file.includes('/attackers/');
  return { src: unit.file, unit: unit.id, refAnim: frog ? 'walk' : 'idle', preKeyed: true, erase: [],
    anims: [
      { name: frog ? 'walk' : 'idle', fps: 3, row: [0, Math.round(cellH)], cells: cells(0), stabilizeBody: true },
      { name: 'attack', fps: 2.5, row: [Math.round(cellH), Math.round(2 * cellH)], cells: cells(1), stabilizeBody: true },
      ...(frog ? [{ name: 'death', fps: 4, row: [Math.round(2 * cellH), unit.height], cells: cells(2) }] : []),
    ] };
}

// 每张 sheet 的分段裁剪矩形。row=[上,下) 为帧行竖直范围, cells=[左,右) 为行内每帧水平范围
// (边界取帧间空隙中点, 依据 scripts 下临时剖面/腐蚀分割脚本的实测)。
// 新 act 表为透明底, preKeyed 跳过 BFS 抠图与去边(避免把蛙肚/面粉云等亮部吃掉), 只做 alpha 阈值清理。
// refAnim: 站立参考动画, 其帧高中位数决定本单位的统一缩放系数。
// scaleMul: 该动画的额外放大系数(源图该行动作画小了的时候纠正), 锚点同比例换算。
const SHEETS = [
  ...campaignCatalog.map(campaignSheet),
  {
    src: 'assets/characters/defenders/豆馅射手.png',
    unit: 'douxian_shooter',
    refAnim: 'idle',
    preKeyed: true,
    anims: [
      // 待机 6 帧(r=4 腐蚀分割实测边界)
      { name: 'idle', fps: 4, row: [222, 530], cells: [[34, 262], [262, 495], [495, 723], [723, 956], [956, 1188], [1188, 1400]] },
      // 攻击 7 帧: f4 吐豆馅(开火帧)。攻击行角色画小了(高 0.78x/头 0.85x), scaleMul 1.2 纠正。
      // 射击节奏 = "一轮攻击动画一发", 所以降射速就是降帧率: 5fps → 4fps,
      // 一轮动画 7/4 = 1.75s (原 7/5 = 1.4s), 射速正好降到 80%。
      // f4 的吐沫喷射区(x878-1095, y768-858, 含上方飞出区)整块 erase(弹丸游戏程序化绘制);
      // 注意 f5 围巾会扬到 x1102+, 其 cell 从 1100 起, 勿把擦除框伸过去
      {
        name: 'attack', fps: 4, scaleMul: 1.2, row: [708, 949], cells: [
          [13, 186], [190, 355], [359, 525], [531, 695],
          { x: [701, 1095], erase: [[878, 768, 1095, 858]] },
          [1100, 1278],
          [1280, 1434],
        ],
      },
    ],
    erase: [],
  },
  {
    src: 'assets/characters/defenders/和面豆包.png',
    unit: 'hemian_doubao',
    refAnim: 'idle',
    preKeyed: true,
    anims: [
      // 待机(守着面袋) 6 帧
      { name: 'idle', fps: 4, row: [60, 412], cells: [[170, 425], [425, 718], [718, 1000], [1000, 1283], [1283, 1574], [1574, 1824]] },
      // 生产 8 帧: 舀面→扬面→面粉云成形; 帧间有面粉云相连, 边界取腐蚀分割实测
      { name: 'produce', fps: 5, row: [470, 795], cells: [[28, 232], [232, 459], [459, 723], [723, 993], [993, 1252], [1252, 1516], [1516, 1724], [1724, 1922]] },
    ],
    erase: [],
  },
  {
    src: 'assets/characters/defenders/不绕弯豆包.png',
    unit: 'buraowan_doubao',
    refAnim: 'walk',
    preKeyed: true,
    anims: [
      // 第一行=走动 6 帧(空隙实测)。角色没有待机行, 放置后直接以 walk 出场
      { name: 'walk', fps: 5, groundTrack: true, row: [49, 463], cells: [[28, 282], [308, 564], [579, 840], [852, 1113], [1129, 1391], [1414, 1672]] },
      // 第二行=推搡 6 帧: 帧间没有整段透明空隙(手部特效与邻帧几乎相连), 边界取身体色列剖面
      // (排除红黄特效色)的实测空隙: f0/f1 间有整透明带取中点, 其余取身体空隙中点
      { name: 'attack', fps: 5, row: [501, 941], cells: [[19, 267], [267, 557], [557, 820], [820, 1140], [1140, 1412], [1412, 1672]] },
    ],
    erase: [],
  },
  {
    src: 'assets/characters/attackers/大笑奶蛙.png',
    unit: 'laugh_frog',
    refAnim: 'walk',
    preKeyed: true,
    // 扑咬两行的手臂伸出体外很远, 锚点只用躯干中段(0.25 半宽)算, 免得被手臂拽偏
    alignRegion: [0.25, 0.4],
    anims: [
      // 八个真实姿势组成左右一步循环，每次换脚四帧、半秒；完整与断手步态同序。
      // 所有断手帧缺少朝向镜头的一侧前臂，另一只手保留；倒地末帧也不恢复。
      { name: 'walk', src: FROG_WALK, fps: 8, stabilizeBody: true, groundTrack: true, motion: FROG_WALK_MOTION, row: [0, 512], cells: frogWalkCells() },
      { name: 'laugh', src: 'assets/characters/attackers/大笑奶蛙-感染大笑.png', fps: 6, stabilizeBody: true, row: [0, 512], cells: gridCells(0, 6, 256, 512, 6, 230) },
      { name: 'walk_b', src: FROG_WALK_BROKEN, fps: 8, stabilizeBody: true, groundTrack: true, motion: FROG_WALK_MOTION, row: [0, 512], cells: frogWalkCells() },
      { name: 'laugh_b', src: 'assets/characters/attackers/大笑奶蛙-感染大笑.png', fps: 6, stabilizeBody: true, row: [512, 1024], cells: gridCells(6, 6, 256, 512, 6, 230) },
      { name: 'death', src: FROG_FIXED, fps: 4, row: [766, 1010], cells: FROG_DEATH_CELLS },
      { name: 'death_b', src: FROG_FIXED, fps: 4, row: [766, 1010], cells: FROG_DEATH_CELLS },
      { name: 'chew', src: 'assets/characters/attackers/大笑奶蛙-失败咀嚼.png', fps: 6, stabilizeBody: true, row: [0, 512], cells: Array.from({ length: 8 }, (_, i) => ({
        x: [[0, 397], [397, 769], [769, 1145], [1145, 1536]][i % 4], row: i < 4 ? [0, 512] : [512, 1024],
        normalizeHeight: 230, bodyMatte: true,
      })) },
    ],
    erase: [],
  },
  {
    src: 'assets/characters/attackers/奶鸡.png',
    unit: 'naiji',
    refAnim: 'walk',
    preKeyed: true,
    // 鸡没有断手/死亡行: 血量低也不换形态, 阵亡直接消失(运行时 hurtAttacker 判 death 元数据缺失)
    anims: [
      // 跳跃行走 8 帧并非等宽：以 alpha > 200 的八个角色主体之间的空隙校准。
      // 旧 209px 网格切掉首帧头部，并把它带入次帧；清除独立邻帧碎片后再 trim。
      { name: 'walk', fps: 5, groundTrack: true, row: [199, 440], cells: [
        { x: [0, 235], bodyMatte: true }, { x: [235, 429], bodyMatte: true },
        { x: [429, 626], bodyMatte: true }, { x: [626, 843], bodyMatte: true },
        { x: [843, 1046], bodyMatte: true }, { x: [1046, 1255], bodyMatte: true },
        { x: [1255, 1459], bodyMatte: true }, { x: [1459, 1672], bodyMatte: true },
      ] },
      // 第二行=啄击 6 帧(空隙实测)
      { name: 'attack', fps: 5, row: [580, 941], cells: [[43, 283], [307, 579], [598, 847], [871, 1150], [1162, 1404], [1413, 1672]] },
    ],
    erase: [],
  },
  ordinaryFrogSheet(),
  { src: 'assets/characters/attackers/奶蛋.png', unit: 'nai_egg', refAnim: 'walk', preKeyed: true, erase: [], anims: [
    // 走动只用完整蛋的原画，连续转角由实际位移计算。
    { name: 'walk', fps: 1, row: [0, 338], cells: [{ x: [0, 384], bodyMatte: true }] },
    { name: 'hatch', fps: 6, row: [338, 697], cells: [
      { x: [0, 384], row: [338, 682] }, { x: [384, 768], row: [338, 675] },
      { x: [768, 1152], row: [325, 697] }, { x: [1152, 1536], row: [338, 697] },
    ] },
    { name: 'death', fps: 6, row: [697, 1024], cells: [
      { x: [0, 384], row: [683, 1024] }, { x: [384, 768], row: [675, 1024] },
      { x: [768, 1152], row: [697, 1024] }, { x: [1152, 1536], row: [697, 1024] },
    ] },
  ] },

];

// ==================== 实现 ====================

const isBgPixel = (buf, i) => {
  if (buf[i + 3] < BG_ALPHA) return true;
  const r = buf[i], g = buf[i + 1], b = buf[i + 2];
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  return mn > BG_MIN_CHANNEL && mx - mn < BG_MAX_SPREAD;
};

/** 从边界 BFS, 把背景像素 alpha 置 0; 再做 DEFRINGE_PASSES 轮去边。 */
function keyOut(buf, w, h) {
  const n = w * h;
  const bg = new Uint8Array(n); // 被判为背景的像素
  const stack = [];
  const seed = (p) => {
    if (!bg[p] && isBgPixel(buf, p * 4)) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  // 去边: 与背景相邻、自身也仍像背景的像素(抗锯齿灰边)继续并入背景
  for (let pass = 0; pass < DEFRINGE_PASSES; pass++) {
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (bg[p] || !isBgPixel(buf, p * 4)) continue;
        if ((x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w])) {
          bg[p] = 1;
          changed++;
        }
      }
    }
    if (!changed) break;
  }
  for (let p = 0; p < n; p++) if (bg[p]) buf[p * 4 + 3] = 0;
}

/** 取一帧「上半身（头+躯干）」的水平质心与垂直质心，用于推算根位移; 取不到返回 null。 */
function upperCentroid(buf, w, h) {
  const yBot = Math.floor(h * 0.5);
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < yBot; y++) {
    for (let x = 0; x < w; x++) {
      if (buf[(y * w + x) * 4 + 3] > 40) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

/** 不知火蛙用绿眼注册头部，避免抬起的白扇和手臂牵动躯干锚点。 */
function frogFaceCentroid(buf, w, h) {
  let sx = 0, sy = 0, count = 0;
  for (let y = 0; y < h * 0.65; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    const [r, g, b, a] = buf.subarray(p, p + 4);
    if (a > 100 && g > r * 1.05 && g > b * 1.25) {
      sx += x; sy += y; count++;
    }
  }
  return count ? { x: sx / count, y: sy / count } : upperCentroid(buf, w, h);
}

/**
 * 把一组走姿帧的「根位移轨道」(ground track) 烘出来 —— 等价于 PvZ 动画里的 `_ground`。
 *
 * PvZ 的僵尸不是匀速平移：它读 `_ground` 轨道当帧的前进量来驱动横向速度，
 * 于是抬脚时身体前移少、脚落地后身体快速跟上，脚踩地不滑步、整体又不呆。
 * 这里用同样的思路：拿上半身质心的循环帧差当推进量，去均值(避免长期漂移)后归一化到 ±1。
 * 运行时会按 `avgSpeed * (1 + track[进度] * strength)` 取瞬时速度(strength 很小)。
 *
 * @param centroids 每帧的上半身质心(可为 null 的帧会被跳过)
 * @returns 长度 = 帧数的轨道, 或 null(信息不足)
 */
function groundTrack(centroids) {
  const n = centroids.length;
  if (n < 3 || centroids.some((v) => v === null)) return null;
  const raw = [];
  for (let i = 0; i < n; i++) raw.push(centroids[(i + 1) % n] - centroids[i]);
  // 3 点循环平滑: 4 帧素材的原始帧差噪声很大, 直接查表会抖
  const sm = raw.map((_, i) => (raw[(i - 1 + n) % n] + raw[i] * 2 + raw[(i + 1) % n]) / 4);
  const mean = sm.reduce((a, b) => a + b, 0) / n;
  const centered = sm.map((v) => v - mean);
  const scale = Math.max(...centered.map(Math.abs));
  if (!(scale > 0.5)) return null; // 几乎没有位移信息就不写轨道
  return centered.map((v) => Number((v / scale).toFixed(3)));
}

/**
 * 身体上下起伏轨道：和 groundTrack 同理，只是量的是"身体比平均位置高/低多少"。
 * 由素材自己决定起伏节奏，比拿正弦猜相位准（迈步抬身、落地压低）。
 * 归一化到 ±1，运行时乘一个像素幅度即可。
 */
function bobTrack(centroidsY) {
  const n = centroidsY.length;
  if (n < 3 || centroidsY.some((v) => v === null)) return null;
  const mean = centroidsY.reduce((a, b) => a + b, 0) / n;
  const centered = centroidsY.map((v) => -(v - mean)); // 质心 y 越小=越高, 取负让"正值=抬高"
  const scale = Math.max(...centered.map(Math.abs));
  if (!(scale > 0.5)) return null;
  return centered.map((v) => Number((v / scale).toFixed(3)));
}

/** alpha 包围盒(阈值 10), 返回 [x0,y0,x1,y1) 或 null。 */
function alphaBBox(buf, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (buf[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x >= x1) x1 = x + 1;
        if (y < y0) y0 = y;
        if (y >= y1) y1 = y + 1;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** Keep the opaque body, plus two pixels of its original antialiased edge.
 * Low-alpha glow can connect adjacent chickens, so connectivity alone is insufficient. */
function isolateBody(buf, w, h) {
  const body = Buffer.from(buf);
  for (let p = 0; p < w * h; p++) if (body[p * 4 + 3] <= 200) body[p * 4 + 3] = 0;
  keepLargestComp(body, w, h, 200);
  let mask = new Uint8Array(w * h);
  for (let p = 0; p < mask.length; p++) mask[p] = body[p * 4 + 3] > 200 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const expanded = mask.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      if (x > 0) expanded[p - 1] = 1;
      if (x + 1 < w) expanded[p + 1] = 1;
      if (y > 0) expanded[p - w] = 1;
      if (y + 1 < h) expanded[p + w] = 1;
    }
    mask = expanded;
  }
  for (let p = 0; p < mask.length; p++) if (!mask[p]) buf[p * 4 + 3] = 0;
}

/** alpha 掩码 + 质心 */
function alphaMask(buf, w, h) {
  const mask = new Uint8Array(w * h);
  let count = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (buf[(y * w + x) * 4 + 3] > 10) {
        mask[y * w + x] = 1;
        count++;
        sx += x;
        sy += y;
      }
    }
  }
  return { mask, count, cx: count ? sx / count : 0, cy: count ? sy / count : 0 };
}

/** 去除与主体分离的微小碎片(lanczos 重采样晕影/抠图残渣)，只保留最大连通域
 *  及与它贴近(切比雪夫距离 < 6px)或面积 ≥ 40 的部件(汗珠/星星等独立小物件)。 */
function despeckle(buf, w, h) {
  const { mask } = alphaMask(buf, w, h);
  const seen = new Uint8Array(w * h);
  const comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const p = st.pop();
      const x = p % w, y = (p / w) | 0;
      n++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        const qx = q % w, qy = (q / w) | 0;
        if (Math.abs(qx - x) + Math.abs(qy - y) !== 1) continue;
        if (mask[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    comps.push({ n, minx, miny, maxx, maxy });
  }
  if (comps.length === 0) return;
  comps.sort((a, b) => b.n - a.n);
  const main = comps[0];
  const kill = new Set();
  for (const c of comps.slice(1)) {
    const gap = Math.max(c.minx - main.maxx - 1, main.minx - c.maxx - 1, c.miny - main.maxy - 1, main.miny - c.maxy - 1, 0);
    if (c.n < 40 && gap >= 6) kill.add(c);
  }
  if (!kill.size) return;
  // 重新标记要清除的部件像素
  seen.fill(0);
  const killArr = [...kill];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0;
    const pixels = [];
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const p = st.pop();
      pixels.push(p);
      const x = p % w, y = (p / w) | 0;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        const qx = q % w, qy = (q / w) | 0;
        if (Math.abs(qx - x) + Math.abs(qy - y) !== 1) continue;
        if (mask[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    for (const c of killArr) {
      if (c.n === pixels.length) {
        // 以 bbox 二次确认(同面积的不同部件极少)
        let minx = w, maxx = 0, miny = h, maxy = 0;
        for (const p of pixels) { const x = p % w, y = (p / w) | 0; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
        if (minx === c.minx && maxx === c.maxx && miny === c.miny && maxy === c.maxy) {
          for (const p of pixels) buf[p * 4 + 3] = 0;
        }
      }
    }
  }
}

/** 只保留最大 4 连通域, 其余全部置透明。
 *  用于抠图后与主体断开、间隔过大无法焊回的大块残影(如奶蛙死亡 d0 的悬浮小腿)。 */
function keepLargestComp(buf, w, h, threshold = 10) {
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = buf[p * 4 + 3] > threshold ? 1 : 0;
  const seen = new Uint8Array(w * h);
  let best = null, bestN = 0;
  const compOf = new Int32Array(w * h).fill(-1);
  const comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const id = comps.length;
    let n = 0;
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const p = st.pop();
      compOf[p] = id;
      n++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        const qx = q % w, qy = (q / w) | 0;
        if (Math.abs(qx - x) + Math.abs(qy - y) !== 1) continue;
        if (mask[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    comps.push(n);
    if (n > bestN) { bestN = n; best = id; }
  }
  for (let p = 0; p < w * h; p++) {
    if (mask[p] && compOf[p] !== best) buf[p * 4 + 3] = 0;
  }
}

/** 把 src 平移到 ref 上: 质心定初值, ±14px 整数搜索最大化 alpha IoU, 返回 {dx,dy}
 *  region 可把评分限制在帧的水平中段: 手臂/道具伸出体外的动画(奶蛙扑咬)若整幅参与评分,
 *  伸出的手臂会把锚点拽偏, 只取躯干中段更稳。 */
function bestAlign(refBuf, rw, rh, srcBuf, sw, sh, region = null) {
  const A = alphaMask(srcBuf, sw, sh); // 被对齐帧
  const B = alphaMask(refBuf, rw, rh); // 参考帧
  const cdx = Math.round(B.cx - A.cx), cdy = Math.round(B.cy - A.cy);
  let rx0 = 0, rx1 = Math.max(sw, rw);
  if (region) {
    // 以被对齐帧质心为中心开窗, 半宽 = 帧质量质心到两侧的距离 × (region 上界 + 0.5)
    const c = A.cx;
    const hw = Math.max(8, Math.round(Math.max(A.cx, sw - A.cx) * (region[1] + 0.5)));
    rx0 = Math.max(0, Math.round(c - hw));
    rx1 = Math.round(c + hw);
  }
  let best = { score: -1, dx: 0, dy: 0 };
  for (let dy = cdy - 14; dy <= cdy + 14; dy++) {
    for (let dx = cdx - 14; dx <= cdx + 14; dx++) {
      const x0 = Math.max(0, dx, rx0), x1 = Math.min(sw, rw + dx, rx1);
      const y0 = Math.max(0, dy), y1 = Math.min(sh, rh + dy);
      let inter = 0;
      for (let y = y0; y < y1; y++) {
        const aRow = y * sw, bRow = (y - dy) * rw;
        for (let x = x0; x < x1; x++) {
          if (A.mask[aRow + x] && B.mask[bRow + (x - dx)]) inter++;
        }
      }
      const union = A.count + B.count - inter;
      const score = union > 0 ? inter / union : 0;
      if (score > best.score) best = { score, dx, dy };
    }
  }
  return best;
}

/** 单位(px)化中位数: 取整数组的中位值 */
function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

async function main() {
  await rm(OUT_ROOT, { recursive: true, force: true });
  const manifest = { refHeight: TARGET_H, units: {} };

  for (const sheet of SHEETS) {
    const { data, info } = await sharp(sheet.src)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    manifest.units[sheet.unit] = {};

    // 第一遍: 抠图 + 擦除 + trim, 全部帧暂存内存
    /** @type {{ anim: string, index: number, buf: Buffer, tw: number, th: number }[]} */
    const frames = [];
    for (const anim of sheet.anims) {
      const animSource = anim.src
        ? await sharp(anim.src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        : { data, info };
      manifest.units[sheet.unit][anim.name] = { frames: anim.cells.length, fps: anim.fps };

      for (let i = 0; i < anim.cells.length; i++) {
        const cell = Array.isArray(anim.cells[i]) ? { x: anim.cells[i] } : anim.cells[i];
        const source = cell.src
          ? await sharp(cell.src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
          : animSource;
        const [ry0, ry1] = cell.row ?? anim.row;
        const [cx0, cx1] = cell.x;
        if (cx0 < 0 || ry0 < 0 || cx1 > source.info.width || ry1 > source.info.height) {
          throw new Error(`${sheet.unit}/${anim.name}/${i} 裁剪矩形超出源图`);
        }
        let w = cx1 - cx0, h = ry1 - ry0;
        // 拷贝 cell 像素
        let buf = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) {
          source.data.copy(buf, y * w * 4, ((ry0 + y) * source.info.width + cx0) * 4, ((ry0 + y) * source.info.width + cx1) * 4);
        }
        if (sheet.preKeyed) {
          // 透明底素材: 不做 BFS/去边(会把蛙肚、面粉云这类亮部边缘吃掉), 只清理半透明噪点
          for (let p = 0; p < w * h; p++) if (buf[p * 4 + 3] < 10) buf[p * 4 + 3] = 0;
        } else {
          keyOut(buf, w, h);
        }
        // 丢弃与主体断开的大块残影(须在 erase 前, 顺序不影响 erase)
        if (cell.keepLargest) keepLargestComp(buf, w, h);
        if (cell.bodyMatte) isolateBody(buf, w, h);
        // 手动擦除区(原图坐标 → cell 坐标): sheet 级 + cell 级。
        // 五元组带 'red' 时只擦红色像素(吐沫/豆丸), 不伤同为深色的头发衣服。
        for (const [ex0, ey0, ex1, ey1, mode] of [...sheet.erase, ...(cell.erase ?? [])]) {
          const x0 = Math.max(ex0 - cx0, 0), y0 = Math.max(ey0 - ry0, 0);
          const x1 = Math.min(ex1 - cx0, w), y1 = Math.min(ey1 - ry0, h);
          if (mode === 'red') {
            for (let y = y0; y < y1; y++)
              for (let x = x0; x < x1; x++) {
                const p = (y * w + x) * 4;
                const r = buf[p], g = buf[p + 1], b = buf[p + 2];
                if (buf[p + 3] > 0 && r > 110 && r - g > 35 && r - b > 35) buf[p + 3] = 0;
              }
            continue;
          }
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) buf[(y * w + x) * 4 + 3] = 0;
        }
        // 补绘表分辨率更高，先按同一站立比例归一化再参与注册。
        if (cell.normalizeHeight) {
          const bb = alphaBBox(buf, w, h);
          if (!bb) throw new Error(`${sheet.unit}/${anim.name}/${i} 是空帧`);
          const ratio = cell.normalizeHeight / (bb[3] - bb[1]);
          const resized = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
            .resize(Math.round(w * ratio), Math.round(h * ratio))
            .raw().toBuffer({ resolveWithObject: true });
          buf = resized.data;
          w = resized.info.width;
          h = resized.info.height;
        }
        // trim + padding
        const bb = alphaBBox(buf, w, h);
        if (!bb) throw new Error(`${sheet.unit}/${anim.name}/${i} 抠完后是空帧, 检查裁剪矩形`);
        const [bx0, by0, bx1, by1] = [
          Math.max(bb[0] - TRIM_PAD, 0),
          Math.max(bb[1] - TRIM_PAD, 0),
          Math.min(bb[2] + TRIM_PAD, w),
          Math.min(bb[3] + TRIM_PAD, h),
        ];
        const tw = bx1 - bx0, th = by1 - by0;
        const trimmed = Buffer.alloc(tw * th * 4);
        for (let y = 0; y < th; y++) {
          buf.copy(trimmed, y * tw * 4, ((by0 + y) * w + bx0) * 4, ((by0 + y) * w + bx1) * 4);
        }
        frames.push({ anim: anim.name, index: i, buf: trimmed, tw, th, by0, contentBottom: bb[3] - by0,
          upperCx: anim.alignFace ? frogFaceCentroid(trimmed, tw, th) : upperCentroid(trimmed, tw, th) });
      }

      // 收脚时剪影变窄，逐帧 trim 的图心会偏移；用上半身注册到共同画布，避免躯干横跳。
      if (anim.stabilizeBody) {
        const mine = frames.filter((f) => f.anim === anim.name);
        const cx = Math.ceil(Math.max(...mine.map((f) => f.upperCx.x))) + TRIM_PAD;
        const cy = Math.ceil(Math.max(...mine.map((f) => f.upperCx.y))) + TRIM_PAD;
        const width = cx + Math.ceil(Math.max(...mine.map((f) => f.tw - f.upperCx.x))) + TRIM_PAD;
        const height = cy + Math.ceil(Math.max(...mine.map((f) => f.th - f.upperCx.y))) + TRIM_PAD;
        for (const f of mine) {
          f.referenceHeight = f.th;
          const dx = Math.round(cx - f.upperCx.x);
          const dy = Math.round(cy - f.upperCx.y);
          const registered = Buffer.alloc(width * height * 4);
          for (let y = 0; y < f.th; y++) {
            f.buf.copy(registered, ((y + dy) * width + dx) * 4, y * f.tw * 4, (y + 1) * f.tw * 4);
          }
          f.buf = registered;
          f.tw = width;
          f.th = height;
          f.contentBottom += dy;
          f.upperCx = { x: cx, y: cy };
        }
      }
      // 走姿类动画额外烘「根位移轨道」+「身体起伏轨道」(见函数注释), 运行时用来驱动横向速度与上下起伏
      if (anim.groundTrack) {
        const mine = frames.filter((f) => f.anim === anim.name);
        const tr = anim.motion?.ground ?? groundTrack(mine.map((f) => (f.upperCx ? f.upperCx.x : null)));
        const bob = anim.motion?.bob ?? bobTrack(mine.map((f) => (f.upperCx ? f.upperCx.y : null)));
        if (tr) {
          manifest.units[sheet.unit][anim.name].groundTrack = tr;
          console.log(`${sheet.unit}/${anim.name} 根位移轨道: [${tr.join(', ')}]`);
        } else {
          console.warn(`!! ${sheet.unit}/${anim.name} 标了 groundTrack 但算不出有效位移, 已跳过`);
        }
        if (bob) {
          manifest.units[sheet.unit][anim.name].bobTrack = bob;
          console.log(`${sheet.unit}/${anim.name} 起伏轨道: [${bob.join(', ')}]`);
        }
      }
    }

    // 单位统一缩放系数: 站立参考动画的帧高中位数 → TARGET_H
    const refHeights = frames
      .filter((f) => f.anim === sheet.refAnim)
      .map((f) => f.referenceHeight ?? f.th)
      .sort((a, b) => a - b);
    if (refHeights.length === 0) throw new Error(`${sheet.unit} 缺少 refAnim=${sheet.refAnim}`);
    const refH = refHeights[Math.floor(refHeights.length / 2)];
    const scale = TARGET_H / refH;
    console.log(`${sheet.unit}: 参考帧高 ${refH}px, 统一缩放 ${scale.toFixed(3)}x`);

    // 卡牌头像: 字符串 = 独立文件(透明边距 trim 后缩到 300 宽); 数组 = 从本 sheet 裁剪
    if (typeof sheet.card === 'string') {
      const { data: cbuf, info: cinfo } = await sharp(sheet.card).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const bb = alphaBBox(cbuf, cinfo.width, cinfo.height);
      if (!bb) throw new Error(`${sheet.unit} card 抠完后是空图`);
      const [bx0, by0, bx1, by1] = [Math.max(bb[0] - TRIM_PAD, 0), Math.max(bb[1] - TRIM_PAD, 0), Math.min(bb[2] + TRIM_PAD, cinfo.width), Math.min(bb[3] + TRIM_PAD, cinfo.height)];
      await mkdir(path.join(OUT_ROOT, sheet.unit), { recursive: true });
      await sharp(cbuf, { raw: { width: cinfo.width, height: cinfo.height, channels: 4 } })
        .extract({ left: bx0, top: by0, width: bx1 - bx0, height: by1 - by0 })
        .resize(300, null, { kernel: 'lanczos3' })
        .png()
        .toFile(path.join(OUT_ROOT, sheet.unit, 'card.png'));
      console.log(`${sheet.unit}/card.png ✓ (独立文件 ${path.basename(sheet.card)})`);
    } else if (Array.isArray(sheet.card)) {
      const [cx0, cy0, cx1, cy1] = sheet.card;
      await mkdir(path.join(OUT_ROOT, sheet.unit), { recursive: true });
      await sharp(data, { raw: { width: W, height: H, channels: 4 } })
        .extract({ left: cx0, top: cy0, width: cx1 - cx0, height: cy1 - cy0 })
        .resize(300, null, { kernel: 'lanczos3' })
        .png()
        .toFile(path.join(OUT_ROOT, sheet.unit, 'card.png'));
      console.log(`${sheet.unit}/card.png ✓`);
    }

    // 各动画的额外缩放系数(scaleMul, 默认 1): 源图某动画整体画得偏大/偏小时
    // 单独纠正, 锚点换算到放大后的输出坐标系
    const mulOf = Object.fromEntries(sheet.anims.map((a) => [a.name, a.scaleMul ?? 1]));

    // 第二遍: 统一缩放输出(乘 scaleMul) + 去碎片(重采样会零星制造与主体不相连的微小晕影块)
    // 同时在"输出像素"里量出每帧内容底边距图底的距离, 供锚点注册使用。
    const framesOut = [];
    for (const f of frames) {
      const dir = path.join(OUT_ROOT, sheet.unit, f.anim);
      await mkdir(dir, { recursive: true });
      const fs = scale * mulOf[f.anim];
      const rw = Math.max(1, Math.round(f.tw * fs));
      const rh = Math.max(1, Math.round(f.th * fs));
      const { data: rbuf, info: rinfo } = await sharp(f.buf, { raw: { width: f.tw, height: f.th, channels: 4 } })
        .resize(rw, rh, { kernel: 'lanczos3' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      despeckle(rbuf, rinfo.width, rinfo.height);
      // 去碎片之后再量: 内容底边离图底多少输出像素
      let bottomGap = 0;
      outer: for (let y = rinfo.height - 1; y >= 0; y--) {
        for (let x = 0; x < rinfo.width; x++) {
          if (rbuf[(y * rinfo.width + x) * 4 + 3] > 10) {
            bottomGap = rinfo.height - 1 - y;
            break outer;
          }
        }
      }
      framesOut.push({ anim: f.anim, index: f.index, bottomGap });
      await sharp(rbuf, { raw: { width: rinfo.width, height: rinfo.height, channels: 4 } })
        .png()
        .toFile(path.join(dir, `${f.index}.png`));
      console.log(`${sheet.unit}/${f.anim}/${f.index} ✓ (${f.tw}x${f.th} -> ${rw}x${rh})`);
    }

    // 锚点注册: 把每个动画的「脚底」对齐到参考动画的脚底, 消除
    // 「上一状态尾帧 → 下一状态首帧」的主体跳动 / 状态切换时凭空浮起下沉。
    // 关键: 锚点是「输出像素」量 —— drawFrame 绘制时会再乘 h/refHeight;
    //       而每帧都是各自 trim 出来的, 各动画行在设计稿上的行距跟"角色该站哪"无关,
    //       绝不能把行与行的纸面距离算进偏移(否则整个动作会飞出所在行, 曾经写错过一次)。
    //   x: 整幅 alpha IoU 最优平移(alignRegion 可限制在躯干中段, 免得伸出的手臂把锚点拽偏)
    //   y: 比较各动画输出帧「内容底边距图底」的中位值 —— 该值越大说明脚在图上越高,
    //      该动画就要整体下移同样的量, 才能跟参考动画踩在同一条脚底线上。
    // 死亡动画也注册(倒向/躺姿与站立位姿差异大, 注册对齐的是"倒下起点"位置);
    // 死亡帧若被 flipDeath 水平翻转绘制, x 偏移由 drawFrame 取反。
    const ref = frames.find((f) => f.anim === sheet.refAnim && f.index === 0);
    const gapsOf = {};
    for (const f of framesOut) (gapsOf[f.anim] ??= []).push(f.bottomGap);
    const refGap = median(gapsOf[sheet.refAnim]);
    const baselineOffset = sheet.anims.find((a) => a.name === sheet.refAnim)?.stabilizeBody ? refGap - 2 : 0;
    const anchors = {};
    for (const anim of sheet.anims) {
      const f0 = frames.find((f) => f.anim === anim.name && f.index === 0);
      if (anim.alignFace) {
        const refX = (ref.upperCx.x - ref.tw / 2) * scale;
        const frameX = (f0.upperCx.x - f0.tw / 2) * scale * mulOf[anim.name];
        anchors[anim.name] = [Math.round((refX - frameX) * 10) / 10, median(gapsOf[anim.name]) - refGap + baselineOffset];
        continue;
      }
      const { dx } = bestAlign(ref.buf, ref.tw, ref.th, f0.buf, f0.tw, f0.th, sheet.alignRegion);
      const s = scale * mulOf[anim.name];
      const dy = (median(gapsOf[anim.name]) - refGap) * scale;
      anchors[anim.name] = [Math.round(dx * s * 10) / 10, Math.round((dy + baselineOffset) * 10) / 10];
    }
    for (const anim of sheet.anims) {
      manifest.units[sheet.unit][anim.name].anchor = anchors[anim.name] ?? [0, 0];
    }
    console.log(`${sheet.unit} 锚点:`, JSON.stringify(anchors), `内容底边留白:`, JSON.stringify(gapsOf));
  }

  await writeFile(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest.json ✓`);
}

await main();
