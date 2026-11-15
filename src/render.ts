import type { Input } from './controls';
import {
  DEG,
  MAX_KNOTS,
  MAX_SPEED,
  NO_GO,
  TILLER_MAX,
  compassName,
  compassPoint,
  smoothstep,
  type Boat,
  type Wind,
} from './sim';
import { BAY_R, type Buoy } from './world';

const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';
const INK = '#24435c';

export interface Camera {
  x: number;
  y: number;
  rot: number; // compass direction that points up the screen
  ppm: number; // pixels per world unit
  cx: number; // where the camera centre sits on screen
  cy: number;
  boatScale: number; // boat drawn bigger when zoomed out
}

export interface WakeDot {
  x: number;
  y: number;
  age: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A star floating on the water to sail through. */
export interface Marker extends Point {
  done: boolean;
}

export interface Scene {
  w: number;
  h: number;
  time: number;
  boat: Boat;
  wind: Wind;
  cam: Camera;
  wake: WakeDot[];
  input: Input;
  bay: boolean; // beach all round, or open water
  ripples: boolean;
  showNoGo: boolean;
  noGoAlways: boolean; // keep the wedge visible even when sailing well away from it
  showBoat: boolean;
  showWind: boolean;
  showCompass: boolean;
  showSpeed: boolean;
  showControls: boolean;
  buoys: Buoy[];
  markers: Marker[];
  flag: Point | null;
  target: Point | null; // where the edge-of-screen arrow points
  starOverTarget: boolean; // bounce a star over the target when it is on screen
}

type Ctx = CanvasRenderingContext2D;

export function render(ctx: Ctx, s: Scene): void {
  const { cam } = s;

  ctx.fillStyle = s.bay ? '#f2deaa' : '#2a93c9';
  ctx.fillRect(0, 0, s.w, s.h);

  // World drawing: (X, -Y) so north is up before the camera turns.
  ctx.save();
  ctx.translate(cam.cx, cam.cy);
  ctx.rotate(-cam.rot);
  ctx.scale(cam.ppm, cam.ppm);
  ctx.translate(-cam.x, cam.y);

  if (s.bay) {
    drawBay(ctx);
    drawBathingBoxes(ctx);
  }
  if (s.ripples) drawRipples(ctx, s);
  drawWake(ctx, s.wake);
  if (s.showNoGo && s.showBoat) drawNoGo(ctx, s);
  s.buoys.forEach((b, i) => drawBuoy(ctx, b, s.time, i, b === s.target));
  drawMarkers(ctx, s);
  if (s.flag) drawFlag(ctx, s, s.flag);
  if (s.showBoat) drawBoat(ctx, s.boat, cam.boatScale, s.time);
  ctx.restore();

  if (s.target) drawTargetArrow(ctx, s, s.target);

  const ui = s.input.layout.scale;
  if (s.showWind) drawWindDial(ctx, s, 74 * ui, 74 * ui, 50 * ui);
  if (s.showCompass) drawCompass(ctx, s, s.w - 74 * ui, 74 * ui, 50 * ui);
  if (s.showSpeed) drawSpeed(ctx, s);
  if (s.showControls) {
    drawTillerControl(ctx, s);
    drawSheetControl(ctx, s);
  }
}

// ---------------------------------------------------------------- world ----

function drawBay(ctx: Ctx): void {
  const g = ctx.createRadialGradient(0, 0, BAY_R - 45, 0, 0, BAY_R);
  g.addColorStop(0, '#2a93c9');
  g.addColorStop(0.7, '#49b4d6');
  g.addColorStop(1, '#9fe0e0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, BAY_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

const BOX_COLORS = ['#ff5d5d', '#ffd23f', '#4fb0ff', '#7bd657', '#ff8a3d', '#c77dff', '#ffffff'];

/** A row of beach huts along the south shore. */
function drawBathingBoxes(ctx: Ctx): void {
  for (let i = 0; i < 15; i++) {
    const c = (152 + i * 4) * DEG;
    const r = BAY_R + 9;
    ctx.save();
    ctx.translate(Math.sin(c) * r, -Math.cos(c) * r);
    ctx.rotate(c);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(-2.7, -2.6, 6, 6);
    ctx.fillStyle = BOX_COLORS[i % BOX_COLORS.length];
    ctx.fillRect(-3, -3, 6, 6);
    ctx.fillStyle = BOX_COLORS[(i + 3) % BOX_COLORS.length];
    ctx.fillRect(-1, -3, 2, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.2;
    ctx.strokeRect(-3, -3, 6, 6);
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(3, 0);
    ctx.stroke();
    ctx.restore();
  }
}

function hash(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Little streaks that drift with the wind, so the wind is always visible. */
function drawRipples(ctx: Ctx, s: Scene): void {
  const { cam, wind } = s;
  const cell = 8;
  const fx = -Math.sin(wind.from);
  const fy = Math.cos(wind.from); // drawing y points down
  const reach = Math.hypot(s.w, s.h) / cam.ppm;
  const camX = cam.x;
  const camY = -cam.y;
  const i0 = Math.floor((camX - reach) / cell);
  const i1 = Math.ceil((camX + reach) / cell);
  const j0 = Math.floor((camY - reach) / cell);
  const j1 = Math.ceil((camY + reach) / cell);
  const len = 2.2;

  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.14, 1.4 / cam.ppm);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const frac = (s.time * 0.35 * wind.strength + hash(j, i)) % 1;
      const along = (frac - 0.5) * cell * 1.5;
      const x = (i + hash(i, j)) * cell + fx * along;
      const y = (j + hash(i + 31, j + 17)) * cell + fy * along;
      if (Math.hypot(x - camX, y - camY) > reach) continue;
      if (s.bay && Math.hypot(x, y) > BAY_R - 4) continue;
      ctx.globalAlpha = 0.34 * Math.sin(Math.PI * frac);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + fx * len, y + fy * len);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawWake(ctx: Ctx, wake: WakeDot[]): void {
  ctx.fillStyle = '#fff';
  for (const d of wake) {
    const life = 1 - d.age / 2.2;
    if (life <= 0) continue;
    ctx.globalAlpha = 0.4 * life;
    ctx.beginPath();
    ctx.arc(d.x, -d.y, 0.35 + d.age * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A red wedge pointing at the wind that fades in as the boat gets close to it. */
function drawNoGo(ctx: Ctx, s: Scene): void {
  const { boat, wind, cam } = s;
  const close = 1 - smoothstep(NO_GO + 2 * DEG, NO_GO + 26 * DEG, Math.abs(boat.windAngle));
  const near = s.noGoAlways ? Math.max(close, 0.7) : close;
  if (near <= 0.01) return;
  const r = 15 * cam.boatScale;
  const mid = wind.from - Math.PI / 2; // compass angle to canvas angle
  ctx.save();
  ctx.translate(boat.x, -boat.y);
  ctx.globalAlpha = near;
  ctx.fillStyle = 'rgba(214,69,69,0.3)';
  ctx.strokeStyle = 'rgba(214,69,69,0.75)';
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, mid - NO_GO, mid + NO_GO);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Label, kept the right way up whichever way the camera is turned.
  ctx.translate(Math.sin(wind.from) * r * 0.72, -Math.cos(wind.from) * r * 0.72);
  ctx.rotate(cam.rot);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${1.5 * cam.boatScale}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO-GO ZONE', 0, 0);
  ctx.restore();
}

/** Stars to sail through. The next one to collect has a pulsing ring. */
function drawMarkers(ctx: Ctx, s: Scene): void {
  for (const m of s.markers) {
    if (m.done) continue;
    ctx.save();
    ctx.translate(m.x, -m.y);
    ctx.rotate(s.cam.rot); // keep the star upright
    if (m === s.target) {
      const pulse = 0.5 + 0.5 * Math.sin(s.time * 4);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 3.6 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    star(ctx, 0, 0, 2.2 + 0.15 * Math.sin(s.time * 3 + m.x));
    ctx.restore();
  }
}

/** A flag on a post, streaming away from the wind. */
function drawFlag(ctx: Ctx, s: Scene, at: Point): void {
  const fx = -Math.sin(s.wind.from);
  const fy = Math.cos(s.wind.from);
  const len = 10;
  const edge = (side: number) => (t: number): [number, number] => {
    const wave = 0.7 * t * Math.sin(t * 8 - s.time * 9);
    const off = wave + side * 1.9 * (1 - t);
    return [fx * len * t - fy * off, fy * len * t + fx * off];
  };
  ctx.save();
  ctx.translate(at.x, -at.y);
  ctx.beginPath();
  const top = edge(1);
  const bottom = edge(-1);
  for (let k = 0; k <= 12; k++) ctx.lineTo(...top(k / 12));
  for (let k = 12; k >= 0; k--) ctx.lineTo(...bottom(k / 12));
  ctx.closePath();
  ctx.fillStyle = '#ff5d5d';
  ctx.strokeStyle = '#a82f2f';
  ctx.lineWidth = 0.25;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5b4636';
  ctx.beginPath();
  ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9a777';
  ctx.beginPath();
  ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBuoy(ctx: Ctx, b: Buoy, time: number, i: number, isTarget: boolean): void {
  const bob = 1 + 0.05 * Math.sin(time * 2 + i * 1.7);
  ctx.save();
  ctx.translate(b.x, -b.y);
  if (isTarget) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * pulse})`;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, 5 + pulse * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,40,80,0.2)';
  ctx.beginPath();
  ctx.arc(0.4, 0.5, 1.5 * bob, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.arc(0, 0, 1.4 * bob, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 0.55 * bob, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** The dinghy from above. Local space: bow towards -y, starboard towards +x. */
export function drawBoat(ctx: Ctx, b: Boat, scale: number, time: number, crew = true): void {
  ctx.save();
  ctx.translate(b.x, -b.y);
  ctx.rotate(b.heading);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-0.72, -2.5);
    ctx.quadraticCurveTo(0, -2.68, 0.72, -2.5);
    ctx.bezierCurveTo(1.15, -1.6, 1.3, -0.2, 1.05, 2.5);
    ctx.lineTo(-1.05, 2.5);
    ctx.bezierCurveTo(-1.3, -0.2, -1.15, -1.6, -0.72, -2.5);
    ctx.closePath();
  };

  // Shadow on the water.
  ctx.save();
  ctx.translate(0.25, 0.3);
  ctx.fillStyle = 'rgba(0,40,80,0.22)';
  hull();
  ctx.fill();
  ctx.restore();

  // Rudder blade, swinging the opposite way to the tiller.
  const th = b.tiller * TILLER_MAX;
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 0.24;
  line(ctx, 0, 2.5, -Math.sin(th) * 0.95, 2.5 + Math.cos(th) * 0.95);

  // Hull and cockpit.
  hull();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e4572e';
  ctx.lineWidth = 0.26;
  ctx.stroke();
  ctx.save();
  ctx.scale(0.74, 0.86);
  hull();
  ctx.fillStyle = '#e6eef4';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#c3d0da';
  ctx.lineWidth = 0.3;
  line(ctx, -0.95, -0.9, 0.95, -0.9); // the seat across the middle
  ctx.strokeStyle = '#8fa3b3';
  ctx.lineWidth = 0.16;
  line(ctx, 0, -0.55, 0, 0.15); // top of the centreboard

  // Tiller.
  ctx.strokeStyle = '#b07a3f';
  ctx.lineWidth = 0.2;
  line(ctx, 0, 2.5, Math.sin(th) * 1.7, 2.5 - Math.cos(th) * 1.7);

  // Sailor, sitting on the side the wind is coming from.
  const sx = b.crew * 0.62;
  const sy = 0.75;
  if (crew) {
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 0.48, 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6fbd';
    ctx.beginPath();
    ctx.arc(sx, sy, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Boom, mainsheet and sail.
  const mx = 0;
  const my = -1.75;
  const boomLen = 3.0;
  const dx = Math.sin(b.boom);
  const dy = Math.cos(b.boom);
  const ex = mx + dx * boomLen;
  const ey = my + dy * boomLen;

  ctx.strokeStyle = '#f4f1e4';
  ctx.lineWidth = 0.07;
  line(ctx, mx + dx * 2.1, my + dy * 2.1, 0, 1.55); // mainsheet rope

  ctx.strokeStyle = '#8a6a45';
  ctx.lineWidth = 0.16;
  line(ctx, mx, my, ex, ey);

  // The sail bellies away from the wind when full and wriggles when flapping.
  const lee = -b.tack;
  const belly = lee * (0.12 + 0.42 * b.drive);
  const nx = dy;
  const ny = -dx;
  const sail = () => {
    ctx.beginPath();
    ctx.moveTo(mx, my);
    for (let k = 1; k <= 16; k++) {
      const t = k / 16;
      const off =
        belly * 4 * t * (1 - t) + b.flap * 0.3 * t * Math.sin(t * 11 - time * 20);
      ctx.lineTo(mx + dx * boomLen * t + nx * off, my + dy * boomLen * t + ny * off);
    }
  };
  sail();
  ctx.strokeStyle = 'rgba(40,70,100,0.45)';
  ctx.lineWidth = 0.42;
  ctx.stroke();
  sail();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.3;
  ctx.stroke();

  ctx.fillStyle = '#5b6b78';
  ctx.beginPath();
  ctx.arc(mx, my, 0.17, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ------------------------------------------------------------------ HUD ----

export function star(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = r * 0.12;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
}

function toScreen(cam: Camera, x: number, y: number): [number, number] {
  const dx = (x - cam.x) * cam.ppm;
  const dy = -(y - cam.y) * cam.ppm;
  const c = Math.cos(-cam.rot);
  const sn = Math.sin(-cam.rot);
  return [cam.cx + dx * c - dy * sn, cam.cy + dx * sn + dy * c];
}

/** A star over the target buoy, or an arrow at the screen edge pointing to it. */
function drawTargetArrow(ctx: Ctx, s: Scene, target: Point): void {
  const ui = s.input.layout.scale;
  const [tx, ty] = toScreen(s.cam, target.x, target.y);
  const m = 46 * ui;
  const top = 100 * ui; // stay clear of the hint at the top of the screen
  const onScreen = tx > m && tx < s.w - m && ty > top && ty < s.h - m;
  const bounce = Math.sin(s.time * 4) * 4 * ui;
  if (onScreen) {
    if (s.starOverTarget) star(ctx, tx, ty - 34 * ui + bounce, 15 * ui);
    return;
  }
  // Slide the marker along the line from the boat to the target until it
  // reaches the edge of the screen.
  const dx = tx - s.cam.cx;
  const dy = ty - s.cam.cy;
  let t = 1;
  if (dx > 0) t = Math.min(t, (s.w - m - s.cam.cx) / dx);
  if (dx < 0) t = Math.min(t, (m - s.cam.cx) / dx);
  if (dy > 0) t = Math.min(t, (s.h - m - s.cam.cy) / dy);
  if (dy < 0) t = Math.min(t, (top - s.cam.cy) / dy);
  const ax = s.cam.cx + dx * t;
  const ay = s.cam.cy + dy * t;
  const ang = Math.atan2(dy, dx);

  ctx.save();
  ctx.translate(ax, ay);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, 0, 25 * ui, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(40 * ui + bounce, 0);
  ctx.lineTo(24 * ui + bounce, -12 * ui);
  ctx.lineTo(24 * ui + bounce, 12 * ui);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  star(ctx, 0, 0, 15 * ui);
  ctx.restore();
}

function dial(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(36,67,92,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function label(ctx: Ctx, text: string, x: number, y: number, size: number, color = '#fff'): void {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.28;
  ctx.strokeStyle = 'rgba(20,60,95,0.55)';
  ctx.lineJoin = 'round';
  if (color === '#fff') ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Shows which way the wind is blowing across the screen. */
function drawWindDial(ctx: Ctx, s: Scene, x: number, y: number, r: number): void {
  dial(ctx, x, y, r);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(s.wind.from + Math.PI - s.cam.rot); // the way the wind blows to
  ctx.fillStyle = '#2a93c9';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.78);
  ctx.lineTo(r * 0.42, -r * 0.12);
  ctx.lineTo(r * 0.16, -r * 0.12);
  ctx.lineTo(r * 0.16, r * 0.72);
  ctx.lineTo(-r * 0.16, r * 0.72);
  ctx.lineTo(-r * 0.16, -r * 0.12);
  ctx.lineTo(-r * 0.42, -r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  label(ctx, 'WIND', x, y + r + 15 * (r / 50), 17 * (r / 50));
  label(ctx, `from the ${compassName(s.wind.from)}`, x, y + r + 34 * (r / 50), 13 * (r / 50));
}

/** A compass that turns so N always points to real north. */
function drawCompass(ctx: Ctx, s: Scene, x: number, y: number, r: number): void {
  dial(ctx, x, y, r);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-s.cam.rot);
  ctx.fillStyle = '#d64545';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.5);
  ctx.lineTo(r * 0.14, 0);
  ctx.lineTo(-r * 0.14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9fb2c2';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.5);
  ctx.lineTo(r * 0.14, 0);
  ctx.lineTo(-r * 0.14, 0);
  ctx.closePath();
  ctx.fill();
  const letters = ['N', 'E', 'S', 'W'];
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 2);
    ctx.translate(0, -r * 0.74);
    ctx.rotate(-(k * Math.PI) / 2 + s.cam.rot); // keep letters upright
    label(ctx, letters[k], 0, 0, r * 0.3, k === 0 ? '#d64545' : INK);
    ctx.restore();
  }
  ctx.restore();
  label(ctx, `Heading ${compassPoint(s.boat.heading)}`, x, y + r + 15 * (r / 50), 17 * (r / 50));
}

function drawSpeed(ctx: Ctx, s: Scene): void {
  const ui = s.input.layout.scale;
  const w = 190 * ui;
  const h = 16 * ui;
  const x = s.w / 2 - w / 2;
  const y = s.h - 46 * ui;
  const frac = Math.min(1, Math.max(0, s.boat.speed / MAX_SPEED));
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0.02) {
    ctx.fillStyle = frac > 0.75 ? '#2e9e5b' : frac > 0.35 ? '#ffb02e' : '#ff8a3d';
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
  }
  const knots = (frac * MAX_KNOTS).toFixed(1);
  label(ctx, `${knots} knots`, s.w / 2, y - 16 * ui, 18 * ui);
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, hot: boolean): void {
  ctx.fillStyle = hot ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.26)';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

/** The tiller as the sailor sees it: pivot at the back of the boat, handle forward. */
function drawTillerControl(ctx: Ctx, s: Scene): void {
  const { tiller: t, scale: ui } = s.input.layout;
  const off = !s.input.tillerEnabled;
  const th = s.input.tiller * TILLER_MAX;
  const gx = t.px + Math.sin(th) * t.len;
  const gy = t.py - Math.cos(th) * t.len;

  ctx.save();
  if (off) ctx.globalAlpha = 0.35;
  const pw = (t.reach + 58 * ui) * 2;
  panel(
    ctx,
    t.px - pw / 2,
    t.py - t.len - 44 * ui,
    pw,
    t.len + 92 * ui,
    26 * ui,
    s.input.holdingTiller,
  );

  // The arc the handle travels along.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3 * ui;
  ctx.setLineDash([2 * ui, 9 * ui]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(t.px, t.py, t.len, -Math.PI / 2 - TILLER_MAX, -Math.PI / 2 + TILLER_MAX);
  ctx.stroke();
  ctx.setLineDash([]);

  // Rudder, tiller and handle.
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 12 * ui;
  line(ctx, t.px, t.py, t.px - Math.sin(th) * 26 * ui, t.py + Math.cos(th) * 26 * ui);
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 15 * ui;
  line(ctx, t.px, t.py, gx, gy);
  ctx.strokeStyle = '#c98f4e';
  ctx.lineWidth = 9 * ui;
  line(ctx, t.px, t.py, gx, gy);
  ctx.fillStyle = '#5b6b78';
  ctx.beginPath();
  ctx.arc(t.px, t.py, 10 * ui, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.input.holdingTiller ? '#ff8a3d' : '#ffffff';
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 4 * ui;
  ctx.beginPath();
  ctx.arc(gx, gy, 25 * ui, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  label(ctx, off ? 'TILLER (auto)' : 'TILLER', t.px, t.py + 30 * ui, 17 * ui);

  // The lesson: the boat turns the opposite way.
  if (!off && Math.abs(s.input.tiller) > 0.15) {
    const right = s.input.tiller < 0;
    label(
      ctx,
      right ? 'Boat turns right  ➜' : '⬅  Boat turns left',
      t.px,
      t.py - t.len - 62 * ui,
      17 * ui,
    );
  }
  ctx.restore();
}

/** The mainsheet: a rope with a knot you drag down to pull in, up to let out. */
function drawSheetControl(ctx: Ctx, s: Scene): void {
  const { sheet: m, scale: ui } = s.input.layout;
  const off = !s.input.sheetEnabled;
  const hy = m.bottom - s.input.sheet * (m.bottom - m.top);

  ctx.save();
  if (off) ctx.globalAlpha = 0.35;
  const pw = 124 * ui;
  panel(
    ctx,
    m.x - pw / 2,
    m.top - 62 * ui,
    pw,
    m.bottom - m.top + 128 * ui,
    26 * ui,
    s.input.holdingSheet,
  );

  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 6 * ui;
  line(ctx, m.x, m.top, m.x, m.bottom);

  // Rope from the top down to the knot.
  ctx.strokeStyle = '#f4f1e4';
  ctx.lineWidth = 8 * ui;
  line(ctx, m.x, m.top - 22 * ui, m.x, hy);
  ctx.strokeStyle = '#d64545';
  ctx.lineWidth = 8 * ui;
  ctx.setLineDash([1, 16 * ui]);
  ctx.lineDashOffset = hy;
  line(ctx, m.x, m.top - 22 * ui, m.x, hy);
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  ctx.fillStyle = s.input.holdingSheet ? '#ff8a3d' : '#ffffff';
  ctx.strokeStyle = '#d64545';
  ctx.lineWidth = 4 * ui;
  ctx.beginPath();
  ctx.arc(m.x, hy, 25 * ui, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  label(ctx, 'LET OUT ⬆', m.x, m.top - 42 * ui, 13 * ui);
  label(ctx, 'PULL IN ⬇', m.x, m.bottom + 22 * ui, 13 * ui);
  label(ctx, off ? 'AUTO' : 'MAINSHEET', m.x, m.bottom + 46 * ui, 15 * ui);
  ctx.restore();
}
