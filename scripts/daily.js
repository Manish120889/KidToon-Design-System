// scripts/daily.js — top-level orchestrator. Run once a day from GitHub Actions.

import fs from 'node:fs';
import path from 'node:path';
import {pickSongs, markPublished} from './pick-songs.js';
import {renderSong} from './render.js';
import {generateThumbnail} from './thumbnail.js';
import {uploadVideo} from './upload.js';
import 'dotenv/config';

const VIDEOS_PER_DAY = parseInt(process.env.VIDEOS_PER_DAY ?? '3', 10);
const DRY_RUN = process.argv.includes('--dry-run');

function buildTitle(song) {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric'
  });
  // YouTube searchable titles
  const variants = [
    `${song.title} 🎵 KidToon Sing-Along for Kids`,
    `${song.title} | Nursery Rhymes for Kids | KidToon`,
    `Sing Along to ${song.title} | KidToon Nursery Rhymes`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

function buildDescription(song) {
  return [
    song.description,
    '',
    `🎵 Sing along to "${song.title}" with KidToon.`,
    '🎨 Bright, bouncy animation made for ages 1-4.',
    '📺 New nursery rhymes every day.',
    '',
    '👶 KidToon makes ad-free nursery rhymes for toddlers and the grown-ups who love them.',
    '',
    '🔔 Subscribe for a new song every day: https://youtube.com/@kidtoon-z3l',
    '',
    '#nurseryrhymes #kidssongs #singalong #KidToon #toddler #lullaby',
  ].join('\n');
}

async function publishOne(song) {
  console.log(`\n━━━ ${song.id} ━━━`);
  console.log(`Title: ${song.title}`);

  // 1. Render MP4
  const videoPath = path.resolve(`out/${song.id}.mp4`);
  await renderSong(song.id, videoPath);

  // 2. Generate thumbnail
  const thumbPath = path.resolve(`out/${song.id}.jpg`);
  try {
    await generateThumbnail(song.id, thumbPath);
  } catch (e) {
    console.warn(`   ⚠️  Thumbnail render failed: ${e.message}`);
  }

  // 3. Upload
  const title = buildTitle(song);
  const description = buildDescription(song);
  const {id: youtubeId, url} = await uploadVideo({
    videoPath,
    thumbnailPath: thumbPath,
    title,
    description,
    tags: song.tags,
    dryRun: DRY_RUN,
  });

  // 4. Mark published in history
  if (!DRY_RUN) markPublished(song.id, youtubeId, url);

  return {song, youtubeId, url};
}

async function main() {
  console.log(`🌅 KidToon daily pipeline — ${new Date().toISOString()}`);
  console.log(`   Videos to publish: ${VIDEOS_PER_DAY}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const songs = pickSongs(VIDEOS_PER_DAY);
  console.log(`\nPicked:`);
  for (const s of songs) console.log(`   - ${s.id}: ${s.title} (${s.palette}, ${s.mascot})`);

  const results = [];
  for (const song of songs) {
    try {
      const r = await publishOne(song);
      results.push(r);
    } catch (e) {
      console.error(`❌ Failed ${song.id}:`, e.message);
      results.push({song, error: e.message});
    }
  }

  console.log(`\n━━━ Summary ━━━`);
  for (const r of results) {
    if (r.error) console.log(`❌ ${r.song.id}: ${r.error}`);
    else        console.log(`✅ ${r.song.id}: ${r.url}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
