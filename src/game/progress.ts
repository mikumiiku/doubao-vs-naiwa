/**
 * 关卡进度：通关解锁下一关，localStorage 持久化。
 */

const KEY = 'dvn.unlocked';

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
