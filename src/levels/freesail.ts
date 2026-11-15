// Free sail: muck around in the bay and collect stars at the buoys.

import type { Mode } from '../game';
import { BUOYS } from '../world';

export function freeSail(): Mode {
  let stars = 0;
  let index = 0;
  let bannerTime = 8;

  return {
    start(g) {
      Object.assign(g.opts, { bay: true, starOverTarget: true, showStarCount: true });
      g.buoys = BUOYS;
      g.target = BUOYS[0];
      g.placeBoat(0, 0, 90, 0.45);
      g.setStarCount(0);
      g.say('Free sail', 'Sail to the star. How many can you collect?');
    },

    update(g, dt) {
      if (bannerTime > 0) {
        bannerTime -= dt;
        if (bannerTime <= 0) g.say('');
      }
      const buoy = BUOYS[index];
      if (Math.hypot(buoy.x - g.boat.x, buoy.y - g.boat.y) < 7) {
        stars += 1;
        index = (index + 1) % BUOYS.length;
        g.target = BUOYS[index];
        g.setStarCount(stars);
        g.callout('⭐ Star!');
      }
    },
  };
}
