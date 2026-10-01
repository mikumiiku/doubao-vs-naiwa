import { DESIGN_W, FIRST_FROG_AFTER_SECOND_DOUGH, GRID, HOME_LINE_X, MOWER, RESOURCE, type WaveDef } from './config';
import { sfx } from '../core/sfx';
import type { Assets } from '../core/assets';
import { Attacker, Defender, DoughBall, Mower, Projectile } from './entities';

/** 战斗系统读写的状态（由 Game 实现） */
export interface BattleState {
  time: number;
  dough: number;
  doughs: DoughBall[];
  doughTimer: number;
  doughsThrown: number;
  doughsResolved: number;
  /** 第一只奶蛙的出现时刻（第二团面团落地/被接住后 5 秒），未到时机为 null */
  firstFrogAt: number | null;
  mowers: Mower[];
  defenders: Defender[];
  attackers: Attacker[];
  projectiles: Projectile[];
  occupied: (Defender | null)[][];
  waveIndex: number;
  waveActive: boolean;
  waveTimer: number;
  /** 当前波开始时刻（旗帜升起动画用） */
  waveStartedAt: number;
  spawnQueue: number;
  spawnTimer: number;
  banner: string;
  bannerT: number;
  state: 'playing' | 'win' | 'lose';
  waves: WaveDef[];
  assets: Assets;
  spawnAttacker(row: number): void;
}

/** 从右侧定时抛入的面团落地或被接住时计入统计；第二团到达后 5 秒放出第一只奶蛙 */
export function resolveThrownDough(s: BattleState, b: DoughBall): void {
  if (b.resolved) return;
  b.resolved = true;
  s.doughsResolved++;
  if (s.doughsResolved === 2) s.firstFrogAt = s.time + FIRST_FROG_AFTER_SECOND_DOUGH;
}

export function updateDoughs(s: BattleState, dt: number): void {
  s.doughTimer += dt;
  const due = s.doughsThrown === 0 ? RESOURCE.firstDoughAt : RESOURCE.doughInterval;
  if (s.doughTimer >= due) {
    s.doughTimer = 0;
    s.doughsThrown++;
    // 从右侧场外抛入，落点在作战区内随机
    const x1 = GRID.colX[0] + 40 + Math.random() * (GRID.colX[GRID.cols] - GRID.colX[0] - 80);
    const y1 = GRID.rowY[0] + 50 + Math.random() * (GRID.rowY[GRID.rows] - GRID.rowY[0] - 110);
    const y0 = 240 + Math.random() * 120;
    const apex = Math.max(60, Math.min(y0, y1) - 130);
    const arc = (y0 + y1) / 2 - apex;
    s.doughs.push(new DoughBall(DESIGN_W + 50, y0, x1, y1, arc, RESOURCE.doughTTL, true));
  }
  for (const b of s.doughs) {
    if (!b.landed) {
      b.t += dt / RESOURCE.doughFlyTime;
      if (b.t >= 1) {
        b.t = 1;
        b.landed = true;
        if (b.counts) resolveThrownDough(s, b);
      }
    } else {
      b.ttl -= dt;
      if (b.ttl <= 0) b.dead = true;
    }
  }
}

/** 大肥鱼触发：沿行冲锋（视觉），同行奶蛙全部秒杀——一次性保险 */
export function activateMower(s: BattleState, m: Mower): void {
  m.state = 'active';
  sfx.mower();
  for (const a of s.attackers) {
    if (a.row === m.row && a.state !== 'dying') hurtAttacker(a, 99999);
  }
}

export function updateMowers(s: BattleState, dt: number): void {
  for (const m of s.mowers) {
    if (m.state !== 'active') continue;
    m.t += dt;
    m.x += MOWER.speed * dt;
    if (m.x > MOWER.exitX) m.state = 'gone';
  }
}

export function updateWaves(s: BattleState, dt: number): void {
  if (s.waveIndex >= s.waves.length) {
    if (s.attackers.length === 0) s.state = 'win';
    return;
  }
  const wave = s.waves[s.waveIndex];
  if (!s.waveActive) {
    if (s.waveIndex === 0) {
      // 首波不由计时器驱动：等第二团面团落地（或被接住）后 5 秒
      if (s.firstFrogAt === null || s.time < s.firstFrogAt) return;
    } else {
      // 与 PvZ 一致按时间表出波: 上一波开始后 delay 秒即来, 不因清场提前
      s.waveTimer += dt;
      if (s.waveTimer < wave.delay) return;
    }
    s.waveActive = true;
    s.spawnQueue = wave.count;
    s.spawnTimer = 0;
    s.waveStartedAt = s.time;
    // 只有最后一波配横幅(PvZ 的 flag wave 提示), 普通波只升起进度条小旗
    if (s.waveIndex === s.waves.length - 1) {
      s.banner = '一大波奶蛙正在逼近！';
      s.bannerT = 3;
    }
    return;
  }
  if (s.spawnQueue > 0) {
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      s.spawnTimer = wave.interval;
      s.spawnQueue--;
      s.spawnAttacker(Math.floor(Math.random() * GRID.rows));
    }
  } else if (s.attackers.length === 0) {
    s.waveActive = false;
    s.waveIndex++;
    s.waveTimer = 0;
  }
}

