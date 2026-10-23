import test from 'node:test';
import assert from 'node:assert/strict';
import { planWebHighReviewPackets } from '../src/web-high-review-packets.mjs';

const HEAD='a'.repeat(40);
const hash=i=>String(i).repeat(64);
const one=(scene,cue,v,id=i=>i) => ({
  id:scene+':'+cue+':'+v,
  sceneId:scene,cue,viewport:v,
  screenshotSha256:hash(v==='1920x900'?'b':v==='390x844'?'c':'d'),
  productionAssetSha256:hash('e')
});
const ledger=()=>({schemaVersion:1,sourceHead:HEAD,items:[
  one('S01','airport-outside','390x844'),one('S01','airport-outside','1920x900'),
  one('S01','airport-outside','360x640'),
  one('S06','eric-alice-stream','1920x900'),one('S06','eric-alice-stream','390x844'),
  one('S06','eric-alice-stream','360x640'),
  one('S65','keys','1920x900')
]});
const receipt=(i,extra={})=>({
  itemId:i.id,sourceHead:HEAD,screenshotSha256:i.screenshotSha256,
  productionAssetSha256:i.productionAssetSha256,actualPixelsReceived:true,
  status:'PASS',observation:'Specific, real Web observation about this viewport and authored cue.',
  ...extra
});

test('packs only same-cue viewports as one candidate, preserves native screenshot hashes',()=>{
 const r=planWebHighReviewPackets(ledger(),[],{maxAttachments:2});
 assert.equal(r.status,'REVIEW_PACKETS_PREPARED');
 assert.equal(r.nextPackets.length,2);
 assert.equal(r.deferredPackets,1);
 assert.deepEqual(r.nextPackets[0].viewports,['1920x900','390x844','360x640']);
 assert.equal(r.nextPackets[0].attachmentProposal,'NATIVE_RESOLUTION_CONTACT_SHEET');
 assert.equal(r.nextPackets[0].sceneId,'S01');
 assert.equal(r.nextPackets[0].cue,'airport-outside');
 assert.equal(r.nextPackets[0].sourceFrames[0].screenshotSha256,hash('b'));
 assert.equal(r.nextPackets[1].sceneId,'S06');
 assert.equal(r.quotaAvailability,'UNKNOWN_NOT_ATTESTED');
 assert.equal(r.nextPackets[0].mustIssuePerFrameVerdict,true);
});

test('accepted frames are never resent in the next pending batch',()=>{
 const x=ledger();const r=planWebHighReviewPackets(x,[receipt(x.items[0]),receipt(x.items[1])],{maxAttachments:4});
 assert.equal(r.counts.PASS,2);
 assert.deepEqual(r.nextPackets[0].viewports,['360x640']);
 assert.equal(r.nextPackets[0].attachmentProposal,'INDIVIDUAL_SCREENSHOT');
 assert.ok(r.nextPackets.every(p=>!p.sourceFrames.some(f=>f.itemId===x.items[0].id)));
});

test('old HEAD receipts rejected rather than accepted or reused',()=>{
 const x=ledger(),r=planWebHighReviewPackets(x,[receipt(x.items[0],{sourceHead:'f'.repeat(40)})]);
 assert.equal(r.counts.PASS,0);
 assert.equal(r.rejectedReceipts[0].reason,'STALE_SOURCE_OR_PIXELS');
 assert.ok(r.nextPackets[0].sourceFrames.some(f=>f.itemId===x.items[0].id));
});

test('existing REWORK is kept with repair owner, not uploaded again unchanged',()=>{
 const x=ledger(),r=planWebHighReviewPackets(x,[receipt(x.items[0],{status:'REWORK'})]);
 assert.equal(r.requiresRepair.length,1);
 assert.ok(r.nextPackets.every(p=>!p.sourceFrames.some(f=>f.itemId===x.items[0].id)));
});

test('exact observed quota message pauses without any packet and without a claimed reset time',()=>{
 const r=planWebHighReviewPackets(ledger(),[],{quotaObservation:{
   message:'Достигнут лимит прикрепления файлов',evidenceRef:'artifacts/evidence/host-error.txt'
 }});
 assert.equal(r.status,'PAUSED_OBSERVED_ATTACHMENT_QUOTA');
 assert.deepEqual(r.nextPackets,[]);
 assert.equal(r.queuedFrames,7);
 assert.equal(r.evidenceRef,'artifacts/evidence/host-error.txt');
 assert.doesNotMatch(JSON.stringify(r),/retryAt|resetAt|retry_after/i);
});

test('generic failure or HTTP 429 message cannot be passed off as an attachment quota',()=>{
 for(const message of ['Failed to upload attachment','429 rate limited','Upload timed out']){
  assert.throws(()=>planWebHighReviewPackets(ledger(),[],{quotaObservation:{message}}),
   /genuine explicit host attachment-quota/);
 }
});

test('single frame mode, strict ceilings, and deterministic deferral',()=>{
 const r=planWebHighReviewPackets(ledger(),[],{maxAttachments:1,maxFramesPerPacket:1});
 assert.equal(r.nextPackets.length,1);
 assert.equal(r.nextPackets[0].sourceFrames.length,1);
 assert.equal(r.queuedPackets,7);
 assert.equal(r.deferredPackets,6);
 assert.throws(()=>planWebHighReviewPackets(ledger(),[],{maxAttachments:11}),/maxAttachments/);
 assert.throws(()=>planWebHighReviewPackets(ledger(),[],{maxFramesPerPacket:4}),/maxFramesPerPacket/);
});

test('completed coverage still requires independent acceptance; planner never returns PASS',()=>{
 const x=ledger(),r=planWebHighReviewPackets(x,x.items.map(i=>receipt(i)));
 assert.deepEqual(r.counts,{PASS:7,REWORK:0,BLOCKED:0,NOT_REVIEWED:0});
 assert.equal(r.status,'NO_PENDING_ART_REVIEW');
 assert.equal(r.nextPackets.length,0);
 assert.ok(!('verdict' in r));
});

test('more than 100 pending frames remain schedulable without dropping later scenes',()=>{
 const x=ledger();x.items=[];
 for(let i=0;i<198;i++){
  const v=['1920x900','390x844','360x640'][i%3],scene='S'+String(Math.floor(i/3)+1).padStart(2,'0');
  x.items.push({...one(scene,'beat',v),id:scene+':beat:'+v});
 }
 const r=planWebHighReviewPackets(x,[],{maxAttachments:2});
 assert.equal(r.queuedFrames,198);
 assert.equal(r.queuedPackets,66);
 assert.equal(r.deferredPackets,64);
});
