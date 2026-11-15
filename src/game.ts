import type { Input } from './controls';
import type { Marker, Point } from './render';
import type { Boat, SailEvent, Wind } from './sim';
import type { Buoy } from './world';

/** What a level can switch on and off. Reset to DEFAULTS before each level starts. */
export interface Options {
  simulate: boolean; // run the sailing engine
  view: 'toggle' | 'fixed'; // toggle = boat/map view button; fixed = still camera at the origin
  span: number; // world units across the short side in the fixed view
  bay: boolean; // beach all round, or open water
  ripples: boolean;
  noGo: boolean; // show the no-go wedge when the boat is near it
  noGoAlways: boolean; // keep the wedge on screen all the time
  showBoat: boolean;
  showWind: boolean;
  showCompass: boolean;
  showSpeed: boolean;
  showControls: boolean;
  tiller: boolean; // can the player move the tiller?
  sheet: boolean; // can the player move the mainsheet?
  autoTrim: boolean; // the game sets the mainsheet
  autoSteer: number | null; // the game steers to this heading (radians)
  hints: 'all' | 'steering' | 'none';
  starOverTarget: boolean;
  showStarCount: boolean;
}

export const DEFAULTS: Options = {
  simulate: true,
  view: 'toggle',
  span: 60,
  bay: false,
  ripples: true,
  noGo: true,
  noGoAlways: false,
  showBoat: true,
  showWind: true,
  showCompass: true,
  showSpeed: true,
  showControls: true,
  tiller: true,
  sheet: true,
  autoTrim: false,
  autoSteer: null,
  hints: 'all',
  starOverTarget: false,
  showStarCount: false,
};

/** Where the fixed camera's centre sits down the screen, as a fraction of the height. */
export const FIXED_CY = 0.56;

/** Everything a level can read and change. */
export interface Game {
  boat: Boat;
  wind: Wind;
  input: Input;
  opts: Options;
  buoys: Buoy[];
  markers: Marker[];
  flag: Point | null;
  target: Point | null;
  time: number;
  w: number;
  h: number;
  /** Put the boat somewhere, stopped, on the right tack for the wind. */
  placeBoat(x: number, y: number, headingDeg: number, sheet: number): void;
  /** Set the instruction banner. Empty strings hide it. */
  say(title: string, sub?: string): void;
  /** Flash a big message in the middle of the screen. */
  callout(text: string): void;
  setStarCount(n: number): void;
  /** End the level and show the stars earned (1 to 3). */
  finish(stars: number, message: string): void;
}

/** One run of a level or of free sail. */
export interface Mode {
  start(g: Game): void;
  update(g: Game, dt: number, events: SailEvent[]): void;
  /** Extra drawing on top of the world, in screen pixels. */
  draw?(g: Game, ctx: CanvasRenderingContext2D): void;
  /** Draw the whole screen instead of the sailing world. */
  drawScene?(g: Game, ctx: CanvasRenderingContext2D): void;
  tap?(g: Game, x: number, y: number): void;
}

export interface LevelDef {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  make(): Mode;
}

/** Stars for finishing quickly: 3 if under `fast` seconds, 2 if under `ok`, else 1. */
export function starsForTime(seconds: number, fast: number, ok: number): number {
  return seconds <= fast ? 3 : seconds <= ok ? 2 : 1;
}

/** Stars for few mistakes: 3 if at most `few`, 2 if at most `some`, else 1. */
export function starsForMistakes(mistakes: number, few: number, some: number): number {
  return mistakes <= few ? 3 : mistakes <= some ? 2 : 1;
}
