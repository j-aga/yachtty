// Level 3: Steer with the tiller. The mainsheet looks after itself.

import { starsForTime, type Mode } from '../game';
import { DEG } from '../sim';

const STARS = 6;

export function tillerLevel(): Mode {
  let step = 0;
  let from = 0; // heading at the start of the current step
  let warned = false;
  let steady = 0;
  let timer = 0;
  let count = 0;
  let finished = false;

  return {
    start(g) {
      Object.assign(g.opts, { sheet: false, autoTrim: true, hints: 'steering' });
      g.placeBoat(-150, 0, 90, 0.4);
      from = g.boat.heading;
      g.say('This is the tiller. It steers the boat.', 'Push the tiller LEFT and hold it there.');
    },

    update(g, dt) {
      // Headings go up when the boat turns right, down when it turns left.
      const turned = (g.boat.heading - from) / DEG;

      if (step === 0) {
        if (turned >= 35) {
          step = 1;
          from = g.boat.heading;
          warned = false;
          g.callout('The boat turned RIGHT!');
          g.say('Tiller left, boat turns right!', 'Now push the tiller RIGHT and hold it there.');
        } else if (turned <= -15 && !warned) {
          warned = true;
          g.say('Oops, that turned us left!', 'Push the tiller the other way: to the LEFT.');
        }
      } else if (step === 1) {
        if (turned <= -50) {
          step = 2;
          g.callout('The boat turned LEFT!');
          g.say('Tiller right, boat turns left!', 'Now let go. The tiller goes back to the middle and the boat sails straight.');
        } else if (turned >= 15 && !warned) {
          warned = true;
          g.say('Oops, that turned us right!', 'Push the tiller the other way: to the RIGHT.');
        }
      } else if (step === 2) {
        steady = Math.abs(g.boat.tiller) < 0.1 ? steady + dt : 0;
        if (steady >= 1.5) {
          step = 3;
          // A zigzag of stars heading east, across the wind.
          for (let i = 0; i < STARS; i++) {
            g.markers.push({
              x: g.boat.x + 34 + 32 * i,
              y: g.boat.y + (i % 2 === 0 ? 10 : -10),
              done: false,
            });
          }
          g.target = g.markers[0];
          g.say('Now steer through the stars!', `⭐ 0 of ${STARS}`);
        }
      } else if (!finished) {
        timer += dt;
        const next = g.markers[count];
        if (Math.hypot(next.x - g.boat.x, next.y - g.boat.y) < 5.5) {
          next.done = true;
          count += 1;
          g.target = g.markers[count] ?? null;
          g.say('Now steer through the stars!', `⭐ ${count} of ${STARS}`);
          if (count === STARS) {
            finished = true;
            g.finish(starsForTime(timer, 55, 85), 'You can steer with the tiller!');
          } else {
            g.callout('⭐');
          }
        }
      }
    },
  };
}