export function updateDefenders(s: BattleState, dt: number): void {
  for (const d of s.defenders) {
    if (d.state === 'dying') {
      if (s.assets.meta(d.def.id, 'death')?.frames) {
        d.anim.update(dt);
        if (d.anim.finished) d.dead = true;
      } else {
        // 无死亡动画: 原地溶解消失
        d.dieT += dt;
        if (d.dieT >= 0.55) d.dead = true;
      }
      continue;
    }
    // 生产型单位：周期播放生产动画，播完抛出一团可拾取的面团
    if (d.def.producer) {
      d.produceTimer -= dt;
      if (d.anim.name === 'produce') {
        if (d.anim.finished) {
          const [lo, hi] = d.def.producer.interval;
          d.produceTimer = lo + Math.random() * (hi - lo);
          d.anim.set('idle', true);
          // 面团抛到身边随机落点（不计入首蛙门控的“右侧抛入”统计）
          s.doughs.push(
            new DoughBall(d.x, d.y - d.def.spriteH * 0.7, d.x + Math.random() * 120 - 60, d.y - 6, 46, RESOURCE.doughTTL, false),
          );
        }
      } else if (d.produceTimer <= d.anim.duration()) {
        // 进入生产动画的时点：让动画播完正好到产出时刻
        d.anim.set('produce', false);
      }
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.anim.update(dt);
      continue;
    }
    const hasTarget = s.attackers.some((a) => a.state !== 'dying' && a.row === d.row && a.x > d.x - 20);
    if (hasTarget) {
      if (d.state !== 'attack') {
        d.state = 'attack';
        d.anim.set('attack', true);
        d.lastFireLoop = -1;
      }
      // 动画帧驱动开火：播到吐豆馅那一帧才出弹，前摇诚实播完，一轮动画一发
      if (d.anim.currentIndex() >= d.def.fireFrame && d.anim.loops !== d.lastFireLoop) {
        d.lastFireLoop = d.anim.loops;
        const w = d.anim.widthFor(d.def.spriteH);
        const dir = d.def.flipX ? -1 : 1;
        s.projectiles.push(
          new Projectile(
            d.row,
            d.x + dir * w * 0.3,
            d.y - d.def.spriteH * 0.62,
            d.def.projectileSpeed * dir,
            d.def.damage,
          ),
        );
        sfx.shoot();
      }
    } else if (d.state !== 'idle') {
      d.state = 'idle';
      d.anim.set('idle', true);
    }
    d.hitFlash = Math.max(0, d.hitFlash - dt);
    d.anim.update(dt);
  }
}

export function updateAttackers(s: BattleState, dt: number): void {
  for (const a of s.attackers) {
    if (a.state === 'dying') {
      a.anim.update(dt);
      if (a.anim.finished) a.dead = true;
      continue;
    }
    // 找同行左前方最近的防守单位
    let target: Defender | null = null;
    let bestGap = Infinity;
    for (const d of s.defenders) {
      if (d.state === 'dying' || d.row !== a.row) continue;
      const gap = a.x - d.x;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        target = d;
      }
    }
    if (target && bestGap <= a.def.biteReach) {
      if (a.state !== 'eat') {
        a.state = 'eat';
        a.anim.set('attack', true);
        a.biteTimer = a.def.biteInterval * 0.6;
      }
      a.target = target;
      a.biteTimer += dt;
      if (a.biteTimer >= a.def.biteInterval) {
        a.biteTimer = 0;
        hurtDefender(s, target, a.def.biteDamage);
      }
    } else {
      if (a.state !== 'walk') {
        a.state = 'walk';
        a.anim.set('walk', true);
      }
      a.target = null;
      a.x -= a.def.speed * dt;
      if (a.x <= HOME_LINE_X) {
        // 越线触发大肥鱼（一次性）；该行保险已用光才判负
        const mower = s.mowers.find((m) => m.row === a.row);
        if (mower && mower.state === 'idle') {
          activateMower(s, mower);
        } else if (!mower || mower.state === 'gone') {
          s.state = 'lose';
        }
        // 冲锋中的大肥鱼已清完该行，越线奶蛙交给死亡动画，不判负
      }
    }
    a.hitFlash = Math.max(0, a.hitFlash - dt);
    a.anim.update(dt);
  }
}

export function hurtDefender(s: BattleState, d: Defender, dmg: number): void {
  d.hp -= dmg;
  d.hitFlash = 0.3;
  if (d.hp <= 0 && d.state !== 'dying') {
    d.state = 'dying';
    d.hitFlash = 0;
    d.dieT = 0;
    // 有死亡动画的播动画; 没有的(新版防守方 act 表只有待机/攻击)走溶解消失
    if (s.assets.meta(d.def.id, 'death')?.frames) d.anim.set('death', false);
    if (s.occupied[d.row]?.[d.col] === d) s.occupied[d.row][d.col] = null;
  }
}

export function updateProjectiles(s: BattleState, dt: number): void {
  for (const p of s.projectiles) {
    p.x += p.vx * dt;
    if (p.x > DESIGN_W + 60 || p.x < -60) {
      p.dead = true;
      continue;
    }
    // 命中同行最靠左（最逼近家园区）的奶蛙
    let best: Attacker | null = null;
    for (const a of s.attackers) {
      if (a.state === 'dying' || a.row !== p.row) continue;
      if (p.x >= a.x - 24 && p.x <= a.x + 36) {
        if (!best || a.x < best.x) best = a;
      }
    }
    if (best) {
      p.dead = true;
      hurtAttacker(best, p.damage);
    }
  }
}

export function hurtAttacker(a: Attacker, dmg: number): void {
  a.hp -= dmg;
  a.hitFlash = 0.2;
  if (a.hp <= 0 && a.state !== 'dying') {
    a.state = 'dying';
    a.hitFlash = 0;
    a.anim.set('death', false);
  }
}

export function cleanup(s: BattleState): void {
  s.defenders = s.defenders.filter((d) => !d.dead);
  s.attackers = s.attackers.filter((a) => !a.dead);
  s.projectiles = s.projectiles.filter((p) => !p.dead);
  s.doughs = s.doughs.filter((b) => !b.dead);
}
