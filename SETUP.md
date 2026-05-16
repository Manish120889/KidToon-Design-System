# Setup guide — KidToon Daily Pipeline

A step-by-step walkthrough. Follow this once; the pipeline runs itself after that.

---

## ⏱ Time required

| Step | Time |
|---|---|
| Google Cloud setup | 10 min |
| Get refresh token | 5 min |
| Push to GitHub + secrets | 10 min |
| First test run | 15 min (render time) |
| **Total** | **~40 min one-time** |

---

## Step 1 — Download & extract

You should have a folder called `kidtoon-pipeline/`. Unzip it somewhere you can navigate to in a terminal.

```bash
cd kidtoon-pipeline
npm install
```

This installs Remotion (~500 MB, includes Chromium for headless rendering) plus the YouTube API client. Takes 2–3 minutes.

---

## Step 2 — Test a local render

Before touching YouTube, verify the rendering works:

```bash
node scripts/synthesize-audio.js twinkle-twinkle
# → public/audio/twinkle-twinkle.wav appears

node scripts/render.js --song=twinkle-twinkle
# → out/twinkle-twinkle.mp4 appears (~10 min on a laptop)
```

Open `out/twinkle-twinkle.mp4`. You should see Sunny the Star bobbing on a starry night background with bouncing karaoke lyrics. If anything looks broken, that's a code issue I need to fix — send me a screenshot.

---

## Step 3 — Google Cloud setup

1. **Go to https://console.cloud.google.com**
2. Top bar → "Select a project" → **New Project** → name: `KidToon Uploader` → Create.
3. Wait ~30 seconds for the project to be ready, then **select it**.
4. **APIs & Services → Library** → search "YouTube Data API v3" → click → **Enable**.
5. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name: `KidToon Uploader`
   - User support email: your email
   - Developer contact: your email
   - Save and continue through Scopes (skip) → Test users → **Add yourself** as a test user → Save.
6. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Name: `kidtoon-uploader-local`
   - Create → **Download JSON**. The file you download contains your `client_id` and `client_secret`.

---

## Step 4 — Get your refresh token

Create a `.env` file at the root of `kidtoon-pipeline/` (NEVER commit this):

```bash
YT_CLIENT_ID=paste-client-id-from-step-3
YT_CLIENT_SECRET=paste-client-secret-from-step-3
```

Then run:

```bash
node scripts/get-refresh-token.js
```

A browser tab opens → sign in with the Google account that owns `@kidtoon-z3l` → "Continue" through the unverified-app warning ("Advanced → Go to KidToon Uploader (unsafe)" — this is your own app, it's fine) → approve the YouTube scopes.

The terminal prints something like:

```
✅ Add these to your GitHub repo as Actions Secrets:
YT_CLIENT_ID=...
YT_CLIENT_SECRET=...
YT_REFRESH_TOKEN=1//0g...
```

**Copy all three values somewhere safe — you won't see the refresh token again.**

---

## Step 5 — Push to GitHub

1. Create a new repo on GitHub (public or private, doesn't matter). Name it `kidtoon-pipeline`.
2. In your `kidtoon-pipeline/` folder:

```bash
git init
git add .
git commit -m "Initial pipeline"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/kidtoon-pipeline.git
git push -u origin main
```

3. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
4. Add these three secrets one at a time:
   - Name: `YT_CLIENT_ID` → Value: (from step 4)
   - Name: `YT_CLIENT_SECRET` → Value: (from step 4)
   - Name: `YT_REFRESH_TOKEN` → Value: (from step 4)

---

## Step 6 — Test the workflow on GitHub

In your GitHub repo:

1. Go to **Actions** tab.
2. You should see "Daily Upload" listed on the left.
3. Click it → **Run workflow** → set `dry_run` to `true` → **Run workflow**.
4. Wait ~20 min. The job will render 3 videos but NOT upload.
5. If it finishes green ✅, you're ready to go live.
6. **Run workflow** again with `dry_run` set to `false` (default) → this actually publishes 3 videos.

---

## Step 7 — Set your YouTube channel to "Made for Kids"

This is **required by COPPA** for kid-targeted content.

1. https://studio.youtube.com → **Settings (cog icon)** → **Channel** → **Advanced settings**.
2. Under "Audience": **"Yes, set this channel as made for kids."**
3. Save.

The uploader script already marks every video as `madeForKids: true`, but having the channel itself set this way is best practice.

---

## Step 8 — Verify it runs daily

The workflow runs at **06:00 UTC every day** automatically. To change the time:

Edit `.github/workflows/daily-upload.yml`:

```yaml
schedule:
  - cron: '0 11 * * *'    # 6am US Eastern
  - cron: '0 14 * * *'    # 6am US Pacific
  - cron: '30 0 * * *'    # 6am India Standard
```

Commit, push. Done.

---

## 🛟 Troubleshooting

**"Quota exceeded"** — Default YouTube API quota is 10,000 units/day, and each upload costs 1,600 units. So 6 uploads/day max. To raise it: Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas → request increase.

**"Refresh token expired"** — Refresh tokens for unpublished apps expire after 7 days. Either:
- Publish your OAuth consent screen (Google may require verification — for a self-use uploader, click "Publish App" anyway), OR
- Run `node scripts/get-refresh-token.js` weekly to refresh.

**Render takes >60 min** — Try lowering video resolution. In `remotion/tokens.ts` change `VIDEO.width: 1920` to `1280`. Cuts render time ~50%.

**Workflow runs but no videos appear** — Check **Actions → Daily Upload → latest run** logs. Common issue: secrets misnamed.

---

## 📊 What success looks like

After Step 6 you should have:
- ✅ 3 videos on your channel
- ✅ Each titled like "Twinkle, Twinkle, Little Star 🎵 KidToon Sing-Along for Kids"
- ✅ Each marked "Made for Kids"
- ✅ Each with a description that links back to your channel
- ✅ `state/history.json` updated in your repo

Then every day at 6am, 3 more drop. The rotation logic in `pick-songs.js` won't repeat a song for 14 days.

You currently have **10 songs** seeded; that's enough for ~3 days of unique content. **Add more songs to `songs/` before launching** so the channel doesn't repeat itself in the first week.

---

## 📝 Adding more songs

The format is simple. To add "Three Blind Mice":

```bash
# songs/three-blind-mice.json
{
  "id": "three-blind-mice",
  "title": "Three Blind Mice",
  "category": "Animals",
  "palette": "grass",
  "mascot": "bunny",
  "bpm": 100,
  "tags": ["nursery rhyme", "three blind mice", "kids songs", "KidToon"],
  "description": "Sing along to Three Blind Mice! Ad-free nursery rhymes — KidToon",
  "verses": [
    { "lyrics": ["Three","blind","mice."], "notes": ["E4","D4","C4"], "beats": [1,1,2] }
  ]
}
```

Push to GitHub. The next daily run picks it up automatically.

You can also ask me to write more songs — give me a list and I'll add them all.
