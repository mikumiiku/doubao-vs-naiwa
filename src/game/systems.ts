import { DESIGN_W, FIRST_FROG_AFTER_SECOND_DOUGH, GRID, HOME_LINE_X, MOWER, RESOURCE, type WaveDef } from './config';
import { Anim, sampleTrack } from '../core/anim';
import { sfx } from '../core/sfx';
import type { Assets } from '../core/assets';
import { Attacker, Defender, DoughBall, Mower, Projectile, type FanWind } from './entities';
import { advanceGridCells, FAN_WIND, gridCoordinate, windContact } from './fan';
import { ATTACKERS } from './units';
import { rowFootY } from './grid';

export function chooseWaveAttacker(wave: WaveDef, index: number, attackers: Attacker[], random = Math.random()): string {
  if (wave.type) return wave.type;
  if (index < (wave.ordinaryFirst ?? 1)) return 'ordinary_frog';
  if (index === (wave.ordinaryFirst ?? 1) && wave.featured) return wave.featured;
  const laughing = attackers.filter((a) => a.def.id === 'laugh_frog' && !a.dead && a.state !== 'dying').length;
  const pool = (
    wave.pool ?? [
      { type: 'ordinary_frog', weight: 90 },
      { type: 'laugh_frog', weight: 10 },
    ]
  ).filter((entry) => entry.type !== 'laugh_frog' || laughing < 2);
  let n = random * pool.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of pool) {
    n -= entry.weight;
    if (n < 0) return entry.type;
  }
  return 'ordinary_frog';
}

function releasePush(d: Defender): void {
  if (d.pushTarget?.pushedBy === d) d.pushTarget.pushedBy = null;
  d.pushTarget = null;
}

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
  fanWinds: FanWind[];
  /** 豆馅弹命中特效（子弹侧的溅射，0.25s 扩散淡出；与奶蛙自身受击反馈无关） */
  hitFx: { x: number; y: number; t: number; radius?: number }[];
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
  activeRows?: number[];
  assets: Assets;
  spawnAttacker(row: number, type?: string): void;
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
    if (a.row === m.row && a.state !== 'dying') hurtAttacker(s, a, 99999);
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
      // 按时间表出波: 上一波**刷完**后再等 delay 秒。
      // 关键在"刷完"而不是"开始"—— 一波通常几秒就刷完了, 若从波开始计时,
      // 每波之间会凭空多出一整段 delay 的空场(旧配置就是这样空 18~22 秒的)。
      s.waveTimer += dt;
      if (s.waveTimer < wave.delay) return;
    }
    s.waveActive = true;
    s.spawnQueue = wave.count;
    s.spawnTimer = 0;
    s.waveStartedAt = s.time;
    // 大波(含最后一波)在屏幕中央弹横幅提示(PvZ 的 huge wave 提示); 小波不提示不升旗
    if (wave.big) {
      s.banner = '一大波奶蛙即将到来';
      s.bannerT = 3;
      sfx.laugh(); // 奶龙大笑, 大波进攻提示音
    }
    return;
  }
  if (s.spawnQueue > 0) {
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      s.spawnTimer = wave.interval;
      s.spawnQueue--;
      const rows = s.activeRows ?? [0, 1, 2, 3, 4];
      const weights = rows.map((row) => 1 / (1 + s.attackers.filter((a) => a.row === row && !a.dead && a.state !== 'dying').length * 0.6));
      let choice = Math.random() * weights.reduce((a, b) => a + b, 0);
      let row = rows[rows.length - 1];
      for (let i = 0; i < rows.length; i++) {
        choice -= weights[i];
        if (choice < 0) {
          row = rows[i];
          break;
        }
      }
      s.spawnAttacker(row, chooseWaveAttacker(wave, wave.count - s.spawnQueue - 1, s.attackers));
      // 本波刷完这一刻就是下一波 delay 的计时起点
      if (s.spawnQueue === 0) s.waveTimer = 0;
    }
  } else {
    // 刷完即开始下一波倒计时；场上存活怪继续移动。
    s.waveActive = false;
    s.waveIndex++;
    s.waveTimer = 0;
  }
}

