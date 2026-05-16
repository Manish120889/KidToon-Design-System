// scripts/llm-lyrics.js — LLM-driven content generation.
// Generates: lyrics, Suno style tags, YouTube/X/IG captions, SEO tags.
//
// Provider: Anthropic Claude (claude-sonnet-4-5). Falls back to OpenAI if
// ANTHROPIC_API_KEY is not set but OPENAI_API_KEY is.
//
// Modes:
//   - 'kidtoon' — kid-safe, nursery-rhyme style, COPPA-compliant
//   - 'news'    — Google-Trends-driven, viral-pop styled (no profanity, no tragedy)

import 'dotenv/config';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ── Prompt builders ───────────────────────────────────────────────────────

function systemPromptKidtoon() {
  return [
    'You are the lead songwriter for KidToon, an ad-free nursery-rhyme channel for toddlers aged 1-4.',
    '',
    'BRAND VOICE',
    '- Warm, silly, certain. Short words, present tense.',
    '- Address toddlers as "you" or "little friend". Never use "user", "consume", "engagement".',
    '- Title Case for titles. Sentence case in lyrics.',
    '- One exclamation per line maximum. Never "!!!".',
    '- Never emoji in lyrics or titles.',
    '',
    'LYRIC CONSTRAINTS',
    '- Public-domain melody OR original — never reference copyrighted songs.',
    '- Structure: Verse 1, Chorus, Verse 2, Chorus, Bridge, Final Chorus.',
    '- Each line: 4-8 syllables, AABB or ABAB rhyme.',
    '- Total length: ~90-120 seconds when sung at 90-110 BPM.',
    '- No scary topics, no death, no romance, no politics, no brands.',
    '',
    'OUTPUT FORMAT: strict JSON only. No prose before or after.',
  ].join('\n');
}

function systemPromptNews() {
  return [
    'You are a viral-pop songwriter. Given a trending news topic, write an original',
    'song that comments on it with wit, never with cruelty.',
    '',
    'CONSTRAINTS',
    '- No profanity, no slurs, no tragedy / death / violence / disasters.',
    '- No real names of private individuals. Public figures OK if context is neutral or playful.',
    '- No political endorsement, no medical/financial advice.',
    '- Structure: Hook, Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus, Outro.',
    '- Lines 6-12 syllables, modern pop phrasing.',
    '- Total length: ~120-180 seconds.',
    '',
    'OUTPUT FORMAT: strict JSON only. No prose.',
  ].join('\n');
}

function userPromptKidtoon(topic) {
  return `Generate a singable nursery-rhyme song for KidToon TV.

TOPIC: ${topic.topic}
ANGLE: ${topic.angle || 'a fun, gentle take on the topic for toddlers'}
KEYWORDS: ${(topic.keywords || []).join(', ')}

Return JSON shaped like:
{
  "title": "Title Case",
  "lyrics": "Line 1\\nLine 2\\n\\n[chorus]\\n...",
  "structured_lyrics": [
    { "section": "verse 1", "lines": ["...", "..."] },
    { "section": "chorus",  "lines": ["...", "..."] }
  ],
  "suno_prompt": "[Style: bright children's pop, ukulele, glockenspiel, light kick, female alto vocals, warm vibrato, age 25-30, gentle, no autotune, public-domain inspired, 100 BPM]",
  "youtube": {
    "title": "Title for YouTube (max 100 chars, includes 'KidToon' or 'Nursery Rhyme')",
    "description": "3-paragraph description with timestamps placeholder [TIMESTAMPS]",
    "tags": ["nursery rhymes", "kids songs", "sing along", "..."]
  },
  "x": { "caption": "Tweet copy <240 chars, 1 hashtag" },
  "instagram": { "caption": "IG caption <2200 chars, ~6 hashtags" }
}`;
}

function userPromptNews(topic) {
  return `Generate a viral original song commenting on this trending news topic.

TOPIC: ${topic.topic}
HEADLINE: ${topic.headline}
SUMMARY: ${topic.summary}
KEYWORDS: ${(topic.keywords || []).join(', ')}

Same JSON shape as KidToon, plus update the suno_prompt for the style you choose:

{
  "title": "...",
  "lyrics": "...",
  "structured_lyrics": [...],
  "suno_prompt": "[Style: ..., vocals: ..., tempo: ...]",
  "youtube": { "title": "...", "description": "...", "tags": [...] },
  "x": { "caption": "..." },
  "instagram": { "caption": "..." }
}`;
}

// ── Provider clients ──────────────────────────────────────────────────────

async function callAnthropic(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.content?.[0]?.text || '';
}

async function callOpenAI(system, user) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

function parseJsonStrict(text) {
  // Strip code fences if the model wrapped the JSON in ```json
  let t = String(text || '').trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Find first { and last }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first < 0 || last < 0) throw new Error('LLM returned no JSON object');
  const slice = t.slice(first, last + 1);
  return JSON.parse(slice);
}

// ── Safety / brand guard ──────────────────────────────────────────────────
const BANNED_WORDS = [
  // Profanity covered by the LLM prompt; brand-banned terms enforced here
  'engagement', 'content', 'consume', 'leverage', 'premium tier',
  // Topics we filter even after LLM
  'kill', 'die', 'death', 'suicide', 'shooting', 'overdose',
];
function isContentSafe(payload) {
  const blob = JSON.stringify(payload).toLowerCase();
  const hits = BANNED_WORDS.filter(w => blob.includes(w));
  return { safe: hits.length === 0, hits };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function generateLyrics({ topic, mode = 'kidtoon' }) {
  const system = mode === 'news' ? systemPromptNews() : systemPromptKidtoon();
  const user = mode === 'news' ? userPromptNews(topic) : userPromptKidtoon(topic);

  let text = await callAnthropic(system, user);
  if (text == null) text = await callOpenAI(system, user);
  if (text == null) {
    throw new Error('No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const payload = parseJsonStrict(text);

  // Required fields
  const required = ['title', 'lyrics', 'suno_prompt', 'youtube', 'x', 'instagram'];
  for (const k of required) {
    if (!payload[k]) throw new Error(`LLM omitted required field: ${k}`);
  }

  // Safety guard — refuse if the LLM produced banned content
  const safety = isContentSafe(payload);
  if (!safety.safe) {
    throw new Error(`Content safety check failed. Banned terms: ${safety.hits.join(', ')}`);
  }

  return payload;
}

// ── CLI for local testing ─────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--news') ? 'news' : 'kidtoon';
  const topic = mode === 'news'
    ? { topic: 'Cherry blossom season in Tokyo',
        headline: 'Tokyo cherry blossoms peak earlier than usual',
        summary: 'Tokyo\'s cherry blossoms reached full bloom this week.',
        keywords: ['spring', 'blossoms', 'Tokyo'] }
    : { topic: 'Counting 1-2-3',
        angle: 'a fun introduction to counting with farm animals',
        keywords: ['count', 'numbers', 'farm'] };
  generateLyrics({ topic, mode })
    .then(p => console.log(JSON.stringify(p, null, 2)))
    .catch(e => { console.error('❌', e.message); process.exit(1); });
}
