// Level 2: Find the wind. Read the clues and tap where the wind is coming from.

import { FIXED_CY, starsForMistakes, type Game, type Mode } from '../game';
import { DEG } from '../sim';

type Clue = 'flag' | 'ripples' | 'sail' | 'all';

interface Round {
  clue: Clue;
  title: string;
  sub: string;
}

const ASK = 'Tap where the wind is COMING FROM.';

const ROUNDS: Round[] = [
  { clue: 'flag', title: 'The wind is invisible, but it leaves clues!', sub: `A flag points AWAY from the wind. ${ASK}` },
  { clue: 'flag', title: 'The wind has changed.', sub: `Look at the flag. ${ASK}` },
  { clue: 'ripples', title: 'Now watch the water.', sub: `Ripples move WITH the wind. ${ASK}` },
  { clue: 'ripples', title: 'The wind has changed again.', sub: `Watch the ripples. ${ASK}` },
  { clue: 'sail', title: 'Now look at the sail.', sub: `A loose sail flaps like a flag. ${ASK}` },
  { clue: 'all', title: 'Last one! Use all the clues.', sub: ASK },
];

export function windLevel(): Mode {
  let round = -1;
  let answer = 0; // 0..7, each 45 degrees round from north
  let mistakes = 0;
  let wrong = -1;
  let wrongTimer = 0;
  let solvedTimer = 0;
  let finished = false;

  const ring = (g: Game) => {
    const ui = g.input.layout.scale;
    const cx = g.w / 2;
    const cy = g.h * FIXED_CY;
    const r = Math.min(
      Math.min(g.w, g.h) * 0.36,
      g.h * (1 - FIXED_CY) - 50 * ui, // clear of the bottom edge
      cy - 172 * ui, // clear of the instructions at the top
    );
    return { cx, cy, r, size: 34 * ui };
  };

  const next = (g: Game) => {
    round += 1;
    if (round >= ROUNDS.length) {
      if (!finished) {
        finished = true;
        g.finish(starsForMistakes(mistakes, 0, 2), 'You can find the wind!');
      }
      return;
    }
    const { clue, title, sub } = ROUNDS[round];
    let pick = answer;
    while (pick === answer) pick = Math.floor(Math.random() * 8);
    answer = pick;
    g.wind.from = answer * 45 * DEG;

    g.opts.ripples = clue === 'ripples' || clue === 'all';
    g.opts.showBoat = clue === 'sail' || clue === 'all';
    g.flag = clue === 'flag' ? { x: 0, y: 0 } : clue === 'all' ? { x: 11, y: 7 } : null;

    // Park the boat with a loose sail so it streams away from the wind.
    const side = Math.random() < 0.5 ? 1 : -1;
    g.placeBoat(0, 0, (g.wind.from + side * (40 + Math.random() * 30) * DEG) / DEG, 1);
    g.say(title, sub);
  };

  return {
    start(g) {
      Object.assign(g.opts, {
        simulate: false,
        view: 'fixed',
        span: 62,
        noGo: false,
        showWind: false,
        showCompass: false,
        showSpeed: false,
        showControls: false,
        hints: 'none',
      });
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
      }
    },

    tap(g, x, y) {
      if (solvedTimer > 0 || finished) return;
      const { cx, cy, r, size } = ring(g);
      for (let i = 0; i < 8; i++) {
        const a = i * 45 * DEG;
        const bx = cx + Math.sin(a) * r;
        const by = cy - Math.cos(a) * r;
        if (Math.hypot(bx - x, by - y) > size * 1.35) continue;
        if (i === answer) {
          g.callout('Yes!');
          g.say('Yes! The wind is coming from there.', 'It blows across the water to the other side.');
          solvedTimer = 1.7;
        } else {
          mistakes += 1;
          g.sound('wrong');
          wrong = i;
          wrongTimer = 0.8;
          const opposite = (i + 4) % 8 === answer;
          g.say(
            ROUNDS[round].title,
            opposite
              ? "That's where the wind is GOING. Tap the other side!"
              : 'Not quite. Look again and tap where the wind is COMING FROM.',
          );
        }
        return;
      }
    },

    draw(g, ctx) {
      const { cx, cy, r, size } = ring(g);
      const solved = solvedTimer > 0;

      // Once solved, show the wind blowing across the screen.
      if (solved) {
        const a = answer * 45 * DEG;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a + Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const len = r * 0.62;
        const wid = size * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -len);
        ctx.lineTo(wid * 2.2, -len + wid * 2.6);
        ctx.lineTo(wid, -len + wid * 2.6);
        ctx.lineTo(wid, len);
        ctx.lineTo(-wid, len);
        ctx.lineTo(-wid, -len + wid * 2.6);
        ctx.lineTo(-wid * 2.2, -len + wid * 2.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < 8; i++) {
        const a = i * 45 * DEG;
        const bx = cx + Math.sin(a) * r;
        const by = cy - Math.cos(a) * r;
        let fill = 'rgba(255,255,255,0.9)';
        if (solved && i === answer) fill = '#2e9e5b';
        else if (i === wrong) fill = '#d64545';
        const lit = fill !== 'rgba(255,255,255,0.9)';

        ctx.save();
        ctx.translate(bx, by);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.arc(0, 4, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        // A small arrow pointing in, the way wind from here would blow.
        ctx.rotate(a + Math.PI);
        ctx.fillStyle = lit ? '#ffffff' : '#2a93c9';
        const s = size * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.85, 0);
        ctx.lineTo(s * 0.32, 0);
        ctx.lineTo(s * 0.32, s);
        ctx.lineTo(-s * 0.32, s);
        ctx.lineTo(-s * 0.32, 0);
        ctx.lineTo(-s * 0.85, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
  };
}
