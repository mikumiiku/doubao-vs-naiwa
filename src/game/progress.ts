/**
 * 关卡进度：通关解锁下一关，localStorage 持久化。
 */

const KEY = 'dvn.unlocked';
const CARDS_KEY = 'dvn.cards';

/** 当前解锁到的最大关卡 id（至少为 1） */
export function unlockedLevel(): number {
  try {
    const n = parseInt(localStorage.getItem(KEY) ?? '1', 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

/** 通关 id 关后调用：把解锁进度推进到 id+1（不回头） */
export function unlockThrough(id: number): void {
  if (id <= unlockedLevel()) return;
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    // 隐私模式等场景忽略
  }
}

/** 已获得的卡牌 id 列表（选关界面「刚获得的卡」靠它判断是否还没拿到） */
export function ownedCards(): string[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((v): v is string => typeof v === 'string').map((id) => (id === 'garlic_doubao' ? 'tangbao_doubao' : id))
      : [];
  } catch {
    return [];
  }
}

export function hasCard(id: string): boolean {
  return ownedCards().includes(id);
}

/** 记录通关奖励：把卡牌加入已获得列表（去重） */
export function grantCards(ids: string[]): void {
  if (ids.length === 0) return;
  const cur = new Set(ownedCards());
  let changed = false;
  for (const id of ids) {
    if (!cur.has(id)) {
      cur.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify([...cur]));
  } catch {
    // 隐私模式等场景忽略
  }
}
