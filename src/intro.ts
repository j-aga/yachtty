// Short animated explainers shown before each level. Each slide is a little
// looping cartoon with one or two sentences that are also read aloud.

import { drawBoat, label, star } from './render';
import {
  DEG,
  NO_GO,
  clamp,
  createBoat,
  idealSheet,
  settleBoat,
  stepBoat,
  wrapAngle,
  type Boat,
  type Wind,
} from './sim';

type Ctx = CanvasRenderingContext2D;

export interface Slide {
  text: string;
  /** Draw the whole screen. `t` is seconds since the slide appeared. */
  draw(ctx: Ctx, w: number, h: number, t: number): void;
}

// ------------------------------------------------------------ toolkit ----

interface View {
  cx: number;
  cy: number;
  ppm: number; // pixels per world unit
  x: number; // world point at the centre
  y: number;
  ui: number;
}

interface FrameOptions {
  span: number; // world units across the short side
  windFrom?: number | null; // degrees; null hides the wind arrow
  x?: number;
  y?: number;
  ripples?: boolean;
}

function hash(i: number, j: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function toScreen(v: View, x: number, y: number): [number, number] {
  return [v.cx + (x - v.x) * v.ppm, v.cy - (y - v.y) * v.ppm];
}

/** Draw in world units: x east, y north, like the game. */
function inWorld(c: Ctx, v: View, draw: () => void): void {
  c.save();
  c.translate(v.cx, v.cy);
  c.scale(v.ppm, v.ppm);
  c.translate(-v.x, v.y);
  draw();
  c.restore();
}

/** Water, drifting ripples and a big WIND arrow. Returns the view to draw into. */
function frame(c: Ctx, w: number, h: number, t: number, o: FrameOptions): View {
  const ui = clamp(Math.min(w, h) / 720, 0.62, 1.15);
  const v: View = {
    cx: w / 2,
    cy: h * 0.56,
    ppm: Math.min(w, h * 0.8) / o.span,
    x: o.x ?? 0,
    y: o.y ?? 0,
    ui,
  };
  c.fillStyle = '#2a93c9';
  c.fillRect(0, 0, w, h);

  const from = o.windFrom === undefined ? 0 : o.windFrom;
  if (from !== null && o.ripples !== false) {
    // Streaks fixed to the water, sliding along with the wind.
    const a = from * DEG;
    const fx = -Math.sin(a);
    const fy = -Math.cos(a);
    const cell = o.span / 5;
    const reach = Math.hypot(w, h) / v.ppm / 2;
    inWorld(c, v, () => {
      c.strokeStyle = '#fff';
      c.lineCap = 'round';
      c.lineWidth = Math.max(0.14, 1.6 / v.ppm);
      const i0 = Math.floor((v.x - reach) / cell);
      const j0 = Math.floor((v.y - reach) / cell);
      for (let i = i0; i <= i0 + Math.ceil((2 * reach) / cell); i++) {
        for (let j = j0; j <= j0 + Math.ceil((2 * reach) / cell); j++) {
          const frac = (t * 0.3 + hash(j, i)) % 1;
          const along = (frac - 0.5) * cell * 1.5;
          const x = (i + hash(i, j)) * cell + fx * along;
          const y = (j + hash(i + 31, j + 17)) * cell + fy * along;
          c.globalAlpha = 0.3 * Math.sin(Math.PI * frac);
          c.beginPath();
          c.moveTo(x, -y);
          c.lineTo(x + fx * cell * 0.28, -(y + fy * cell * 0.28));
          c.stroke();
        }
      }
      c.globalAlpha = 1;
    });
  }

  if (from !== null) {
    // The arrow sits on the side the wind comes from and points across the scene.
    const a = from * DEG;
    const r = Math.min(w * 0.42, h * 0.3);
    const ax = v.cx + Math.sin(a) * r;
    const ay = v.cy - Math.cos(a) * r;
    const s = 30 * ui;
    c.save();
    c.translate(ax, ay);
    c.rotate(a + Math.PI);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    const bob = Math.sin(t * 3) * s * 0.15;
    c.translate(0, -bob);
    c.beginPath();
    c.moveTo(0, -s * 1.3);
    c.lineTo(s * 0.95, -s * 0.2);
    c.lineTo(s * 0.4, -s * 0.2);
    c.lineTo(s * 0.4, s * 1.1);
    c.lineTo(-s * 0.4, s * 1.1);
    c.lineTo(-s * 0.4, -s * 0.2);
    c.lineTo(-s * 0.95, -s * 0.2);
    c.closePath();
    c.fill();
    c.restore();
    label(c, 'WIND', ax + Math.cos(a) * s * 2.2, ay + Math.sin(a) * s * 2.2, 18 * ui);
  }
  return v;
}

/** Words in a white pill, so they read over anything. */
function caption(c: Ctx, v: View, text: string, x: number, y: number, color = '#24435c'): void {
  const size = 19 * v.ui;
  c.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  const wide = c.measureText(text).width + size * 1.3;
  c.fillStyle = 'rgba(255,255,255,0.94)';
  c.beginPath();
  c.roundRect(x - wide / 2, y - size * 0.95, wide, size * 1.9, size * 0.95);
  c.fill();
  label(c, text, x, y, size, color);
}

interface Control {
  tiller: number;
  sheet?: number; // leave out and the sail trims itself
}

interface Run {
  boat: Boat;
  trail: { x: number; y: number }[];
}

/**
 * Sail a boat with the real engine for `t` seconds, working the controls from
 * a script. Run again from the start each frame, so a slide can loop.
 */
function sail(
  t: number,
  wind: Wind,
  start: { x?: number; y?: number; heading: number; speed?: number; sheet?: number },
  script: (time: number, b: Boat) => Control,
): Run {
  const b = createBoat(start.x ?? 0, start.y ?? 0, start.heading * DEG);
  b.sheet = start.sheet ?? idealSheet(Math.abs(wrapAngle(wind.from - b.heading)));
  settleBoat(b, wind);
  b.speed = start.speed ?? 0;
  const trail: { x: number; y: number }[] = [];
  const dt = 1 / 30;
  const steps = Math.floor(t / dt);
  for (let n = 0; n < steps; n++) {
    const ctl = script(n * dt, b);
    b.tiller += (ctl.tiller - b.tiller) * 0.25;
    if (ctl.sheet === undefined) {
      const want = idealSheet(Math.abs(b.windAngle));
      b.sheet += clamp(want - b.sheet, -1.2 * dt, 1.2 * dt);
    } else {
      b.sheet += clamp(ctl.sheet - b.sheet, -0.6 * dt, 0.6 * dt);
    }
    stepBoat(b, wind, dt);
    if (n % 4 === 0 && b.speed > 0.8) trail.push({ x: b.x, y: b.y });
  }
  return { boat: b, trail };
}

function drawTrail(c: Ctx, trail: { x: number; y: number }[], size: number): void {
  trail.slice(-45).forEach((p, i, list) => {
    c.fillStyle = `rgba(255,255,255,${0.4 * ((i + 1) / list.length)})`;
    c.beginPath();
    c.arc(p.x, -p.y, size, 0, Math.PI * 2);
    c.fill();
  });
}

/** A boat set up to sail happily in a direction, for scenes that don't need the engine. */
function posed(x: number, y: number, headingDeg: number, wind: Wind): Boat {
  const b = createBoat(x, y, headingDeg * DEG);
  b.sheet = idealSheet(Math.abs(wrapAngle(wind.from - b.heading)));
  settleBoat(b, wind);
  return b;
}

/** Where a boat is after travelling `dist` along a zigzag of points. */
function along(points: [number, number][], dist: number): { x: number; y: number; heading: number; done: boolean } {
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const heading = Math.atan2(x2 - x1, y2 - y1) / DEG;
    if (dist <= len) {
      return { x: x1 + ((x2 - x1) * dist) / len, y: y1 + ((y2 - y1) * dist) / len, heading, done: false };
    }
    dist -= len;
  }
  const [x, y] = points[points.length - 1];
  const [px, py] = points[points.length - 2];
  return { x, y, heading: Math.atan2(x - px, y - py) / DEG, done: true };
}

