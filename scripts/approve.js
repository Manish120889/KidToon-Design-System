#!/usr/bin/env node
// scripts/approve.js — convenience CLI wrapper for the approval gate.
// Usage:
//   node scripts/approve.js <id>                  # approve
//   node scripts/approve.js <id> --reject -n "x"  # reject with note
//   node scripts/approve.js --list                # show pending

import { approve, reject, listPending } from './approval-gate.js';

const args = process.argv.slice(2);
if (args.includes('--list') || args.length === 0) {
  const pending = listPending();
  if (!pending.length) { console.log('No pending runs.'); process.exit(0); }
  for (const p of pending) {
    console.log(`${p.id}\t${p.title || p.song?.title || ''}\tqueued ${p.queuedAt}`);
  }
  process.exit(0);
}
const id = args[0];
const isReject = args.includes('--reject');
if (isReject) {
  const ni = args.indexOf('-n') >= 0 ? args.indexOf('-n') : args.indexOf('--notes');
  const notes = ni > 0 ? args[ni + 1] : 'manual reject';
  reject(id, notes);
  console.log(`Rejected ${id}`);
} else {
  approve(id);
  console.log(`Approved ${id}`);
}
