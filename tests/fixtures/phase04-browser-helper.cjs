// Controlled fake browser helper: protocol integration only, no real browser or entitlement.
const mode = process.argv[2] || 'reply';
const fs = require('node:fs');
const marker = process.argv[3];
if (mode !== 'no-ready' && mode !== 'stubborn-start') process.stdout.write(JSON.stringify({ type: 'ready' }) + '\n');
if (mode === 'stubborn' || mode === 'stubborn-start') {
  process.on('SIGTERM', () => {});
  setTimeout(() => { if (marker) fs.writeFileSync(marker, 'orphan'); }, 800);
}
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk.toString('utf8');
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines.filter(Boolean)) {
    const msg = JSON.parse(line);
    if (msg.type === 'run' && mode === 'reply') {
      process.stdout.write(JSON.stringify({ type: 'event', id: msg.id, event: 'submitted' }) + '\n');
      process.stdout.write(JSON.stringify({ type: 'result', id: msg.id, text: 'fake-provider-response' }) + '\n');
    }
  }
});
process.stdin.on('end', () => {
  if (mode !== 'stubborn' && mode !== 'stubborn-start') process.exit(0);
});