function dottedPath(c: Ctx, points: [number, number][], width: number): void {
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = width;
  c.setLineDash([width * 2.5, width * 3]);
  c.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, -y) : c.lineTo(x, -y)));
  c.stroke();
  c.setLineDash([]);
}

function noGoWedge(c: Ctx, x: number, y: number, r: number, windFrom: number): void {
  const mid = windFrom * DEG - Math.PI / 2;
  c.fillStyle = 'rgba(214,69,69,0.32)';
  c.strokeStyle = 'rgba(214,69,69,0.8)';
  c.lineWidth = r * 0.015;
  c.beginPath();
  c.moveTo(x, -y);
  c.arc(x, -y, r, mid - NO_GO, mid + NO_GO);
  c.closePath();
  c.fill();
  c.stroke();
}

const NORTH: Wind = { from: 0, strength: 1 };
const RED = '#c0392b';
const GREEN = '#1e7d46';

// ------------------------------------------------------------- slides ----

const parts: Slide[] = [
  {
    text: 'A dinghy is a small sailing boat. The wind pushes on the sail, and off you go!',
    draw(c, w, h, t) {
      const run = sail(t % 9, NORTH, { heading: 90, sheet: 1 }, (time) => ({ tiller: 0, sheet: time > 1.2 ? 0.38 : 1 }));
      const v = frame(c, w, h, t, { span: 36, x: run.boat.x, y: run.boat.y });
      inWorld(c, v, () => {
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2, t);
      });
    },
  },
  {
    text: 'Every part of the boat has a name. Tap the dots to learn them, then try the quiz.',
    draw(c, w, h, t) {
      const v = frame(c, w, h, t, { span: 30, windFrom: null });
      const b = createBoat(0, 0, 0);
      b.boom = -32 * DEG;
      b.tack = 1;
      b.drive = 0.8;
      const scale = 3;
      inWorld(c, v, () => drawBoat(c, b, scale, t, false));
      // Places on the boat, in boat units: x to starboard, y towards the stern.
      const spots: [string, number, number, number][] = [
        ['Mast', 0, -1.75, 1],
        ['Sail', -0.9, -0.3, -1],
        ['Boom', -1.5, 0.75, -1],
        ['Tiller', 0, 1.6, 1],
        ['Rudder', 0, 3.1, 1],
      ];
      const lit = Math.floor(t / 1.3) % spots.length;
      spots.forEach(([name, lx, ly, side], i) => {
        const [sx, sy] = toScreen(v, lx * scale, -ly * scale);
        const on = i === lit;
        c.fillStyle = on ? '#ff8a3d' : '#ffffff';
        c.strokeStyle = '#24435c';
        c.lineWidth = 2.5 * v.ui;
        c.beginPath();
        c.arc(sx, sy, (on ? 12 + 2 * Math.sin(t * 8) : 9) * v.ui, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        if (on) caption(c, v, name, sx + side * 80 * v.ui, sy);
      });
    },
  },
];

