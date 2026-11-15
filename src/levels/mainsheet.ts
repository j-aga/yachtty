// Level 4: The mainsheet. The boat steers itself.

import { starsForTime, type Game, type Mode } from '../game';
import { DEG, wrapAngle } from '../sim';

interface Step {
  heading: number; // degrees the boat steers to
  title: string;
  sub: string;
  goal: 'go' | 'stop';
  hold: number; // seconds the goal must last
  done: string; // shown when the step is finished
}

const STEPS: Step[] = [
  {
    heading: 90,
    title: 'This rope is the mainsheet. It pulls the sail in.',
    sub: 'The sail is flapping. PULL IN the mainsheet until the boat goes fast.',
    goal: 'go',
    hold: 1.5,
    done: 'The sail is full!',
  },
  {
    heading: 90,
    title: 'Letting the sail out is your brake.',
    sub: 'LET OUT the mainsheet all the way to slow right down.',
    goal: 'stop',
    hold: 0,
    done: 'Nice stop!',
  },
  {
    heading: 90,
    title: 'When in doubt, let it out!',
    sub: 'Now PULL IN again to get going.',
    goal: 'go',
    hold: 1,
    done: 'Off we go!',
  },
  {
    heading: 160,
    title: "We're turning away from the wind.",
    sub: 'The sail wants to go OUT. Let the mainsheet out until it says Great sailing!',
    goal: 'go',
    hold: 1.5,
    done: 'Sail out, wind behind!',
  },
  {
    heading: 50,
    title: "Now we're turning towards the wind.",
    sub: 'The sail wants to come IN. Pull the mainsheet in until it says Great sailing!',
    goal: 'go',
    hold: 1.5,
    done: 'Sail in, close to the wind!',
  },
  {
    heading: 90,
    title: 'Now sideways to the wind.',
    sub: 'The sail goes about HALF way. Find the spot that says Great sailing!',
    goal: 'go',
    hold: 1.5,
    done: 'Perfect!',
  },
];

export function mainsheetLevel(): Mode {
  let index = 0;
  let held = 0;
  let timer = 0;
  let finished = false;

  const begin = (g: Game) => {
    const s = STEPS[index];
    g.opts.autoSteer = s.heading * DEG;
    held = 0;
    g.say(s.title, s.sub);
  };

  return {
    start(g) {
      Object.assign(g.opts, { tiller: false, hints: 'all' });
      g.placeBoat(-120, 20, 90, 1);
      begin(g);
    },

    update(g, dt) {
      if (finished) return;
      timer += dt;
      const s = STEPS[index];
      const onCourse = Math.abs(wrapAngle(s.heading * DEG - g.boat.heading)) < 6 * DEG;
      const ok =
        s.goal === 'stop' ? g.boat.speed < 2 && g.boat.sheet > 0.6 : onCourse && g.boat.trim === 'good';
      held = ok ? held + dt : 0;
      if (!ok || held < s.hold) return;

      index += 1;
      if (index < STEPS.length) {
        g.callout(s.done);
        begin(g);
      } else {
        finished = true;
        g.finish(
          starsForTime(timer, 75, 120),
          'Close to the wind: pull in. Away from the wind: let out.',
        );
      }
    },
  };
}
