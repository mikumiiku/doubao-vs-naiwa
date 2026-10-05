export const EGG_RHYTHM = {
  version: 2,
  duration: 180,
  bpm: 150,
  radius: 34,
  hitWindow: 0.09,
  perfectWindow: 0.035,
  missLimit: 5,
  startX: 1540,
  targetX: 557.5,
};

export interface EggNote {
  at: number;
  spawnAt: number;
  row: number;
  speed: number;
  height: number;
  frequency: number;
  phase: number;
}

/** 固定谱面让重试能练习同一组走位；到达时刻排序不受速度变化影响。 */
function createEggChart(): EggNote[] {
  const notes: EggNote[] = [];
  const beat = 60 / EGG_RHYTHM.bpm;
  const near = [1, 2, 1, 3, 2, 3, 2, 1];
  const wide = [0, 2, 4, 3, 1, 2, 0, 3];
  for (let b = 0; 3 + b * beat < 178; b++) {
    const at = 3 + b * beat;
    // 约50秒与105秒给短缓冲，其余段落从单拍推进到八分连段。
    const rest = (at >= 49 && at < 57) || (at >= 103 && at < 111);
    if (rest && b % 2) continue;
    const dense = !rest && ((at >= 25 && at < 49 && b % 4 < 2) || (at >= 67 && at < 103 && b % 4 !== 3) || at >= 125);
    for (const offset of dense ? [0, beat / 2] : [0]) {
      const target = at + offset;
      const index = notes.length;
      const speed = Math.min(680, 420 + target * 1.5);
      const travel = (EGG_RHYTHM.startX - EGG_RHYTHM.targetX) / speed;
      const pattern = target < 67 || rest ? near : wide;
      const frequency = 3.8 + (index % 7) * 0.18;
      notes.push({
        at: target,
        spawnAt: target - travel,
        row: pattern[index % pattern.length],
        speed,
        height: 35 + ((index * 47) % 135),
        frequency,
        phase: ((index % 5) * Math.PI) / 5 - travel * frequency,
      });
    }
  }
  return notes.sort((a, b) => a.at - b.at);
}

export const EGG_CHART = createEggChart();

export function eggRhythmPhase(time: number): string {
  if (time < 25) return '热身';
  if (time < 49) return '双连';
  if (time < 57) return '缓冲';
  if (time < 103) return '跳点';
  if (time < 111) return '缓冲';
  if (time < 125) return '蓄势';
  return '终段连打';
}
