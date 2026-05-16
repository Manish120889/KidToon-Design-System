// scripts/approval-gate.js — human-in-the-loop approval queue.
//
// After a video is rendered the pipeline either:
//   (a) Posts a preview link to Slack and waits for an emoji reaction OR
//   (b) Writes the run to `state/pending/<id>.json` and waits for an
//       operator to call `node scripts/approve.js <id>` (or use the
//       dashboard UI in Pipeline Dashboard.html).
//
// Default behavior: file-based gate (works offline). Slack gate kicks in
// if SLACK_WEBHOOK_URL is set. Auto-approve kicks in if AUTO_APPROVE=1.

import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const STATE_DIR = path.resolve('state');
const PENDING_DIR = path.join(STATE_DIR, 'pending');
const APPROVED_DIR = path.join(STATE_DIR, 'approved');
const REJECTED_DIR = path.join(STATE_DIR, 'rejected');

function ensureDirs() {
  for (const d of [STATE_DIR, PENDING_DIR, APPROVED_DIR, REJECTED_DIR]) fs.mkdirSync(d, { recursive: true });
}

async function postToSlack(message) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  return true;
}

/**
 * Queue a run for human review. Returns { decision: 'approved'|'rejected', notes? }.
 * Blocks until decided OR timeoutMinutes elapses (default 240 = 4 hours).
 */
export async function awaitApproval(run, { timeoutMinutes = 240 } = {}) {
  ensureDirs();
  const id = run.id || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  run.id = id;
  run.queuedAt = new Date().toISOString();
  run.status = 'pending';

  if (process.env.AUTO_APPROVE === '1') {
    console.log(`🟢 AUTO_APPROVE=1 — bypassing approval gate for ${id}`);
    return { decision: 'approved' };
  }

  const pendingPath = path.join(PENDING_DIR, `${id}.json`);
  fs.writeFileSync(pendingPath, JSON.stringify(run, null, 2));
  console.log(`⏳ Awaiting approval for ${id} → ${pendingPath}`);

  // Slack heads-up (optional)
  const slacked = await postToSlack({
    text: `*KidToon pipeline — approval needed*`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🎬 Review needed' } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Title:*\n${run.title || run.song?.title || id}` },
        { type: 'mrkdwn', text: `*Run id:*\n\`${id}\`` },
      ]},
      { type: 'section', text: { type: 'mrkdwn',
        text: `Approve in the dashboard, or run:\n\`\`\`node scripts/approve.js ${id}\`\`\`` } },
    ],
  });
  if (slacked) console.log(`   posted to Slack`);

  const deadline = Date.now() + timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10_000));
    if (fs.existsSync(path.join(APPROVED_DIR, `${id}.json`))) {
      console.log(`✅ Approved: ${id}`);
      return { decision: 'approved' };
    }
    if (fs.existsSync(path.join(REJECTED_DIR, `${id}.json`))) {
      const notes = JSON.parse(fs.readFileSync(path.join(REJECTED_DIR, `${id}.json`), 'utf8')).notes;
      console.log(`🛑 Rejected: ${id} — ${notes || 'no notes'}`);
      return { decision: 'rejected', notes };
    }
  }
  // Timeout = soft reject
  console.warn(`⚠️  Approval timed out for ${id}`);
  return { decision: 'rejected', notes: 'timeout' };
}

/** Mark a pending run as approved. Called by `scripts/approve.js` or the dashboard. */
export function approve(id) {
  ensureDirs();
  const src = path.join(PENDING_DIR, `${id}.json`);
  if (!fs.existsSync(src)) throw new Error(`No pending run: ${id}`);
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  data.status = 'approved';
  data.approvedAt = new Date().toISOString();
  fs.writeFileSync(path.join(APPROVED_DIR, `${id}.json`), JSON.stringify(data, null, 2));
  return data;
}

export function reject(id, notes) {
  ensureDirs();
  const src = path.join(PENDING_DIR, `${id}.json`);
  if (!fs.existsSync(src)) throw new Error(`No pending run: ${id}`);
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  data.status = 'rejected';
  data.rejectedAt = new Date().toISOString();
  data.notes = notes;
  fs.writeFileSync(path.join(REJECTED_DIR, `${id}.json`), JSON.stringify(data, null, 2));
  return data;
}

/** List all pending runs for the dashboard. */
export function listPending() {
  ensureDirs();
  return fs.readdirSync(PENDING_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(PENDING_DIR, f), 'utf8')));
}

// CLI: node scripts/approve.js <id> [--reject] [--notes "why"]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, ...rest] = process.argv.slice(2);
  if (!id) { console.error('Usage: node scripts/approval-gate.js <id> [--reject --notes "why"]'); process.exit(1); }
  const isReject = rest.includes('--reject');
  if (isReject) {
    const ni = rest.indexOf('--notes');
    const notes = ni >= 0 ? rest[ni + 1] : 'no reason given';
    reject(id, notes);
    console.log(`Rejected ${id}`);
  } else {
    approve(id);
    console.log(`Approved ${id}`);
  }
}
