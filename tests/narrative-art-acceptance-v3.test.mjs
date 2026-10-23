import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NARRATIVE_ART_ACCEPTANCE_V3 as V3, assessArtFindingsV3, validateArtReviewV3 } from '../src/narrative-art-acceptance-v3.mjs';
import { validateWebReview } from '../src/web-delegation.mjs';
import { summarizeArtReviewQueue } from '../src/art-review-queue.mjs';
import { authorizeArtRework } from '../src/art-rework-budget.mjs';
import { createRun } from '../src/execution-engine.mjs';

const H='a'.repeat(40), B='b'.repeat(64), C='c'.repeat(64);
const cosmetic=()=>({id:'bianca-folds',severity:'P3',status:'OPEN',observation:'Minor folds in fabric differ'});
const wrongPerson=()=>({id:'wrong-bianca',severity:'P1',status:'OPEN',characterId:'bianca',
  impactCode:'WRONG_CHARACTER',authoredCue:'Bianca enters the lobby and speaks to Nika',
  observation:'A different character is pictured and acts as Bianca',
  playerImpact:'Player identifies the wrong character in an important story encounter',
  evidenceRef:'bianca-portrait',actualPixelsReceived:true});
function review(status='PASS',findings=[],more={}) {
  return {artAcceptanceProfile:V3,phase:'acceptance',agent:'ceos_art_director_web',
    sourceHead:H,status,reviewTraceId:'trace-001',taskId:'review-001',
    reviewedItems:['ep2_bianca_arrives'],evidenceRefs:['bianca-portrait'],
    receivedEvidenceRefs:['bianca-portrait'],actualPixelsReceived:true,
    decision:'Identity, wardrobe, story context and current scene framing checked over supplied pixels.',
    findings,unresolved:findings.filter(x=>x.status==='OPEN'&&['P0','P1'].includes(x.severity)).map(x=>x.id),
    visualEvidence:[{ref:'bianca-portrait',path:'artifacts/img/bianca.png',sha256:B,
      observation:'Bianca stands in the correct hotel lobby wearing her recognizable charcoal tailored suit.'}],
    requiredCast:['bianca'],wardrobeAssessments:[{
      characterId:'bianca',identityObservation:'Bianca retains long copper red hair, age and face.',
      wardrobeObservation:'Charcoal suit is consistent with a formal business encounter.',
      actionObservation:'Bianca faces the lobby reception in the narrative beat.',
      evidenceRefs:['bianca-portrait'],identityStatus:'PASS',wardrobeStatus:'PASS',
      storyActionStatus:'PASS',dualFormatStatus:'PASS'
    }],...more};
}
const opts={pipeline:'production-art',phase:'acceptance',currentHead:H,
  visual:true,assurance:'visual-content',artAcceptanceProfile:V3};
test('V3 accepts minor wardrobe details as explicit PASS_WITH_NOTES, never forces regenerations',()=>{
  const v=review('PASS_WITH_NOTES',[cosmetic()]);
  assert.equal(validateArtReviewV3(v).verdict,'PASS_WITH_NOTES');
  assert.deepEqual(validateWebReview(v,opts),[]);
  assert.equal(authorizeArtRework({acceptanceProfile:V3,scopeKey:'bianca',
    findings:[cosmetic()],attempts:[],transportState:'READY',
    proposedMethod:'generation',proposedStrategyKey:'regenerate-for-folds'}).status,'NO_MATERIAL_REWORK');
});
test('V3 requires independent explicit status and actual pixel evidence, never synthesizes PASS',()=>{
  assert.ok(validateArtReviewV3(review('PASS',[cosmetic()])).errors.some(x=>x.includes('disagrees')));
  assert.ok(validateWebReview(review('PASS_WITH_NOTES',[cosmetic()],{actualPixelsReceived:false}),opts).length);
  assert.ok(validateWebReview(review('PASS_WITH_NOTES',[cosmetic()],{receivedEvidenceRefs:[]}),opts).length);
  assert.ok(validateArtReviewV3(review('PASS',[],{requiredCast:[],wardrobeAssessments:[]})).ok);
});
test('V3 prevents wardrobe or wrong-character defects from becoming advisory',()=>{
  const issue=wrongPerson(), r=review('REWORK',[issue]);
  r.wardrobeAssessments[0].identityStatus='REWORK';
  assert.equal(validateArtReviewV3(r).verdict,'REWORK');
  assert.ok(validateWebReview(r,opts).length>0); // REWORK cannot satisfy final gate
  assert.equal(assessArtFindingsV3([{...cosmetic(),severity:'P2',materialPlayerImpact:true}]).ok,false);
  assert.equal(assessArtFindingsV3([{...issue,actualPixelsReceived:false}]).ok,false);
});
test('V3 accepts incidental costume variation without independent mandatory duplicate wardrobe gate',()=>{
  const r=review('PASS_WITH_NOTES',[{
    id:'costume-buttons',severity:'P2',status:'OPEN',
    observation:'Small button shape difference between portrait and landscape'
  }]);
  assert.equal(validateArtReviewV3(r).ok,true);
  assert.equal(validateWebReview(r,opts).length,0);
});
test('V3 queue counts independent PASS_WITH_NOTES as accepted; historical REWORK not relabelled',()=>{
  const ledger={schemaVersion:1,sourceHead:H,acceptanceProfile:V3,items:[{
    id:'bianca:portrait',sceneId:'ep2_bianca_arrives',cue:'0,0',viewport:'390x844',
    screenshotSha256:B,productionAssetSha256:C
  }]};
  const r={...review('PASS_WITH_NOTES',[cosmetic()]),itemId:'bianca:portrait',
    acceptanceProfile:V3,screenshotSha256:B,productionAssetSha256:C,
    observation:'The game portrait clearly shows the intended character and suitable costume.'};
  const ok=summarizeArtReviewQueue(ledger,[r]);
  assert.equal(ok.counts.PASS_WITH_NOTES,1);
  assert.equal(ok.complete,true);
  const unresolved=summarizeArtReviewQueue(ledger,[
    {...r,status:'REWORK',findings:[wrongPerson()],unresolved:['wrong-bianca'],reviewTraceId:'old'},
    r
  ]);
  assert.equal(unresolved.complete,false);
  assert.equal(unresolved.rejected.some(x=>x.reason==='REWORK_NOT_RESOLVED'),true);
});
test('V3 is opt-in for new narrative production runs; old default V2 persists',t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-v3-config-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const project=path.join(base,'project');fs.mkdirSync(path.join(project,'config'),{recursive:true});
  fs.writeFileSync(path.join(project,'config','narrative-game.local.json'),
    JSON.stringify({profile:'narrative-game',enabled:true,artAcceptanceProfile:V3}));
  const scope={target:'episode art',inScope:['EP3'],outOfScope:[],
    acceptanceContract:'source-bound',mutationBoundary:'local'};
  const capabilities={filesystem:{exists:true,readable:true,writable:true},
    web:{status:'NOT_CONFIGURED'},
    imageGeneration:{status:'unknown',capabilityPresence:'UNKNOWN',generationAllowed:false}};
  const created=createRun(project,'production-art',{scope,capabilities});
  assert.equal(created.run.artAcceptanceProfile,V3);
});
