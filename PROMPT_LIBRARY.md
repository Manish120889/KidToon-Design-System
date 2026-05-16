# KidToon Pipeline — Prompt Library

The LLM step in `scripts/llm-lyrics.js` ships with two production prompts:
**kidtoon-mode** (kid-safe nursery rhymes) and **news-mode** (trend-driven
viral pop). This document is the canonical reference for both, plus
variations you can swap in.

> **How to use:** copy a block into the `systemPromptX()` / `userPromptX()`
> functions in `scripts/llm-lyrics.js`, OR override at runtime by setting
> `KIDTOON_PROMPT_OVERRIDE` / `NEWS_PROMPT_OVERRIDE` in your environment
> (the script reads these as fallback system prompts).

---

## 1. KidToon-mode system prompt

```
You are the lead songwriter for KidToon, an ad-free nursery-rhyme channel
for toddlers aged 1-4.

BRAND VOICE
- Warm, silly, certain. Short words, present tense.
- Address toddlers as "you" or "little friend". Never use "user",
  "consume", "engagement".
- Title Case for titles. Sentence case in lyrics.
- One exclamation per line maximum. Never "!!!".
- Never emoji in lyrics or titles.

LYRIC CONSTRAINTS
- Public-domain melody OR original — never reference copyrighted songs.
- Structure: Verse 1, Chorus, Verse 2, Chorus, Bridge, Final Chorus.
- Each line: 4-8 syllables, AABB or ABAB rhyme.
- Total length: ~90-120 seconds when sung at 90-110 BPM.
- No scary topics, no death, no romance, no politics, no brands.

OUTPUT FORMAT: strict JSON only. No prose before or after.
```

## 2. News-mode system prompt

```
You are a viral-pop songwriter. Given a trending news topic, write an
original song that comments on it with wit, never with cruelty.

CONSTRAINTS
- No profanity, no slurs, no tragedy / death / violence / disasters.
- No real names of private individuals. Public figures OK if context is
  neutral or playful.
- No political endorsement, no medical/financial advice.
- Structure: Hook, Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus, Outro.
- Lines 6-12 syllables, modern pop phrasing.
- Total length: ~120-180 seconds.

OUTPUT FORMAT: strict JSON only. No prose.
```

## 3. Required JSON schema

Both modes must return this exact shape (the parser in `llm-lyrics.js`
enforces it and rejects runs that omit fields):

```json
{
  "title": "Title Case",
  "lyrics": "Plain text with \\n line breaks. Section labels like [chorus] OK.",
  "structured_lyrics": [
    { "section": "verse 1", "lines": ["...", "..."] },
    { "section": "chorus",  "lines": ["...", "..."] }
  ],
  "suno_prompt": "[Style: ..., vocals: ..., tempo: 100 BPM]",
  "youtube": {
    "title": "≤100 chars",
    "description": "Multi-paragraph. Use [TIMESTAMPS] placeholder.",
    "tags": ["nursery rhymes", "kids songs", "..."]
  },
  "x":         { "caption": "≤240 chars, 1 hashtag" },
  "instagram": { "caption": "≤2200 chars, ~6 hashtags" }
}
```

---

## 4. Variation library — drop-in Suno style tags

These plug into `suno_prompt` when you want a different musical feel.

| Mood / age | Suno prompt fragment |
|---|---|
| Sleepy lullaby | `[Style: lullaby, soft piano, female alto, breathy, 70 BPM, gentle vibrato]` |
| Bouncy preschool | `[Style: bright children's pop, ukulele, glockenspiel, light kick, female alto vocals, 110 BPM]` |
| Animal-action | `[Style: kids barnyard folk, banjo, accordion, hand-claps, call-and-response, female vocal lead, 130 BPM]` |
| Sing-along with claps | `[Style: campfire kids, acoustic guitar, tambourine, group claps every 4 bars, female vocal lead, 100 BPM]` |
| Viral TikTok (news mode) | `[Style: hyperpop, distorted synths, tight 808s, female vocoder vocals, 150 BPM, anthemic]` |
| Pop-rock anthem (news mode) | `[Style: arena pop-rock, driving drums, electric guitar, soaring female vocals, 128 BPM]` |
| Hip-hop reaction (news mode) | `[Style: lo-fi hip-hop, dusty drums, mellow Rhodes piano, female rap vocals, 90 BPM]` |

## 5. Caption templates

### YouTube (long)
```
🎵 Sing along to "{title}" with KidToon.
🎨 Bright, bouncy animation made for ages 1-4.
📺 New nursery rhymes every day.

[TIMESTAMPS]

#nurseryrhymes #kidssongs #singalong #KidToon
```

### YouTube Shorts
```
{title} — sing along! 🎵 #shorts #kidssongs #nurseryrhymes
```

### X (Twitter)
```
new song just dropped 🎵
{title}

watch + sing along ↓
```

### Instagram Reels
```
{title} 🌟

{one-line description of the song}

#nurseryrhymes #kidssongs #toddlerlife #singalong #kidsofinstagram #earlylearning
```

## 6. Title generator templates

`scripts/llm-lyrics.js` returns one title per run. If you want variety,
post-process with these patterns (the existing `daily.js` already does
something like this for the v1 pipeline):

- `"{title} 🎵 KidToon Sing-Along for Kids"`
- `"{title} | Nursery Rhymes for Kids | KidToon"`
- `"Sing Along to {title} | KidToon Nursery Rhymes"`
- `"{title} (Official Video) — KidToon TV"`

## 7. Failure-mode prompts

When Suno generates distorted audio (audio QA flag) the orchestrator
retries with a slightly different style tag — this is the prompt the
retry layer appends to the original `suno_prompt`:

```
[Re-render request: ensure clean vocal mix, no distortion, no autotune
artifacts, normalized to -14 LUFS]
```

## 8. Safety post-filter (already enforced in code)

The pipeline scans every LLM output for banned terms before continuing.
See `BANNED_WORDS` in `scripts/llm-lyrics.js`. Edit that list to add your
own brand-banned phrases.
