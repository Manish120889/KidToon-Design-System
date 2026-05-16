// scripts/upload-x.js — Twitter / X API v2 video upload with chunked transfer.
//
// Required env:
//   X_API_KEY            (OAuth 1.0a consumer key)
//   X_API_SECRET         (OAuth 1.0a consumer secret)
//   X_ACCESS_TOKEN       (OAuth 1.0a access token for the posting account)
//   X_ACCESS_SECRET      (OAuth 1.0a access token secret)
//
// X video upload still requires OAuth 1.0a (chunked media-upload endpoint).
// Use `crypto` to sign requests; we avoid pulling in a heavy SDK.

import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';

const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const CHUNK = 5 * 1024 * 1024;

function oauth1Sign({ method, url, params, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const allParams = { ...params, ...oauthParams };
  const sortedQ = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');
  const base = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedQ)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return 'OAuth ' + Object.entries(oauthParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ');
}

function creds() {
  const c = {
    consumerKey: process.env.X_API_KEY,
    consumerSecret: process.env.X_API_SECRET,
    token: process.env.X_ACCESS_TOKEN,
    tokenSecret: process.env.X_ACCESS_SECRET,
  };
  for (const k of Object.keys(c)) if (!c[k]) throw new Error(`Missing env ${k}`);
  return c;
}

async function mediaUpload(form, queryParams = {}) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const c = creds();
  // For multipart, body params are NOT included in the signature base — only query params.
  const auth = oauth1Sign({
    method: 'POST', url, params: queryParams,
    consumerKey: c.consumerKey, consumerSecret: c.consumerSecret,
    token: c.token, tokenSecret: c.tokenSecret,
  });
  const qs = new URLSearchParams(queryParams).toString();
  const res = await fetch(`${url}${qs ? '?' + qs : ''}`, {
    method: 'POST', headers: { authorization: auth }, body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`media/upload ${res.status}: ${t.slice(0, 400)}`);
  }
  return res.json();
}

async function chunkedUpload(videoPath) {
  const stat = fs.statSync(videoPath);
  if (stat.size > MAX_VIDEO_BYTES) throw new Error(`Video exceeds 512MB`);
  console.log(`📤 X: chunked upload (${(stat.size/1024/1024).toFixed(2)} MB)`);

  // INIT
  const initForm = new FormData();
  initForm.append('command', 'INIT');
  initForm.append('media_type', 'video/mp4');
  initForm.append('total_bytes', String(stat.size));
  initForm.append('media_category', 'tweet_video');
  const init = await mediaUpload(initForm);
  const mediaId = init.media_id_string;
  console.log(`   media_id: ${mediaId}`);

  // APPEND
  const fd = fs.openSync(videoPath, 'r');
  const buf = Buffer.alloc(CHUNK);
  let segment = 0;
  let offset = 0;
  while (offset < stat.size) {
    const bytes = fs.readSync(fd, buf, 0, CHUNK, offset);
    const chunk = buf.subarray(0, bytes);
    const form = new FormData();
    form.append('command', 'APPEND');
    form.append('media_id', mediaId);
    form.append('segment_index', String(segment));
    form.append('media', new Blob([chunk]), 'chunk.bin');
    await mediaUpload(form);
    console.log(`   appended segment ${segment} (${bytes} B)`);
    offset += bytes; segment++;
  }
  fs.closeSync(fd);

  // FINALIZE
  const finForm = new FormData();
  finForm.append('command', 'FINALIZE');
  finForm.append('media_id', mediaId);
  const fin = await mediaUpload(finForm);
  // Wait for processing if Twitter says so
  if (fin.processing_info) {
    let info = fin.processing_info;
    while (info && info.state !== 'succeeded') {
      if (info.state === 'failed') throw new Error(`X media processing failed: ${JSON.stringify(info.error)}`);
      const wait = (info.check_after_secs || 5) * 1000;
      console.log(`   processing… (${info.state}, retry in ${wait/1000}s)`);
      await new Promise(r => setTimeout(r, wait));
      const url = `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`;
      const c = creds();
      const auth = oauth1Sign({
        method: 'GET', url: 'https://upload.twitter.com/1.1/media/upload.json',
        params: { command: 'STATUS', media_id: mediaId },
        consumerKey: c.consumerKey, consumerSecret: c.consumerSecret,
        token: c.token, tokenSecret: c.tokenSecret,
      });
      const r = await fetch(url, { headers: { authorization: auth } });
      const j = await r.json();
      info = j.processing_info;
    }
  }
  return mediaId;
}

async function postTweet({ text, mediaId }) {
  const url = 'https://api.twitter.com/2/tweets';
  const c = creds();
  const auth = oauth1Sign({
    method: 'POST', url, params: {},
    consumerKey: c.consumerKey, consumerSecret: c.consumerSecret,
    token: c.token, tokenSecret: c.tokenSecret,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 280), media: { media_ids: [mediaId] } }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`/2/tweets ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

export async function uploadX({ videoPath, caption, dryRun }) {
  if (dryRun) { console.log(`🧪 [dry-run] X post: "${caption.slice(0,80)}"`); return { id: 'DRY', url: 'n/a' }; }
  const mediaId = await chunkedUpload(videoPath);
  const tweet = await postTweet({ text: caption, mediaId });
  const id = tweet.data.id;
  const url = `https://x.com/i/status/${id}`;
  console.log(`✅ X posted: ${url}`);
  return { id, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [vid, ...rest] = process.argv.slice(2);
  uploadX({ videoPath: vid, caption: rest.join(' ') || 'Test from KidToon pipeline' })
    .then(r => console.log(r))
    .catch(e => { console.error(e); process.exit(1); });
}
