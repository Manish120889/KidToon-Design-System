// scripts/daily-v2.js — the v2 orchestrator that ties together
// trends → LLM → Suno → render → shorts → approval → multi-platform.
//
// Run modes (set via PIPELINE_MODE env or --mode flag):
//   - kidtoon (default)  — kid-safe topics, nursery-rhyme style, KidToon brand
//   - news               — trending news topics, viral pop, monetizable
//
// Sample cron: `node scripts/daily-v2.js --mode=kidtoon`
//
// Each day this produces up to N runs. Every run goes through these stages,
// each of which is idempotent — re-running picks up where it left off:
//
//   1. SCRAPE   — getTrendingTopics()  →  topics.json
//   2. WRITE    — generateLyrics()     →  lyrics.json (title, lyrics, suno_prompt, captions)
//   3. SING     — generateSong()       →  audio.mp3
//   4. RENDER   — renderSong()         →  video-16x9.mp4
//   5. SHORT    — composeShorts()      →  video-9x16.mp4
//   6. APPROVE  — awaitApproval()      →  blocks until human OKs
//   7. PUBLISH  — uploadVideo() + uploadX() + uploadInstagram()

import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

import { getTrendingTopics } from './scrape-trends.js';
import { generateLyrics } from './llm-lyrics.js';
import { generateWithRetry as generateSong } from './suno-generate.js';
import { renderSong } from './render.js';
import { generateThumbnail } from './thumbnail.js';
import { composeShorts, writeSrtFromWords } from './compose-shorts.js';
import { awaitApproval } from './approval-gate.js';
import { uploadVideo } from './upload.js';
import { uploadX } from './upload-x.js';
import { uploadInstagram } from './upload-instagram.js';

