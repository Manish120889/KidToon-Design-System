// scripts/render.js
// Renders a single song to MP4.
//   Usage: node scripts/render.js --song=twinkle-twinkle [--out=out/twinkle-twinkle.mp4]

import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia} from '@remotion/renderer';
import {synthesizeSong} from './synthesize-audio.js';

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    args[k] = v ?? true;
  }
  return args;
}

export async function renderSong(songId, outPath) {
  const songPath = path.resolve(`songs/${songId}.json`);
  const song = JSON.parse(fs.readFileSync(songPath, 'utf-8'));

  // 1. Synthesize audio (3-5 min target) and capture lyric event timings
  console.log(`🎵 Synthesizing audio for ${song.title}...`);
  const {wav, events, totalFrames, durationSec} = synthesizeSong(song, 240, 30);
  const audioDir = path.resolve('public/audio');
  fs.mkdirSync(audioDir, {recursive: true});
  const audioFile = `audio/${songId}.wav`;
  fs.writeFileSync(path.join(audioDir, `${songId}.wav`), wav);
  console.log(`   ${durationSec.toFixed(1)}s, ${events.length} lyric events`);

  // 2. Bundle Remotion
  console.log('📦 Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: path.resolve('remotion/index.ts'),
    webpackOverride: (c) => c,
  });

  // 3. Build composition props
  const inputProps = {
    songId: song.id,
    title: song.title,
    palette: song.palette,
    mascot: song.mascot,
    bpm: song.bpm,
    audioSrc: audioFile,
    lyricEvents: events,
  };

  // 4. Get composition (uses defaultProps merged with our overrides)
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'KidToonSong',
    inputProps,
  });

  // 5. Override duration to match audio
  composition.durationInFrames = totalFrames;

  // 6. Render
  const outFile = outPath || path.resolve(`out/${songId}.mp4`);
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  console.log(`🎬 Rendering to ${outFile}...`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outFile,
    inputProps,
    onProgress: ({progress}) => {
      const pct = Math.round(progress * 100);
      if (pct % 5 === 0) process.stdout.write(`\r   ${pct}%   `);
    },
  });
  console.log(`\n✅ Done: ${outFile}`);
  return outFile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  const song = args.song;
  if (!song) {
    console.error('Usage: node scripts/render.js --song=<song-id>');
    process.exit(1);
  }
  renderSong(song, args.out).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
