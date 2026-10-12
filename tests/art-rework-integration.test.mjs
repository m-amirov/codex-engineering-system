import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT } from '../src/ceos.mjs';

test('production art pipeline references executable rework preflight and fail-closed budget', () => {
 const skill=fs.readFileSync(path.join(CEOS_ROOT,'skills/production-art/SKILL.md'),'utf8');
 assert.match(skill,/Mechanical pre-repair authorization/);
 assert.match(skill,/bin\/art-rework-budget\.mjs/);
 assert.match(skill,/two generated candidates or three distinct failed approaches/);
 assert.match(skill,/host-side guard/);
});

test('CEOS art budget does not substitute for independent Web pixel acceptance', () => {
 const code=fs.readFileSync(path.join(CEOS_ROOT,'src/art-rework-budget.mjs'),'utf8');
 assert.match(code,/actualPixelsReceived/);
 assert.match(code,/NO_MATERIAL_REWORK/);
 assert.match(code,/ESCALATE_ART_GENERATION/);
 assert.match(code,/BLOCKED_WEB_TRANSPORT/);
 const doc=fs.readFileSync(path.join(CEOS_ROOT,'docs/art-rework-budget.md'),'utf8');
 assert.match(doc,/does \*\*not\*\* prove/i);
});
