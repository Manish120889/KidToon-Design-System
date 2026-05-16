# KidToon Daily Pipeline

Automated daily nursery-rhyme video generator + YouTube uploader. Designed to run on GitHub Actions for free.

**What this does:** Every day at 6am UTC, this pipeline picks 3 nursery rhymes, renders them as KidToon-branded videos with parallax backgrounds, a bouncing animated character, and karaoke-style on-screen lyrics, then uploads them to your YouTube channel as "Made for Kids" content.

**Audio:** Path C — instrumental melodies are synthesized programmatically from note data in each song's JSON file. No vocal track, no licensing fees. The on-screen lyrics highlight word-by-word in time with the melody so kids and parents sing along.

---

## ⚡ Quick start (one-time, ~30 minutes)

### 1. Get the code

```bash
git clone https://github.com/YOUR-USERNAME/kidtoon-pipeline.git
cd kidtoon-pipeline
npm install
```

### 2. Set up Google Cloud + YouTube API

1. Go to https://console.cloud.google.com
2. Create a new project named **KidToon Uploader**
3. **APIs & Services → Library →** enable **YouTube Data API v3**
4. **APIs & Services → OAuth consent screen:**
   - User type: **External**
   - App name: KidToon Uploader
   - Add yourself as a test user
5. **APIs & Services → Credentials →** Create credentials → OAuth 2.0 Client ID
   - Application type: **Desktop app**
   - Name: `kidtoon-uploader`
   - Download the JSON

### 3. Get your refresh token (one-time)

This step gets a permanent token that lets the pipeline upload on your behalf.

```bash
# In a .env file at repo root (NEVER commit this):
YT_CLIENT_ID=<from-credentials-json>
YT_CLIENT_SECRET=<from-credentials-json>

# Then run:
node scripts/get-refresh-token.js
```

A browser window will open. Sign in with the Google account that owns your YouTube channel and accept the scopes. Paste the resulting code back into the terminal. The script prints your `YT_REFRESH_TOKEN`. **Save it — you won't see it again.**

### 4. Test a local render

```bash
node scripts/daily.js --dry-run
```

This renders one video to `out/` without uploading. Open the MP4 to verify it looks right.

### 5. Push to GitHub + add secrets

```bash
git remote add origin https://github.com/YOUR-USERNAME/kidtoon-pipeline.git
git push -u origin main
```

In your GitHub repo:
1. **Settings → Secrets and variables → Actions → New repository secret**
2. Add three secrets:
   - `YT_CLIENT_ID`
   - `YT_CLIENT_SECRET`
   - `YT_REFRESH_TOKEN`

### 6. Verify the workflow

Go to **Actions** tab in your repo. The workflow `Daily Upload` is scheduled for 6am UTC. You can also trigger it manually: **Actions → Daily Upload → Run workflow**.

---

## 📁 Repo structure

```
kidtoon-pipeline/
├── README.md
├── package.json
├── remotion.config.ts
├── tsconfig.json
├── .github/workflows/daily-upload.yml      cron: 3 videos/day at 6am UTC
├── remotion/
│   ├── Root.tsx                            composition registry
│   ├── MainComposition.tsx                 main scene assembly
│   ├── Background.tsx                      parallax day/night scene
│   ├── Character.tsx                       squash-stretch mascot
│   ├── Subtitles.tsx                       karaoke lyric overlay
│   └── tokens.ts                           brand colors / fonts
├── songs/
│   ├── twinkle-twinkle.json
│   ├── itsy-bitsy-spider.json
│   ├── old-macdonald.json
│   ├── wheels-on-the-bus.json
│   ├── row-row-row-your-boat.json
│   ├── mary-had-a-little-lamb.json
│   ├── baa-baa-black-sheep.json
│   ├── abc-song.json
│   ├── five-little-ducks.json
│   └── head-shoulders-knees-toes.json
├── scripts/
│   ├── get-refresh-token.js                one-time OAuth helper
│   ├── synthesize-audio.js                 song JSON → WAV file (sine synth)
│   ├── render.js                           Remotion → MP4
│   ├── thumbnail.js                        generates 1280×720 thumbnail
│   ├── upload.js                           YouTube Data API upload
│   ├── pick-songs.js                       daily rotation (no repeat within 14 days)
│   └── daily.js                            orchestrator — renders + uploads 3 videos
└── state/
    └── history.json                        which songs have been published when
```

---

## 🎵 Adding a new song

Create `songs/your-song.json`:

```json
{
  "id": "your-song",
  "title": "Your Song Title",
  "category": "Sunshine Songs",
  "palette": "day",
  "mascot": "star",
  "bpm": 120,
  "verses": [
    {
      "lyrics": ["Hello", "little", "friend"],
      "notes":  ["C4",   "C4",     "G4"],
      "beats":  [1,      1,        2]
    }
  ]
}
```

- `palette`: `day`, `night`, `pink`, `grass`, `cream`
- `mascot`: `star`, `bunny`, `sun`, `moon`, `bunny`, `balloon`
- `notes`: standard scientific pitch notation (`C4`, `D#5`, etc.)
- `beats`: duration in beats at the given BPM
- The video auto-loops the verses until it hits the 3–5 min target.

---

## 🛠 Local development

```bash
npm run preview           # opens Remotion Studio to scrub through any composition
npm run render -- --song=twinkle-twinkle
npm run daily -- --dry-run
```

---

## ⚖️ Legal checklist (do these BEFORE going live)

- [ ] Trademark search for "KidToon" → https://tmsearch.uspto.gov
- [ ] Confirm every song in `songs/` is public domain (the seed 10 all are; verify any you add)
- [ ] YouTube channel set to **Made for Kids** (Studio → Settings → Channel → Advanced)
- [ ] Privacy policy + about page on your channel
- [ ] Decide on monetization stance (kids content = non-personalized ads only)

---

## 💸 Cost summary

| Item | Cost |
|---|---|
| GitHub Actions runtime | Free (2000 min/mo on free plan) |
| YouTube Data API | Free |
| Audio synthesis | Free (generated locally) |
| Total monthly | **$0** |

You'll burn ~10–15 min per video render × 3 videos/day × 30 days = ~1000 min/mo, well within the free tier.
