// Sound effects (made on the spot, no audio files) and spoken instructions.

export type Sound = 'tap' | 'ding' | 'yes' | 'wrong' | 'tack' | 'gybe' | 'bump' | 'fanfare';

const KEY = 'yachtty.sound';

let on = true;
try {
  on = localStorage.getItem(KEY) !== 'off';
} catch {
  // Storage blocked: sound just starts switched on.
}

export function soundOn(): boolean {
  return on;
}

export function setSoundOn(value: boolean): void {
  on = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // Nothing to do; the choice just won't be remembered.
  }
  if (!value) hush();
}

// ------------------------------------------------------------- effects ----

let ac: AudioContext | null = null;

/** Browsers only allow sound after a tap or key press, so call this from one. */
export function unlockAudio(): void {
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    ac = null; // no sound on this device
  }
}

function note(freq: number, at: number, length: number, type: OscillatorType = 'sine', volume = 0.2, slideTo = freq): void {
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo !== freq) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** A rush of air: hissing noise whose pitch sweeps from one tone to another. */
function whoosh(from: number, to: number, length: number, volume: number): void {
  if (!ac) return;
  const t = ac.currentTime;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + length * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

export function play(sound: Sound): void {
  if (!on || !ac || ac.state !== 'running') return;
  switch (sound) {
    case 'tap':
      note(620, 0, 0.06, 'triangle', 0.12);
      break;
    case 'ding':
      note(880, 0, 0.16, 'sine', 0.2);
      note(1320, 0.09, 0.3, 'sine', 0.2);
      break;
    case 'yes':
      [523, 659, 784].forEach((f, i) => note(f, i * 0.08, 0.22, 'triangle', 0.2));
      break;
    case 'wrong':
      note(220, 0, 0.28, 'sawtooth', 0.09, 150);
      break;
    case 'tack':
      whoosh(500, 1800, 0.55, 0.25);
      break;
    case 'gybe':
      whoosh(1600, 400, 0.4, 0.3);
      note(140, 0.12, 0.25, 'sine', 0.35, 70); // the boom going "thunk"
      break;
    case 'bump':
      note(110, 0, 0.3, 'sine', 0.4, 55);
      break;
    case 'fanfare':
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.13, i === 3 ? 0.7 : 0.2, 'triangle', 0.22));
      note(784, 0.39, 0.7, 'sine', 0.12);
      break;
  }
}

// -------------------------------------------------------------- speech ----
//
// Each sentence is spoken from a recorded file when there is one (made by
// `npm run voices` into public/voice/), and by the device's own voice if not.

let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): void {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  // Prefer an Australian voice, then any other English one.
  voice =
    voices.find((v) => v.lang === 'en-AU') ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

const VOICE_DIR = `${import.meta.env.BASE_URL}voice/`;
let recorded: Record<string, string> = {}; // sentence -> file name
const clips = new Map<string, Promise<AudioBuffer>>();

const recordedReady = fetch(`${VOICE_DIR}manifest.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((m: { files?: Record<string, string> } | null) => {
    recorded = m?.files ?? {};
  })
  .catch(() => {
    // No recordings yet: the device voice does everything.
  });

/** Turn on-screen text into something that reads well aloud. */
export function speakable(text: string): string {
  return text
    .replace(/⭐.*$/u, '') // star counters
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/[()]/g, ', ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/ in \d+:\d\d(?=[.!?])/, '') // race times
    .replace(/\bNO-GO\b/gi, 'no go')
    .replace(/\b[A-Z]{2,}\b/g, (word) => word.toLowerCase())
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Counters like "Question 2 of 11" are shown, not spoken. */
const COUNTER = /^(\w+ )?\d+ of \d+[.!]?$|^\d+ more to find\.$/;

/** Split text into the sentences that get spoken, one recording each. */
export function spokenLines(text: string): string[] {
  return speakable(text)
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .map((line) => line.charAt(0).toUpperCase() + line.slice(1))
    .filter((line) => line && !COUNTER.test(line));
}

let turn = 0; // goes up whenever speech is replaced or stopped
let busy = false;
let source: AudioBufferSourceNode | null = null;

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function loadClip(file: string): Promise<AudioBuffer> {
  let clip = clips.get(file);
  if (!clip) {
    clip = fetch(VOICE_DIR + file)
      .then((r) => {
        if (!r.ok) throw new Error(`missing ${file}`);
        return r.arrayBuffer();
      })
      .then((data) => ac!.decodeAudioData(data));
    clip.catch(() => clips.delete(file));
    clips.set(file, clip);
  }
  return clip;
}

async function playClip(file: string, mine: number): Promise<void> {
  const buffer = await loadClip(file);
  if (mine !== turn || !ac) return;
  await new Promise<void>((done) => {
    const src = ac!.createBufferSource();
    src.buffer = buffer;
    src.connect(ac!.destination);
    src.onended = () => done();
    source = src;
    src.start();
  });
}

function deviceVoice(line: string): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(line);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'en-AU';
    u.rate = 0.95;
    u.pitch = 1.05;
    u.onend = () => done();
    u.onerror = () => done();
    // Some browsers never say when they've finished, so don't wait forever.
    setTimeout(done, 1500 + line.length * 90);
    window.speechSynthesis.speak(u);
  });
}

/**
 * Is the sound system awake? Right after the first tap it is still starting
 * up, so give it a moment rather than giving up on the recordings.
 */
async function audioAwake(): Promise<boolean> {
  if (!ac) return false;
  if (ac.state !== 'running') {
    try {
      await Promise.race([ac.resume(), pause(1000)]);
    } catch {
      // Not allowed yet: the device voice will do.
    }
  }
  return ac.state === 'running';
}

async function sayLine(line: string, mine: number): Promise<void> {
  const file = recorded[line];
  if (file && (await audioAwake()) && mine === turn) {
    try {
      await playClip(file, mine);
      return;
    } catch {
      // Fall through to the device voice.
    }
  }
  if (mine === turn) await deviceVoice(line);
}

/** Read some text aloud, replacing anything still being read. */
export function speak(text: string): void {
  hush();
  const lines = spokenLines(text);
  if (import.meta.env.DEV) noteLines(lines);
  if (!on || lines.length === 0) return;
  const mine = turn;
  busy = true;
  void (async () => {
    // On a slow connection the list of recordings may still be on its way.
    await Promise.race([recordedReady, pause(2000)]);
    for (const line of lines) {
      if (mine !== turn) return;
      await sayLine(line, mine);
      if (mine === turn) await pause(120);
    }
    if (mine === turn) busy = false;
  })();
}

/** Is something being read aloud right now? */
export function speaking(): boolean {
  return busy;
}

export function hush(): void {
  turn += 1;
  busy = false;
  try {
    source?.stop();
  } catch {
    // Already finished.
  }
  source = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/**
 * While developing, tell the dev server about every line the game speaks, so
 * `npm run voices` knows what to record. See vite.config.js.
 */
const noted = new Set<string>();
export function noteLines(lines: string[]): void {
  const fresh = lines.filter((line) => !noted.has(line));
  if (fresh.length === 0) return;
  fresh.forEach((line) => noted.add(line));
  void fetch('/__voice', { method: 'POST', body: JSON.stringify(fresh) }).catch(() => {});
}
