// scripts/upload.js — YouTube Data API v3 upload.
// Reads OAuth credentials from env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// Required setup is documented in README.md.

import fs from 'node:fs';
import {google} from 'googleapis';
import 'dotenv/config';

function makeOAuth() {
  const {YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN} = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    throw new Error('Missing YT_CLIENT_ID, YT_CLIENT_SECRET, or YT_REFRESH_TOKEN env vars.');
  }
  const oauth = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
  oauth.setCredentials({refresh_token: YT_REFRESH_TOKEN});
  return oauth;
}

export async function uploadVideo({videoPath, thumbnailPath, title, description, tags, dryRun}) {
  if (dryRun) {
    console.log(`🧪 [dry-run] Would upload "${title}" from ${videoPath}`);
    return {id: 'DRY_RUN', url: 'n/a'};
  }

  const auth = makeOAuth();
  const youtube = google.youtube({version: 'v3', auth});

  console.log(`⬆️  Uploading "${title}"...`);
  const insertRes = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: tags?.slice(0, 15),
        categoryId: '10', // Music
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus: 'public',
        madeForKids: true,           // ✅ COPPA-compliant
        selfDeclaredMadeForKids: true,
        embeddable: true,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = insertRes.data.id;
  console.log(`   videoId = ${videoId}`);

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    console.log(`   Setting thumbnail...`);
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {body: fs.createReadStream(thumbnailPath)},
      });
    } catch (e) {
      console.warn(`   ⚠️  Thumbnail upload failed (channel may not be eligible yet): ${e.message}`);
    }
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`✅ Published: ${url}`);
  return {id: videoId, url};
}