const wind: Slide[] = [
  {
    text: "You can't see the wind, but you can see what it does. A flag always points away from the wind.",
    draw(c, w, h, t) {
      const from = [0, 90, 225][Math.floor(t / 3.2) % 3];
      const v = frame(c, w, h, t, { span: 40, windFrom: from });
      const a = from * DEG + Math.PI; // the way the wind is going
      inWorld(c, v, () => {
        // A long pennant: wide at the pole, waving to a point downwind.
        const edge = (side: number, k: number): [number, number] => {
          const d = (k / 14) * 13;
          const wave = Math.sin(d * 0.8 - t * 9) * 1.1 * (k / 14);
          const off = wave + side * 2.2 * (1 - k / 14);
          return [Math.sin(a) * d + Math.cos(a) * off, -(Math.cos(a) * d - Math.sin(a) * off)];
        };
        c.fillStyle = '#e4572e';
        c.strokeStyle = '#a8321a';
        c.lineWidth = 0.3;
        c.lineJoin = 'round';
        c.beginPath();
        for (let k = 0; k <= 14; k++) c.lineTo(...edge(1, k));
        for (let k = 14; k >= 0; k--) c.lineTo(...edge(-1, k));
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = '#c9a777';
        c.strokeStyle = '#6b4a2b';
        c.lineWidth = 0.3;
        c.beginPath();
        c.arc(0, 0, 1, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      });
    },
  },
  {
    text: 'Ripples run with the wind, and a loose sail flaps away from it. Tap where the wind is coming from.',
    draw(c, w, h, t) {
      const v = frame(c, w, h, t, { span: 34 });
      const b = createBoat(0, 0, 65 * DEG);
      b.sheet = 1;
      settleBoat(b, NORTH);
      inWorld(c, v, () => drawBoat(c, b, 2.4, t));
    },
  },
];

const WEST: Wind = { from: 270 * DEG, strength: 1 };

const tiller: Slide[] = [
  {
    text: 'The tiller steers the boat, but it works backwards! Push the tiller left and the boat turns right. Push it right and the boat turns left.',
    draw(c, w, h, t) {
      const time = t % 9;
      const script = (s: number): Control => ({ tiller: s > 1 && s < 2.4 ? -1 : s > 4.2 && s < 6.1 ? 1 : 0 });
      const run = sail(time, WEST, { heading: 0, speed: 6 }, script);
      const v = frame(c, w, h, t, { span: 38, windFrom: 270, x: run.boat.x, y: run.boat.y });
      inWorld(c, v, () => {
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2.4, t);
      });
      const push = script(time).tiller;
      const words =
        push < 0 ? 'Tiller LEFT: boat turns RIGHT' : push > 0 ? 'Tiller RIGHT: boat turns LEFT' : 'Tiller in the middle: straight ahead';
      caption(c, v, words, v.cx, v.cy + 13 * v.ppm);
    },
  },
];

