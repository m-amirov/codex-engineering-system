import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeArtReviewQueue } from '../src/art-review-queue.mjs';

const H = 'a'.repeat(40);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const ledger = () => ({schemaVersion:1,sourceHead:H,items:[
  {id:'S07:0,0:desktop',sceneId:'S07',cue:'0,0',viewport:'1920x900',screenshotSha256:B,productionAssetSha256:C},
  {id:'S65:0,29:portrait',sceneId:'S65',cue:'0,29',viewport:'390x844',screenshotSha256:D,productionAssetSha256:C}
]});
const receipt = (itemId='S07:0,0:desktop', override={}) => ({
 itemId,sourceHead:H,screenshotSha256:B,productionAssetSha256:C,
 actualPixelsReceived:true,status:'PASS',observation:'The acting character is clearly in the foreground.',...override
});

test('deduplicates coverage and resumes only unreviewed or transport-blocked frames', () => {
 const r=summarizeArtReviewQueue(ledger(),[receipt()]);
 assert.equal(r.counts.PASS,1);
 assert.equal(r.counts.NOT_REVIEWED,1);
 assert.equal(r.nextBatch.length,1);
 assert.equal(r.nextBatch[0].id,'S65:0,29:portrait');
 assert.equal(r.verdict,'COVERAGE_INCOMPLETE');
});

test('receipt from a former HEAD does not become an art PASS', () => {
 const r=summarizeArtReviewQueue(ledger(),[receipt(undefined,{sourceHead:'f'.repeat(40)})]);
 assert.equal(r.counts.PASS,0);
 assert.equal(r.rejected[0].reason,'STALE_SOURCE_OR_PIXELS');
});

test('undelivered pixels cannot enter accepted coverage', () => {
 const r=summarizeArtReviewQueue(ledger(),[receipt(undefined,{actualPixelsReceived:false})]);
 assert.equal(r.counts.NOT_REVIEWED,2);
 assert.equal(r.rejected[0].reason,'INVALID_VISUAL_RECEIPT');
});

test('semantic rework is not silently replaced without resolution evidence', () => {
 const r=summarizeArtReviewQueue(ledger(),[receipt(undefined,{status:'REWORK'}),receipt()]);
 assert.equal(r.counts.REWORK,1);
 assert.equal(r.requiresRepair.length,1);
 assert.equal(r.rejected[0].reason,'REWORK_NOT_RESOLVED');
});

test('independent acceptance remains a separate gate even after complete coverage', () => {
 const r=summarizeArtReviewQueue(ledger(),[receipt(),receipt('S65:0,29:portrait',{screenshotSha256:D})]);
 assert.equal(r.complete,true);
 assert.equal(r.verdict,'READY_FOR_INDEPENDENT_ACCEPTANCE_GATE');
 assert.deepEqual(r.counts,{PASS:2,REWORK:0,BLOCKED:0,NOT_REVIEWED:0});
});

test('duplicate ledger entries and malformed hashes are rejected', () => {
 const x=ledger();x.items[1].id=x.items[0].id;
 assert.throws(()=>summarizeArtReviewQueue(x,[]),/duplicated/);
 x.items[1].id='S65:0,29:portrait'; x.items[0].screenshotSha256='bad';
 assert.throws(()=>summarizeArtReviewQueue(x,[]),/invalid/);
});

test('reviewed frames counted once even with multiple valid responses', () => {
 const r=summarizeArtReviewQueue(ledger(),[receipt(),receipt()]);
 assert.equal(r.counts.PASS,1);
 assert.equal(r.matchedRecords,2);
});
