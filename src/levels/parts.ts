// Level 1: Meet the boat. Tap every dot to learn the parts, then a quiz.

import { starsForMistakes, type Game, type Mode } from '../game';
import { drawBoat, label } from '../render';
import { createBoat } from '../sim';

type Ctx = CanvasRenderingContext2D;

interface Part {
  name: string;
  about: string;
  view: 'side' | 'top';
  x: number; // position in that view's boat units
  y: number;
  lx: number; // where the name label goes, relative to the dot, in boat units
  ly: number;
}

const PARTS: Part[] = [
  { name: 'Mast', about: 'The tall pole that holds the sail up.', view: 'side', x: 1.5, y: -4.95, lx: 0, ly: -0.5 },
  { name: 'Sail', about: 'Catches the wind to push the boat along.', view: 'side', x: -0.1, y: -3.2, lx: 0, ly: -0.5 },
  { name: 'Boom', about: 'The pole along the bottom of the sail. Duck when it swings across!', view: 'side', x: 0.7, y: -1.47, lx: 0.2, ly: -0.5 },
  { name: 'Mainsheet', about: 'The rope that pulls the sail in and lets it out.', view: 'side', x: -0.45, y: -1.08, lx: 0, ly: 0.52 },
  { name: 'Tiller', about: 'The handle you steer with.', view: 'side', x: -1.95, y: -0.96, lx: -0.4, ly: -0.5 },
  { name: 'Rudder', about: 'The fin at the back that turns the boat. The tiller moves it.', view: 'side', x: -2.75, y: 0.75, lx: 0, ly: 0.55 },
  { name: 'Centreboard', about: 'The fin under the middle. It stops the boat sliding sideways.', view: 'side', x: 0.65, y: 1.0, lx: 0, ly: 0.55 },
  { name: 'Bow', about: 'The front of the boat.', view: 'top', x: 0, y: -2.45, lx: 0, ly: -0.55 },
  { name: 'Stern', about: 'The back of the boat.', view: 'top', x: 0.75, y: 2.45, lx: 0.3, ly: 0.55 },
  { name: 'Port', about: 'The left side when you look forward. Port is red.', view: 'top', x: -1.18, y: 0.4, lx: -0.2, ly: -0.55 },
  { name: 'Starboard', about: 'The right side when you look forward. Starboard is green.', view: 'top', x: 1.18, y: 0.4, lx: 0.3, ly: -0.55 },
];

interface ViewBox {
  ox: number; // screen position of the view's origin
  oy: number;
  scale: number; // pixels per boat unit
}

interface Layout {
  side: ViewBox;
  top: ViewBox;
  dot: number;
  button: { x: number; y: number; w: number; h: number };
}

function layout(g: Game): Layout {
  const ui = g.input.layout.scale;
  const padTop = 130 * ui;
  const padBottom = 84 * ui;
  const availH = g.h - padTop - padBottom;
  const wide = g.w > g.h * 0.95;

  // Side view needs about 7 x 8.4 units, top view about 5.6 x 7.4.
  let side: ViewBox;
  let top: ViewBox;
  if (wide) {
    const sw = g.w * 0.57;
    const tw = g.w - sw;
    const scale = Math.min(sw / 7, availH / 8.4, tw / 5.6);
    side = { ox: sw / 2 + 0.2 * scale, oy: padTop + availH / 2 + 1.9 * scale, scale };
    top = { ox: sw + tw / 2, oy: padTop + availH / 2 - 0.2 * scale, scale };
  } else {
    const sh = availH * 0.53;
    const th = availH - sh;
    const scale = Math.min(g.w / 7, sh / 8.4, th / 7.4);
    side = { ox: g.w / 2 + 0.2 * scale, oy: padTop + sh / 2 + 1.9 * scale, scale };
    top = { ox: g.w / 2, oy: padTop + sh + th / 2 - 0.2 * scale, scale };
  }
  const bw = 250 * ui;
  const bh = 56 * ui;
  return {
    side,
    top,
    dot: Math.min(17 * ui, side.scale * 0.3),
    button: { x: g.w / 2 - bw / 2, y: g.h - bh - 18 * ui, w: bw, h: bh },
  };
}

