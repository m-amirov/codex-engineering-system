import fs from 'node:fs';
import path from 'node:path';
import { authorizeArtRework } from '../src/art-rework-budget.mjs';

try {
  const index=process.argv.indexOf('--request');
  if (index < 0 || !process.argv[index+1])
    throw new Error('Usage: node bin/art-rework-budget.mjs --request <json>');
  const request=JSON.parse(fs.readFileSync(path.resolve(process.argv[index+1]),'utf8'));
  const result=authorizeArtRework(request);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if (!result.authorizesMutation) process.exitCode=2;
} catch(error) {
  process.stderr.write('ART_REWORK_BUDGET_ERROR: '+error.message+'\n');
  process.exitCode=2;
}
