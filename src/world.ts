import type { Boat } from './sim';

/** The bay is a big circle of water with a beach all the way round. */
export const BAY_R = 190;
const SHALLOWS = 7; // how close to the beach the boat can get

export interface Buoy {
  x: number;
  y: number;
  color: string;
}

export const BUOYS: Buoy[] = [
  { x: 70, y: 0, color: '#ff8a3d' },
  { x: 0, y: -70, color: '#ffd23f' },
  { x: -80, y: -40, color: '#ff5d8f' },
  { x: 0, y: 60, color: '#7bd657' },
];

/** Stop the boat at the beach. Returns true if it just ran aground. */
export function keepInBay(b: Boat): boolean {
  const d = Math.hypot(b.x, b.y);
  const limit = BAY_R - SHALLOWS;
  if (d <= limit) return false;
  b.x *= limit / d;
  b.y *= limit / d;
  const bumped = b.speed > 0.5;
  b.speed = 0;
  return bumped;
}
