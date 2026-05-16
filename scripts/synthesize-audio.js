// scripts/synthesize-audio.js
// Reads a song JSON, generates a melody + soft pad WAV file under public/audio/.
// Pure Node — no native deps. Writes 16-bit PCM @ 44.1kHz mono.

import fs from 'node:fs';
import path from 'node:path';

const NOTE_FREQ = {
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99
};

const SAMPLE_RATE = 44100;

// Soft bell-ish voice: a few harmonics + quick attack + slow decay.
function renderNoteSamples(freq, durationSec) {
  const total = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(total);
  // Harmonic mix (gentle, kid-friendly)
  const harmonics = [
    {mult: 1,    amp: 0.55},
    {mult: 2,    amp: 0.20},
    {mult: 3,    amp: 0.08},
    {mult: 4,    amp: 0.04},
  ];

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    // ADSR envelope — quick attack, gentle decay
    let env;
    const attack = 0.02;
    const release = Math.min(0.15, durationSec * 0.3);
    if (t < attack) {
      env = t / attack;
    } else if (t > durationSec - release) {
      env = Math.max(0, (durationSec - t) / release);
    } else {
      env = 1;
    }
    let s = 0;
    for (const h of harmonics) {
      s += Math.sin(2 * Math.PI * freq * h.mult * t) * h.amp;
    }
    samples[i] = s * env * 0.5;
  }
  return samples;
}

function renderRest(durationSec) {
  return new Float32Array(Math.floor(durationSec * SAMPLE_RATE));
}

// Add a soft "drum" tick (low sine + noise burst) every beat for groove.
function renderTick(durationSec) {
  const total = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const tickDur = Math.min(0.06, durationSec);
  const tickSamples = Math.floor(tickDur * SAMPLE_RATE);
  for (let i = 0; i < tickSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.max(0, 1 - t / tickDur);
    // low thump
    samples[i] += Math.sin(2 * Math.PI * 80 * t) * env * 0.18;
    // soft noise
    samples[i] += (Math.random() * 2 - 1) * env * env * 0.04;
  }
  return samples;
}

function concatFloat32(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function mixAdd(target, source, offsetSamples) {
  const end = Math.min(target.length, offsetSamples + source.length);
  for (let i = offsetSamples; i < end; i++) {
    target[i] += source[i - offsetSamples];
  }
}

function floatToPcm16(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm;
}

function buildWav(pcm) {
  const blockAlign = 2; // mono 16-bit
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);             // PCM
  buffer.writeUInt16LE(1, 22);             // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);            // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) {
    buffer.writeInt16LE(pcm[i], 44 + i * 2);
  }
  return buffer;
}

/**
 * Synthesizes audio for a song.
 *
 * @param songJson — parsed JSON of a song file
 * @param targetDurationSec — pad/loop so the output >= this length (3-5 min target)
 * @returns { wav: Buffer, events: [{startFrame, endFrame, word}], totalFrames }
 */
export function synthesizeSong(songJson, targetDurationSec = 240, fps = 30) {
  const beatDurSec = 60 / songJson.bpm;
  const segments = [];   // Float32Array per note/rest
  const events = [];     // {startFrame, endFrame, word}
  const tickBuffer = renderTick(beatDurSec);

  let currentSamples = 0;

  const playOneVerse = () => {
    for (const verse of songJson.verses) {
      for (let i = 0; i < verse.lyrics.length; i++) {
        const note = verse.notes[i];
        const beats = verse.beats[i];
        const durSec = beats * beatDurSec;
        const freq = NOTE_FREQ[note];
        if (!freq) throw new Error(`Unknown note: ${note}`);

        const startFrame = Math.floor((currentSamples / SAMPLE_RATE) * fps);
        const seg = renderNoteSamples(freq, durSec);
        segments.push(seg);
        currentSamples += seg.length;
        const endFrame = Math.floor((currentSamples / SAMPLE_RATE) * fps);
        events.push({startFrame, endFrame, word: verse.lyrics[i]});
      }
      // verse-end pause: half a beat
      const pause = renderRest(beatDurSec * 0.5);
      segments.push(pause);
      currentSamples += pause.length;
    }
  };

  // Play verses on loop until target duration reached
  let loops = 0;
  while ((currentSamples / SAMPLE_RATE) < targetDurationSec && loops < 12) {
    playOneVerse();
    loops++;
    // gap between loops
    if ((currentSamples / SAMPLE_RATE) < targetDurationSec) {
      const gap = renderRest(beatDurSec * 2);
      segments.push(gap);
      currentSamples += gap.length;
    }
  }

  // Concat melody
  const melody = concatFloat32(segments);

  // Overlay drum ticks on every beat
  const totalBeats = Math.floor(melody.length / SAMPLE_RATE / beatDurSec);
  for (let b = 0; b < totalBeats; b++) {
    const off = Math.floor(b * beatDurSec * SAMPLE_RATE);
    mixAdd(melody, tickBuffer, off);
  }

  // Fade in / out
  const fadeSamples = Math.floor(SAMPLE_RATE * 0.4);
  for (let i = 0; i < fadeSamples && i < melody.length; i++) {
    const g = i / fadeSamples;
    melody[i] *= g;
    melody[melody.length - 1 - i] *= g;
  }

  // Soft normalize: peak to 0.85
  let peak = 0;
  for (let i = 0; i < melody.length; i++) peak = Math.max(peak, Math.abs(melody[i]));
  if (peak > 0) {
    const g = 0.85 / peak;
    for (let i = 0; i < melody.length; i++) melody[i] *= g;
  }

  const pcm = floatToPcm16(melody);
  const wav = buildWav(pcm);
  const totalFrames = Math.floor((melody.length / SAMPLE_RATE) * fps);

  return {wav, events, totalFrames, durationSec: melody.length / SAMPLE_RATE};
}

// CLI usage: node scripts/synthesize-audio.js <song-id>
if (import.meta.url === `file://${process.argv[1]}`) {
  const songId = process.argv[2];
  if (!songId) {
    console.error('Usage: node scripts/synthesize-audio.js <song-id>');
    process.exit(1);
  }
  const songPath = path.resolve(`songs/${songId}.json`);
  const song = JSON.parse(fs.readFileSync(songPath, 'utf-8'));
  const {wav, events, totalFrames, durationSec} = synthesizeSong(song);
  const outDir = path.resolve('public/audio');
  fs.mkdirSync(outDir, {recursive: true});
  const outPath = path.join(outDir, `${songId}.wav`);
  fs.writeFileSync(outPath, wav);
  console.log(`✅ Wrote ${outPath}`);
  console.log(`   Duration: ${durationSec.toFixed(1)}s (${totalFrames} frames @ 30fps)`);
  console.log(`   Lyric events: ${events.length}`);
}