export function updateDefenders(s: BattleState, dt: number): void {
  for (const d of s.defenders) {
    if (d.state === 'dying') {
      // 被夹起移除的单位不播死亡动画: 走上提缩小通道(绘制端按 dieT 做提起/缩放/淡出)
      if (!d.lifted && s.assets.meta(d.def.id, 'death')?.frames) {
        d.anim.update(dt);
        if (d.anim.finished) d.dead = true;
      } else {
        // 无死亡动画: 原地溶解消失; lifted: 夹子夹起消失
        d.dieT += dt;
        if (d.dieT >= 0.55) d.dead = true;
      }
      continue;
    }
    // 移动型单位沿行向右走，接触目标后蓄力，再让它向后跳半格。
    // 推完二者分开各自继续走(怪也恢复行进), 下次碰到再推; 不占格/不产面/不射击
    if (d.def.mover) {
      const mv = d.def.mover;
      const separated = (t: Attacker): boolean => {
        const gap = t.x - d.x;
        return gap >= mv.reach || gap < -12;
      };
      // 目标死亡/移除, 或推搡后已分开 → 解锁, 双方各自恢复行走
      if (d.pushTarget && (d.pushTarget.dead || d.pushTarget.state === 'dying' || (!d.pushTarget.hop && separated(d.pushTarget))))
        releasePush(d);
      if (!d.pushTarget) {
        // 找前方 reach 以内最近的一只; 一次只拦一只, 别的怪不受影响照样走
        let best: Attacker | null = null;
        let bestGap = Infinity;
        for (const a of s.attackers) {
          if (a.dead || a.state === 'dying' || a.state === 'vault' || a.row !== d.row || a.pushedBy || a.hop) continue;
          const gap = a.x - d.x;
          if (gap > -12 && gap < mv.reach && gap < bestGap) {
            bestGap = gap;
            best = a;
          }
        }
        if (best) {
          d.pushTarget = best;
          best.pushedBy = d;
          d.anim.set('attack', true);
          d.anim.t = 0;
          d.anim.loops = 0;
          // 从这一轮开始计: 一轮动画推一下(接触瞬间不立刻结算, 推的动作播完才发力)
          d.pushLoop = d.anim.loops;
        }
      }
      if (d.pushTarget) {
        // 推搡时站定: 怪被冻结(updateAttackers 的 pushedBy 分支, 不播动画不移动)
        const t = d.pushTarget;
        if (d.anim.loops !== d.pushLoop) {
          d.pushLoop = d.anim.loops;
          if (!t.hop) t.hop = { from: t.x, to: t.x + mv.knockback, elapsed: 0, duration: 0.38 };
        }
      } else {
        if (d.anim.name !== 'walk') d.anim.set('walk', true);
        d.x += mv.speed * dt;
      }
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.anim.update(dt);
      // 走到草坪最右端离场消失(一次性单位, 无死亡动画)
      if (d.x > GRID.colX[GRID.cols]) {
        releasePush(d);
        d.dead = true;
      }
      continue;
    }
    const boost = s.defenders.some(
      (other) =>
        other !== d &&
        !other.dead &&
        other.state !== 'dying' &&
        other.def.boost &&
        Math.abs(other.row - d.row) <= 1 &&
        Math.abs(other.x - d.x) <= other.def.boost.radius,
    )
      ? 1.35
      : 1;
    d.abilityFx = Math.max(0, d.abilityFx - dt);
    if (d.def.blast) {
      d.abilityTimer += dt;
      d.state = 'attack';
      d.anim.set('attack', true);
      d.anim.update(dt);
      if (d.abilityTimer >= d.def.blast.fuse) {
        for (const a of s.attackers) {
          if (Math.abs(a.row - d.row) <= d.def.blast.rows && Math.abs(a.x - d.x) <= d.def.blast.radius) hurtAttacker(s, a, d.def.damage);
        }
        s.hitFx.push({ x: d.x, y: d.y - 55, t: 0, radius: d.def.blast.radius });
        pickUpDefender(s, d);
        d.lifted = false;
      }
      continue;
    }
    if (d.def.boost || d.def.blocker) {
      const active = d.def.boost
        ? s.defenders.some(
            (other) =>
              other !== d && other.state !== 'dying' && Math.abs(other.row - d.row) <= 1 && Math.abs(other.x - d.x) <= d.def.boost!.radius,
          )
        : d.hitFlash > 0;
      d.anim.set(active ? 'attack' : 'idle', true);
      d.anim.update(dt);
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      continue;
    }
    if (d.def.slow || d.def.slam) {
      const effect = d.def.slow ?? d.def.slam!;
      d.abilityTimer = Math.max(0, d.abilityTimer - dt * boost);
      const nearby = s.attackers.filter(
        (a) =>
          !a.dead &&
          a.state !== 'dying' &&
          Math.abs(a.row - d.row) <= (d.def.slow?.rows ?? 0) &&
          a.x >= d.x - 30 &&
          a.x - d.x <= effect.range,
      );
      d.anim.set(nearby.length ? 'attack' : 'idle', true);
      if (nearby.length && d.abilityTimer <= 0 && d.anim.currentIndex() >= d.def.fireFrame) {
        d.abilityTimer = effect.interval;
        d.abilityFx = 0.65;
        for (const a of nearby) {
          hurtAttacker(s, a, d.def.damage);
          if (a.state === 'dying' || a.dead) continue;
          if (d.def.slow) {
            a.slowTimer = d.def.slow.duration;
            a.slowFactor = d.def.slow.factor;
          }
          if (d.def.slam && !a.hop && !a.vault && !a.pushedBy) {
            a.hop = { from: a.x, to: a.x + d.def.slam.knockback, elapsed: 0, duration: 0.32 };
          }
        }
      }
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.anim.update(dt * boost);
      continue;
    }
    // 生产型单位：周期播放生产动画，播完抛出一团可拾取的面团
    if (d.def.producer) {
      d.produceTimer -= dt * boost;
      if (d.anim.name === 'produce') {
        // 抛出动作在动画中段: 面团提前 0.5s 出现与动作对齐(不再等动画播完)
        if (d.anim.finished || d.anim.duration() - d.anim.t <= 0.5) {
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
      d.anim.update(dt * boost);
      continue;
    }
    const hasTarget = s.attackers.some((a) => a.state !== 'dying' && Math.abs(a.row - d.row) <= (d.def.lanes ?? 0) && a.x > d.x - 20);
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
        for (let row = Math.max(0, d.row - (d.def.lanes ?? 0)); row <= Math.min(GRID.rows - 1, d.row + (d.def.lanes ?? 0)); row++) {
          const p = new Projectile(
            row,
            d.x + dir * w * 0.3,
            rowFootY(row) - d.def.spriteH * 0.52,
            d.def.projectileSpeed * dir,
            d.def.damage,
          );
          p.remainingHits = d.def.pierce ?? 1;
          p.lightweight = !d.def.pierce;
          s.projectiles.push(p);
        }
        sfx.shoot();
      }
    } else if (d.state !== 'idle') {
      d.state = 'idle';
      d.anim.set('idle', true);
    }
    d.hitFlash = Math.max(0, d.hitFlash - dt);
    d.anim.update(dt * boost);
  }
}

