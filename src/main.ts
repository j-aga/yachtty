import {
  hush,
  noteLines,
  play,
  setSoundOn,
  soundOn,
  speak,
  speaking,
  spokenLines,
  unlockAudio,
} from './audio';
import { Input, computeLayout } from './controls';
import { DEFAULTS, FIXED_CY, type Game, type LevelDef, type Mode } from './game';
import { INTROS, type Slide } from './intro';
import { COMING_SOON, FREE_SAIL, LEVELS } from './levels';
import { bestStars, saveStars } from './progress';
import { render, type Camera, type WakeDot } from './render';
import {
  DEG,
  clamp,
  createBoat,
  idealSheet,
  settleBoat,
  stepBoat,
  wrapAngle,
  type SailEvent,
  type Trim,
} from './sim';
import { keepInBay } from './world';

const $ = (id: string) => document.getElementById(id)!;

const canvas = $('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const bannerEl = $('banner');
const hintEl = $('hint');
const calloutEl = $('callout');
const starsEl = $('stars');
const buttonsEl = $('buttons');
const viewBtn = $('viewBtn');
const homeEl = $('home');
const doneEl = $('done');
const introBar = $('introBar');

const input = new Input();
input.attach(canvas);

const wake: WakeDot[] = [];
let current: LevelDef | null = null;
let mode: Mode | null = null;
let playing = false;
let boatView = true; // true = boat points up the screen, false = north-up map
let viewBlend = 1;
let wakeTimer = 0;
let calloutTimer = 0;
// The explainer playing before a level, if any.
let intro: { slides: Slide[]; index: number; t: number } | null = null;
// What was last read aloud, so only new words are spoken.
let saidTitle = '';
let saidSub = '';
let saidText = ''; // the last instruction, for repeating
let sinceSaid = 0;
let repeatAt = 25;

/** Flash a big message in the middle of the screen, silently. */
function flash(text: string): void {
  calloutEl.textContent = text;
  calloutEl.classList.add('show');
  window.clearTimeout(calloutTimer);
  calloutTimer = window.setTimeout(() => calloutEl.classList.remove('show'), 1400);
}

const g: Game = {
  boat: createBoat(0, 0, 90 * DEG),
  wind: { from: 0, strength: 1 },
  input,
  opts: { ...DEFAULTS },
  buoys: [],
  markers: [],
  flag: null,
  target: null,
  time: 0,
  w: 0,
  h: 0,

  placeBoat(x, y, headingDeg, sheet) {
    const b = g.boat;
    b.x = x;
    b.y = y;
    b.heading = headingDeg * DEG;
    b.speed = 0;
    b.tiller = 0;
    b.sheet = sheet;
    input.tiller = 0;
    input.sheet = sheet;
    settleBoat(b, g.wind);
    wake.length = 0;
  },

  say(title, sub = '') {
    bannerEl.hidden = title === '';
    $('bannerTitle').textContent = title;
    $('bannerSub').textContent = sub;

    // Read new instructions aloud, but not counters ticking up.
    if (title === '') {
      saidTitle = '';
      saidSub = '';
      saidText = '';
      return;
    }
    const counter = /⭐|^Order \d/.test(sub);
    let words = '';
    if (title !== saidTitle) {
      const stop = /[.!?:]$/.test(title) ? '' : '.';
      words = /^Order \d/.test(sub) ? title : `${title}${stop} ${sub}`;
    } else if (sub !== saidSub && !counter) {
      words = sub;
    }
    if (words) {
      speak(words);
      saidText = words;
      sinceSaid = 0;
      repeatAt = 25;
    }
    saidTitle = title;
    saidSub = sub;
  },

  callout(text) {
    flash(text);
    play(/^(Yes|Aye)/.test(text) ? 'yes' : 'ding');
  },

  sound(name) {
    play(name);
  },

  setStarCount(n) {
    starsEl.textContent = `⭐ ${n}`;
  },

  finish(stars, message) {
    if (!current) return;
    playing = false;
    saveStars(current.id, stars);
    $('doneStars').innerHTML = starRow(stars);
    $('doneMessage').textContent = message;
    $('nextBtn').hidden = nextAfter(current) === null;
    // A short pause so the last star or tick is seen before the card appears.
    const finished = current;
    window.setTimeout(() => {
      if (playing || current !== finished) return;
      doneEl.hidden = false;
      play('fanfare');
      speak(`Well done! ${message}`);
    }, 700);
  },
};

// ------------------------------------------------------------ screens ----

function starRow(n: number): string {
  return [1, 2, 3].map((i) => `<span class="${i <= n ? '' : 'off'}">⭐</span>`).join('');
}

function nextAfter(def: LevelDef): LevelDef | null {
  const i = LEVELS.indexOf(def);
  if (i < 0) return null;
  return LEVELS[i + 1] ?? FREE_SAIL;
}

function showHome(): void {
  playing = false;
  mode = null;
  current = null;
  doneEl.hidden = true;
  buttonsEl.hidden = true;
  starsEl.hidden = true;
  hintEl.hidden = true;
  intro = null;
  introBar.hidden = true;
  hush();
  g.say('');

  const grid = $('levelGrid');
  grid.textContent = '';
  const upNext = LEVELS.find((l) => bestStars(l.id) === 0);
  LEVELS.forEach((def, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = def === upNext ? 'level next' : 'level';
    b.innerHTML =
      `<span class="num">Level ${i + 1}</span><span class="icon">${def.icon}</span>` +
      `<span class="name">${def.title}</span><span>${def.blurb}</span>` +
      `<span class="earned">${starRow(bestStars(def.id))}</span>`;
    b.addEventListener('click', () => startLevel(def, true));
    grid.append(b);
  });
  const free = document.createElement('button');
  free.type = 'button';
  free.className = 'level free';
  free.innerHTML =
    `<span class="num">Any time</span><span class="icon">${FREE_SAIL.icon}</span>` +
    `<span class="name">${FREE_SAIL.title}</span><span>${FREE_SAIL.blurb}</span>`;
  free.addEventListener('click', () => startLevel(FREE_SAIL, true));
  grid.append(free);
  COMING_SOON.forEach((title, i) => {
    const d = document.createElement('div');
    d.className = 'level soon';
    d.innerHTML =
      `<span class="num">Level ${LEVELS.length + i + 1}</span><span class="icon">🔒</span>` +
      `<span class="name">${title}</span><span>Coming soon</span>`;
    grid.append(d);
  });

  homeEl.hidden = false;
}

/** Show slide `i` of the explainer that is playing. */
function showSlide(i: number): void {
  if (!intro || !current) return;
  intro.index = i;
  intro.t = 0;
  const n = LEVELS.indexOf(current) + 1;
  g.say(`Level ${n}: ${current.title}`, intro.slides[i].text);
  const last = i === intro.slides.length - 1;
  $('introNext').textContent = last ? "Let's go! ▶" : 'Next ▶';
  $('introDots').textContent =
    intro.slides.length > 1 ? intro.slides.map((_, k) => (k === i ? '●' : '○')).join('') : '';
}

/** Start a level. With `explain`, play its animated explainer first. */
function startLevel(def: LevelDef, explain = false): void {
  current = def;
  homeEl.hidden = true;
  doneEl.hidden = true;
  hush();

  const slides = INTROS[def.id];
  if (explain && slides) {
    playing = false;
    mode = null;
    intro = { slides, index: 0, t: 0 };
    g.say('');
    hintEl.hidden = true;
    starsEl.hidden = true;
    buttonsEl.hidden = false;
    buttonsEl.classList.add('corner');
    viewBtn.hidden = true;
    $('resetBtn').hidden = true;
    $('helpBtn').hidden = true;
    introBar.hidden = false;
    showSlide(0);
    return;
  }
  intro = null;
  introBar.hidden = true;
  $('resetBtn').hidden = false;
  $('helpBtn').hidden = !slides;

  // Back to a clean slate, then let the level set itself up.
  g.opts = { ...DEFAULTS };
  g.wind.from = 0;
  g.wind.strength = 1;
  g.buoys = [];
  g.markers = [];
  g.flag = null;
  g.target = null;
  g.time = 0;
  g.say('');
  g.placeBoat(0, 0, 90, 0.45);
  boatView = true;
  viewBlend = 1;
  viewBtn.textContent = 'Map view';
  shownTrim = null;
  nagTrim = null;
  hintEl.hidden = true;

  mode = def.make();
  mode.start(g);

  const controls = g.opts.simulate && g.opts.showControls;
  input.tillerEnabled = controls && g.opts.tiller;
  input.sheetEnabled = controls && g.opts.sheet;
  input.release();

  buttonsEl.hidden = false;
  viewBtn.hidden = !(g.opts.simulate && g.opts.view === 'toggle');
  buttonsEl.classList.toggle('corner', !!mode.drawScene || !g.opts.showCompass);
  starsEl.hidden = !g.opts.showStarCount;
  playing = true;
}

// -------------------------------------------------------------- hints ----

const HINTS: Record<Trim, string> = {
  nogo: "No-go zone! You can't sail into the wind. Steer away.",
  pinching: 'Too close to the wind. Steer away a little.',
  luffing: 'Sail is flapping. Pull the mainsheet in!',
  tight: 'Sail is too tight. Let the mainsheet out.',
  ok: 'Nearly there!', // finished off below with which way to move the rope
  good: 'Great sailing!',
};

let shownTrim: Trim | null = null;
let pendingTrim: Trim = 'ok';
let pendingFor = 0;

/** Change the hint only once the new state has lasted a moment, so it doesn't flicker. */
function updateHint(dt: number): void {
  const trim = g.boat.trim;
  if (trim !== pendingTrim) {
    pendingTrim = trim;
    pendingFor = 0;
  }
  pendingFor += dt;
  // Good news shows straight away, so it is easy to stop at the right spot.
  // The no-go warning waits, so it doesn't flash up in the middle of every tack.
  const wait = pendingTrim === 'good' ? 0 : pendingTrim === 'nogo' ? 1.2 : 0.3;
  if (shownTrim === null || (pendingTrim !== shownTrim && pendingFor >= wait)) {
    shownTrim = pendingTrim;
    hintEl.dataset.trim = shownTrim;
  }
  let text = HINTS[shownTrim];
  if (shownTrim === 'ok') {
    text += g.boat.trimError > 0 ? ' Pull in a tiny bit more.' : ' Let out a tiny bit more.';
  }
  if (hintEl.textContent !== text) hintEl.textContent = text;
  const steering = shownTrim === 'nogo' || shownTrim === 'pinching';
  const show =
    g.opts.simulate && (g.opts.hints === 'all' || (g.opts.hints === 'steering' && steering));
  hintEl.hidden = !show;
  remind(dt, show);
}

// What to say when a problem has gone on for a while without being fixed.
const REMINDERS: Partial<Record<Trim, string>> = {
  nogo: "You're in the no go zone. Steer away from the wind.",
  pinching: "You're too close to the wind. Steer away a little.",
  luffing: 'Your sail is flapping. Pull the mainsheet in.',
  tight: 'Your sail is too tight. Let the mainsheet out a bit.',
};

let nagTrim: Trim | null = null;
let nagFor = 0;
let nagAt = 0;

/** Spoken nudges: the hint if it's ignored, and the instruction if nothing happens. */
function remind(dt: number, hintShown: boolean): void {
  const trim = hintShown ? shownTrim : null;
  if (trim !== nagTrim) {
    nagTrim = trim;
    nagFor = 0;
    nagAt = trim === 'ok' ? 7 : 3.5;
  }
  let words = trim ? REMINDERS[trim] : undefined;
  if (trim === 'ok') {
    words = g.boat.trimError > 0 ? 'Nearly there. Pull the mainsheet in a tiny bit more.' : 'Nearly there. Let the mainsheet out a tiny bit more.';
  }
  if (words && g.opts.remind) {
    nagFor += dt;
    if (nagFor >= nagAt && !speaking()) {
      speak(words);
      nagAt = nagFor + 10; // and again every so often until it's sorted
      sinceSaid = Math.min(sinceSaid, repeatAt - 8); // don't repeat the instruction straight after
    }
  }

  // Nothing new for a good while? Say the instruction again.
  sinceSaid += dt;
  if (saidText && sinceSaid >= repeatAt && !speaking()) {
    speak(saidText);
    repeatAt = sinceSaid + 40;
  }
}

// --------------------------------------------------------------- loop ----

function sail(dt: number): SailEvent[] {
  const { boat, opts } = g;
  input.update(dt);

  if (opts.autoSteer !== null) {
    // Steer towards the heading: the tiller goes the opposite way to the turn.
    const error = wrapAngle(opts.autoSteer - boat.heading);
    const want = clamp(-error * 2.5, -1, 1);
    input.tiller += (want - input.tiller) * (1 - Math.exp(-dt / 0.15));
  }
  if (opts.autoTrim) {
    const want = idealSheet(Math.abs(boat.windAngle));
    input.sheet += clamp(want - input.sheet, -1.2 * dt, 1.2 * dt);
  }
  boat.tiller = input.tiller;
  boat.sheet = input.sheet;

  const events = stepBoat(boat, g.wind, dt);
  for (const event of events) {
    flash(event === 'tack' ? 'Nice tack!' : 'Gybe! Mind the boom!');
    play(event);
  }
  if (opts.bay && keepInBay(boat)) {
    flash('Bump! Turn around.');
    play('bump');
  }

  // Foam trail behind the boat.
  wakeTimer -= dt;
  if (wakeTimer <= 0 && boat.speed > 0.8) {
    wakeTimer = 0.09;
    wake.push({
      x: boat.x - Math.sin(boat.heading) * 2.4,
      y: boat.y - Math.cos(boat.heading) * 2.4,
      age: 0,
    });
  }
  for (const d of wake) d.age += dt;
  while (wake.length && wake[0].age > 2.2) wake.shift();

  return events;
}

function camera(): Camera {
  const short = Math.min(g.w, g.h);
  if (g.opts.view === 'fixed') {
    return {
      x: 0,
      y: 0,
      rot: 0,
      ppm: short / g.opts.span,
      cx: g.w / 2,
      cy: g.h * FIXED_CY,
      boatScale: 2.3,
    };
  }
  const span = 120 + (34 - 120) * viewBlend; // world units across the short side
  return {
    x: g.boat.x,
    y: g.boat.y,
    rot: wrapAngle(g.boat.heading) * viewBlend,
    ppm: short / span,
    cx: g.w / 2,
    cy: g.h * (0.5 + 0.08 * viewBlend),
    boatScale: 1.7 - 0.7 * viewBlend,
  };
}

/** Move the game on by one small step of time. */
function tick(dt: number): void {
  if (!mode || !playing) return;
  g.time += dt;
  const events = g.opts.simulate ? sail(dt) : [];
  mode.update(g, dt, events);
  updateHint(dt);
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const goal = boatView ? 1 : 0;
  viewBlend += (goal - viewBlend) * (1 - Math.exp(-dt / 0.15));
  if (Math.abs(goal - viewBlend) < 0.002) viewBlend = goal;

  tick(dt);

  if (intro) {
    intro.t += dt;
    intro.slides[intro.index].draw(ctx, g.w, g.h, intro.t);
    requestAnimationFrame(frame);
    return;
  }
  if (mode?.drawScene) {
    mode.drawScene(g, ctx);
  } else {
    const o = g.opts;
    render(ctx, {
      w: g.w,
      h: g.h,
      time: g.time,
      boat: g.boat,
      wind: g.wind,
      cam: camera(),
      wake,
      input,
      bay: o.bay,
      ripples: o.ripples,
      showNoGo: o.noGo,
      noGoAlways: o.noGoAlways,
      showBoat: o.showBoat,
      showWind: o.showWind,
      showCompass: o.showCompass,
      showSpeed: o.showSpeed,
      showControls: o.showControls,
      buoys: g.buoys,
      markers: g.markers,
      flag: g.flag,
      target: g.target,
      starOverTarget: o.starOverTarget,
    });
    if (mode?.draw) mode.draw(g, ctx);
  }
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------- setup ----

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  g.w = window.innerWidth;
  g.h = window.innerHeight;
  canvas.width = Math.round(g.w * dpr);
  canvas.height = Math.round(g.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  input.layout = computeLayout(g.w, g.h);
  document.documentElement.style.setProperty('--ui', String(input.layout.scale));
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

canvas.addEventListener('pointerdown', (e) => {
  if (playing && mode?.tap) mode.tap(g, e.clientX, e.clientY);
});

$('homeBtn').addEventListener('click', showHome);
$('doneHomeBtn').addEventListener('click', showHome);
$('resetBtn').addEventListener('click', (e) => {
  if (current) startLevel(current);
  (e.currentTarget as HTMLElement).blur();
});
$('againBtn').addEventListener('click', () => {
  if (current) startLevel(current);
});
$('nextBtn').addEventListener('click', () => {
  const next = current && nextAfter(current);
  if (next) startLevel(next, true);
});
$('helpBtn').addEventListener('click', () => {
  if (current) startLevel(current, true);
});
$('introNext').addEventListener('click', () => {
  if (!intro || !current) return;
  if (intro.index < intro.slides.length - 1) showSlide(intro.index + 1);
  else startLevel(current);
});
$('introSkip').addEventListener('click', () => {
  if (current) startLevel(current);
});

// Sound on and off, from the home screen or during a level.
function showSound(): void {
  $('soundBtn').textContent = soundOn() ? '🔊' : '🔇';
  $('homeSoundBtn').textContent = soundOn() ? '🔊 Sound on' : '🔇 Sound off';
}
for (const id of ['soundBtn', 'homeSoundBtn']) {
  $(id).addEventListener('click', (e) => {
    setSoundOn(!soundOn());
    showSound();
    (e.currentTarget as HTMLElement).blur();
  });
}
showSound();

// Browsers only let sound start from a tap or key press.
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) play('tap');
});
viewBtn.addEventListener('click', () => {
  boatView = !boatView;
  viewBtn.textContent = boatView ? 'Map view' : 'Boat view';
  viewBtn.blur();
});

resize();
showHome();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Handy for poking at the game from the browser console.
  Object.assign(window, {
    yachtty: g,
    playSound: play,
    // Queue up lines for `npm run voices` without having to hear them first.
    voiceLines(texts: string[]) {
      noteLines(texts.flatMap(spokenLines));
    },
    // Run the game forward without waiting, for testing.
    fastForward(seconds: number) {
      if (intro) intro.t += seconds;
      for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60);
    },
  });
}
