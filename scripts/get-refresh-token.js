// scripts/get-refresh-token.js
// One-time helper that prints a permanent refresh token you'll paste into GitHub Secrets.
//
// Setup before running:
//   1. Create a Google Cloud project, enable YouTube Data API v3.
//   2. Create OAuth credentials (Desktop app type). Download the JSON.
//   3. Make a .env file in this folder with:
//        YT_CLIENT_ID=...
//        YT_CLIENT_SECRET=...
//   4. Run: node scripts/get-refresh-token.js
//   5. A browser opens. Sign in with the Google account that owns your YouTube channel.
//   6. The redirect URL after auth contains ?code=... — copy that code into your terminal.
//   7. The script prints YT_REFRESH_TOKEN. Save it. Don't commit it.

import {google} from 'googleapis';
import http from 'node:http';
import open from 'open';
import 'dotenv/config';
import readline from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

const REDIRECT_PORT = 41891;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

async function getCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err) {
        res.writeHead(400, {'Content-Type': 'text/html'});
        res.end(`<h1>Auth error: ${err}</h1>`);
        server.close();
        reject(new Error(err));
        return;
      }
      if (code) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(`<h1>✅ Got it!</h1><p>You can close this tab and return to the terminal.</p>`);
        server.close();
        resolve(code);
      }
    });
    server.listen(REDIRECT_PORT);
  });
}

async function main() {
  const {YT_CLIENT_ID, YT_CLIENT_SECRET} = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) {
    console.error('❌ Missing YT_CLIENT_ID or YT_CLIENT_SECRET in .env');
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('🌐 Opening browser for authorization...');
  console.log('   If it doesn\'t open, visit this URL manually:');
  console.log('   ' + authUrl);
  console.log();

  await open(authUrl);

  const code = await getCode();
  const {tokens} = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    console.error('❌ No refresh_token returned. Try running again with prompt=consent.');
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Add these to your GitHub repo as Actions Secrets:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`YT_CLIENT_ID=${YT_CLIENT_ID}`);
  console.log(`YT_CLIENT_SECRET=${YT_CLIENT_SECRET}`);
  console.log(`YT_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Done. You will not see the refresh token again — save it now.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
