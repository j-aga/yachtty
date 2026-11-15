// Level 7: Gybing. Turn the back of the boat through the wind, then zigzag downwind.

import { starsForTime, type Game, type Mode } from '../game';
import { DEG } from '../sim';

const STARS = 4;
const SIDE = (t: number) => (t > 0 ? 'RIGHT' : 'LEFT');

export function gybingLevel(): Mode {
  let step = 0;
  let from = 0; // heading at the start of the current step
  let tack = 1; // which tack the boat was on at the start of the current step
  let warned = false;
  let timer = 0;
  let count = 0;
  let finished = false;

  // To gybe, the tiller goes away from the sail: towards where the sailor sits.
  const awayFromSail = () => SIDE(tack);

  const ask = (g: Game, title: string) => {
    from = g.boat.heading;
    tack = g.boat.tack;
    warned = false;
    g.say(
      title,
      `Pull the tiller away from the sail (${awayFromSail()}) and HOLD it until the boom swings across.`,
    );
  };

  const progress = (g: Game) =>
    g.say('Zigzag down to the stars!', `You have the mainsheet too: watch the hints. ⭐ ${count} of ${STARS}`);

  return {
    start(g) {
      Object.assign(g.opts, { sheet: false, autoTrim: true, hints: 'steering' });
      g.placeBoat(0, 0, 135, 0.7);
      g.boat.speed = 5;
      ask(g, 'With the wind behind you, turning it to the other side is called GYBING.');
    },

    update(g, dt, events) {
      if (finished) return;

      if (step < 2) {
        // Turning up towards the wind instead of away from it?
        const up = ((g.boat.heading - from) / DEG) * tack;
        if (events.includes('gybe')) {
          step += 1;
          if (step === 1) {
            ask(g, 'You gybed! The boom swings over fast, so always duck.');
          } else {
            // Stars down the wind, each one a gybe away from the last.
            const side = -g.boat.tack; // the side the boat is sailing towards
            let x = g.boat.x;
            let y = g.boat.y;
            for (let i = 0; i < STARS; i++) {
              x += (i === 0 ? 40 : 70) * (i % 2 === 0 ? side : -side);
              y -= i === 0 ? 30 : 45;
              g.markers.push({ x, y, done: false });
            }
            g.target = g.markers[0];
            // Hand over the mainsheet as well.
            Object.assign(g.opts, { sheet: true, autoTrim: false, hints: 'all' });
            g.input.sheetEnabled = true;
            g.callout('Ready to zigzag!');
            progress(g);
          }
        } else if (events.includes('tack')) {
          ask(g, 'That was a tack: the long way round! Try again with the wind behind you.');
        } else if (up > 50 && !warned) {
          warned = true;
          g.sound('wrong');
          g.say(
            "Oops, we're turning towards the wind!",
            `Pull the tiller the other way (${awayFromSail()}), away from the sail.`,
          );
        }
        return;
      }

      timer += dt;
      const next = g.markers[count];
      if (Math.hypot(next.x - g.boat.x, next.y - g.boat.y) < 6.5) {
        next.done = true;
        count += 1;
        g.target = g.markers[count] ?? null;
        if (count === STARS) {
          finished = true;
          g.finish(starsForTime(timer, 55, 90), 'You can gybe! Remember to duck under the boom.');
        } else {
          g.callout('⭐ Now gybe!');
          progress(g);
        }
      }
    },
  };
}
