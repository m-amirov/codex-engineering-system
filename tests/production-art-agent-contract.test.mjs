import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('managed Terra producer cannot reject deferred binding just because run parent field is null',()=>{
  const agent=read('agents/ceos-asset-generator.toml');
  assert.match(agent,/producerBindingMode=CURRENT_TURN/);
  assert.match(agent,/run\.producerParentSessionId=null/);
  assert.match(agent,/PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED/);
  assert.match(agent,/do NOT interpret null/);
  assert.match(agent,/producer's own execution context/);
  assert.match(agent,/gpt-5\.6-terra/);
  assert.match(read('global/AGENTS.md'),/run\.producerParentSessionId/);
  assert.match(read('skills/production-art/SKILL.md'),/CURRENT_TURN/);
  assert.match(read('policies/art-producer.md'),/parent Codex orchestrator/);
  assert.match(read('docs/NATIVE_TERRA_ROUTING.md'),/Null is the expected deferred binding/);
});
