// Level 8: Who gives way. Two boats are about to meet: tap the one that must keep clear.

import { starsForMistakes, type Game, type Mode } from '../game';
import { drawBoat, label } from '../render';
import { DEG, createBoat, idealSheet, settleBoat, wrapAngle, type Boat, type Wind } from '../sim';

const WIND: Wind = { from: 0, strength: 1 }; // always from the top of the screen

type Ask =
  | 'starboard' // tap the boat on starboard tack
  | 'port' // tap the boat on port tack
  | 'tack' // opposite tacks: port gives way
  | 'windward' // same tack: the boat nearer the wind gives way
  | 'overtake'; // the boat catching up gives way (always the first boat listed)

interface Start {
  x: number;
  y: number;
  heading: number; // degrees
  speed: number;
}

interface Round {
  ask: Ask;
  boats: [Start, Start];
  title: string;
  sub: string;
  why: string;
}

const CRASH = 'These boats are about to crash! Tap the boat that must GIVE WAY.';

const ROUNDS: Round[] = [
  {
    ask: 'starboard',
    boats: [
      { x: -13, y: -4, heading: 45, speed: 0 },
      { x: 13, y: -4, heading: -45, speed: 0 },
    ],
    title: 'First, which tack is a boat on?',
    sub: 'STARBOARD tack means the wind blows onto its right side. Tap the boat on STARBOARD tack.',
    why: 'Wind on the right side, sail out on the left: starboard tack.',
  },
  {
    ask: 'port',
    boats: [
      { x: -12, y: 6, heading: 90, speed: 0 },
      { x: 12, y: -8, heading: -90, speed: 0 },
    ],
    title: 'PORT tack means the wind blows onto its left side.',
    sub: 'Tap the boat on PORT tack.',
    why: 'Wind on the left side, sail out on the right: port tack.',
  },
  {
    ask: 'tack',
    boats: [
      { x: -16, y: -12, heading: 45, speed: 3.2 },
      { x: 16, y: -12, heading: -45, speed: 3.2 },
    ],
    title: 'Rule 1: PORT gives way to STARBOARD.',
    sub: CRASH,
    why: 'The port tack boat gives way. Starboard keeps going.',
  },
  {
    ask: 'tack',
    boats: [
      { x: -20, y: 0, heading: 90, speed: 3.6 },
      { x: 20, y: 0, heading: -90, speed: 3.6 },
    ],
    title: 'Rule 1 again: PORT gives way to STARBOARD.',
    sub: CRASH,
    why: 'The port tack boat gives way. Starboard keeps going.',
  },
  {
    ask: 'windward',
    boats: [
      { x: 16, y: 11, heading: -110, speed: 3.2 },
      { x: 16, y: -11, heading: -70, speed: 3.2 },
    ],
    title: 'Rule 2: on the same tack, the boat nearer the wind gives way.',
    sub: `That boat is called the WINDWARD boat. ${CRASH}`,
    why: 'Both are on the same tack, so the windward boat gives way.',
  },
  {
    ask: 'windward',
    boats: [
      { x: -17, y: -10, heading: 62, speed: 3.2 },
      { x: -15, y: 12, heading: 112, speed: 3.2 },
    ],
    title: 'Rule 2 again: same tack, WINDWARD boat gives way.',
    sub: CRASH,
    why: 'Both are on the same tack, so the windward boat gives way.',
  },
  {
    ask: 'overtake',
    boats: [
      { x: -24, y: 0, heading: 90, speed: 4.2 },
      { x: -3, y: 0, heading: 90, speed: 1.6 },
    ],
    title: 'Rule 3: a boat catching up from behind gives way.',
    sub: CRASH,
    why: 'The boat coming from behind must go around.',
  },
  {
    ask: 'tack',
    boats: [
      { x: -14, y: -14, heading: 45, speed: 3 },
      { x: 5, y: 16, heading: 200, speed: 3 },
    ],
    title: 'Last one! Which rule is it?',
    sub: CRASH,
    why: 'Port gives way to starboard, even when one boat is running.',
  },
];