export function updateAttackers(s: BattleState, dt: number): void {
  for (const wind of s.fanWinds) {
    wind.previousX = wind.x;
    wind.x -= FAN_WIND.speed * dt;
    wind.age += dt;
  }
  s.fanWinds = s.fanWinds.filter((wind) => wind.age < FAN_WIND.life);
  for (const a of s.attackers) {
    if (a.dead) continue;
    if (a.state === 'dying') {
      a.vaultOffset = Math.min(0, a.vaultOffset + 220 * dt);
      a.anim.update(dt);
      if (a.anim.finished) a.dead = true;
      continue;
    }
    a.slowTimer = Math.max(0, a.slowTimer - dt);
    a.rallyBuff = Math.max(0, a.rallyBuff - dt);
    a.rallyFx = Math.max(0, a.rallyFx - dt);
    if (a.def.rally) {
      a.rallyTimer -= dt;
      if (a.rallyTimer <= 0) {
        a.rallyTimer = a.def.rally.interval;
        a.rallyFx = a.def.rally.duration;
        for (const ally of s.attackers) {
          if (!ally.dead && ally.state !== 'dying' && Math.abs(ally.row - a.row) <= 1 && Math.abs(ally.x - a.x) <= a.def.rally.radius) {
            ally.rallyBuff = a.def.rally.duration;
            ally.rallyFactor = a.def.rally.factor;
          }
        }
      }
      if (a.state === 'walk') a.anim.set(a.rallyFx > 0 ? 'attack' : 'walk', true);
    }
    if (a.hop) {
      interruptFan(a);
      const hop = a.hop;
      hop.elapsed = Math.min(hop.duration, hop.elapsed + dt);
      const k = hop.elapsed / hop.duration;
      a.x = hop.from + (hop.to - hop.from) * (1 - (1 - k) ** 3);
      a.hopOffset = -12 * 4 * k * (1 - k);
      a.biteTimer = 0;
      a.target = null;
      a.hitFlash = Math.max(0, a.hitFlash - dt);
      if (k >= 1) {
        a.hop = null;
        a.hopOffset = 0;
        if (a.pushedBy) releasePush(a.pushedBy);
      }
      continue;
    }
    // 被不绕弯豆包推搡: 冻结自身动画与移动(推它的豆包带着它右移), 此期间不会啃咬
    if (a.pushedBy) {
      const p = a.pushedBy;
      if (p.pushTarget !== a || p.dead || p.state === 'dying') a.pushedBy = null;
      else {
        interruptFan(a);
        a.biteTimer = 0;
        a.target = null;
        a.hitFlash = Math.max(0, a.hitFlash - dt);
        continue;
      }
    }
    if (updateFan(s, a, dt)) continue;
    if (a.def.egg && a.state === 'vault' && a.vault) {
      const vault = a.vault;
      vault.elapsed = Math.min(vault.duration, vault.elapsed + dt);
      const k = vault.elapsed / vault.duration;
      const previousX = a.x;
      a.x = vault.from + ((vault.to - vault.from) * (1 - Math.cos(k * Math.PI))) / 2;
      a.rollAngle += (a.x - previousX) / (a.def.spriteH * 0.48);
      a.vaultOffset = -vault.height * 4 * k * (1 - k);
      if (k >= 1) {
        a.vault = null;
        a.vaultOffset = 0;
        a.rollAngle = 0;
        a.state = 'hatch';
        a.anim.set('hatch', false);
      }
      continue;
    }
    if (a.def.egg && a.state === 'hatch') {
      a.anim.update(dt);
      if (a.anim.finished) {
        const healthRatio = a.hp / a.def.hp;
        a.def = ATTACKERS.naiji;
        a.hp = a.def.hp * healthRatio;
        a.anim = new Anim(s.assets, a.def.id, 'walk');
        a.state = 'walk';
        a.target = null;
        a.biteTimer = 0;
        a.rollAngle = 0;
      }
      continue;
    }
    // 找同行左前方最近的防守单位
    let target: Defender | null = null;
    let bestGap = Infinity;
    for (const d of s.defenders) {
      if (d.dead || d.state === 'dying' || d.row !== a.row || d.def.mover) continue;
      const gap = a.x - d.x;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        target = d;
      }
    }
    if (a.def.egg && target && bestGap <= a.def.egg.reach) {
      const egg = a.def.egg;
      a.state = 'vault';
      a.vault = {
        from: a.x,
        to: Math.max(HOME_LINE_X + 2, Math.min(a.x - egg.distance, target.x - 80)),
        elapsed: 0,
        duration: egg.duration,
        height: egg.height,
      };
      a.target = null;
      a.biteTimer = 0;
      continue;
    }
    // 有断手素材的单位在血量越过阈值后切换同侧断手动作。
    // 没有断手行的单位(奶鸡)跳过换形, 始终用普通走/啄
    const broken = a.hp <= a.def.hp * a.def.damageStages[0] && !!s.assets.meta(a.def.id, 'walk_b')?.frames;
    if (target && bestGap <= a.def.biteReach) {
      if (a.target !== target) a.biteTimer = 0;
      if (a.state !== 'eat' || a.broken !== broken) {
        a.state = 'eat';
        a.broken = broken;
        const action = a.def.infectionSeconds ? 'laugh' : 'attack';
        a.anim.set(broken ? `${action}_b` : action, true);
        if (!a.def.infectionSeconds && a.biteTimer <= 0) a.biteTimer = a.def.biteInterval * 0.6;
      }
      a.target = target;
      a.biteTimer += dt;
      if (a.def.infectionSeconds) {
        if (a.biteTimer >= a.def.infectionSeconds) {
          const converted = new Attacker(ATTACKERS.laugh_frog, target.row, target.x, target.y, s.assets);
          hurtDefender(s, target, target.hp);
          target.dead = true;
          s.attackers.push(converted);
          a.target = null;
          a.biteTimer = 0;
          sfx.laugh();
        }
      } else if (a.biteTimer >= a.def.biteInterval) {
        a.biteTimer = 0;
        hurtDefender(s, target, a.def.biteDamage);
      }
    } else {
      if (a.state !== 'walk' || a.broken !== broken) {
        a.state = 'walk';
        a.broken = broken;
        a.anim.set(broken ? 'walk_b' : 'walk', true);
      }
      a.target = null;
      a.biteTimer = 0;
      // 瞬时速度由动画的「根位移轨道」调制(PvZ 的 _ground 做法):
      // 抬脚那半程身体推进少、脚落地后身体快速跟上, 所以长期平均速度不变但每一步有快有慢,
      // 比匀速平移自然得多, 也让脚踩地的瞬间不显得在滑。
      // 轨道是去均值 ±1 的(见 slice-sprites), 所以平均速度不受强度影响。
      const walkMeta = s.assets.meta(a.def.id, a.anim.name);
      const gait = 1 + sampleTrack(walkMeta?.groundTrack, a.anim, walkMeta?.frames ?? 0, walkMeta?.fps ?? 0) * a.def.groundTrackStrength;
      const distance = a.def.speed * a.speedMul * gait * (a.slowTimer > 0 ? a.slowFactor : 1) * (a.rallyBuff > 0 ? a.rallyFactor : 1) * dt;
      const previousX = a.x;
      a.x -= distance;
      if (a.def.egg) a.rollAngle -= distance / (a.def.spriteH * 0.48);
      checkHomeLine(s, a);
      if (a.def.fan && a.state === 'walk') {
        a.fanProgress += gridCoordinate(previousX) - gridCoordinate(a.x);
        if (a.fanProgress >= a.def.fan.cells) {
          a.fanProgress %= a.def.fan.cells;
          a.fanTimer = 0;
          a.fanCast = false;
          a.state = 'fan';
          a.anim.set('fan', false);
          sfx.fan();
        }
      }
    }
    a.hitFlash = Math.max(0, a.hitFlash - dt);
    a.anim.update(dt);
  }
}