const mainsheet: Slide[] = [
  {
    text: 'The mainsheet is the rope that pulls the sail in. Pull it in and the sail fills with wind. Let it out and the sail flaps and you slow down.',
    draw(c, w, h, t) {
      const time = t % 10;
      const pulled = (s: number) => s > 2 && s < 6.5;
      const run = sail(time, NORTH, { heading: 90, sheet: 1 }, (s) => ({ tiller: 0, sheet: pulled(s) ? 0.38 : 1 }));
      const v = frame(c, w, h, t, { span: 36, x: run.boat.x, y: run.boat.y });
      inWorld(c, v, () => {
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2.3, t);
      });
      caption(
        c,
        v,
        pulled(time) ? 'Pull IN: the sail fills and we go!' : 'Let OUT: the sail flaps and we stop',
        v.cx,
        v.cy + 13 * v.ppm,
      );
    },
  },
  {
    text: 'Sailing towards the wind, pull the sail in. Sailing away from the wind, let it out.',
    draw(c, w, h, t) {
      // Swing slowly between pointing near the wind and pointing away from it.
      const run = sail(t % 14, NORTH, { heading: 55, speed: 6 }, (s, b) => {
        const want = s < 1 ? 55 : s < 7 ? 160 : 55;
        return { tiller: clamp(-wrapAngle(want * DEG - b.heading) * 1.2, -0.45, 0.45) };
      });
      const v = frame(c, w, h, t, { span: 38, x: run.boat.x, y: run.boat.y });
      inWorld(c, v, () => {
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2.3, t);
      });
      const near = Math.abs(run.boat.windAngle) < 95 * DEG;
      caption(c, v, near ? 'Towards the wind: sail IN' : 'Away from the wind: sail OUT', v.cx, v.cy + 13 * v.ppm);
    },
  },
];

const noGo: Slide[] = [
  {
    text: 'No boat can sail straight into the wind. The sail just flaps and you stop. That red slice is the no go zone.',
    draw(c, w, h, t) {
      const run = sail(t % 8, NORTH, { heading: 90, speed: 6 }, (s, b) => ({
        tiller: s > 1 && Math.abs(b.windAngle) > 8 * DEG ? 1 : 0,
      }));
      const v = frame(c, w, h, t, { span: 40, x: run.boat.x, y: run.boat.y - 3 });
      inWorld(c, v, () => {
        noGoWedge(c, run.boat.x, run.boat.y, 16, 0);
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2.3, t);
      });
      const stuck = Math.abs(run.boat.windAngle) < NO_GO;
      caption(c, v, stuck ? 'Into the wind: stuck!' : 'Sailing along...', v.cx, v.cy + 13 * v.ppm, stuck ? RED : '#24435c');
    },
  },
  {
    text: 'Right beside the no go zone is close hauled. Across the wind is a reach. With the wind behind you, it is a run.',
    draw(c, w, h, t) {
      const v = frame(c, w, h, t, { span: 64 });
      const three: [string, number, number, number][] = [
        ['CLOSE HAULED', -20, 4, 47],
        ['REACH', 0, 0, 90],
        ['RUN', 20, 4, 178],
      ];
      const lit = Math.floor(t / 2.2) % 3;
      three.forEach(([name, x, y, heading], i) => {
        const bob = i === lit ? Math.sin(t * 5) * 0.6 : 0;
        const b = posed(x, y + bob, heading, NORTH);
        inWorld(c, v, () => {
          if (i === 0) noGoWedge(c, x, y, 13, 0);
          drawBoat(c, b, i === lit ? 2.5 : 2, t);
        });
        const [sx, sy] = toScreen(v, x, y - 10);
        if (i === lit) caption(c, v, name, sx, sy);
        else label(c, name, sx, sy, 15 * v.ui);
      });
    },
  },
];