export function giveWayLevel(): Mode {
  let round = -1;
  let boats: Boat[] = [];
  let starts: Start[] = [];
  let answer = 0;
  let mistakes = 0;
  let wrong = -1;
  let wrongTimer = 0;
  let solvedTimer = 0;
  let loop = 0; // seconds into the "about to crash" replay
  let finished = false;

  const view = (g: Game) => ({
    cx: g.w / 2,
    cy: g.h * 0.6,
    ppm: Math.min(g.w, g.h * 0.85) / 60,
  });

  const next = (g: Game) => {
    round += 1;
    if (round >= ROUNDS.length) {
      if (!finished) {
        finished = true;
        g.finish(starsForMistakes(mistakes, 0, 2), 'Port gives way. Windward gives way. Overtaking gives way.');
      }
      return;
    }
    const r = ROUNDS[round];
    // Flip left and right at random so the answer can't be learnt by position.
    const flip = Math.random() < 0.5 ? -1 : 1;
    starts = r.boats.map((s) => ({ ...s, x: s.x * flip, heading: s.heading * flip }));
    boats = starts.map((s) => {
      const b = createBoat(s.x, s.y, s.heading * DEG);
      b.sheet = idealSheet(Math.abs(wrapAngle(WIND.from - b.heading)));
      settleBoat(b, WIND);
      return b;
    });
    if (r.ask === 'starboard') answer = boats[0].tack === 1 ? 0 : 1;
    else if (r.ask === 'port' || r.ask === 'tack') answer = boats[0].tack === -1 ? 0 : 1;
    else if (r.ask === 'windward') answer = boats[0].y > boats[1].y ? 0 : 1;
    else answer = 0;
    loop = 0;
    wrong = -1;
    g.say(r.title, r.sub);
  };

  return {
    start(g) {
      Object.assign(g.opts, { simulate: false, hints: 'none' });
      next(g);
    },

    update(g, dt) {
      if (wrongTimer > 0) {
        wrongTimer -= dt;
        if (wrongTimer <= 0) wrong = -1;
      }
      if (solvedTimer > 0) {
        solvedTimer -= dt;
        if (solvedTimer <= 0) next(g);
        return;
      }
      // Sail towards each other, stop just short, then replay.
      loop = (loop + dt) % 4;
      const t = Math.min(loop, 2.6);
      boats.forEach((b, i) => {
        b.x = starts[i].x + Math.sin(b.heading) * starts[i].speed * t;
        b.y = starts[i].y + Math.cos(b.heading) * starts[i].speed * t;
      });
    },

    tap(g, x, y) {
      if (solvedTimer > 0 || finished) return;
      const { cx, cy, ppm } = view(g);
      const dist = boats.map((b) => Math.hypot(cx + b.x * ppm - x, cy - b.y * ppm - y));
      const i = dist[0] < dist[1] ? 0 : 1;
      if (dist[i] > 8 * ppm) return;
      const r = ROUNDS[round];
      if (i === answer) {
        g.callout('Yes!');
        g.say('Yes!', r.why);
        solvedTimer = 3;
      } else {
        mistakes += 1;
        g.sound('wrong');
        wrong = i;
        wrongTimer = 0.8;
        g.say(r.title, `Not that one. ${r.sub}`);
      }
    },

    drawScene(g, ctx) {
      const { cx, cy, ppm } = view(g);
      const ui = g.input.layout.scale;
      const solved = solvedTimer > 0;
      const r = ROUNDS[Math.min(round, ROUNDS.length - 1)];

      ctx.fillStyle = '#2a93c9';
      ctx.fillRect(0, 0, g.w, g.h);

      // Streaks drifting down the screen with the wind.
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2 * ui;
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 137.5) % 100) / 100;
        const sy = ((i * 61.8 + g.time * 9) % 100) / 100;
        ctx.beginPath();
        ctx.moveTo(sx * g.w, sy * g.h);
        ctx.lineTo(sx * g.w, sy * g.h + 26 * ui);
        ctx.stroke();
      }

      // Wind sign, top left.
      const wx = 74 * ui;
      const wy = 74 * ui;
      const wr = 50 * ui;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a93c9';
      ctx.beginPath();
      ctx.moveTo(wx, wy + wr * 0.7);
      ctx.lineTo(wx + wr * 0.55, wy + wr * 0.05);
      ctx.lineTo(wx + wr * 0.22, wy + wr * 0.05);
      ctx.lineTo(wx + wr * 0.22, wy - wr * 0.65);
      ctx.lineTo(wx - wr * 0.22, wy - wr * 0.65);
      ctx.lineTo(wx - wr * 0.22, wy + wr * 0.05);
      ctx.lineTo(wx - wr * 0.55, wy + wr * 0.05);
      ctx.closePath();
      ctx.fill();
      label(ctx, 'WIND', wx, wy + wr + 16 * ui, 17 * ui);

      const naming = r.ask === 'starboard' || r.ask === 'port'; // just naming the tack
      const showsTack = naming || r.ask === 'tack';
      boats.forEach((b, i) => {
        const bx = cx + b.x * ppm;
        const by = cy - b.y * ppm;

        // Ring: red for a wrong tap, then red and green once solved.
        let ring = '';
        if (i === wrong) ring = '#d64545';
        else if (solved && naming) ring = i === answer ? '#2e9e5b' : '';
        else if (solved) ring = i === answer ? '#d64545' : '#2e9e5b';
        if (ring) {
          ctx.fillStyle = ring + '55';
          ctx.strokeStyle = ring;
          ctx.lineWidth = 4 * ui;
          ctx.beginPath();
          ctx.arc(bx, by, 7.5 * ppm, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(ppm, ppm);
        drawBoat(ctx, b, 2.1, g.time);
        ctx.restore();

        if (solved) {
          const lines: string[] = [];
          if (showsTack) lines.push(b.tack === 1 ? 'STARBOARD tack' : 'PORT tack');
          if (r.ask === 'windward' && i === answer) lines.push('WINDWARD');
          if (!naming) lines.push(i === answer ? 'GIVES WAY' : 'KEEPS GOING');
          // Put the words on the outside of the pair so they don't overlap.
          const other = boats[1 - i];
          const below = b.y < other.y || (b.y === other.y && i === 1);
          lines.forEach((text, n) => {
            const row = below ? n : lines.length - 1 - n;
            const off = (9.5 + row * 3.2) * ppm;
            label(ctx, text, bx, below ? by + off : by - off, 17 * ui);
          });
        }
      });
    },
  };
}
