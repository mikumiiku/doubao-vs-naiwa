// 校准工具：从战场背景图检测作战区网格边界与等待区出生圆心
// 用法：node scripts/measure-grid.mjs
import sharp from 'sharp';

const SRC = 'assets/battle_field/白天战场.png';

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const px = (x, y) => {
  const i = (y * W + x) * C;
  return [data[i], data[i + 1], data[i + 2]];
};

// 绿色得分：草地高、泥土/石头低
const greenScore = (x, y) => {
  const [r, g, b] = px(x, y);
  return g - (r + b) / 2;
};

function profile(axis, from, to, fixedFrom, fixedTo) {
  const out = [];
  for (let v = from; v <= to; v++) {
    let sum = 0;
    for (let f = fixedFrom; f <= fixedTo; f += 3) {
      sum += axis === 'x' ? greenScore(v, f) : greenScore(f, v);
    }
    out.push(sum / ((fixedTo - fixedFrom) / 3 + 1));
  }
  return out;
}

// 打印压缩后的剖面：每 bucket 取均值，方便肉眼看台阶
function printProfile(name, prof, from, step) {
  const bucket = 8;
  let line = '';
  const marks = [];
  for (let i = 0; i < prof.length; i += bucket) {
    const chunk = prof.slice(i, i + bucket);
    const m = chunk.reduce((a, b) => a + b, 0) / chunk.length;
    line += `${from + i}:${m.toFixed(0)}  `;
    marks.push({ pos: from + i, v: m });
    if (line.length > 100) {
      console.log(line);
      line = '';
    }
  }
  if (line) console.log(line);
  // 自动找「高台」连续段（草格内部 vs 缝隙）
  const vals = marks.map((m) => m.v);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const thr = lo + (hi - lo) * 0.45;
  const segs = [];
  let start = null;
  for (const m of marks) {
    if (m.v >= thr && start === null) start = m.pos;
    if (m.v < thr && start !== null) {
      segs.push([start, m.pos]);
      start = null;
    }
  }
  if (start !== null) segs.push([start, marks[marks.length - 1].pos + bucket]);
  console.log(
    `${name} 高得分段 (thr=${thr.toFixed(1)}):`,
    segs.map(([a, b]) => `${a}-${b}(${b - a})`).join(' '),
  );
}

console.log('== X 剖面（y 420-720 平均，找 9 列） ==');
printProfile('X', profile('x', 250, 1500, 420, 720), 250, 1);
console.log('== Y 剖面（x 500-1250 平均，找 5 行） ==');
printProfile('Y', profile('y', 150, 900, 500, 1250), 150, 1);

// 等待区圆心：在 x 1450-1580 竖带上找「石灰色」像素的 y 聚类（圆环上下沿）
console.log('== 等待区圆环 ==');
const isStone = (x, y) => {
  const [r, g, b] = px(x, y);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx - mn < 35 && mx > 110 && mx < 210; // 低饱和中亮度
};
const rowHasStone = [];
for (let y = 100; y <= 900; y++) {
  let cnt = 0;
  for (let x = 1430; x <= 1600; x += 2) if (isStone(x, y)) cnt++;
  rowHasStone.push([y, cnt]);
}
// 聚类成段
const segs = [];
let start = null;
for (const [y, cnt] of rowHasStone) {
  if (cnt >= 6 && start === null) start = y;
  if (cnt < 6 && start !== null) {
    segs.push([start, y]);
    start = null;
  }
}
if (start !== null) segs.push([start, 900]);
console.log('石色 y 段:', segs.map(([a, b]) => `${a}-${b}`).join(' '));
// 圆环上下沿成对，圆心 = 相邻两段（上沿、下沿）中心的中点；按 y 排序两两配对
const centers = [];
for (let i = 0; i + 1 < segs.length; i += 2) {
  const topMid = (segs[i][0] + segs[i][1]) / 2;
  const botMid = (segs[i + 1][0] + segs[i + 1][1]) / 2;
  centers.push(Math.round((topMid + botMid) / 2));
}
console.log('圆心 y:', centers.join(', '));
// 每个圆心的 x：在该 y 水平扫描石色像素的左右边界
for (const cy of centers) {
  let minX = 9999;
  let maxX = -1;
  for (let x = 1380; x <= 1650; x++) if (isStone(x, cy)) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  console.log(`y=${cy} 圆环 x 范围 ${minX}-${maxX} 圆心 x=${Math.round((minX + maxX) / 2)}`);
}
