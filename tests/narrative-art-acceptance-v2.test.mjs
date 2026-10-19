import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NARRATIVE_ART_ACCEPTANCE_V2 as V2, NARRATIVE_ART_STORY_FIRST_GUIDANCE, assessNarrativeArtFindings } from '../src/narrative-art-acceptance.mjs';
import { authorizeArtRework } from '../src/art-rework-budget.mjs';
import { summarizeArtReviewQueue } from '../src/art-review-queue.mjs';
import { validateWebReview } from '../src/web-delegation.mjs';
import { createRun } from '../src/execution-engine.mjs';

const H='a'.repeat(40),B='b'.repeat(64),C='c'.repeat(64);
const p3=()=>({id:'S03-wall-photo',status:'OPEN',severity:'P3',observation:'Background photograph looks slightly different'});
const p2=()=>({id:'S03-hand',status:'OPEN',severity:'P2',observation:'Partially visible secondary hand'});
const p1=()=>({id:'S06-wrong-actor',status:'OPEN',severity:'P1',
  impactCode:'WRONG_ACTOR_OR_ACTION',authoredCue:'S06: Matteo gives Nika the document',
  observation:'Elio is visibly handing the document to Nika instead of Matteo',
  playerImpact:'Player will identify the wrong character as the person who gave the document',
  evidenceRef:'S06:390x844',actualPixelsReceived:true});
const materialP2=()=>({id:'S06-essential-gesture',status:'OPEN',severity:'P2',
  materialPlayerImpact:true,impactCode:'ESSENTIAL_GESTURE_UNREADABLE',
  authoredCue:'S06: the protagonist follows the explicit signal from Matteo',
  observation:'The directing hand is cropped and no other visual indication explains the direction',
  playerImpact:'Player cannot understand the story-critical action of directing Nika to the exit',
  evidenceRef:'S06:390x844',actualPixelsReceived:true});
const ledger=()=>({schemaVersion:1,sourceHead:H,acceptanceProfile:V2,items:[
  {id:'S06:390x844',sceneId:'S06',cue:'0,12',viewport:'390x844',screenshotSha256:B,productionAssetSha256:C}
]});
const receipt=(status,findings=[],more={})=>({
  itemId:'S06:390x844',sourceHead:H,screenshotSha256:B,productionAssetSha256:C,
  acceptanceProfile:V2,actualPixelsReceived:true,status,
  observation:'The character and the central authored action are legible in the game frame.',
  findings,...more
});
const rework=(findings)=>({
  acceptanceProfile:V2,scopeKey:'S06:390x844',findings,attempts:[],
  transportState:'READY',proposedMethod:'generation',proposedStrategyKey:'first-composition'
});
const webReview=(findings=[],extra={})=>({
  phase:'acceptance',agent:'ceos_art_director_web',sourceHead:H,
  artAcceptanceProfile:V2,status:'PASS',reviewTraceId:'trace1',taskId:'web1',
  reviewedItems:['S06'],evidenceRefs:['S06:390x844'],receivedEvidenceRefs:['S06:390x844'],
  actualPixelsReceived:true,decision:'Independently reviewed real pixel-backed story framing',
  findings,unresolved:[],...extra
});
const webOptions={pipeline:'production-art',phase:'acceptance',currentHead:H,visual:true,assurance:'strict',artAcceptanceProfile:V2};

test('V2 accepts incidental background, acceptable clothing and noncritical crop as advisory',()=>{
  const verdict=assessNarrativeArtFindings([p3(),p2()]);
  assert.equal(verdict.ok,true);
  assert.equal(verdict.verdict,'ACCEPTABLE_WITH_NOTES');
  assert.equal(verdict.blockingFindings.length,0);
  assert.equal(verdict.advisoryFindings.length,2);
});

test('P1 plot/action contradictions block, but cannot be asserted without actual pixels and cue',()=>{
  assert.equal(assessNarrativeArtFindings([p1()]).verdict,'REWORK_REQUIRED');
  assert.equal(assessNarrativeArtFindings([p1(),p3()]).blockingFindings.length,1);
  assert.equal(assessNarrativeArtFindings([{...p1(),actualPixelsReceived:false}]).verdict,'INVALID_FINDINGS');
  assert.equal(assessNarrativeArtFindings([{...p1(),impactCode:'COSMETIC_DIFFERENCE'}]).verdict,'INVALID_FINDINGS');
});

test('story-first policy rejects a P1 for a narrated nonvisual action with explicitly no player impact',()=>{
  const unillustrated={
    ...p1(), id:'S24-calendar',
    impactCode:'STORY_CRITICAL_PROP_MISSING',
    authoredCue:'Matteo narrates the change of the shared calendar label',
    observation:'The image shows a planning sheet, not a visible edit to the calendar',
    playerImpact:'The dialogue makes the decision clear, so the missing close-up is nonmaterial',
    visualRequired:false, materialPlayerImpact:false
  };
  const result=assessNarrativeArtFindings([unillustrated]);
  assert.equal(result.ok,false);
  assert.equal(result.verdict,'INVALID_FINDINGS');
  assert.match(result.errors.join(' '),/non-visual.*non-material/);
  assert.equal(assessNarrativeArtFindings([{...unillustrated,severity:'P2'}]).verdict,'ACCEPTABLE_WITH_NOTES');
});

