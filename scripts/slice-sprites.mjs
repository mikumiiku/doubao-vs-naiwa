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
import { rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ==================== 校准常量 ====================

const OUT_ROOT = 'public/assets/sprites';
const TARGET_H = 220; // 站立参考帧的输出高度(px)
const TRIM_PAD = 3; // trim 后四周留白(px)
const BG_MIN_CHANNEL = 125; // 背景判定: 最暗通道 > 此值(亮度下限)
const BG_MAX_SPREAD = 25; // 背景判定: 通道极差 < 此值(低饱和度)
const BG_ALPHA = 10; // 背景判定: alpha < 此值(奶蛙图自带透明区)
const DEFRINGE_PASSES = 3; // 去边次数: 与透明区相邻且仍像背景的像素继续抠掉

// 每张 sheet 的分段裁剪矩形。row=[上,下) 为帧行竖直范围, cells=[左,右) 为行内每帧水平范围
// (边界取帧间空隙中点, 依据 scripts 下临时剖面/腐蚀分割脚本的实测)。
// 新 act 表为透明底, preKeyed 跳过 BFS 抠图与去边(避免把蛙肚/面粉云等亮部吃掉), 只做 alpha 阈值清理。
// refAnim: 站立参考动画, 其帧高中位数决定本单位的统一缩放系数。
// scaleMul: 该动画的额外放大系数(源图该行动作画小了的时候纠正), 锚点同比例换算。
const SHEETS = [
  {
    src: 'assets/act/doubao/豆馅射手.png',
    unit: 'douxian_shooter',
    refAnim: 'idle',
    preKeyed: true,
    anims: [
      // 待机 6 帧(r=4 腐蚀分割实测边界)
      { name: 'idle', fps: 4, row: [210, 535], cells: [[34, 262], [262, 495], [495, 723], [723, 956], [956, 1188], [1188, 1400]] },
      // 攻击 7 帧: f4 吐豆馅(开火帧)。攻击行角色画小了(高 0.78x/头 0.85x), scaleMul 1.2 纠正。
      // f4 的吐沫喷射区(x878-1095, y768-858, 含上方飞出区)整块 erase(弹丸游戏程序化绘制);
      // 注意 f5 围巾会扬到 x1102+, 其 cell 从 1100 起, 勿把擦除框伸过去
      {
        name: 'attack', fps: 5, scaleMul: 1.2, row: [705, 950], cells: [
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
    src: 'assets/act/doubao/和面豆包.png',
    unit: 'hemian_doubao',
    refAnim: 'idle',
    preKeyed: true,
    anims: [
      // 待机(守着面袋) 6 帧
      { name: 'idle', fps: 4, row: [60, 412], cells: [[170, 425], [425, 718], [718, 1000], [1000, 1283], [1283, 1574], [1574, 1824]] },
      // 生产 8 帧: 舀面→扬面→面粉云成形; 帧间有面粉云相连, 边界取腐蚀分割实测
      { name: 'produce', fps: 5, row: [466, 796], cells: [[28, 232], [232, 459], [459, 723], [723, 993], [993, 1252], [1252, 1516], [1516, 1724], [1724, 1922]] },
    ],
    erase: [],
  },
  {
    src: 'assets/act/naiwa/大笑奶蛙.png',
    unit: 'laugh_frog',
    refAnim: 'walk',
    preKeyed: true,
    anims: [
      // 每行一个阶段: 走(6) / 吃·双手抓拉(5) / 待机(6) / 扑·单臂冲拳(5, 备用) / 死亡(5)
      // 死亡为朝左前方(行进方向)趴倒, 素材方向正确, flipDeath=false
      // 走帧原顺序播放步态相位反向(视觉倒着走), 帧序整体倒排纠正
      { name: 'walk', fps: 5, row: [8, 232], cells: [[1195, 1394], [951, 1195], [706, 951], [492, 706], [255, 492], [55, 255]] },
      { name: 'attack', fps: 5, row: [240, 448], cells: [[76, 300], [300, 572], [572, 853], [853, 1134], [1134, 1354]] },
      { name: 'idle', fps: 4, row: [456, 672], cells: [[57, 262], [262, 500], [500, 734], [734, 956], [956, 1203], [1203, 1408]] },
      { name: 'push', fps: 5, row: [680, 876], cells: [[76, 315], [315, 594], [594, 883], [883, 1156], [1156, 1372]] },
      { name: 'death', fps: 4, row: [882, 1076], cells: [[57, 308], [308, 594], [594, 882], [882, 1159], [1159, 1439]] },
    ],
    erase: [],
  },
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
function keepLargestComp(buf, w, h) {
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = buf[p * 4 + 3] > 10 ? 1 : 0;
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

/** 把 src 平移到 ref 上: 质心定初值, ±14px 整数搜索最大化 alpha IoU, 返回 {dx,dy} */
function bestAlign(refBuf, rw, rh, srcBuf, sw, sh) {
  const A = alphaMask(srcBuf, sw, sh); // 被对齐帧
  const B = alphaMask(refBuf, rw, rh); // 参考帧
  const cdx = Math.round(B.cx - A.cx), cdy = Math.round(B.cy - A.cy);
  let best = { score: -1, dx: 0, dy: 0 };
  for (let dy = cdy - 14; dy <= cdy + 14; dy++) {
    for (let dx = cdx - 14; dx <= cdx + 14; dx++) {
      const x0 = Math.max(0, dx), x1 = Math.min(sw, rw + dx);
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
      const [ry0, ry1] = anim.row;
      manifest.units[sheet.unit][anim.name] = { frames: anim.cells.length, fps: anim.fps };

      for (let i = 0; i < anim.cells.length; i++) {
        const cell = Array.isArray(anim.cells[i]) ? { x: anim.cells[i] } : anim.cells[i];
        const [cx0, cx1] = cell.x;
        const w = cx1 - cx0, h = ry1 - ry0;
        // 拷贝 cell 像素
        const buf = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) {
          data.copy(buf, y * w * 4, ((ry0 + y) * W + cx0) * 4, ((ry0 + y) * W + cx1) * 4);
        }
        if (sheet.preKeyed) {
          // 透明底素材: 不做 BFS/去边(会把蛙肚、面粉云这类亮部边缘吃掉), 只清理半透明噪点
          for (let p = 0; p < w * h; p++) if (buf[p * 4 + 3] < 10) buf[p * 4 + 3] = 0;
        } else {
          keyOut(buf, w, h);
        }
        // 丢弃与主体断开的大块残影(须在 erase 前, 顺序不影响 erase)
        if (cell.keepLargest) keepLargestComp(buf, w, h);
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
        frames.push({ anim: anim.name, index: i, buf: trimmed, tw, th });
      }
    }

    // 单位统一缩放系数: 站立参考动画的帧高中位数 → TARGET_H
    const refHeights = frames
      .filter((f) => f.anim === sheet.refAnim)
      .map((f) => f.th)
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

    // 锚点注册: 每个动画的首帧平移对齐到 refAnim 首帧, 消除
    // 「上一状态尾帧 → 下一状态首帧」的主体跳动。帧各自 trim 后包围盒不同,
    // 逐帧底中锚定只在同动画内一致, 跨动画要靠注册偏移统一坐标系。
    // 死亡动画也注册(倒向/躺姿与站立位姿差异大, 注册对齐的是"倒下起点"位置);
    // 死亡帧若被 flipDeath 水平翻转绘制, x 偏移由 drawFrame 取反。
    const ref = frames.find((f) => f.anim === sheet.refAnim && f.index === 0);
    const anchors = {};
    for (const anim of sheet.anims) {
      const f0 = frames.find((f) => f.anim === anim.name && f.index === 0);
      const { dx, dy } = bestAlign(ref.buf, ref.tw, ref.th, f0.buf, f0.tw, f0.th);
      const s = scale * mulOf[anim.name];
      anchors[anim.name] = [Math.round(dx * s * 10) / 10, Math.round(dy * s * 10) / 10];
    }
    for (const anim of sheet.anims) {
      manifest.units[sheet.unit][anim.name].anchor = anchors[anim.name] ?? [0, 0];
    }
    console.log(`${sheet.unit} 锚点:`, JSON.stringify(anchors));

    // 第二遍: 统一缩放输出(乘 scaleMul) + 去碎片(重采样会零星制造与主体不相连的微小晕影块)
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
      await sharp(rbuf, { raw: { width: rinfo.width, height: rinfo.height, channels: 4 } })
        .png()
        .toFile(path.join(dir, `${f.index}.png`));
      console.log(`${sheet.unit}/${f.anim}/${f.index} ✓ (${f.tw}x${f.th} -> ${rw}x${rh})`);
    }
  }

  await writeFile(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest.json ✓`);
}

await main();
