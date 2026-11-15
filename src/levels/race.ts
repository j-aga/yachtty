// Level 10: Buoy race. Everything together: upwind, across and downwind against the clock.

import { starsForTime, type Mode } from '../game';
import { label } from '../render';
import type { Buoy } from '../world';

interface Mark extends Buoy {
  title: string;
  sub: string;
}

const COURSE: Mark[] = [
  {
    x: 0,
    y: 75,
    color: '#ff8a3d',
    title: 'Buoy 1: the ORANGE buoy is straight upwind.',
    sub: 'Zigzag up to it by tacking. Keep the mainsheet pulled in.',
  },
  {
    x: -85,
    y: 0,
    color: '#ff5d8f',
    title: 'Buoy 2: now away from the wind to the PINK buoy.',
    sub: 'Let the mainsheet out as you turn.',
  },
  {
    x: 0,
    y: -80,
    color: '#ffd23f',
    title: 'Last one: gybe, then race to the YELLOW buoy!',
    sub: 'Duck under the boom, and keep the sail well out.',
  },
];

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function raceLevel(): Mode {
  let index = 0;
  let timer = 0;
  let finished = false;

  return {
    start(g) {
      Object.assign(g.opts, { bay: true, starOverTarget: true });
      g.buoys = COURSE;
      g.target = COURSE[0];
      g.placeBoat(0, -62, 50, 0.05);
      g.say(COURSE[0].title, COURSE[0].sub);
      g.callout('Go!');
    },

    update(g, dt) {
      if (finished) return;
      timer += dt;
      const mark = COURSE[index];
      if (Math.hypot(mark.x - g.boat.x, mark.y - g.boat.y) > 8) return;

      index += 1;
      if (index < COURSE.length) {
        g.target = COURSE[index];
        g.callout(`Buoy ${index}!`);
        g.say(COURSE[index].title, COURSE[index].sub);
      } else {
        finished = true;
        g.target = null;
        g.callout('Finish!');
        g.finish(starsForTime(timer, 90, 140), `You finished the race in ${clock(timer)}!`);
      }
    },

    draw(g, ctx) {
      const ui = g.input.layout.scale;
      label(ctx, `⏱ ${clock(timer)}`, g.w / 2, g.h - 104 * ui, 24 * ui);
    },
  };
}
