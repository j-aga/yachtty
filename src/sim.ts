// Sailing engine. Deliberately simplified: the right action always gives the
// right result, so a beginner learns the cause and effect rather than fighting
// realistic physics.
//
// Conventions
//   World: x = east, y = north. Angles are compass radians (0 = north, clockwise).
//   tiller: -1 = pushed to port (left), +1 = pushed to starboard (right).
//           The boat turns the opposite way to the tiller.
//   sheet:  0 = mainsheet pulled all the way in, 1 = let all the way out.
//   boom:   signed angle off the centreline, positive = out to starboard.
//   tack:   +1 = wind coming over the starboard side, -1 = over the port side.

export const DEG = Math.PI / 180;

export const BOAT_LEN = 5; // world units
export const MAX_SPEED = 8; // world units per second in normal wind
export const MAX_KNOTS = 6; // what MAX_SPEED is shown as
export const NO_GO = 38 * DEG; // half-width of the no-go zone
export const MIN_BOOM = 8 * DEG;
export const MAX_BOOM = 85 * DEG;
export const TILLER_MAX = 35 * DEG; // how far the tiller swings, for drawing

const TURN_RATE = 60 * DEG; // per second at full tiller and good speed
const BOOM_RATE = 220 * DEG; // how fast the boom can swing
const TRIM_TOLERANCE = 6 * DEG; // how far off perfect still counts as perfect

export type Trim = 'nogo' | 'pinching' | 'luffing' | 'tight' | 'ok' | 'good';
export type SailEvent = 'tack' | 'gybe';

export interface Wind {
  from: number; // compass direction the wind comes from
  strength: number; // 1 = normal
}

export interface Boat {
  x: number;
  y: number;
  heading: number;
  speed: number;
  tiller: number;
  sheet: number;
  boom: number;
  tack: 1 | -1;
  crew: number; // where the sailor sits, -1 (port) to 1 (starboard)

  // Worked out each step, for drawing and hints.
  windAngle: number; // signed angle from the bow to where the wind comes from
  drive: number; // 0..1 how hard the sail is pulling
  flap: number; // 0..1 how much the sail is flapping
  trimError: number; // boom angle off the best: + = too far out, - = too far in
  trim: Trim;

  // Bookkeeping for spotting a finished tack or gybe.
  sailSide: 1 | -1;
  viaBow: boolean;
}

export function createBoat(x: number, y: number, heading: number): Boat {
  return {
    x,
    y,
    heading,
    speed: 0,
    tiller: 0,
    sheet: 0.5,
    boom: 0,
    tack: 1,
    crew: 1,
    windAngle: 0,
    drive: 0,
    flap: 0,
    trimError: 0,
    trim: 'ok',
    sailSide: 1,
    viaBow: true,
  };
}

/** Put the boat on the correct tack for the wind without firing a tack event. */
export function settleBoat(b: Boat, wind: Wind): void {
  const a = wrapAngle(wind.from - b.heading);
  b.tack = a >= 0 ? 1 : -1;
  b.sailSide = b.tack;
  b.crew = b.tack;
  b.boom = -b.tack * Math.min(Math.abs(a), boomLimit(b.sheet));
  stepBoat(b, wind, 0);
}

