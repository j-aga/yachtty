// Level 9: The compass. Steer by compass direction, then follow directions to hidden stars.

import { starsForTime, type Game, type Mode } from '../game';
import { DEG, compassName, wrapAngle } from '../sim';

interface Order {
  heading: number; // degrees
  title: string;
  sub?: string;
}

const ORDERS: Order[] = [
  {
    heading: 90,
    title: 'The compass shows which way the boat is pointing.',
    sub: 'N, E, S, W: Never Eat Soggy Weetbix! Steer EAST and hold it steady.',
  },
  { heading: 180, title: 'Now steer SOUTH.' },
  { heading: 270, title: 'Now steer WEST.' },
  { heading: 135, title: 'Half way between south and east is SOUTH-EAST. Steer SOUTH-EAST.' },
];

const LEGS = [225, 90, 315]; // the way to each hidden star, in degrees
const LEG_LENGTH = 55;

type Phase = 'orders' | 'north' | 'zig' | 'zag' | 'hunt';

export function compassLevel(): Mode {
  let phase: Phase = 'orders';
  let index = 0;
  let held = 0;
  let timer = 0;
  let legTime = 0;
  let finished = false;

  const pointing = (g: Game, deg: number, within: number) =>
    Math.abs(wrapAngle(deg * DEG - g.boat.heading)) < within * DEG;

  const WATCH = 'Watch the compass in the top corner.';

  const leg = (g: Game) => {
    const dir = LEGS[index] * DEG;
    const from = index === 0 ? g.boat : g.markers[index - 1];
    const star = {
      x: from.x + Math.sin(dir) * LEG_LENGTH,
      y: from.y + Math.cos(dir) * LEG_LENGTH,
      done: false,
    };
    g.markers.push(star);
    g.target = null; // no arrow: the compass is the only clue
    legTime = 0;
    g.say(
      `Hidden star ${index + 1} of ${LEGS.length}: sail ${compassName(dir).toUpperCase()}!`,
      'Keep the compass steady and the star will appear.',
    );
  };

  return {
    start(g) {
      Object.assign(g.opts, { sheet: false, autoTrim: true, hints: 'steering' });
      g.placeBoat(0, 0, 180, 1);
      g.boat.speed = 4;
      g.say(ORDERS[0].title, ORDERS[0].sub);
    },

    update(g, dt) {
      if (finished) return;

      if (phase === 'orders') {
        held = pointing(g, ORDERS[index].heading, 10) ? held + dt : 0;
        if (held < 1.5) return;
        held = 0;
        index += 1;
        g.callout('Aye aye!');
        if (index < ORDERS.length) {
          g.say(ORDERS[index].title, ORDERS[index].sub ?? WATCH);
        } else {
          phase = 'north';
          g.opts.hints = 'none';
          g.say('Now try to steer NORTH.', 'The wind is coming from the north today...');
        }
      } else if (phase === 'north') {
        held = pointing(g, 0, 15) ? held + dt : 0;
        if (held < 1) return;
        held = 0;
        phase = 'zig';
        g.opts.hints = 'steering';
        g.callout('No-go zone!');
        g.say(
          "North is where the wind comes from, so it's in the no-go zone!",
          'To go north you zigzag. First steer NORTH-EAST.',
        );
      } else if (phase === 'zig' || phase === 'zag') {
        held = pointing(g, phase === 'zig' ? 45 : -45, 10) ? held + dt : 0;
        if (held < 1.5) return;
        held = 0;
        if (phase === 'zig') {
          phase = 'zag';
          g.callout('Aye aye!');
          g.say('Now tack and steer NORTH-WEST.', 'North-east, then north-west: that zigzag takes you north.');
        } else {
          phase = 'hunt';
          index = 0;
          g.callout('Treasure hunt!');
          leg(g);
        }
      } else {
        timer += dt;
        legTime += dt;
        const star = g.markers[index];
        // Lost? After a while, bring back the arrow.
        if (legTime > 22 && g.target !== star) {
          g.target = star;
          g.say(`Hidden star ${index + 1} of ${LEGS.length}`, 'Here is an arrow to help. Follow it to the star.');
        }
        if (Math.hypot(star.x - g.boat.x, star.y - g.boat.y) < 7) {
          star.done = true;
          g.target = null;
          index += 1;
          if (index === LEGS.length) {
            finished = true;
            g.finish(starsForTime(timer, 50, 80), 'You can steer by compass!');
          } else {
            g.callout('⭐ Found it!');
            leg(g);
          }
        }
      }
    },
  };
}
