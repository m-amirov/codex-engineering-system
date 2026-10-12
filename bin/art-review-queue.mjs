import fs from 'node:fs';
import path from 'node:path';
import { summarizeArtReviewQueue } from '../src/art-review-queue.mjs';

function option(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
}

try {
  const ledgerFile = option('--ledger');
  const receiptFile = option('--receipts');
  if (!ledgerFile || !receiptFile)
    throw new Error('usage: node bin/art-review-queue.mjs --ledger <json> --receipts <json> [--limit 6]');
  const ledger = JSON.parse(fs.readFileSync(path.resolve(ledgerFile), 'utf8'));
  const file = JSON.parse(fs.readFileSync(path.resolve(receiptFile), 'utf8'));
  const receipts = Array.isArray(file) ? file : file.records;
  const value = option('--limit');
  const report = summarizeArtReviewQueue(ledger, receipts, { limit: value === null ? 6 : Number(value) });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.rejected.length > 0) process.exitCode = 2;
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 2;
}