export function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(lo: number, hi: number, v: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/** How far out the boom is allowed to go for a given mainsheet setting. */
export function boomLimit(sheet: number): number {
  return MIN_BOOM + (MAX_BOOM - MIN_BOOM) * clamp(sheet, 0, 1);
}

/**
 * The best boom angle for a wind angle: pulled right in when sailing close to
 * the wind, about halfway on a reach, all the way out on a run.
 */
export function idealBoom(absWindAngle: number): number {
  return clamp((absWindAngle - 30 * DEG) * 0.62, MIN_BOOM, MAX_BOOM);
}

/** The mainsheet setting that gives the best boom angle. */
export function idealSheet(absWindAngle: number): number {
  return (idealBoom(absWindAngle) - MIN_BOOM) / (MAX_BOOM - MIN_BOOM);
}

export function stepBoat(b: Boat, wind: Wind, dt: number): SailEvent[] {
  const events: SailEvent[] = [];

  const a = wrapAngle(wind.from - b.heading);
  const abs = Math.abs(a);
  const side: 1 | -1 = a >= 0 ? 1 : -1;

  // Which side is the wind on? Crossing the bow is a tack; crossing the stern
  // is a gybe, which waits until the wind is clearly on the new side.
  if (side !== b.tack) {
    if (abs < 90 * DEG) {
      b.tack = side;
      b.viaBow = true;
    } else if (abs < 165 * DEG) {
      b.tack = side;
      b.viaBow = false;
    }
  }
  // A tack or gybe only counts once the boat is sailing again on the new side.
  if (abs > NO_GO + 4 * DEG && b.tack !== b.sailSide) {
    b.sailSide = b.tack;
    events.push(b.viaBow ? 'tack' : 'gybe');
  }

  // The sail swings like a flag until the mainsheet stops it.
  const limit = boomLimit(b.sheet);
  const boomAbs = Math.min(abs, limit);
  const boomTarget = -b.tack * boomAbs;
  const boomStep = BOOM_RATE * dt;
  b.boom += clamp(boomTarget - b.boom, -boomStep, boomStep);

  // How well is the sail set?
  const ideal = idealBoom(abs);
  const error = boomAbs - ideal; // + = too far out, - = pulled in too tight
  let trimPower = 1;
  if (error > TRIM_TOLERANCE) {
    const span = Math.max(abs - ideal, 12 * DEG);
    trimPower = clamp(1 - (error - TRIM_TOLERANCE) / (span - TRIM_TOLERANCE), 0, 1);
  } else if (error < -TRIM_TOLERANCE) {
    trimPower = Math.max(0.35, 1 - (0.65 * (-error - TRIM_TOLERANCE)) / (30 * DEG));
  }

  // How good is this direction? Nothing in the no-go zone, best on a reach.
  const upwind = smoothstep(34 * DEG, 46 * DEG, abs);
  const pointPower = upwind * (1 - 0.2 * smoothstep(120 * DEG, 180 * DEG, abs));

  b.windAngle = a;
  b.drive = trimPower * pointPower;
  b.trimError = error;
  b.flap = Math.max(error > 0 ? 1 - trimPower : 0, 1 - upwind);

  if (abs < NO_GO) b.trim = 'nogo';
  else if (upwind < 0.8) b.trim = 'pinching'; // just outside the no-go zone
  else if (error > TRIM_TOLERANCE && trimPower < 0.8) b.trim = 'luffing';
  else if (error < -TRIM_TOLERANCE && trimPower < 0.85) b.trim = 'tight';
  else if (trimPower > 0.92) b.trim = 'good';
  else b.trim = 'ok';

  // Speed chases a target; turning hard costs a little.
  const target = MAX_SPEED * wind.strength * b.drive * (1 - 0.2 * Math.abs(b.tiller));
  const tau = target > b.speed ? 1.6 : 2.6;
  b.speed += (target - b.speed) * (1 - Math.exp(-dt / tau));

  // The rudder works better with speed, but always works a bit so a stopped
  // boat can still be turned.
  const bite = 0.3 + 0.7 * Math.min(1, b.speed / (0.5 * MAX_SPEED));
  b.heading -= b.tiller * TURN_RATE * bite * dt;

  // Stuck head to wind ("in irons"): drift backwards and let the bow fall away.
  if (abs < NO_GO + 2 * DEG && b.speed < 1) {
    const stuck = 1 - b.speed;
    b.heading -= side * 7 * DEG * stuck * dt;
    const drift = 0.6 * wind.strength * stuck * dt;
    b.x -= Math.sin(wind.from) * drift;
    b.y -= Math.cos(wind.from) * drift;
  }

  b.x += Math.sin(b.heading) * b.speed * dt;
  b.y += Math.cos(b.heading) * b.speed * dt;

  b.crew += (b.tack - b.crew) * (1 - Math.exp(-dt / 0.25));

  return events;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const POINT_NAMES = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

function pointIndex(angle: number): number {
  const turn = 2 * Math.PI;
  return Math.round((((angle % turn) + turn) % turn) / (45 * DEG)) % 8;
}

/** Compass letters for an angle, e.g. "NE". */
export function compassPoint(angle: number): string {
  return POINTS[pointIndex(angle)];
}

/** Compass word for an angle, e.g. "north-east". */
export function compassName(angle: number): string {
  return POINT_NAMES[pointIndex(angle)];
}
