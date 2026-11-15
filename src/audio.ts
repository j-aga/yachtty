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

/** Turn on-screen text into something that reads well aloud. */
export function speakable(text: string): string {
  return text
    .replace(/⭐.*$/u, '') // star counters
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/[()]/g, ', ')
    .replace(/\bNO-GO\b/gi, 'no go')
    .replace(/\b[A-Z]{2,}\b/g, (word) => word.toLowerCase())
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read some text aloud, replacing anything still being read. */
export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const words = speakable(text);
  if (!on || !words) return;
  const u = new SpeechSynthesisUtterance(words);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-AU';
  u.rate = 0.95;
  u.pitch = 1.05;
  synth.speak(u);
}

export function hush(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