test('story-first does not demote actual wrong actor or material P1, and still requires evidence',()=>{
  assert.equal(assessNarrativeArtFindings([p1()]).verdict,'REWORK_REQUIRED');
  assert.equal(assessNarrativeArtFindings([{...p1(),visualRequired:true}]).verdict,'REWORK_REQUIRED');
  assert.equal(assessNarrativeArtFindings([{...p1(),visualRequired:'no'}]).verdict,'INVALID_FINDINGS');
  assert.ok(NARRATIVE_ART_STORY_FIRST_GUIDANCE.some(rule=>rule.includes('dialogue')));
});

test('P2 requires explicit material impact and allowed impact code to block',()=>{
  assert.equal(assessNarrativeArtFindings([p2()]).verdict,'ACCEPTABLE_WITH_NOTES');
  assert.equal(assessNarrativeArtFindings([materialP2()]).verdict,'REWORK_REQUIRED');
  assert.equal(assessNarrativeArtFindings([{...materialP2(),impactCode:'BACKGROUND_PHOTO_VARIATION'}]).verdict,'INVALID_FINDINGS');
});

test('P3 cannot masquerade as essential material player impact',()=>{
  assert.equal(assessNarrativeArtFindings([{...p3(),materialPlayerImpact:true}]).verdict,'INVALID_FINDINGS');
});

test('V2 repair preflight refuses cosmetic P2/P3 and permits proven narrative defects',()=>{
  assert.equal(authorizeArtRework(rework([p2(),p3()])).status,'NO_MATERIAL_REWORK');
  assert.equal(authorizeArtRework(rework([materialP2()])).status,'READY_FOR_SCOPED_REPAIR');
  assert.equal(authorizeArtRework(rework([p1()])).status,'READY_FOR_SCOPED_REPAIR');
  assert.equal(authorizeArtRework(rework([{...p1(),actualPixelsReceived:false}])).status,'BLOCKED_UNVERIFIED_FINDINGS');
  const exhausted=rework([p1()]);
  exhausted.attempts=[1,2].map(i=>({scopeKey:exhausted.scopeKey,method:'generation',strategyKey:'candidate-'+i,outcome:'FAIL'}));
  assert.equal(authorizeArtRework(exhausted).status,'ESCALATE_ART_GENERATION');
});

test('V2 review queue never silently converts cosmetic REWORK into PASS',()=>{
  const result=summarizeArtReviewQueue(ledger(),[receipt('REWORK',[p3()])]);
  assert.equal(result.counts.NOT_REVIEWED,1);
  assert.equal(result.rejected[0].reason,'V2_STATUS_FINDINGS_MISMATCH');
  assert.equal(result.complete,false);
});

test('V2 queue accepts explicit independently issued PASS with P2/P3 notes',()=>{
  const result=summarizeArtReviewQueue(ledger(),[receipt('PASS',[p3(),p2()])]);
  assert.equal(result.counts.PASS,1);
  assert.equal(result.complete,true);
  assert.equal(result.verdict,'READY_FOR_INDEPENDENT_ACCEPTANCE_GATE');
});

test('V2 queue rejects false PASS with open P1 and missing reviewer profile',()=>{
  const wrong=summarizeArtReviewQueue(ledger(),[receipt('PASS',[p1()])]);
  assert.equal(wrong.rejected[0].reason,'V2_STATUS_FINDINGS_MISMATCH');
  const missing=summarizeArtReviewQueue(ledger(),[receipt('PASS',[],{acceptanceProfile:null})]);
  assert.equal(missing.rejected[0].reason,'V2_PROFILE_MISMATCH');
});

test('V2 cannot wash away prior independent REWORK without resolution evidence',()=>{
  const l=ledger();
  const x=summarizeArtReviewQueue(l,[receipt('REWORK',[p1()]),receipt('PASS',[p3()])]);
  assert.equal(x.counts.REWORK,1);
  assert.equal(x.rejected[0].reason,'REWORK_NOT_RESOLVED');
});

test('Independent Web acceptance V2 permits P3 advice but refuses any material P1',()=>{
  assert.deepEqual(validateWebReview(webReview([p3(),p2()]),webOptions),[]);
  assert.match(validateWebReview(webReview([p1()]),webOptions).join(' '),/blocking findings/);
  assert.match(validateWebReview(webReview([p3()],{artAcceptanceProfile:null}),webOptions).join(' '),/V2 reviewer decision/);
  assert.match(validateWebReview(webReview([p3()],{actualPixelsReceived:false}),webOptions).join(' '),/actual-pixel|pixel/i);
  assert.match(validateWebReview(webReview([p3()],{receivedEvidenceRefs:[]}),webOptions).join(' '),/bundle/);
});

test('New narrative CEOS art runs persist V2; generic art remains legacy',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-art-v2-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const art=path.join(root,'novel'),generic=path.join(root,'generic');
  fs.mkdirSync(path.join(art,'config'),{recursive:true});
  fs.mkdirSync(generic);
  fs.writeFileSync(path.join(art,'config','narrative-game.local.json'),
    JSON.stringify({profile:'narrative-game',enabled:true}));
  const scope={target:'episode visuals',inScope:['EP1'],outOfScope:[],
    acceptanceContract:'source-bound',mutationBoundary:'local'};
  const caps={filesystem:{exists:true,readable:true,writable:true},web:{status:'NOT_CONFIGURED'},
    imageGeneration:{status:'unknown',capabilityPresence:'UNKNOWN',generationAllowed:false}};
  const novelRun=createRun(art,'production-art',{scope,capabilities:caps});
  const genericRun=createRun(generic,'production-art',{scope,capabilities:caps});
  assert.equal(novelRun.run.artAcceptanceProfile,V2);
  assert.equal(genericRun.run.artAcceptanceProfile,null);
});
