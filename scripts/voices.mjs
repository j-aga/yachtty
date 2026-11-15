// Turns the lines Yachtty speaks into audio files, using xAI's text-to-speech API.
//
//   npm run voices            make an MP3 for every line in voice/phrases.json that lacks one
//   npm run voices samples    make one sample per available voice, in voice-samples/
//
// The API key is read from .env.local (XAI_API_KEY=...). The voice and speed are
// set in voice/config.json. Changing either re-makes every line.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PHRASES = path.join(ROOT, 'voice/phrases.json');
const CONFIG = path.join(ROOT, 'voice/config.json');
const OUT = path.join(ROOT, 'public/voice');
const MANIFEST = path.join(OUT, 'manifest.json');
const SAMPLES = path.join(ROOT, 'voice-samples');
const API = 'https://api.x.ai/v1/tts';

const SAMPLE_TEXT =
  "Ahoy! Welcome to Yachtty. Push the tiller left and the boat turns right. Your sail is flapping. Pull the mainsheet in. Well done, you can tack!";

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function apiKey() {
  let key = process.env.XAI_API_KEY ?? '';
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    key = env.match(/^XAI_API_KEY=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, '') || key;
  } catch {
    // No .env.local: fall back to the environment variable.
  }
  if (!key) {
    console.error('No API key. Put XAI_API_KEY=your-key in .env.local');
    process.exit(1);
  }
  return key;
}

const KEY = apiKey();
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** Ask xAI to say some text; returns the MP3 bytes. Waits and retries if told to slow down. */
async function synthesize(text, voice, speed, bitRate = 128000) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        voice_id: voice,
        language: 'en',
        speed,
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: bitRate },
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const retry = res.status === 429 || res.status >= 500;
    if (!retry || attempt >= 4) {
      throw new Error(`xAI said ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
}

/** A short, stable file name for a line. */
function fileFor(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  return `${slug}-${h.toString(16).padStart(8, '0')}.mp3`;
}

/** Run jobs a few at a time. */
async function pool(items, size, job) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await job(items[next++]);
    }),
  );
}

async function samples() {
  const res = await fetch(`${API}/voices`, { headers });
  if (!res.ok) throw new Error(`xAI said ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { voices } = await res.json();
  fs.mkdirSync(SAMPLES, { recursive: true });
  await pool(voices, 3, async (v) => {
    const audio = await synthesize(SAMPLE_TEXT, v.voice_id, 1);
    fs.writeFileSync(path.join(SAMPLES, `${v.voice_id}.mp3`), audio);
    console.log(`  ${v.voice_id.padEnd(8)} ${v.name ?? ''}`);
  });
  // A page for listening to them side by side.
  const rows = voices
    .map(
      (v) =>
        `<tr><td><b>${v.name ?? v.voice_id}</b><br><code>${v.voice_id}</code></td><td>${v.gender ?? ''}</td>` +
        `<td><audio controls preload="none" src="${v.voice_id}.mp3"></audio></td></tr>`,
    )
    .join('\n');
  fs.writeFileSync(
    path.join(SAMPLES, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Yachtty voice samples</title>
<style>body{font:16px system-ui;max-width:760px;margin:30px auto;padding:0 16px}td{padding:8px 12px;border-bottom:1px solid #ddd}code{color:#666}</style>
<h1>Yachtty voice samples</h1><p>Each voice reads the same few lines from the game.</p><table>${rows}</table>`,
  );
  console.log(`\n${voices.length} samples saved. Open voice-samples/index.html to listen, then put your favourite in voice/config.json.`);
}

async function generate() {
  const phrases = [...new Set(readJson(PHRASES, []))];
  const config = { voice: 'eve', speed: 1, bitRate: 128000, ...readJson(CONFIG, {}) };
  let manifest = readJson(MANIFEST, { voice: '', speed: 1, files: {} });
  manifest.bitRate ??= 128000; // recordings made before the quality setting existed
  fs.mkdirSync(OUT, { recursive: true });

  // A different voice, speed or quality means starting again.
  const same = ['voice', 'speed', 'bitRate'].every((k) => manifest[k] === config[k]);
  if (!same) {
    manifest = { voice: config.voice, speed: config.speed, bitRate: config.bitRate, files: {} };
  }
  const todo = phrases.filter(
    (p) => !manifest.files[p] || !fs.existsSync(path.join(OUT, manifest.files[p])),
  );
  const chars = todo.reduce((n, p) => n + p.length, 0);
  console.log(`${phrases.length} lines, ${todo.length} to make (${chars} characters) in voice "${config.voice}".`);

  let failed = 0;
  await pool(todo, 4, async (text) => {
    try {
      const audio = await synthesize(text, config.voice, config.speed, config.bitRate);
      const name = fileFor(text);
      fs.writeFileSync(path.join(OUT, name), audio);
      manifest.files[text] = name;
      console.log(`  ✓ ${text.slice(0, 70)}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${text.slice(0, 70)}\n    ${err.message}`);
    }
  });

  // Forget lines the game no longer says, and delete their files.
  const wanted = new Set(phrases);
  for (const text of Object.keys(manifest.files)) if (!wanted.has(text)) delete manifest.files[text];
  const keep = new Set(Object.values(manifest.files));
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith('.mp3') && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
  }
  const sorted = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(MANIFEST, JSON.stringify({ ...manifest, files: sorted }, null, 2) + '\n');
  console.log(failed ? `Done, but ${failed} failed. Run again to retry them.` : 'Done.');
  if (failed) process.exitCode = 1;
}

await (process.argv[2] === 'samples' ? samples() : generate());
