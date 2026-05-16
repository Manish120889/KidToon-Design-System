// scripts/suno-generate.js — Suno API wrapper with poll, retry, and audio QA.
//
// Works with two backends (whichever you set up):
//   1. PiAPI / GoAPI hosted Suno proxy (recommended) — set SUNO_API_BASE + SUNO_API_KEY
//   2. Self-hosted gcui-art/suno-api on Vercel using your Suno Pro session cookie
//      — set SUNO_API_BASE to your Vercel URL (no api key required)
//
// Both expose the same surface used here: POST /api/generate, GET /api/feed?ids=...

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import 'dotenv/config';

const POLL_INTERVAL_MS = 30_000;
const MAX_POLL_MINUTES = 10;
const MIN_AUDIO_BYTES = 1_000_000; // 1 MB — anything smaller is likely truncated

function authHeaders() {
  const key = process.env.SUNO_API_KEY;
  return key ? { authorization: `Bearer ${key}` } : {};
}

async function startGeneration({ prompt, lyrics, title, makeInstrumental = false }) {
  const base = process.env.SUNO_API_BASE;
  if (!base) throw new Error('SUNO_API_BASE not set');

  const body = {
    prompt: lyrics,                  // gcui-art/suno-api convention
    tags: prompt,
    title: title?.slice(0, 80),
    make_instrumental: makeInstrumental,
    wait_audio: false,               // we'll poll ourselves
    model: process.env.SUNO_MODEL || 'chirp-v4',
  };

  const res = await fetch(`${base.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Suno /api/generate ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  // Both backends return an array of clip records. Normalize.
  const records = Array.isArray(data) ? data : (data.clips || data.data || []);
  if (!records.length) throw new Error('Suno returned no clip records');
  const ids = records.map(r => r.id).filter(Boolean);
  if (!ids.length) throw new Error('Suno returned records without ids');
  return ids;
}

async function pollFeed(ids) {
  const base = process.env.SUNO_API_BASE.replace(/\/$/, '');
  const url = `${base}/api/feed?ids=${ids.join(',')}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Suno /api/feed ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function pickBestClip(clips) {
  // Filter to complete clips with an audio_url, then sort by duration (longest)
  const ready = clips.filter(c =>
    (c.status === 'complete' || c.status === 'streaming' || c.status === 'success')
    && (c.audio_url || c.audioUrl || c.audio)
  );
  if (!ready.length) return null;
  ready.sort((a, b) => (b.duration || b.metadata?.duration || 0) - (a.duration || a.metadata?.duration || 0));
  return ready[0];
}

async function downloadAudio(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(res.body, fs.createWriteStream(dest));
  const stat = fs.statSync(dest);
  if (stat.size < MIN_AUDIO_BYTES) {
    throw new Error(`Audio too small (${stat.size}B) — likely truncated`);
  }
  return stat.size;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Generate a song via Suno. Returns the local path to the downloaded mp3.
 * @param {object} args
 * @param {string} args.prompt    — Suno style tags ("[Style: ..., vocals: ...]")
 * @param {string} args.lyrics    — Full lyrics text (sections labelled [verse], [chorus])
 * @param {string} args.title     — Song title
 * @param {string} args.outDir    — Directory to write the mp3 into
 * @param {string} args.songId    — Slug used for filename
 * @param {boolean} [args.dryRun]
 */
export async function generateSong({ prompt, lyrics, title, outDir, songId, dryRun }) {
  if (dryRun) {
    const fake = path.join(outDir, `${songId}.mp3`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(fake, ''); // placeholder, real run downloads
    console.log(`🧪 [dry-run] Suno generation skipped → ${fake}`);
    return { path: fake, durationSec: 0 };
  }

  console.log(`🎵 Suno: starting generation for "${title}"`);
  const ids = await startGeneration({ prompt, lyrics, title });
  console.log(`   clips: ${ids.join(', ')}`);

  const deadline = Date.now() + MAX_POLL_MINUTES * 60_000;
  let lastStatuses = {};
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let feed;
    try { feed = await pollFeed(ids); }
    catch (e) { console.warn(`   poll error: ${e.message}`); continue; }

    const clips = Array.isArray(feed) ? feed : (feed.data || feed.clips || []);
    // Log status changes
    for (const c of clips) {
      if (lastStatuses[c.id] !== c.status) {
        console.log(`   clip ${c.id}: ${c.status}`);
        lastStatuses[c.id] = c.status;
      }
    }
    if (clips.every(c => c.status === 'error')) {
      throw new Error('All Suno clips failed');
    }
    const best = pickBestClip(clips);
    if (best) {
      const audioUrl = best.audio_url || best.audioUrl || best.audio;
      const dest = path.join(outDir, `${songId}.mp3`);
      console.log(`   downloading: ${audioUrl}`);
      const bytes = await downloadAudio(audioUrl, dest);
      console.log(`✅ Suno: ${(bytes/1024/1024).toFixed(2)} MB → ${dest}`);
      return {
        path: dest,
        durationSec: best.duration || best.metadata?.duration || 0,
        clipId: best.id,
      };
    }
  }
  throw new Error(`Suno timed out after ${MAX_POLL_MINUTES} min`);
}

// ── Retry orchestrator ────────────────────────────────────────────────────
export async function generateWithRetry(args, { maxAttempts = 2 } = {}) {
  let lastErr = null;
  for (let i = 1; i <= maxAttempts; i++) {
    try { return await generateSong(args); }
    catch (e) {
      lastErr = e;
      console.warn(`   attempt ${i}/${maxAttempts} failed: ${e.message}`);
      if (i < maxAttempts) await sleep(5000);
    }
  }
  throw lastErr;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const example = {
    title: 'Test Song',
    prompt: '[Style: bright children\'s pop, ukulele, female alto, 100 BPM]',
    lyrics: '[verse]\nLittle stars are shining\nUp above the night\n\n[chorus]\nTwinkle twinkle little star\n',
    outDir: 'out',
    songId: 'test-' + Date.now(),
  };
  generateWithRetry(example)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}
