import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT, SKILL_NAMES, renderContext } from '../src/ceos.mjs';

const names=['narrative-dialogue-editor','narrative-continuity-engine','reader-experience-review'];
test('all three narrative companion skills are registered for global CEOS installation',()=>{
 for(const name of names){
   assert.ok(SKILL_NAMES.includes(name),name);
   const skill=fs.readFileSync(path.join(CEOS_ROOT,'skills',name,'SKILL.md'),'utf8');
   assert.match(skill,new RegExp('name: '+name));
   assert.match(skill,/^description:/m);
 }
});
test('dialogue editor preserves route/locale semantics',()=>{
 const s=fs.readFileSync(path.join(CEOS_ROOT,'skills/narrative-dialogue-editor/SKILL.md'),'utf8');
 for(const term of ['subtext','RU/EN','character canon','route topology','editorial'])assert.ok(s.toLowerCase().includes(term.toLowerCase()));
});
test('continuity engine separates declared graph checks from real runtime proof',()=>{
 const s=fs.readFileSync(path.join(CEOS_ROOT,'skills/narrative-continuity-engine/SKILL.md'),'utf8');
 assert.match(s,/narrative-game/);assert.match(s,/knowledge/);assert.match(s,/Back/);
 assert.match(s,/not proof/i);
});
test('reader experience review requires blind material and never fabricates evidence',()=>{
 const s=fs.readFileSync(path.join(CEOS_ROOT,'skills/reader-experience-review/SKILL.md'),'utf8');
 assert.match(s,/cold read/);assert.match(s,/withhold Story Bible/i);
 assert.match(s,/NOT_VERIFIED/);
});
test('romance-narrative composes but does not always invoke all companion skills',()=>{
 const s=fs.readFileSync(path.join(CEOS_ROOT,'skills/romance-narrative/SKILL.md'),'utf8');
 for(const name of names)assert.ok(s.includes(name));
 assert.match(s,/Activate these only when/);
});
