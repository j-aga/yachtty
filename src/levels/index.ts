import type { LevelDef } from '../game';
import { compassLevel } from './compass';
import { freeSail } from './freesail';
import { giveWayLevel } from './giveway';
import { gybingLevel } from './gybing';
import { mainsheetLevel } from './mainsheet';
import { noGoLevel } from './nogo';
import { partsLevel } from './parts';
import { raceLevel } from './race';
import { tackingLevel } from './tacking';
import { tillerLevel } from './tiller';
import { windLevel } from './wind';

export const LEVELS: LevelDef[] = [
  { id: 'parts', title: 'Meet the boat', blurb: 'Learn the parts of a dinghy.', icon: '⛵', make: partsLevel },
  { id: 'wind', title: 'Find the wind', blurb: 'Spot where the wind is coming from.', icon: '🚩', make: windLevel },
  { id: 'tiller', title: 'Steer with the tiller', blurb: 'Push left to go right!', icon: '🧭', make: tillerLevel },
  { id: 'mainsheet', title: 'The mainsheet', blurb: 'Pull in to go, let out to slow.', icon: '🪢', make: mainsheetLevel },
  { id: 'nogo', title: 'The no-go zone', blurb: 'Close hauled, reach and run.', icon: '⛔', make: noGoLevel },
  { id: 'tacking', title: 'Tacking', blurb: 'Zigzag up into the wind.', icon: '↩️', make: tackingLevel },
  { id: 'gybing', title: 'Gybing', blurb: 'Turn with the wind behind. Duck!', icon: '💨', make: gybingLevel },
  { id: 'giveway', title: 'Who gives way', blurb: 'Port, starboard and keeping clear.', icon: '🚦', make: giveWayLevel },
  { id: 'compass', title: 'Compass', blurb: 'Steer north, east, south and west.', icon: '🗺️', make: compassLevel },
  { id: 'race', title: 'Buoy race', blurb: 'Put it all together against the clock.', icon: '🏁', make: raceLevel },
];

export const FREE_SAIL: LevelDef = {
  id: 'free',
  title: 'Free sail',
  blurb: 'Sail around the bay and collect stars.',
  icon: '🌊',
  make: freeSail,
};

/** Levels still to be built, shown greyed out on the home screen. */
export const COMING_SOON: string[] = [];
