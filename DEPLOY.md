# KidToon Pipeline v2 — Deploy Guide

End-to-end deployment for the automated daily AI-music-video pipeline.
Same architecture handles both **KidToon mode** (kid-safe nursery rhymes
for the existing channel) and **News mode** (trend-driven viral pop, per
the brief).

> **Realistic expectation:** day-one setup is ~3 hours including API
> account creation. The actual code is ready to ship.

---

## 0. What you're deploying

```
Trends ──► LLM lyrics ──► Suno audio ──► Remotion 16:9 ──► ffmpeg 9:16
   │           │              │              │                │
   v           v              v              v                v
Google     Anthropic        PiAPI         already           burnt-in
News RSS   /OpenAI         /GoAPI         in repo           subtitles
                                              │
                                              v
                                        Approval gate
                                       (Slack + file
                                        queue or auto)
                                              │
                                ┌─────────────┼─────────────┐
                                v             v             v
                            YouTube         X            Instagram
                          Data API v3   API v2 chunked   Graph Reels
```

Five things you provide:
1. **API keys** (LLM, Suno, social platforms) — listed in `.env.example`
2. **Hosting** (GitHub Actions OR Vercel cron OR Make.com — pick one)
3. **A public CDN** for IG to fetch MP4s from (R2 / S3 / GitHub release)
4. **Decisions:** mode, posts/day, approval gate on/off
5. **A real test run** before flipping to auto-publish

---

## 1. Pick a runtime

### Option A — GitHub Actions (recommended; free)

Best for: most people. 2,000 free minutes/month covers ~3 runs/day.

```bash
git remote add origin https://github.com/<you>/kidtoon-pipeline.git
git push -u origin main
```

Then in **Settings → Secrets → Actions** add every variable from
`.env.example` that you intend to use. The included workflow at
`.github/workflows/daily-v2.yml` runs at **06:00 UTC daily** plus exposes
a "Run workflow" button.

### Option B — Vercel Cron

Best for: anyone already on Vercel.

```bash
vercel --prod
```

Add `vercel.json`:
```json
{ "crons": [{ "path": "/api/daily", "schedule": "0 6 * * *" }] }
```

Wrap `scripts/daily-v2.js` in `api/daily.js`:
```js
import { main } from '../scripts/daily-v2.js';
export default async function handler(req, res) {
  try { await main(); res.status(200).json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
}
```
Set env vars in **Vercel → Project → Settings → Environment Variables**.

### Option C — Make.com (low-code)

Follow `make-blueprint.yaml` to wire the 14-step scenario. No code; pays
~$9-29/mo for the operations.

---

## 2. Provision the APIs

| Service | Where | What you need |
|---|---|---|
| **Anthropic** | https://console.anthropic.com | `ANTHROPIC_API_KEY` ($5 free credit) |
| **Suno** | PiAPI.ai *or* self-host gcui-art/suno-api on Vercel with your Suno cookie | `SUNO_API_BASE` + optional `SUNO_API_KEY` |
| **YouTube** | https://console.cloud.google.com (Data API v3) | OAuth Desktop credentials → refresh token via `npm run get-token` |
| **X (Twitter)** | https://developer.twitter.com → Basic tier $200/mo OR Free for posting only | OAuth 1.0a consumer + access keys with **Read+Write** |
| **Instagram** | https://developers.facebook.com → IG Business account linked to a Facebook Page | Long-lived page access token with `instagram_content_publish` |
| **Slack** (optional) | https://api.slack.com/messaging/webhooks | Webhook URL for approval pings |
| **Public CDN** for IG | Cloudflare R2 (free 10GB) or AWS S3 | Public bucket + `INSTAGRAM_PUBLIC_BASE_URL` |

> **Cost gotcha:** as of writing, X requires a paid **Basic** tier
> ($200/mo) for media uploads to work reliably. If your budget can't
> swing that, set `SKIP_PLATFORMS=x` and post tweets manually from the
> dashboard.

---

## 3. Local sanity check before going live

```bash
cd kidtoon-pipeline
cp .env.example .env
# Fill in keys

npm install
npm run trends          # scrape only, prints JSON
npm run lyrics          # generates one song
npm run daily:dryrun    # full pipeline, no uploads
```

The `daily:dryrun` writes everything under `out/runs/<runId>/` so you can
inspect lyrics, audio, video, captions before letting it post anywhere.

---

## 4. Approval gate workflow

Three modes, controlled by `AUTO_APPROVE` env var:

- **`AUTO_APPROVE=0`** (default; recommended weeks 1-4)
  Pipeline writes the run to `state/pending/<id>.json` and waits.
  Approve via:
  - CLI: `npm run approve -- <runId>`
  - Reject: `npm run approve -- <runId> --reject -n "verse 2 weak"`
  - Dashboard: open **Pipeline Dashboard.html** and click *Approve & publish*
  - Slack: if `SLACK_WEBHOOK_URL` is set, you get a heads-up message
