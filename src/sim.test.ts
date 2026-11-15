import { describe, expect, it } from 'vitest';
import {
  DEG,
  MAX_SPEED,
  createBoat,
  idealSheet,
  settleBoat,
  stepBoat,
  wrapAngle,
  type Boat,
  type SailEvent,
  type Wind,
} from './sim';

const north: Wind = { from: 0, strength: 1 };

function boatOn(headingDeg: number, sheet: number): Boat {
  const b = createBoat(0, 0, headingDeg * DEG);
  b.sheet = sheet;
  settleBoat(b, north);
  return b;
}

function run(b: Boat, seconds: number, wind: Wind = north): SailEvent[] {
  const events: SailEvent[] = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) events.push(...stepBoat(b, wind, dt));
  return events;
}

describe('steering', () => {
  it('turns the opposite way to the tiller', () => {
    const b = boatOn(90, idealSheet(90 * DEG));
    b.tiller = 1; // tiller to starboard
    run(b, 1);
    expect(b.heading).toBeLessThan(90 * DEG); // boat turned to port

    const c = boatOn(90, idealSheet(90 * DEG));
    c.tiller = -1;
    run(c, 1);
    expect(c.heading).toBeGreaterThan(90 * DEG);
  });

  it('can still turn when stopped', () => {
    const b = boatOn(90, 1);
    b.tiller = -1;
    run(b, 1);
    expect(b.heading).toBeGreaterThan(95 * DEG);
  });
});

describe('mainsheet', () => {
  it('sails fast on a beam reach with the sail set well', () => {
    const b = boatOn(90, idealSheet(90 * DEG));
    run(b, 10);
    expect(b.speed).toBeGreaterThan(MAX_SPEED * 0.9);
    expect(b.trim).toBe('good');
    expect(b.x).toBeGreaterThan(40); // went east
  });

  it('stalls with the sheet let right out on a beam reach', () => {
    const b = boatOn(90, 1);
    run(b, 10);
    expect(b.speed).toBeLessThan(MAX_SPEED * 0.25);
    expect(b.trim).toBe('luffing');
    expect(b.flap).toBeGreaterThan(0.7);
  });

  it('is slower when pulled in too tight on a run', () => {
    const b = boatOn(180, 0);
    run(b, 10);
    expect(b.trim).toBe('tight');
    expect(b.speed).toBeLessThan(MAX_SPEED * 0.5);
    expect(b.speed).toBeGreaterThan(1);
  });

  it('only calls the trim good when the sheet is close to right', () => {
    const ideal = idealSheet(90 * DEG);
    expect(boatOn(90, ideal + 0.08).trim).toBe('good');
    expect(boatOn(90, ideal - 0.08).trim).toBe('good');
    expect(boatOn(90, ideal - 0.2).trim).not.toBe('good');
    expect(boatOn(90, ideal + 0.2).trim).not.toBe('good');
    expect(boatOn(180, 1).trim).toBe('good'); // straight downwind, sail right out
  });

  it('wants the sheet in when close-hauled and out on a run', () => {
    expect(idealSheet(45 * DEG)).toBeLessThan(0.1);
    expect(idealSheet(90 * DEG)).toBeGreaterThan(0.3);
    expect(idealSheet(90 * DEG)).toBeLessThan(0.5);
    expect(idealSheet(180 * DEG)).toBe(1);
  });

  it('puts the boom on the side away from the wind', () => {
    const east = boatOn(90, 0.5); // wind over the port side
    expect(east.tack).toBe(-1);
    expect(east.boom).toBeGreaterThan(0); // boom out to starboard
    const west = boatOn(-90, 0.5);
    expect(west.tack).toBe(1);
    expect(west.boom).toBeLessThan(0);
  });
});

describe('the no-go zone', () => {
  it('stops a boat pointed at the wind', () => {
    const b = boatOn(90, idealSheet(90 * DEG));
    run(b, 8);
    b.heading = 5 * DEG;
    run(b, 0.5);
    expect(b.trim).toBe('nogo');
    run(b, 6);
    expect(b.speed).toBeLessThan(1.5);
  });

  it('warns when sailing a bit too close to the wind', () => {
    expect(boatOn(41, idealSheet(41 * DEG)).trim).toBe('pinching');
    const closeHauled = boatOn(46, idealSheet(46 * DEG));
    run(closeHauled, 8);
    expect(closeHauled.trim).toBe('good');
  });

  it('lets the bow fall away so the boat is never stuck for good', () => {
    const b = boatOn(2, 0.1);
    run(b, 30);
    expect(Math.abs(wrapAngle(b.heading))).toBeGreaterThan(38 * DEG);
    expect(b.speed).toBeGreaterThan(1);
  });
});

describe('tacking and gybing', () => {
  it('reports a tack after turning the bow through the wind', () => {
    const b = boatOn(-45, idealSheet(45 * DEG)); // starboard tack, close-hauled
    run(b, 6);
    expect(b.tack).toBe(1);
    b.tiller = -1; // push the tiller towards the sail
    const events = run(b, 2.5);
    b.tiller = 0;
    expect(events).toEqual(['tack']);
    expect(b.tack).toBe(-1);
    expect(b.boom).toBeGreaterThan(0);
    expect(b.speed).toBeGreaterThan(1); // kept some speed through the turn
  });

  it('reports a gybe after turning the stern through the wind', () => {
    const b = boatOn(150, 1);
    run(b, 6);
    b.tiller = -1;
    const events = run(b, 2);
    expect(events).toEqual(['gybe']);
    expect(b.tack).toBe(1);
  });

  it('does not report a tack for wobbling about head to wind', () => {
    const b = boatOn(-45, idealSheet(45 * DEG));
    run(b, 6);
    b.heading = 3 * DEG; // just across the wind
    run(b, 0.2);
    b.heading = -45 * DEG; // and back again
    expect(run(b, 1)).toEqual([]);
  });
});