function checkHomeLine(s: BattleState, a: Attacker): void {
  if (a.x > HOME_LINE_X) return;
  const mower = s.mowers.find((m) => m.row === a.row);
  if (mower?.state === 'idle') activateMower(s, mower);
  else if (!mower || mower.state === 'gone') s.state = 'lose';
  else hurtAttacker(s, a, 99999);
}

function interruptFan(a: Attacker): void {
  if (a.state !== 'fan' && a.state !== 'slide') return;
  a.slide = null;
  a.state = 'walk';
  a.anim.set('walk', true);
}

function updateFan(s: BattleState, a: Attacker, dt: number): boolean {
  const fan = a.def.fan;
  if (!fan) return false;
  if (a.state === 'fan') {
    a.fanTimer += dt;
    a.anim.update(dt);
    if (!a.fanCast && a.fanTimer >= fan.castAt - 1e-8) {
      a.fanCast = true;
      s.fanWinds.push({ row: a.row, x: a.x - 46, previousX: a.x - 46, y: a.y - 55, age: 0 });
    }
    if (a.fanTimer >= fan.duration - 1e-8) {
      a.state = 'slide';
      a.slide = { from: a.x, to: advanceGridCells(a.x, 1), elapsed: 0, duration: fan.slideDuration };
    }
    return true;
  }
  if (a.state !== 'slide' || !a.slide) return false;
  const slide = a.slide;
  const speedFactor = (a.slowTimer > 0 ? a.slowFactor : 1) * (a.rallyBuff > 0 ? a.rallyFactor : 1);
  slide.elapsed = Math.min(slide.duration, slide.elapsed + dt * speedFactor);
  const progress = slide.elapsed / slide.duration;
  const nextX = slide.from + (slide.to - slide.from) * (1 - (1 - progress) ** 3);
  let stopX = nextX;
  for (const d of s.defenders) {
    if (d.dead || d.state === 'dying' || d.def.mover || d.row !== a.row || d.x >= a.x) continue;
    stopX = Math.max(stopX, Math.min(a.x, d.x + a.def.biteReach));
  }
  const blocked = stopX > nextX;
  a.x = stopX;
  checkHomeLine(s, a);
  if (a.hp > 0 && !a.dead && (progress >= 1 || blocked)) {
    a.slide = null;
    a.state = 'walk';
    a.anim.set('walk', true);
  }
  return true;
}

