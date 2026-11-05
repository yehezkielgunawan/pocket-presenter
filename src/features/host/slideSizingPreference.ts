import type { SlideSizingMode } from '../deck/slideSizing';

const key = 'pp.slide-sizing.v1';

export function readSlideSizingPreference(): SlideSizingMode {
  try {
    const saved = localStorage.getItem(key);
    return saved === 'fill' || saved === 'stretch' ? saved : 'fit';
  } catch {
    return 'fit';
  }
}

export function saveSlideSizingPreference(mode: SlideSizingMode) {
  try {
    localStorage.setItem(key, mode);
  } catch {
    // The in-memory preference still works when storage is blocked.
  }
}
