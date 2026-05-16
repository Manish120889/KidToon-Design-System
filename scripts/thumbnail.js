// scripts/thumbnail.js
// Generates a 1280x720 thumbnail using a headless Chromium (already available via Remotion deps).
// Cheaper approach: render a single frame of the composition via Remotion's renderStill().

import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderStill} from '@remotion/renderer';
import {synthesizeSong} from './synthesize-audio.js';

export async function generateThumbnail(songId, outPath) {
  const songPath = path.resolve(`songs/${songId}.json`);
  const song = JSON.parse(fs.readFileSync(songPath, 'utf-8'));

  // Make sure the audio file exists so the composition can resolve it
  const audioDir = path.resolve('public/audio');
  if (!fs.existsSync(path.join(audioDir, `${songId}.wav`))) {
    const {wav, events} = synthesizeSong(song, 240, 30);
    fs.mkdirSync(audioDir, {recursive: true});
    fs.writeFileSync(path.join(audioDir, `${songId}.wav`), wav);
    song._events = events;
  }

  const bundleLocation = await bundle({entryPoint: path.resolve('remotion/index.ts')});
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'KidToonSong',
    inputProps: {
      songId: song.id,
      title: song.title,
      palette: song.palette,
      mascot: song.mascot,
      bpm: song.bpm,
      audioSrc: `audio/${songId}.wav`,
      lyricEvents: song._events ?? [{word: song.title, startFrame: 30, endFrame: 90}],
    },
  });

  const outFile = outPath || path.resolve(`out/${songId}.jpg`);
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: outFile,
    frame: 60, // 2 sec in
    imageFormat: 'jpeg',
    jpegQuality: 90,
  });

  console.log(`🖼  Wrote thumbnail: ${outFile}`);
  return outFile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const song = process.argv[2];
  if (!song) {
    console.error('Usage: node scripts/thumbnail.js <song-id>');
    process.exit(1);
  }
  generateThumbnail(song).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
