// scripts/pick-songs.js — picks N songs that haven't been published in the last 14 days.

import fs from 'node:fs';
import path from 'node:path';

const HISTORY_PATH = path.resolve('state/history.json');
const SONGS_DIR = path.resolve('songs');
const COOLDOWN_DAYS = 14;

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return {published: []};
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
}

function saveHistory(h) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), {recursive: true});
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2));
}

function loadAllSongs() {
  return fs
    .readdirSync(SONGS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SONGS_DIR, f), 'utf-8')));
}

export function pickSongs(n = 3) {
  const history = loadHistory();
  const allSongs = loadAllSongs();
  const now = Date.now();
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  // Score: prefer songs never published, then oldest published.
  const scored = allSongs.map((song) => {
    const last = history.published
      .filter((p) => p.songId === song.id)
      .reduce((m, p) => Math.max(m, new Date(p.at).getTime()), 0);
    return {song, last};
  });

  // Drop songs published within cooldown
  const eligible = scored.filter(({last}) => now - last >= cooldownMs);

  // If not enough, allow oldest cooldown-violators too
  const pool = eligible.length >= n ? eligible : scored;

  // Sort by oldest last-published (or never = 0)
  pool.sort((a, b) => a.last - b.last);

  // Take N, but introduce some variety: pick from top half
  const picked = [];
  for (let i = 0; i < n && pool.length; i++) {
    // Pick from first half of pool to add slight randomness while still favoring oldest
    const topHalf = Math.max(1, Math.ceil(pool.length / 2));
    const idx = Math.floor(Math.random() * topHalf);
    picked.push(pool[idx].song);
    pool.splice(idx, 1);
  }
  return picked;
}

export function markPublished(songId, youtubeId, url) {
  const history = loadHistory();
  history.published.push({
    songId,
    youtubeId,
    url,
    at: new Date().toISOString(),
  });
  saveHistory(history);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const picked = pickSongs(parseInt(process.argv[2] ?? '3', 10));
  console.log('Picked:');
  for (const s of picked) console.log(` - ${s.id}: ${s.title}`);
}