export function hurtDefender(s: BattleState, d: Defender, dmg: number): void {
  const previousHp = d.hp;
  d.hp -= dmg;
  if (d.def.blocker) {
    const earned = Math.min(d.def.blocker.maxDrops, Math.floor((d.def.hp - Math.max(0, d.hp)) / d.def.blocker.dropEvery));
    while (d.candyDrops < earned && previousHp > 0) {
      d.candyDrops++;
      s.doughs.push(new DoughBall(d.x, d.y - 65, d.x - 50 + d.candyDrops * 20, d.y - 10, 45, RESOURCE.doughTTL, false));
    }
  }
  d.hitFlash = 0.3;
  if (d.hp <= 0 && d.state !== 'dying') {
    d.state = 'dying';
    releasePush(d);
    d.hitFlash = 0;
    d.dieT = 0;
    // 有死亡动画的播动画; 没有的(新版防守方 act 表只有待机/攻击)走溶解消失
    if (s.assets.meta(d.def.id, 'death')?.frames) d.anim.set('death', false);
    if (s.occupied[d.row]?.[d.col] === d) s.occupied[d.row][d.col] = null;
  }
}

/** 夹子挖除: 目标进入"被夹起"状态（上提+缩小消失, 0.55s），并立即释放占地（无返还，同 PvZ 铲子） */
export function pickUpDefender(s: BattleState, d: Defender): void {
  if (d.state === 'dying') return;
  d.state = 'dying';
  releasePush(d);
  d.lifted = true;
  d.hitFlash = 0;
  d.dieT = 0;
  if (s.occupied[d.row]?.[d.col] === d) s.occupied[d.row][d.col] = null;
}

