// scripts/upload-instagram.js — Meta Graph API Reels upload.
//
// Reels are a 3-step process:
//   1. POST /{ig-user-id}/media     with video_url + caption  → container_id
//   2. Poll  /{container_id}?fields=status_code  until FINISHED
//   3. POST /{ig-user-id}/media_publish?creation_id=container_id
//
// IMPORTANT: Instagram's container endpoint fetches the video from a PUBLIC URL
// you provide — it cannot upload from your disk directly. Host the MP4 on S3,
// Cloudflare R2, GCS, or even a temporary GitHub release asset. Set
// INSTAGRAM_PUBLIC_BASE_URL to where your renders are served from.
//
// Required env:
//   IG_USER_ID                   — IG business account ID (from Graph API)
//   META_ACCESS_TOKEN            — long-lived page access token with instagram_content_publish
//   INSTAGRAM_PUBLIC_BASE_URL    — base URL where the mp4 in your /out folder is fetchable

import 'dotenv/config';
import path from 'node:path';

const GRAPH = 'https://graph.facebook.com/v21.0';

function env() {
  const e = {
    igUser: process.env.IG_USER_ID,
    token: process.env.META_ACCESS_TOKEN,
    publicBase: process.env.INSTAGRAM_PUBLIC_BASE_URL,
  };
  for (const k of Object.keys(e)) if (!e[k]) throw new Error(`Missing env ${k}`);
  return e;
}

async function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST ${url} ${res.status}: ${t.slice(0, 400)}`);
  }
  return res.json();
}

async function getStatus(containerId, token) {
  const res = await fetch(`${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function uploadInstagram({ videoPath, caption, dryRun, mode = 'reels' }) {
  if (dryRun) { console.log(`🧪 [dry-run] IG ${mode}: "${caption.slice(0,80)}"`); return { id: 'DRY', url: 'n/a' }; }
  const { igUser, token, publicBase } = env();

  // Build the public URL. Caller provides a path under publicBase.
  const filename = path.basename(videoPath);
  const videoUrl = `${publicBase.replace(/\/$/, '')}/${filename}`;
  console.log(`📤 IG Reels: using public URL ${videoUrl}`);

  // 1. Container
  const containerParams = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption: caption.slice(0, 2200),
    share_to_feed: 'true',
    access_token: token,
  };
  const c = await postForm(`${GRAPH}/${igUser}/media`, containerParams);
  const containerId = c.id;
  console.log(`   container_id: ${containerId}`);

  // 2. Poll
  const deadline = Date.now() + 5 * 60_000;
  let status = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await getStatus(containerId, token);
    status = s.status_code;
    console.log(`   container status: ${status}`);
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`IG container failed: ${status}`);
  }
  if (status !== 'FINISHED') throw new Error('IG container timed out');

  // 3. Publish
  const pub = await postForm(`${GRAPH}/${igUser}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });
  const id = pub.id;
  // Fetch permalink for nicer logging
  let url = `https://www.instagram.com/reel/${id}/`;
  try {
    const meta = await fetch(`${GRAPH}/${id}?fields=permalink&access_token=${token}`);
    if (meta.ok) { const j = await meta.json(); if (j.permalink) url = j.permalink; }
  } catch {}
  console.log(`✅ IG posted: ${url}`);
  return { id, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [vid, ...rest] = process.argv.slice(2);
  uploadInstagram({ videoPath: vid, caption: rest.join(' ') || 'Test reel' })
    .then(r => console.log(r))
    .catch(e => { console.error(e); process.exit(1); });
}