// ── Args / env ──────────────────────────────────────────────────────────
const argMode = process.argv.find(a => a.startsWith('--mode='));
const MODE = (argMode ? argMode.split('=')[1] : process.env.PIPELINE_MODE) || 'kidtoon';
const VIDEOS_PER_DAY = parseInt(process.env.VIDEOS_PER_DAY || '1', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const RUNS_DIR = path.resolve('out/runs');
const SKIP_PLATFORMS = (process.env.SKIP_PLATFORMS || '').split(',').filter(Boolean);

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function runDir(runId) {
  const d = path.join(RUNS_DIR, runId);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
function readJson(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// ── Per-run pipeline ────────────────────────────────────────────────────
async function processRun({ topic, runId }) {
  const dir = runDir(runId);
  console.log(`\n━━━ run ${runId} ━━━`);
  console.log(`   topic: ${topic.topic}`);

  // 1. WRITE
  let lyrics = readJson(path.join(dir, 'lyrics.json'));
  if (!lyrics) {
    console.log(`   1️⃣  generating lyrics…`);
    lyrics = await generateLyrics({ topic, mode: MODE });
    writeJson(path.join(dir, 'lyrics.json'), lyrics);
  } else console.log(`   1️⃣  lyrics cached`);
  console.log(`      → ${lyrics.title}`);

  // 2. SING (Suno)
  const audioPath = path.join(dir, 'audio.mp3');
  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1024 * 1024) {
    console.log(`   2️⃣  Suno generation…`);
    await generateSong({
      prompt: lyrics.suno_prompt,
      lyrics: lyrics.lyrics,
      title: lyrics.title,
      outDir: dir,
      songId: 'audio',
      dryRun: DRY_RUN,
    });
  } else console.log(`   2️⃣  audio cached`);

  // 3. RENDER (Remotion 16:9)
  const videoPath = path.join(dir, 'video-16x9.mp4');
  if (!fs.existsSync(videoPath)) {
    console.log(`   3️⃣  Remotion render…`);
    if (DRY_RUN) {
      fs.writeFileSync(videoPath, ''); // placeholder
    } else {
      await renderSong({
        songId: slug(lyrics.title),
        audioPath,
        lyrics,
        outputPath: videoPath,
        palette: MODE === 'news' ? 'pink' : 'day',
      });
    }
  } else console.log(`   3️⃣  video cached`);

  // 4. THUMBNAIL
  const thumbPath = path.join(dir, 'thumbnail.jpg');
  if (!fs.existsSync(thumbPath)) {
    try {
      console.log(`   3️⃣ b thumbnail…`);
      await generateThumbnail({ title: lyrics.title, outputPath: thumbPath });
    } catch (e) { console.warn(`      thumbnail failed: ${e.message}`); }
  }

  // 5. SHORTS (9:16)
  const shortsPath = path.join(dir, 'video-9x16.mp4');
  if (!fs.existsSync(shortsPath) && !DRY_RUN) {
    console.log(`   4️⃣  composing shorts…`);
    let srt = null;
    if (lyrics.words?.length) {
      srt = writeSrtFromWords(lyrics.words, path.join(dir, 'subs.srt'));
    }
    try {
      await composeShorts({ inputPath: videoPath, outputPath: shortsPath, maxDuration: 60, srtPath: srt });
    } catch (e) { console.warn(`      shorts compose failed: ${e.message}`); }
  }

  // 6. APPROVAL GATE
  const decision = await awaitApproval({
    id: runId,
    title: lyrics.title,
    topic: topic.topic,
    files: { video: videoPath, shorts: shortsPath, thumbnail: thumbPath, audio: audioPath },
    lyrics,
  });
  if (decision.decision !== 'approved') {
    return { runId, status: 'rejected', notes: decision.notes };
  }

  // 7. PUBLISH
  const results = {};
  if (!SKIP_PLATFORMS.includes('youtube')) {
    try {
      const r = await uploadVideo({
        videoPath,
        thumbnailPath: thumbPath,
        title: lyrics.youtube?.title || lyrics.title,
        description: lyrics.youtube?.description || lyrics.lyrics,
        tags: lyrics.youtube?.tags || [],
        dryRun: DRY_RUN,
      });
      results.youtube = r;
    } catch (e) { results.youtube = { error: e.message }; }
  }
  if (!SKIP_PLATFORMS.includes('x') && fs.existsSync(shortsPath)) {
    try {
      const r = await uploadX({
        videoPath: shortsPath,
        caption: lyrics.x?.caption || lyrics.title,
        dryRun: DRY_RUN,
      });
      results.x = r;
    } catch (e) { results.x = { error: e.message }; }
  }
  if (!SKIP_PLATFORMS.includes('instagram') && fs.existsSync(shortsPath)) {
    try {
      const r = await uploadInstagram({
        videoPath: shortsPath,
        caption: lyrics.instagram?.caption || lyrics.title,
        dryRun: DRY_RUN,
      });
      results.instagram = r;
    } catch (e) { results.instagram = { error: e.message }; }
  }

  writeJson(path.join(dir, 'result.json'), results);
  return { runId, status: 'published', results, title: lyrics.title };
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🌅 KidToon pipeline v2 — mode=${MODE} videos=${VIDEOS_PER_DAY} dryRun=${DRY_RUN}`);
  const topics = await getTrendingTopics({ limit: VIDEOS_PER_DAY * 2, mode: MODE });
  if (!topics.length) { console.error('No topics scraped'); process.exit(1); }

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  let processed = 0;
  for (const topic of topics) {
    if (processed >= VIDEOS_PER_DAY) break;
    const runId = `${today}-${slug(topic.topic)}`;
    try {
      const r = await processRun({ topic, runId });
      results.push(r);
      if (r.status === 'published') processed++;
    } catch (e) {
      console.error(`❌ Run failed: ${e.message}`);
      results.push({ runId, status: 'failed', error: e.message });
      // Skip to next topic (the "backup topic" fail-safe from the brief)
    }
  }
  console.log(`\n━━━ Summary ━━━`);
  for (const r of results) {
    const tag = r.status === 'published' ? '✅' : r.status === 'rejected' ? '🛑' : '❌';
    console.log(`${tag} ${r.runId} — ${r.title || ''} ${r.error || r.notes || ''}`);
  }
  // Exit non-zero if nothing published, so cron alerts fire
  if (!results.some(r => r.status === 'published')) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