export function updateProjectiles(s: BattleState, dt: number): void {
  for (const p of s.projectiles) {
    if (p.dead) continue;
    const previousX = p.x;
    p.x += p.vx * dt;
    // 连续碰撞检测避免高速针形弹在低帧率时穿过怪物。
    const contacts = s.attackers
      .filter(
        (a) =>
          !a.dead &&
          a.state !== 'dying' &&
          a.row === p.row &&
          !p.hit.has(a) &&
          Math.max(previousX, p.x) >= a.x - 24 &&
          Math.min(previousX, p.x) <= a.x + 36,
      )
      .sort((a, b) => a.x - b.x);
    const distance = p.x - previousX;
    const events: { t: number; attacker?: Attacker }[] = contacts.map((a) => ({
      t: Math.max(0, Math.min(1, ((distance >= 0 ? a.x - 24 : a.x + 36) - previousX) / distance || 0)), attacker: a,
    }));
    if (p.lightweight && !p.windWeakened && p.vx > 0) {
      for (const wind of s.fanWinds) {
        if (wind.row !== p.row) continue;
        const t = windContact(wind, previousX, p.x, p.y);
        if (t !== null) events.push({ t });
      }
    }
    events.sort((a, b) => a.t - b.t);
    for (const event of events) {
      if (!event.attacker) {
        if (!p.windWeakened) {
          p.damage *= FAN_WIND.damageFactor;
          p.windWeakened = true;
        }
        continue;
      }
      const a = event.attacker;
      p.hit.add(a);
      p.remainingHits--;
      s.hitFx.push({ x: a.x, y: p.y, t: 0 });
      hurtAttacker(s, a, p.damage);
      if (p.remainingHits <= 0) {
        p.dead = true;
        break;
      }
    }
    if (p.x > DESIGN_W + 60 || p.x < -60) p.dead = true;
  }
}

export function hurtAttacker(s: BattleState, a: Attacker, dmg: number): void {
  if (a.dead || a.state === 'dying') return;
  a.hp -= dmg;
  a.hitFlash = 0.2;
  if (a.hp <= 0) {
    a.state = 'dying';
    a.vault = null;
    a.slide = null;
    a.hop = null;
    a.hopOffset = 0;
    if (a.pushedBy) releasePush(a.pushedBy);
    a.hitFlash = 0;
    a.diedAt = s.time;
    if (a.def.id === 'laugh_frog') sfx.frogDeath();
    // 致命伤已越过断手阈值，使用对应倒地动作，避免断手在死亡时恢复。
    a.broken = a.hp <= a.def.hp * a.def.damageStages[0] && !!s.assets.meta(a.def.id, 'walk_b')?.frames;
    const death = a.broken && s.assets.meta(a.def.id, 'death_b')?.frames ? 'death_b' : 'death';
    if (s.assets.meta(a.def.id, death)?.frames) a.anim.set(death, false);
    else a.dead = true;
  }
}

export function cleanup(s: BattleState): void {
  s.defenders = s.defenders.filter((d) => !d.dead);
  s.attackers = s.attackers.filter((a) => !a.dead);
  s.projectiles = s.projectiles.filter((p) => !p.dead);
  s.doughs = s.doughs.filter((b) => !b.dead);
}
