// Level 6: Tacking. Turn the bow through the wind, then zigzag to stars upwind.

import { starsForTime, type Game, type Mode } from '../game';
import { DEG } from '../sim';

const STARS = 4;
const SIDE = (t: number) => (t > 0 ? 'RIGHT' : 'LEFT');

export function tackingLevel(): Mode {
  let step = 0;
  let from = 0; // heading at the start of the current step
  let tack = 1; // which tack the boat was on at the start of the current step
  let warned = false;
  let timer = 0;
  let count = 0;
  let finished = false;

  // To tack, the tiller goes towards the sail: away from where the sailor sits.
  const towardsSail = () => SIDE(-tack);

  const ask = (g: Game, title: string) => {
    from = g.boat.heading;
    tack = g.boat.tack;
    warned = false;
    g.say(
      title,
      `Push the tiller towards the sail (${towardsSail()}) and HOLD it until the sail fills on the other side.`,
    );
  };

  const progress = (g: Game) =>
    g.say('Zigzag up to the stars!', `You have the mainsheet too: keep it pulled in. ⭐ ${count} of ${STARS}`);

  return {
    start(g) {
      Object.assign(g.opts, { sheet: false, autoTrim: true, hints: 'none', noGoAlways: true });
      g.placeBoat(0, 0, 48, 0.05);
      g.boat.speed = 5;
      ask(g, 'Turning the front of the boat through the wind is called TACKING.');
    },

    update(g, dt, events) {
      if (finished) return;

      if (step < 2) {
        // Turning away from the wind instead of through it?
        const away = ((g.boat.heading - from) / DEG) * -tack;
        if (events.includes('tack')) {
          step += 1;
          if (step === 1) {
            ask(g, 'You tacked! The sail swapped sides, and so did you.');
          } else {
            // Stars up the wind, each one a tack away from the last.
            const side = -g.boat.tack; // the side the boat is sailing towards
            let x = g.boat.x;
            let y = g.boat.y;
            for (let i = 0; i < STARS; i++) {
              x += (i === 0 ? 40 : 62) * (i % 2 === 0 ? side : -side);
              y += i === 0 ? 34 : 50;
              g.markers.push({ x, y, done: false });
            }
            g.target = g.markers[0];
            // Hand over the mainsheet as well.
            Object.assign(g.opts, { sheet: true, autoTrim: false, hints: 'all' });
            g.input.sheetEnabled = true;
            g.callout('Ready to zigzag!');
            progress(g);
          }
        } else if (away > 50 && !warned) {
          warned = true;
          g.sound('wrong');
          g.say(
            "Oops, we're turning away from the wind!",
            `Push the tiller the other way (${towardsSail()}), towards the sail.`,
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
          g.finish(starsForTime(timer, 60, 95), 'You can tack! Zigzag to get anywhere upwind.');
        } else {
          g.callout('⭐ Now tack!');
          progress(g);
        }
      }
    },
  };
}