const ZIG_UP: [number, number][] = [
  [-22, -46],
  [18, -6],
  [-16, 28],
  [2, 46],
];

const tacking: Slide[] = [
  {
    text: "You can't sail straight into the wind. So to get upwind, you zigzag. Each turn through the wind is called a tack.",
    draw(c, w, h, t) {
      const v = frame(c, w, h, t, { span: 150, y: 12 });
      const at = along(ZIG_UP, (t % 11) * 14);
      const b = posed(at.x, at.y, at.heading, NORTH);
      inWorld(c, v, () => {
        dottedPath(c, ZIG_UP, 0.9);
        star(c, 2, -46, 5 + Math.sin(t * 4) * 0.5);
        drawBoat(c, b, 4, t);
      });
      ZIG_UP.slice(1, 3).forEach(([x, y]) => {
        const [sx, sy] = toScreen(v, x + (x > 0 ? 15 : -15), y);
        label(c, 'TACK', sx, sy, 18 * v.ui);
      });
    },
  },
  {
    text: 'To tack, push the tiller towards the sail and hold it. The front of the boat swings through the wind, and the sail fills on the other side.',
    draw(c, w, h, t) {
      const time = t % 8;
      let turning = false;
      const run = sail(time, NORTH, { heading: 46, speed: 6 }, (s, b) => {
        turning = s > 1.6 && wrapAngle(b.heading) > -46 * DEG && (turning || s < 1.8);
        return { tiller: turning ? 1 : 0 };
      });
      const v = frame(c, w, h, t, { span: 40, x: run.boat.x, y: run.boat.y - 3 });
      inWorld(c, v, () => {
        noGoWedge(c, run.boat.x, run.boat.y, 16, 0);
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2.4, t);
      });
      const words = time < 1.6 ? 'Ready to tack...' : turning ? 'Tiller towards the sail. Hold it!' : 'Sail on the new side. Tacked!';
      caption(c, v, words, v.cx, v.cy + 13 * v.ppm, !turning && time > 1.6 ? GREEN : '#24435c');
    },
  },
];

const gybing: Slide[] = [
  {
    text: 'With the wind behind you, turning so the wind swaps sides is called a gybe. The boom swings across fast, so always duck!',
    draw(c, w, h, t) {
      const time = t % 8;
      let turning = false;
      const run = sail(time, NORTH, { heading: 140, speed: 6 }, (s, b) => {
        turning = s > 1.6 && b.heading < 222 * DEG && (turning || s < 1.8);
        return { tiller: turning ? -0.8 : 0 };
      });
      const v = frame(c, w, h, t, { span: 40, x: run.boat.x, y: run.boat.y + 2 });
      inWorld(c, v, () => {
        drawTrail(c, run.trail, 0.5);
        drawBoat(c, run.boat, 2.4, t);
      });
      const gybed = run.boat.tack === 1;
      const words = time < 1.6 ? 'Wind behind us...' : gybed ? 'The boom swings over. DUCK!' : 'Tiller away from the sail...';
      caption(c, v, words, v.cx, v.cy + 13 * v.ppm, gybed ? RED : '#24435c');
    },
  },
];

