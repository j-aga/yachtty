// Best stars per level, kept on this device.

const KEY = 'yachtty.progress';

type Progress = Record<string, number>;

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? (data as Progress) : {};
  } catch {
    return {}; // private browsing or blocked storage: just don't remember
  }
}

export function bestStars(id: string): number {
  const n = load()[id];
  return typeof n === 'number' ? n : 0;
}

export function saveStars(id: string, stars: number): void {
  const data = load();
  if (stars <= (data[id] ?? 0)) return;
  data[id] = stars;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Nothing to do; progress just won't be saved.
  }
}
