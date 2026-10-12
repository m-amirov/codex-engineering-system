import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeArtRework } from '../src/art-rework-budget.mjs';

const finding = (override={}) => ({
 id:'S07-acting-role', severity:'P1', status:'OPEN',
 authoredCue:'S07 [0,0]: Nick says Do not touch',
 observation:'Eric performs the gesture instead of Nick in the actual screenshot.',
 playerImpact:'Player attributes the action to the wrong character',
 evidenceRef:'S07:390x844', actualPixelsReceived:true, ...override
});
const base = () => ({
 scopeKey:'S07:0,0:portrait',findings:[finding()],attempts:[],transportState:'READY',
 proposedMethod:'generation',proposedStrategyKey:'full-scene-cg'
});
test('material pixel-backed P1 mismatch allows one scoped attempt', () => {
 assert.equal(authorizeArtRework(base()).status,'READY_FOR_SCOPED_REPAIR');
});
test('P3-only polish is not authorization for generation', () => {
 const x=base();x.findings=[finding({severity:'P3'})];
 assert.equal(authorizeArtRework(x).status,'NO_MATERIAL_REWORK');
});
test('attachment quota blocks without consuming generation budget', () => {
 const x=base();x.transportState='ATTACHMENT_QUOTA_EXHAUSTED';
 assert.equal(authorizeArtRework(x).status,'BLOCKED_WEB_TRANSPORT');
});
test('undelivered pixels cannot support semantic repair', () => {
 const x=base();x.findings=[finding({actualPixelsReceived:false})];
 assert.equal(authorizeArtRework(x).status,'BLOCKED_UNVERIFIED_FINDINGS');
});
test('third generation after two candidates must escalate', () => {
 const x=base();x.proposedStrategyKey='third';
 x.attempts=[1,2].map(i=>({scopeKey:x.scopeKey,method:'generation',strategyKey:'candidate-'+i,outcome:'FAIL'}));
 assert.equal(authorizeArtRework(x).status,'ESCALATE_ART_GENERATION');
});
test('fourth distinct strategy after three failures must escalate', () => {
 const x=base();x.proposedMethod='crop';x.proposedStrategyKey='fresh';
 x.attempts=['mapping','staging','css'].map(m=>({scopeKey:x.scopeKey,method:m,strategyKey:m+'-1',outcome:'FAIL'}));
 assert.equal(authorizeArtRework(x).status,'ESCALATE_ART_REWORK');
});
test('repeat of same failed approach is blocked', () => {
 const x=base();x.attempts=[{scopeKey:x.scopeKey,method:'generation',strategyKey:x.proposedStrategyKey,outcome:'FAIL'}];
 assert.equal(authorizeArtRework(x).status,'BLOCKED_REPEAT_STRATEGY');
});
test('accepted scope cannot be reworked in the same scope', () => {
 const x=base();x.attempts=[{scopeKey:x.scopeKey,method:'crop',strategyKey:'success',outcome:'PASS'}];
 assert.equal(authorizeArtRework(x).status,'BLOCKED_ALREADY_ACCEPTED');
});
test('failures from unrelated visual beats do not use current budget', () => {
 const x=base();x.attempts=[1,2,3].map(i=>({scopeKey:'S65:0,29',method:'generation',strategyKey:'prior-'+i,outcome:'FAIL'}));
 assert.equal(authorizeArtRework(x).status,'READY_FOR_SCOPED_REPAIR');
});
