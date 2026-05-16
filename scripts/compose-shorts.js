// scripts/compose-shorts.js — generate 9:16 vertical Shorts/Reels crop with
// burnt-in subtitles from the 16:9 master MP4.
//
// Requires ffmpeg on PATH. The GH Actions runner has it preinstalled;
// for local dev: `brew install ffmpeg` or `apt-get install ffmpeg`.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

/**
 * Crop 1920x1080 → 1080x1920, trim to maxDuration seconds, burn captions.
 *
 * @param {object} args
 * @param {string} args.inputPath     — 16:9 master MP4
 * @param {string} args.outputPath    — output 9:16 MP4
 * @param {number} [args.maxDuration] — seconds; default 60 for Shorts
 * @param {string} [args.srtPath]     — optional .srt to burn into the video
 */
export async function composeShorts({ inputPath, outputPath, maxDuration = 60, srtPath }) {
  if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // ffmpeg video filter:
  //   1. blurred bg pad (scale 1080x1920 + gaussian blur)
  //   2. center crop of the 16:9 source onto that bg
  //   3. optional subtitles burn
  // We use the "split" trick to use the same source twice (bg + fg) in one pass.
  const subsFilter = srtPath
    ? `,subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='Fontname=Fredoka,Fontsize=22,PrimaryColour=&HFFFFFF,OutlineColour=&H000033,Outline=3,BorderStyle=1,Alignment=2,MarginV=120'`
    : '';

  const vf = [
    '[0:v]split=2[bg][fg]',
    '[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:1[bgblur]',
    '[fg]scale=1080:608:force_original_aspect_ratio=decrease[fgscaled]',
    `[bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2${subsFilter}[v]`,
  ].join(';');

  const args = [
    '-y', '-i', inputPath,
    '-t', String(maxDuration),
    '-filter_complex', vf,
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '128k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];
  console.log(`🎬 ffmpeg compose-shorts → ${outputPath}`);
  await run('ffmpeg', args);
  return outputPath;
}

/**
 * Build a simple .srt file from { word, start, end } records.
 * Groups words into ~3-second chunks for kid-friendly readability.
 */
export function writeSrtFromWords(words, srtPath) {
  const CHUNK = 3.0;
  let cur = { start: null, end: null, words: [] };
  const lines = [];
  let idx = 1;
  const flush = () => {
    if (!cur.words.length) return;
    lines.push(String(idx++));
    lines.push(`${fmt(cur.start)} --> ${fmt(cur.end)}`);
    lines.push(cur.words.join(' '));
    lines.push('');
  };
  for (const w of words) {
    if (cur.start == null) cur.start = w.start;
    cur.end = w.end;
    cur.words.push(w.text);
    if (cur.end - cur.start >= CHUNK) { flush(); cur = { start: null, end: null, words: [] }; }
  }
  flush();
  fs.mkdirSync(path.dirname(srtPath), { recursive: true });
  fs.writeFileSync(srtPath, lines.join('\n'));
  return srtPath;
}

function fmt(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/compose-shorts.js <input.mp4> <output.mp4> [srt]');
    process.exit(1);
  }
  composeShorts({ inputPath: input, outputPath: output, srtPath: process.argv[4] })
    .then(p => console.log('Done:', p))
    .catch(e => { console.error(e); process.exit(1); });
}