- **`AUTO_APPROVE=1`** — flips to fully autonomous. Set this only after
  you've watched 7+ successful runs without intervention.
- **Soft-launch hybrid** — set `AUTO_APPROVE=0` but `SKIP_PLATFORMS=x,instagram`
  so YouTube auto-publishes and the others wait.

---

## 5. Fail-safes (already wired)

| Risk | Mitigation in code |
|---|---|
| Google News rate-limits the scraper | `PROXY_URL` env (residential proxy) + exponential backoff in `scrape-trends.js` |
| Suno generates distorted audio (< 1 MB) | `MIN_AUDIO_BYTES` check + retry once with adjusted prompt in `suno-generate.js` |
| Suno times out (> 10 min) | Hard deadline; orchestrator moves to next backup topic |
| LLM produces unsafe content | `BANNED_WORDS` post-filter in `llm-lyrics.js` |
| Upload chunk fails on large files | X uploader uses 5MB chunked transfer; IG uses public URL pull |
| GitHub Actions runner dies | Workflow uploads `out/runs/**` as artifact on failure |
| YouTube COPPA | `madeForKids: true` set on every upload (kidtoon mode) |

---

## 6. Quotas to watch

- **YouTube Data API:** 10,000 units/day (each upload = 1,600). Default cron @ 1 video/day = 16% of quota.
- **X Basic tier:** 100 posts/day, 50K read/month.
- **Instagram:** 50 publishes/day per IG account.
- **Anthropic:** ~30 cents per song.
- **Suno Pro:** 500 generations/month at $10/mo OR PiAPI ~10 cents/song.

---

## 7. Day-by-day rollout

| Day | Goal | Stop condition |
|---|---|---|
| 1 | All API keys live. `npm run daily:dryrun` produces a valid mp4. | Any stage fails |
| 2 | First **kidtoon-mode** run goes live on YouTube *only*. Manual approval. | Video is rejected |
| 3 | Add X publishing. Approval still manual. | Caption format off |
| 4 | Add Instagram. Verify the public-URL fetch works from your CDN. | Permission errors |
| 5-6 | Two manual-approved runs/day. Tune Suno prompts in `PROMPT_LIBRARY.md`. | Audio quality < bar |
| 7 | Flip `AUTO_APPROVE=1`. Soak for 48h. | Anything embarrassing |

---

## 8. Things I cannot do from a design environment

Said straight: **this design environment can write the code and verify
it parses, but it cannot:**

- Actually run the daily cron — that's your hosting provider's job
- Hold your OAuth tokens — those live in GitHub Secrets / Vercel env
- Test against the live X/IG APIs — those require your account
- Fetch from YouTube — same reason

What I *can* do: maintain the code, add new platforms, tweak prompts,
fix bugs you hit during the rollout. Send screenshots of any errors and
I'll iterate.

---

## 9. Files in this folder

```
kidtoon-pipeline/
  scripts/
    scrape-trends.js          Google News + Trends scraper + safety filter
    llm-lyrics.js             Anthropic/OpenAI lyric + caption generator
    suno-generate.js          Suno wrapper with poll/retry/QA
    render.js                 Remotion → MP4 (existing)
    compose-shorts.js         ffmpeg 1080×1920 + burnt subs
    thumbnail.js              1280×720 thumbnail (existing)
    approval-gate.js          file-queue + Slack pinger
    approve.js                CLI: approve <id>, --reject -n "why", --list
    upload.js                 YouTube Data API v3 (existing)
    upload-x.js               Twitter API v2 + OAuth 1.0a chunked
    upload-instagram.js       Meta Graph Reels publish
    daily.js                  v1 orchestrator (synth audio, KidToon only)
    daily-v2.js               v2 orchestrator (Suno + multi-platform)
    pick-songs.js             rotation for v1 (existing)
    get-refresh-token.js      one-time YouTube OAuth (existing)
  remotion/                   video composition (existing)
  songs/                      song JSON for v1 mode (existing)
  state/
    history.json              v1 publish history (existing)
    pending/<id>.json         awaiting approval
    approved/<id>.json        approved, will publish on next run
    rejected/<id>.json        rejected
  .github/workflows/
    daily-upload.yml          v1 cron (existing)
    daily-v2.yml              v2 cron (this guide)
  .env.example                every env var the pipeline reads
  package.json
  PROMPT_LIBRARY.md           every LLM prompt + Suno style tag
  make-blueprint.yaml         Make.com-compatible spec
  DEPLOY.md                   you are here
  README.md                   v1 doc (existing)
```

Plus, at the project root:

```
Pipeline Dashboard.html       operator UI (open in browser)
pipeline-dashboard.jsx        its source
```
