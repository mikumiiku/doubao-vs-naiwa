import { readyBattle } from './battle-fixture';
import type { Assets } from '../../src/core/assets';
import { Game } from '../../src/game/game';
import { GRID, LEVELS } from '../../src/game/config';
import { doughPos } from '../../src/game/entities';
import { cellCenterX, rowFootY } from '../../src/game/grid';
import { DEFENDERS } from '../../src/game/units';
import { BELT } from '../../src/game/special';
import type { CheckResult } from './reward-flow-entry';

/** 固定种子、真实面团/冷却/鼠标种植路径；不补钱、不跳波、不清怪。 */
export function campaignPlaythroughChecks(assets: Assets): CheckResult[] {
  const out: CheckResult[] = [];
  const originalRandom = Math.random;
  let seed = 1042026;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    for (const level of LEVELS.filter((l) => l.kind === 'battle')) {
      let result: CheckResult | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        seed = 1042026 + level.id * 100 + attempt * 7919;
        const g = readyBattle(assets, level);
        const place = (id: string, row: number, col: number): boolean => {
          const def = DEFENDERS.find((d) => d.id === id)!;
          if (!level.cards.includes(id) || g.occupied[row][col] || g.dough < def.cost || (g.cooldowns.get(id) ?? 0) > 0) return false;
          g.placing = id;
          g.onPointerDown({ x: cellCenterX(col), y: rowFootY(row) - 50 });
          return g.placing === null;
        };
        for (let tick = 0; tick < 360 * 30 && g.state === 'playing'; tick++) {
          g.update(1 / 30);
          for (const b of g.doughs) {
            if (!b.dead) {
              const p = doughPos(b);
              g.onPointerDown({ x: p.x, y: p.y - 20 });
            }
          }
          if (tick % 6) continue;
          const living = g.attackers.filter((a) => !a.dead && a.state !== 'dying');
          const producers = g.defenders.filter((d) => d.state !== 'dying' && d.def.producer).length;
          const shooters = g.defenders.filter((d) => d.state !== 'dying' && d.def.projectileSpeed > 0).length;
          if (producers < (shooters >= 3 && g.time < 80 ? 3 : level.id >= 3 ? 2 : shooters >= 1 ? 2 : 1)) {
            const row = [0, 2, 4, 1, 3].find((r) => g.activeRows.includes(r) && !g.occupied[r][0]);
            if (row !== undefined && place('hemian_doubao', row, 0)) continue;
          }
          const rows = g.activeRows
            .slice()
            .sort(
              (a, b) =>
                Math.min(1600, ...living.filter((z) => z.row === a).map((z) => z.x)) -
                Math.min(1600, ...living.filter((z) => z.row === b).map((z) => z.x)),
            );
          const covered = (row: number) =>
            g.defenders.some((d) => d.state !== 'dying' && d.def.projectileSpeed > 0 && Math.abs(d.row - row) <= (d.def.lanes ?? 0));
          const cluster = living.find(
            (a) => a.x < 900 && living.filter((b) => Math.abs(b.row - a.row) <= 1 && Math.abs(b.x - a.x) < 200).length >= 2,
          );
          if (level.id >= 9 && cluster) {
            const col = Array.from({ length: 9 }, (_, i) => i)
              .filter((c) => !g.occupied[cluster.row][c] && Math.abs(cellCenterX(c) - cluster.x) < 180)
              .sort((a, b) => Math.abs(cellCenterX(a) - cluster.x) - Math.abs(cellCenterX(b) - cluster.x))[0];
            if (col !== undefined && place('zhaxin_doubao', cluster.row, col)) continue;
          }
          if (level.id >= 9 && !g.defenders.some((d) => d.def.lanes && d.state !== 'dying') && place('luanhui_doubao', 2, 3)) continue;
          let planted = false;
          for (const row of rows) {
            const front = level.id < 7 ? 1 : 3;
            if (living.length && !covered(row) && !g.occupied[row][front] && place('douxian_shooter', row, front)) {
              planted = true;
              break;
            }
          }
          if (planted) continue;
          if (rows.some((row) => !covered(row))) continue;
          const laugher = living.find((a) => a.def.infectionSeconds && a.x < 1050);
          if (laugher) {
            const col = Array.from({ length: 9 }, (_, i) => i)
              .filter((c) => !g.occupied[laugher.row][c] && cellCenterX(c) < laugher.x)
              .sort((a, b) => cellCenterX(b) - cellCenterX(a))[0];
            if (col !== undefined && place('buraowan_doubao', laugher.row, col)) continue;
          }
          for (const row of rows) {
            if (
              living.some((a) => a.row === row && a.x < 950) &&
              !living.some((a) => a.row === row && a.def.infectionSeconds && a.x < 1050) &&
              !g.occupied[row][5] &&
              place('tangbao_doubao', row, 5)
            ) {
              planted = true;
              break;
            }
          }
          if (planted) continue;
          const urgent = living.find((a) => a.x < 720);
          if (urgent && living.filter((a) => Math.abs(a.row - urgent.row) <= 1 && Math.abs(a.x - urgent.x) < 200).length >= 2) {
            const col = Math.min(8, Math.max(1, GRID.colX.findIndex((x) => x > urgent.x) - 1));
            if (place('zhaxin_doubao', urgent.row, col)) continue;
          }
          for (const row of rows) {
            if (!living.some((a) => a.row === row)) continue;
            if (place(level.id >= 5 ? 'yizhen_doubao' : 'douxian_shooter', row, level.id < 7 ? 3 : 1)) {
              planted = true;
              break;
            }
            if (level.id >= 8 && place('moyu_doubao', row, 5)) {
              planted = true;
              break;
            }
            if (level.id >= 7 && place('fudu_doubao', row, 2)) {
              planted = true;
              break;
            }
            if (place('douxian_shooter', row, 4)) {
              planted = true;
              break;
            }
          }
        }
        result = {
          name: `第${level.id}关真实资源策略模拟通关`,
          ok: g.state === 'win',
          detail: `${g.state} / ${g.time.toFixed(1)}秒 / 豆包${g.defenders.length} / 剩余面团${g.dough} / 推车${g.mowers.filter((m) => m.state === 'idle').length} / 种子${1042026 + level.id * 100 + attempt * 7919}`,
        };
        if (result.ok) break;
      }
      out.push(result!);
    }
    let conveyorResult: CheckResult | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      seed = 1052026 + attempt * 7919;
      const g = readyBattle(assets, LEVELS[9]);
      g.dough = 0;
      for (let tick = 0; tick < 360 * 30 && g.state === 'playing'; tick++) {
        g.update(1 / 30);
        if (tick % 6) continue;
        const living = g.attackers.filter((a) => !a.dead && a.state !== 'dying');
        for (const c of [...g.conveyor!.cards]) {
          const def = DEFENDERS.find((d) => d.id === c.id)!;
          const rows = [0, 1, 2, 3, 4].sort(
            (a, b) =>
              Math.min(1600, ...living.filter((z) => z.row === a).map((z) => z.x)) -
              Math.min(1600, ...living.filter((z) => z.row === b).map((z) => z.x)),
          );
          let row = rows[0],
            col = 3;
          if (def.producer) {
            row = [0, 2, 4, 1, 3].find((r) => !g.occupied[r][0]) ?? row;
            col = 0;
          } else if (def.blast) {
            const a = living.find((a) => a.x < 1100);
            if (!a) continue;
            row = a.row;
            col =
              [0, 1, 2, 3, 4, 5, 6, 7, 8]
                .filter((c) => !g.occupied[row][c] && Math.abs(cellCenterX(c) - a.x) < 180)
                .sort((a1, b) => Math.abs(cellCenterX(a1) - a.x) - Math.abs(cellCenterX(b) - a.x))[0] ?? -1;
          } else if (def.projectileSpeed > 0) {
            if (def.lanes) row = [2, 1, 3].find((r) => !g.occupied[r][3]) ?? row;
            else row = rows.find((r) => !g.defenders.some((d) => d.state !== 'dying' && d.row === r && d.def.projectileSpeed > 0)) ?? row;
            col = [3, 1, 4, 2, 5, 0].find((c) => !g.occupied[row][c]) ?? -1;
          } else if (def.boost) {
            row = rows.find((r) => !g.occupied[r][2]) ?? row;
            col = 2;
          } else if (def.mover) {
            const a = living.find((a) => a.x < 1200);
            if (!a) continue;
            row = a.row;
            col = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !g.occupied[row][c] && cellCenterX(c) < a.x).at(-1) ?? -1;
          } else {
            row = rows.find((r) => !g.occupied[r][5]) ?? row;
            col = [5, 6, 4, 7].find((c) => !g.occupied[row][c]) ?? -1;
          }
          if (col < 0 || g.occupied[row][col]) continue;
          g.onPointerDown({ x: c.x + 30, y: BELT.y + 40 });
          g.onPointerDown({ x: cellCenterX(col), y: rowFootY(row) - 50 });
        }
      }
      conveyorResult = {
        name: '第10关传送带真实供卡策略模拟通关',
        ok: g.state === 'win' && g.dough === 0 && g.doughsThrown === 0,
        detail: `${g.state} / ${g.time.toFixed(1)}秒 / 发卡${g.conveyor!.sequence} / 零面团 / 种子${1052026 + attempt * 7919}`,
      };
      if (conveyorResult.ok) break;
    }
    out.push(conveyorResult!);
  } finally {
    Math.random = originalRandom;
  }
  return out;
}