const giveWay: Slide[] = [
  {
    text: 'When two boats meet, one must give way. The big rule: a boat on port tack gives way to a boat on starboard tack.',
    draw(c, w, h, t) {
      const time = t % 9;
      // The port tack boat ducks behind the other one, then carries on.
      const port = sail(time, NORTH, { x: -22, y: -18, heading: 45, speed: 5 }, (s) => ({
        tiller: s > 1.2 && s < 2.2 ? -1 : s > 4.4 && s < 5.4 ? 1 : 0,
      }));
      const stbd = sail(time, NORTH, { x: 22, y: -18, heading: -45, speed: 5 }, () => ({ tiller: 0 }));
      const v = frame(c, w, h, t, { span: 78, y: 4 });
      inWorld(c, v, () => {
        drawTrail(c, port.trail, 0.7);
        drawTrail(c, stbd.trail, 0.7);
        drawBoat(c, port.boat, 2.6, t);
        drawBoat(c, stbd.boat, 2.6, t);
      });
      const [px, py] = toScreen(v, port.boat.x, port.boat.y - 9);
      const [sx, sy] = toScreen(v, stbd.boat.x, stbd.boat.y + 9);
      caption(c, v, 'PORT tack: gives way', px, py, RED);
      caption(c, v, 'STARBOARD tack: keeps going', sx, sy, GREEN);
    },
  },
  {
    text: 'If both boats are on the same tack, the boat nearer the wind keeps clear. And a boat catching up from behind goes around.',
    draw(c, w, h, t) {
      const time = t % 9;
      // The windward boat turns up to stay out of the way.
      const upper = sail(time, NORTH, { x: 26, y: 12, heading: -112, speed: 5 }, (s) => ({
        tiller: s > 1.6 && s < 2.3 ? -1 : 0,
      }));
      const lower = sail(time, NORTH, { x: 26, y: -12, heading: -70, speed: 5 }, () => ({ tiller: 0 }));
      const v = frame(c, w, h, t, { span: 78 });
      inWorld(c, v, () => {
        drawTrail(c, upper.trail, 0.7);
        drawTrail(c, lower.trail, 0.7);
        drawBoat(c, upper.boat, 2.6, t);
        drawBoat(c, lower.boat, 2.6, t);
      });
      const [ux, uy] = toScreen(v, upper.boat.x, upper.boat.y + 9);
      const [lx, ly] = toScreen(v, lower.boat.x, lower.boat.y - 9);
      caption(c, v, 'Nearer the wind: gives way', ux, uy, RED);
      caption(c, v, 'Keeps going', lx, ly, GREEN);
    },
  },
];

const compass: Slide[] = [
  {
    text: 'A compass tells you which way you are pointing. North, East, South, West. Never Eat Soggy Weetbix!',
    draw(c, w, h, t) {
      const v = frame(c, w, h, t, { span: 46, windFrom: null });
      const step = Math.floor(t / 1.6) % 4;
      const into = clamp((t % 1.6) / 0.5, 0, 1);
      const heading = (step - 1 + into * into * (3 - 2 * into)) * 90;
      const r = 17 * v.ppm;
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath();
      c.arc(v.cx, v.cy, r * 1.28, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a93c9';
      c.beginPath();
      c.arc(v.cx, v.cy, r * 0.74, 0, Math.PI * 2);
      c.fill();
      ['N', 'E', 'S', 'W'].forEach((letter, i) => {
        const a = i * 90 * DEG;
        const on = i === step && into >= 1;
        label(c, letter, v.cx + Math.sin(a) * r, v.cy - Math.cos(a) * r, (on ? 44 : 30) * v.ui, on ? '#e4572e' : '#24435c');
      });
      const b = createBoat(0, 0, heading * DEG);
      b.boom = -20 * DEG;
      b.drive = 0.6;
      inWorld(c, v, () => drawBoat(c, b, 3.2, t));
    },
  },
];

const COURSE: [number, number][] = [
  [0, -62],
  [45, -17],
  [-23, 51],
  [0, 75],
  [-85, 0],
  [0, -80],
];

const race: Slide[] = [
  {
    text: 'Race time! Zigzag up to the orange buoy. Sail across to the pink one. Then gybe and run down to the yellow one. Use everything you have learnt!',
    draw(c, w, h, t) {
      const v = frame(c, w, h, t, { span: 270, x: -15, y: 14 });
      const at = along(COURSE, (t % 16) * 30);
      const b = posed(at.x, at.y, at.heading, NORTH);
      const buoys: [number, number, string, string][] = [
        [0, 75, '#ff8a3d', '1'],
        [-85, 0, '#ff5d8f', '2'],
        [0, -80, '#ffd23f', '3'],
      ];
      inWorld(c, v, () => {
        dottedPath(c, COURSE, 1.5);
        for (const [x, y, color] of buoys) {
          c.fillStyle = color;
          c.strokeStyle = 'rgba(0,0,0,0.3)';
          c.lineWidth = 0.8;
          c.beginPath();
          c.arc(x, -y, 6, 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
        drawBoat(c, b, 6, t);
      });
      for (const [x, y, , n] of buoys) {
        const [sx, sy] = toScreen(v, x, y);
        label(c, n, sx, sy, 20 * v.ui, '#24435c');
      }
    },
  },
];

/** Explainer slides for each level, by level id. */
export const INTROS: Record<string, Slide[]> = {
  parts,
  wind,
  tiller,
  mainsheet,
  nogo: noGo,
  tacking,
  gybing,
  giveway: giveWay,
  compass,
  race,
};
