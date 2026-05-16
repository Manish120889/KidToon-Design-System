// scripts/scrape-trends.js — pull trending topics, kid-safe filter, return JSON.
//
// Sources (in order; first that returns data wins):
//   1. Google News RSS — `/news/rss?hl=en-US&...&topic=...`. Free, no key.
//   2. Google Trends Daily — unofficial `daily/dailytrends` endpoint.
//
// Anti-block defenses:
//   - Custom user-agent
//   - Optional HTTP proxy via PROXY_URL (residential proxy recommended for high volume)
//   - Exponential backoff on 429 / 5xx
//
// Safety filter strips tragic/sensitive/adult topics so the pipeline doesn't
// accidentally produce a song about a disaster.

import 'dotenv/config';
import { XMLParser } from 'fast-xml-parser';

const USER_AGENT = 'Mozilla/5.0 (compatible; KidToonBot/1.0; +https://kidtoon.tv)';

// Topics we never write songs about.
const UNSAFE_PATTERNS = [
  /\b(death|died|dies|killed|murder|massacre|shooting|stabbing|terror|attack|war|invasion|missile)\b/i,
  /\b(rape|assault|abuse|trafficking|kidnap)\b/i,
  /\b(suicide|overdose|fentanyl|opioid)\b/i,
  /\b(scandal|fraud|arrest|prison|guilty|lawsuit|indicted)\b/i,
  /\b(crash|wreck|fire|flood|earthquake|hurricane|tornado|wildfire|disaster|tragedy|tragic)\b/i,
  /\b(virus|pandemic|outbreak|infection|disease)\b/i,
  /\b(porn|nude|sexual|onlyfans|breakup|divorce|cheating)\b/i,
  /\b(racist|nazi|fascist|extremist|riot)\b/i,
];

function isSafe(text) {
  if (!text) return false;
  return !UNSAFE_PATTERNS.some(re => re.test(text));
}

async function fetchWithRetry(url, opts = {}, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const proxy = process.env.PROXY_URL;
      const fetchOpts = {
        ...opts,
        headers: { 'user-agent': USER_AGENT, ...opts.headers },
      };
      if (proxy) {
        // Node 20+: undici supports HTTP/HTTPS proxies via ProxyAgent
        const { ProxyAgent } = await import('undici');
        fetchOpts.dispatcher = new ProxyAgent(proxy);
      }
      const res = await fetch(url, fetchOpts);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Status ${res.status}`);
      }
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, i);
      console.warn(`   fetch retry ${i+1}/${attempts}: ${e.message}, waiting ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ── Google News RSS ───────────────────────────────────────────────────────
async function fetchGoogleNewsRss({ topic = 'HEADLINES', country = 'US', lang = 'en' } = {}) {
  // Predefined topic feeds: HEADLINES, WORLD, NATION, BUSINESS, TECHNOLOGY,
  // ENTERTAINMENT, SPORTS, SCIENCE, HEALTH
  const url = `https://news.google.com/rss/headlines/section/topic/${topic}?hl=${lang}-${country}&gl=${country}&ceid=${country}:${lang}`;
  const res = await fetchWithRetry(url);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item || [];
  return items.map(it => ({
    headline: String(it.title || '').trim(),
    summary: String(it.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 280),
    source: it.source?.['#text'] || 'Google News',
    publishedAt: it.pubDate,
    url: it.link,
  }));
}

// ── Google Trends Daily ───────────────────────────────────────────────────
async function fetchGoogleTrendsDaily({ country = 'US' } = {}) {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=0&geo=${country}&ns=15`;
  const res = await fetchWithRetry(url);
  // The endpoint prefixes its JSON with `)]}',` — strip it.
  const raw = await res.text();
  const cleaned = raw.replace(/^\)\]\}',?\s*/, '');
  const json = JSON.parse(cleaned);
  const days = json?.default?.trendingSearchesDays || [];
  const out = [];
  for (const day of days) {
    for (const t of day.trendingSearches || []) {
      out.push({
        headline: t.title?.query,
        summary: t.articles?.[0]?.snippet || '',
        keywords: (t.relatedQueries || []).map(q => q.query).slice(0, 5),
        url: t.articles?.[0]?.url,
        publishedAt: day.date,
      });
    }
  }
  return out;
}

// ── Topic shaping ─────────────────────────────────────────────────────────
function shape(raw) {
  // Extract top-2-words noun phrase as a "topic"
  const t = (raw.headline || '').replace(/[^a-zA-Z0-9\s'-]/g, ' ').trim();
  const words = t.split(/\s+/).slice(0, 6);
  const topic = words.slice(0, 3).join(' ');
  return {
    topic,
    headline: raw.headline,
    summary: raw.summary,
    keywords: raw.keywords || [],
    source: raw.source,
    url: raw.url,
    publishedAt: raw.publishedAt,
  };
}

// ── Public API ────────────────────────────────────────────────────────────
export async function getTrendingTopics({ limit = 3, mode = 'news', country = 'US' } = {}) {
  console.log(`📰 Scraping trends (mode=${mode}, country=${country})`);
  let raw = [];
  // News mode pulls general headlines; KidToon mode targets ENTERTAINMENT/SCIENCE
  const topics = mode === 'kidtoon' ? ['ENTERTAINMENT', 'SCIENCE'] : ['HEADLINES', 'TECHNOLOGY', 'ENTERTAINMENT'];
  for (const t of topics) {
    try {
      const items = await fetchGoogleNewsRss({ topic: t, country });
      raw.push(...items);
    } catch (e) { console.warn(`   ${t} RSS failed: ${e.message}`); }
  }
  if (raw.length < limit) {
    try {
      const daily = await fetchGoogleTrendsDaily({ country });
      raw.push(...daily);
    } catch (e) { console.warn(`   Trends Daily failed: ${e.message}`); }
  }

  // Deduplicate by headline
  const seen = new Set();
  const dedup = raw.filter(r => {
    const k = (r.headline || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });

  // Filter for safety
  const safe = dedup.filter(r => isSafe(r.headline) && isSafe(r.summary));

  // For KidToon mode, prefer animal / space / nature / food / friendship topics
  const KID_KEYWORDS = /\b(animal|dog|cat|puppy|kitten|cow|bird|bee|elephant|panda|baby|star|moon|sun|rainbow|garden|flower|tree|forest|ocean|fish|fruit|cookie|ice cream|playground|family|friend|kindness|sleep|dream|hug)\b/i;
  const ranked = mode === 'kidtoon'
    ? safe.sort((a, b) => (KID_KEYWORDS.test(b.headline) ? 1 : 0) - (KID_KEYWORDS.test(a.headline) ? 1 : 0))
    : safe;

  const shaped = ranked.slice(0, limit * 2).map(shape).slice(0, limit);
  console.log(`   selected ${shaped.length} topic(s):`);
  shaped.forEach(s => console.log(`   - ${s.topic}: ${s.headline}`));
  return shaped;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--kidtoon') ? 'kidtoon' : 'news';
  getTrendingTopics({ limit: 3, mode })
    .then(t => console.log(JSON.stringify(t, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}
