// Level 5: The no-go zone and the points of sail. The mainsheet looks after itself.

import { starsForTime, type Game, type Mode } from '../game';
import { label } from '../render';
import { DEG, NO_GO } from '../sim';

type PointOfSail = 'nogo' | 'close' | 'reach' | 'broad' | 'run';

const NAMES: Record<PointOfSail, string> = {
  nogo: 'NO-GO ZONE',
  close: 'CLOSE HAULED',
  reach: 'REACH',
  broad: 'BROAD REACH',
  run: 'RUN',
};

/** Which point of sail is the boat on, from the angle between the bow and the wind? */
export function pointOfSail(absWindAngle: number): PointOfSail {
  if (absWindAngle < NO_GO) return 'nogo';
  if (absWindAngle < 62 * DEG) return 'close';
  if (absWindAngle < 112 * DEG) return 'reach';
  if (absWindAngle < 150 * DEG) return 'broad';
  return 'run';
}

interface Step {
  want: PointOfSail;
  title: string;
  sub: string;
  hold: number;
  done: string;
}

const LESSON: Step[] = [
  {
    want: 'nogo',
    title: 'The red slice is the NO-GO ZONE.',
    sub: 'Push the tiller RIGHT to turn the boat into the wind. See what happens!',
    hold: 1.5,
    done: 'The sail is just flapping!',
  },
  {
    want: 'close',
    title: 'No boat can sail straight into the wind.',
    sub: 'Steer away from the wind, just until the sail fills. Then let go.',
    hold: 2,
    done: 'CLOSE HAULED: as near the wind as you can go.',
  },
  {
    want: 'reach',
    title: 'Close hauled means sailing right beside the no-go zone.',
    sub: 'Now turn further away, until the wind blows across the boat.',
    hold: 2,
    done: 'A REACH: the fastest way to sail!',
  },
  {
    want: 'run',
    title: 'A reach is across the wind.',
    sub: 'Keep turning away until the wind is right behind you.',
    hold: 2,
    done: 'A RUN: the wind pushes you along.',
  },
];

const ORDERS: PointOfSail[] = ['reach', 'close', 'run', 'close'];

export function noGoLevel(): Mode {
  let index = 0;
  let held = 0;
  let timer = 0;
  let finished = false;

  const order = (g: Game) => {
    const n = index - LESSON.length;
    const what = ORDERS[n] === 'close' ? 'sail CLOSE HAULED' : `sail on a ${NAMES[ORDERS[n]]}`;
    g.say(`Captain's orders: ${what}!`, `Order ${n + 1} of ${ORDERS.length}`);
  };

  return {
    start(g) {
      // No "steer away" hint at first: we want the boat to find the no-go zone.
      Object.assign(g.opts, { sheet: false, autoTrim: true, hints: 'none', noGoAlways: true });
      g.placeBoat(0, 0, 90, 0.4);
      g.say(LESSON[0].title, LESSON[0].sub);
    },

    update(g, dt) {
      if (finished) return;
      const lesson = index < LESSON.length;
      if (!lesson) timer += dt;

      const want = lesson ? LESSON[index].want : ORDERS[index - LESSON.length];
      const hold = lesson ? LESSON[index].hold : 1.2;
      const now = pointOfSail(Math.abs(g.boat.windAngle));
      // Close hauled only counts once the sail has filled.
      const ok = now === want && !(want === 'close' && g.boat.trim === 'pinching');
      held = ok ? held + dt : 0;
      if (held < hold) return;

      held = 0;
      index += 1;
      g.opts.hints = 'steering';
      if (index < LESSON.length) {
        g.callout(LESSON[index - 1].done);
        g.say(LESSON[index].title, LESSON[index].sub);
      } else if (index < LESSON.length + ORDERS.length) {
        g.callout(lesson ? LESSON[index - 1].done : 'Aye aye!');
        order(g);
      } else {
        finished = true;
        g.finish(
          starsForTime(timer, 30, 50),
          'Close hauled, reach and run. And never straight into the no-go zone!',
        );
      }
    },

    draw(g, ctx) {
      const ui = g.input.layout.scale;
      const now = pointOfSail(Math.abs(g.boat.windAngle));
      label(ctx, NAMES[now], g.w / 2, g.h - 104 * ui, 24 * ui, now === 'nogo' ? '#ffd9d2' : '#fff');
    },
  };
}
