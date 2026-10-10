import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateArtProducerBrief } from '../src/art-producer-brief.mjs';

const run = (cwd, ...args) => {
  const r = spawnSync('git', args, {cwd, encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
};
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function makeProject() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-terra-brief-'));
  run(dir,'init','-q');
  run(dir,'config','user.email','ceos-test@example.invalid');
  run(dir,'config','user.name','CEOS Fixture');
  fs.mkdirSync(path.join(dir,'assets','refs'),{recursive:true});
  // Valid 1x1 PNG fixture; header checks do not claim visual acceptance.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
  for(const name of ['alice','eric','nick','damir'])
    fs.writeFileSync(path.join(dir,'assets','refs',name+'.png'),png);
  fs.writeFileSync(path.join(dir,'source.txt'),'verified local source');
  run(dir,'add','.');
  run(dir,'commit','-qm','fixture');
  return dir;
}
function brief(dir) {
  return {
    schemaVersion:1, sourceHead:run(dir,'rev-parse','HEAD'), sceneId:'S26',
    cue:{id:'guesthouse-courtyard',at:[0,2]},
    requiredCast:['alice','eric','nick','damir'],
    narrativeActions:[
      {character:'eric',action:'Folds the paper road map next to the parked car'},
      {character:'nick',action:'Drinks water while standing near the steps'},
      {character:'damir',action:'Returns an empty cooking pot to the guesthouse owner'}
    ],
    sceneContinuity:'The group discusses relationships outside after the power outage',
    characterReferences:['alice','eric','nick','damir'].map(character=>{
      const p='assets/refs/'+character+'.png';
      return {character,path:p,sha256:hash(fs.readFileSync(path.join(dir,p)))};
    }),
    forbiddenProps:['stethoscope','filming camera'],
    desktop:{
      composition:'Four persons grounded in a shared courtyard with coherent perspective',
      framing:'Landscape composition with facial and hand details legible',
      requiredVisibleCast:['alice','eric','nick','damir']
    },
    portrait:{
      composition:'All four persons remain visible with deliberate staggered staging',
      framing:'Vertical mobile crop preserves four distinct faces and grounding',
      requiredVisibleCast:['alice','eric','nick','damir']
    },
    qualityAcceptance:[
      'All eyes and facial details are clean, sharp and identity-consistent',
      'Anatomical hands and contact points have realistic proportions',
      'Lighting, location and required narrative props fit the manuscript'
    ],
    candidateNumber:1, priorRejection:null
  };
}
test('Terra producer brief is exact HEAD and image-reference bound, without pretending capability proof',()=>{
  const dir=makeProject();
  const result=validateArtProducerBrief(dir,brief(dir));
  assert.equal(result.status,'READY_TO_GENERATE',result.issues.join('; '));
  assert.equal(result.toolAvailability,'NOT_ATTESTED');
  assert.equal(result.maxCandidatesPerCueVariant,2);
});

test('stale HEAD, missing refs, changed pixels, traversal, omitted portrait cast fail closed',()=>{
  const dir=makeProject(), b=brief(dir);
  b.sourceHead='f'.repeat(40);
  b.characterReferences[0].sha256='1'.repeat(64);
  b.characterReferences[1].path='../outside.png';
  b.characterReferences[2].path='assets/refs/not-real.png';
  b.portrait.requiredVisibleCast=['alice','eric'];
  const r=validateArtProducerBrief(dir,b);
  assert.equal(r.status,'BLOCKED_ART_BRIEF');
  assert.match(r.issues.join(' | '),/sourceHead/);
  assert.match(r.issues.join(' | '),/SHA-256/);
  assert.match(r.issues.join(' | '),/project-relative/);
  assert.match(r.issues.join(' | '),/existing file/);
  assert.match(r.issues.join(' | '),/portrait/);
});

test('candidate three stops, candidate two requires independently referenced rejection and real revision',()=>{
  const dir=makeProject(), b=brief(dir);
  b.candidateNumber=3;
  assert.match(validateArtProducerBrief(dir,b).issues.join('; '),/maximum of 2/);
  b.candidateNumber=2;
  assert.match(validateArtProducerBrief(dir,b).issues.join('; '),/second candidate/);
  const p='reject.json',data=JSON.stringify({assessment:'Failed hand anatomy and missing cast'});
  fs.writeFileSync(path.join(dir,p),data);
  b.priorRejection={
    candidateNumber:1,evidencePath:p,sha256:hash(Buffer.from(data)),
    findings:['The portrait omits two required characters from the courtyard',
      'Unnatural hand position and blurred eyes in the desktop frame'],
    revision:'Rebuild the scene with all four people and clear hand anatomy'
  };
  assert.equal(validateArtProducerBrief(dir,b).status,'READY_TO_GENERATE');
  fs.writeFileSync(path.join(dir,p),'tampered');
  assert.match(validateArtProducerBrief(dir,b).issues.join('; '),/SHA-256/);
});

test('art brief rejects fake PNG bytes even when SHA matches',()=>{
  const dir=makeProject(), b=brief(dir);
  const img='assets/refs/alice.png';
  fs.writeFileSync(path.join(dir,img),Buffer.from('not actual PNG pixels'));
  b.characterReferences[0].sha256=hash(fs.readFileSync(path.join(dir,img)));
  assert.match(validateArtProducerBrief(dir,b).issues.join('; '),/valid image header/);
});

test('semantic text omissions block as structurally incomplete, without judging image quality',()=>{
  const dir=makeProject(), b=brief(dir);
  b.narrativeActions=[];
  b.sceneContinuity='';
  b.qualityAcceptance=['nice'];
  assert.equal(validateArtProducerBrief(dir,b).status,'BLOCKED_ART_BRIEF');
});

test('art-brief-verify CLI reports read-only readiness and blocked code 2',()=>{
  const dir=makeProject(), b=brief(dir);
  fs.writeFileSync(path.join(dir,'art-brief.json'),JSON.stringify(b));
  const bin=path.join(import.meta.dirname,'..','bin','ceos.mjs');
  const good=spawnSync(process.execPath,[bin,'art-brief-verify','--project',dir,'--file','art-brief.json','--json'],{encoding:'utf8'});
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).status,'READY_TO_GENERATE');
  b.sourceHead='a'.repeat(40);
  fs.writeFileSync(path.join(dir,'art-brief.json'),JSON.stringify(b));
  const bad=spawnSync(process.execPath,[bin,'art-brief-verify','--project',dir,'--file','art-brief.json','--json'],{encoding:'utf8'});
  assert.equal(bad.status,2,bad.stderr);
  assert.equal(JSON.parse(bad.stdout).status,'BLOCKED_ART_BRIEF');
});