function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The dinghy from the side, bow to the right. Units match the top view. */
function drawSideBoat(ctx: Ctx): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Underwater parts first, so the water tints them.
  ctx.fillStyle = '#b9c6d0';
  ctx.strokeStyle = '#7f909d';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.rect(0.35, -0.95, 0.6, 2.45); // centreboard
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b07a3f';
  ctx.strokeStyle = '#6b4a2b';
  ctx.beginPath(); // rudder
  ctx.moveTo(-2.5, -0.7);
  ctx.lineTo(-2.78, -0.7);
  ctx.lineTo(-3.0, 1.25);
  ctx.lineTo(-2.55, 1.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Water.
  ctx.fillStyle = 'rgba(42,147,201,0.62)';
  ctx.beginPath();
  ctx.roundRect(-3.6, 0, 6.9, 1.95, 0.3);
  ctx.fill();

  // Hull.
  ctx.beginPath();
  ctx.moveTo(-2.5, -0.75);
  ctx.lineTo(2.5, -0.75);
  ctx.lineTo(2.15, 0.16);
  ctx.lineTo(-2.4, 0.2);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e4572e';
  ctx.lineWidth = 0.12;
  ctx.stroke();

  // Sail.
  ctx.beginPath();
  ctx.moveTo(1.5, -1.5);
  ctx.lineTo(-1.9, -1.35);
  ctx.quadraticCurveTo(-2.0, -3.4, -1.6, -5.35);
  ctx.lineTo(1.5, -4.5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#9fb2c2';
  ctx.lineWidth = 0.07;
  ctx.fill();
  ctx.stroke();

  // Sprit, mast and boom.
  ctx.strokeStyle = '#b08d5e';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(1.5, -2.3);
  ctx.lineTo(-1.6, -5.35);
  ctx.stroke();
  ctx.strokeStyle = '#5b6b78';
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.moveTo(1.5, -0.75);
  ctx.lineTo(1.5, -4.95);
  ctx.stroke();
  ctx.strokeStyle = '#8a6a45';
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  ctx.moveTo(1.5, -1.5);
  ctx.lineTo(-1.95, -1.35);
  ctx.stroke();

  // Mainsheet.
  ctx.strokeStyle = '#d64545';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-0.45, -1.4);
  ctx.lineTo(-0.45, -0.75);
  ctx.stroke();

  // Tiller.
  ctx.strokeStyle = '#c98f4e';
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(-2.64, -0.82);
  ctx.lineTo(-1.5, -1.0);
  ctx.stroke();
}

/** A name tag: dark text on a white pill, readable over sail, hull and water. */
function tag(ctx: Ctx, text: string, x: number, y: number, size: number): void {
  ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 0.9;
  const h = size * 1.5;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(36,67,92,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#24435c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.04);
}

export function partsLevel(): Mode {
  let phase: 'explore' | 'quiz' = 'explore';
  const seen = new Set<Part>();
  const solved = new Set<Part>();
  let selected: Part | null = null;
  let order: Part[] = [];
  let question = 0;
  let mistakes = 0;
  let wrong: Part | null = null;
  let wrongTimer = 0;
  let nextTimer = 0;
  let finished = false;

  const diagram = createBoat(0, 0, 0);
  diagram.tack = 1;
  diagram.drive = 0.1;

  const where = (p: Part, l: Layout): [number, number] => {
    const v = p.view === 'side' ? l.side : l.top;
    return [v.ox + p.x * v.scale, v.oy + p.y * v.scale];
  };

  const ask = (g: Game) => {
    g.say(`Tap the ${order[question].name.toUpperCase()}`, `Question ${question + 1} of ${order.length}`);
  };

  return {
    start(g) {
      Object.assign(g.opts, { simulate: false, hints: 'none', view: 'fixed' });
      g.say('Meet the boat', 'Tap every dot to find out what it is.');
    },

    update(g, dt) {
      if (wrongTimer > 0) {
        wrongTimer -= dt;
        if (wrongTimer <= 0) wrong = null;
      }
      if (nextTimer > 0) {
        nextTimer -= dt;
        if (nextTimer <= 0) {
          question += 1;
          if (question < order.length) {
            ask(g);
          } else if (!finished) {
            finished = true;
            g.finish(starsForMistakes(mistakes, 1, 4), 'You know your way around a boat!');
          }
        }
      }
    },

    tap(g, x, y) {
      const l = layout(g);
      if (phase === 'explore' && seen.size === PARTS.length) {
        const b = l.button;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          phase = 'quiz';
          selected = null;
          order = shuffled(PARTS);
          question = 0;
          ask(g);
          return;
        }
      }

      const reach = Math.max(30, l.dot * 1.7);
      let hit: Part | null = null;
      let best = reach;
      for (const p of PARTS) {
        const [px, py] = where(p, l);
        const d = Math.hypot(px - x, py - y);
        if (d < best) {
          best = d;
          hit = p;
        }
      }
      if (!hit) return;

      if (phase === 'explore') {
        seen.add(hit);
        selected = hit;
        const left = PARTS.length - seen.size;
        const progress = left > 0 ? `${left} more to find.` : 'You found them all!';
        g.say(hit.name.toUpperCase(), `${hit.about} ${progress}`);
        return;
      }

      if (nextTimer > 0 || finished || solved.has(hit)) return;
      const want = order[question];
      if (hit === want) {
        solved.add(hit);
        g.callout('Yes!');
        nextTimer = 0.8;
      } else {
        mistakes += 1;
        g.sound('wrong');
        wrong = hit;
        wrongTimer = 0.9;
        g.say(
          `Tap the ${want.name.toUpperCase()}`,
          `That one is the ${hit.name.toLowerCase()}. Try again!`,
        );
      }
    },

    drawScene(g, ctx) {
      const l = layout(g);
      const ui = g.input.layout.scale;
      ctx.fillStyle = '#d9f0fa';
      ctx.fillRect(0, 0, g.w, g.h);

      // Side view.
      ctx.save();
      ctx.translate(l.side.ox, l.side.oy);
      ctx.scale(l.side.scale, l.side.scale);
      drawSideBoat(ctx);
      ctx.restore();
      label(ctx, 'From the side', l.side.ox - 0.2 * l.side.scale, l.side.oy + 2.5 * l.side.scale, 16 * ui, '#5b7890');

      // Top view, on a patch of water.
      ctx.fillStyle = '#2a93c9';
      ctx.beginPath();
      ctx.roundRect(
        l.top.ox - 2.6 * l.top.scale,
        l.top.oy - 3.4 * l.top.scale,
        5.2 * l.top.scale,
        7.4 * l.top.scale,
        0.5 * l.top.scale,
      );
      ctx.fill();
      ctx.save();
      ctx.translate(l.top.ox, l.top.oy);
      ctx.scale(l.top.scale, l.top.scale);
      drawBoat(ctx, diagram, 1, 0, false);
      ctx.restore();
      label(ctx, 'From above', l.top.ox, l.top.oy + 4.45 * l.top.scale, 16 * ui, '#5b7890');

      // Dots and names.
      for (const p of PARTS) {
        const [px, py] = where(p, l);
        const v = p.view === 'side' ? l.side : l.top;
        const named = phase === 'explore' ? seen.has(p) : solved.has(p);
        const pulse = 1 + 0.08 * Math.sin(g.time * 4 + px * 0.05);
        let fill = '#ffffff';
        if (p === wrong) fill = '#d64545';
        else if (phase === 'quiz' && solved.has(p)) fill = '#2e9e5b';
        else if (phase === 'explore' && p === selected) fill = '#ff8a3d';
        else if (named) fill = '#bfe6c9';

        ctx.fillStyle = fill;
        ctx.strokeStyle = '#24435c';
        ctx.lineWidth = 3 * ui;
        ctx.beginPath();
        ctx.arc(px, py, l.dot * (named ? 0.8 : pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (!named && p !== wrong) label(ctx, '?', px, py + ui, 19 * ui, '#24435c');
        if (named) {
          tag(ctx, p.name, px + p.lx * v.scale, py + p.ly * v.scale, 16 * ui);
        }
      }

      if (phase === 'explore' && seen.size === PARTS.length) {
        const b = l.button;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.roundRect(b.x, b.y + 4 * ui, b.w, b.h, b.h / 2);
        ctx.fill();
        ctx.fillStyle = '#ff8a3d';
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
        ctx.fill();
        label(ctx, 'Start the quiz  ➜', g.w / 2, b.y + b.h / 2, 22 * ui);
      }
    },
  };
}
