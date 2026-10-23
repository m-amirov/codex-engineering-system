import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveAuthoredSceneId, resolveEpisodeIdentity, expectedEpisodePath } from '../src/narrative-source-resolver.mjs';
import { authorizeArtCandidate, inspectArtCandidateLedger } from '../src/art-candidate-ledger.mjs';
import { classifyTemporaryBlocker, planWorkAroundTemporaryBlocker } from '../src/temporary-blocker-recovery.mjs';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-phase01-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, rel, obj) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(obj));
  fs.writeFileSync(file, bytes);
  return digest(bytes);
}
test('canonical EP3 scene is accepted from actual graph, aliases and invented IDs refused', t => {
  const root = project(t);
  put(root, 'narrative/graph.json', { scenes: [
    { id: 'ep3_old_photo', episode: 3, assetId: 'photo' },
    { id: 'ep3_document_check_response', episode: 3, assetId: 'document' }
  ]});
  assert.equal(resolveAuthoredSceneId(root, 'ep3_old_photo').code, 'AUTHORED_SCENE');
  assert.equal(resolveAuthoredSceneId(root, 'ep3_unwritten').code, 'SCENE_NOT_IN_NARRATIVE_GRAPH');
  assert.equal(resolveAuthoredSceneId(root, '../ep3_old_photo').ok, false);
  assert.equal(resolveAuthoredSceneId(root, 'ep3_old_photo_alias').ok, false);
  assert.equal(expectedEpisodePath('EP3'), 'narrative/episodes/ep-03.json');
  assert.equal(resolveEpisodeIdentity('EP3',
    { episode: 3, scenes: [{id:'ep3_old_photo'}, {id:'ep3_document_check_response'}] },
    { scenes: [{id:'ep3_old_photo',episode:3},{id:'ep3_document_check_response',episode:3}] }).ok, true);
  assert.equal(resolveEpisodeIdentity('EP3',
    { episode: 3, scenes: [{id:'ep3_old_photo'}] },
    { scenes: [{id:'ep3_old_photo',episode:3},{id:'ep3_document_check_response',episode:3}] }).ok, false);
});
test('legacy S scenes and EP2 fixtures remain supported without requiring graph episode field', t => {
  const root = project(t);
  put(root, 'narrative/graph.json', {scenes:[{id:'S24',assetId:'a'}]});
  assert.equal(resolveAuthoredSceneId(root, 'S24').ok, true);
  assert.equal(resolveEpisodeIdentity('EP2', {episode:2,scenes:[{id:'S24'}]}, {scenes:[{id:'S24'}]}).ok, true);
});
test('third candidate requires one scoped host-observed, hash-bound exception and verified history', t => {
  const root = project(t), head = 'a'.repeat(40);
  const ledgerPath = 'artifacts/production-art/candidate-ledger.json';
  const exceptionPath = 'artifacts/production-art/owner-exception.json';
  const attempts = [1,2].map(n => ({attemptId:'old-photo-'+n, sceneId:'ep3_old_photo',
    variant:'pair', candidateNumber:n, status:'OUTPUT_SAVED', sourceHead:head,producerTrace:'terra-trace-'+n}));
  put(root, ledgerPath, {schemaVersion:1,kind:'ART_CANDIDATE_LEDGER_V1',attempts});
  const exceptionSha = put(root, exceptionPath, {schemaVersion:1,kind:'OWNER_AUTHORIZED_ART_EXCEPTION_V1',
    sourceHead:head,scenes:[{sceneId:'ep3_old_photo',variant:'pair',baseLimit:2,extraCandidates:1}]});
  const options = {sceneId:'ep3_old_photo',variant:'pair',candidateNumber:3,sourceHead:head,
    ownerExceptionPath:exceptionPath,ownerExceptionSha256:exceptionSha,ownerApprovalObserved:true,ledgerPath};
  assert.equal(inspectArtCandidateLedger(root,ledgerPath).status,'PASS_CANDIDATE_LEDGER');
  assert.equal(authorizeArtCandidate(root, options).status,'READY_TO_GENERATE');
  assert.equal(authorizeArtCandidate(root, {...options,ownerApprovalObserved:false}).authorized,false);
  assert.equal(authorizeArtCandidate(root, {...options,sceneId:'ep3_other'}).authorized,false);
  assert.equal(authorizeArtCandidate(root, {...options,candidateNumber:4}).authorized,false);
  assert.equal(authorizeArtCandidate(root, {...options,ownerExceptionSha256:'f'.repeat(64)}).authorized,false);
  assert.equal(authorizeArtCandidate(root, {...options,ledgerPath:null}).authorized,false);
  assert.equal(authorizeArtCandidate(root, {...options,candidateNumber:2}).status,'BLOCKED_CANDIDATE_ALREADY_CONSUMED');
});
test('ledger counts invoked attempts even when image bytes were lost and refuses duplicate ordinals', t => {
  const root=project(t), head='b'.repeat(40), rel='artifacts/candidates.json';
  const x={attemptId:'one',sceneId:'ep3_old_photo',variant:'pair',candidateNumber:1,
    status:'OUTPUT_LOST',sourceHead:head,producerTrace:'observed-native-tool-turn'};
  put(root,rel,{schemaVersion:1,kind:'ART_CANDIDATE_LEDGER_V1',attempts:[x]});
  assert.equal(inspectArtCandidateLedger(root,rel).consumed['ep3_old_photo:pair'],1);
  put(root,rel,{schemaVersion:1,kind:'ART_CANDIDATE_LEDGER_V1',attempts:[x,{...x,attemptId:'two'}]});
  assert.equal(inspectArtCandidateLedger(root,rel).status,'BLOCKED_CANDIDATE_LEDGER');
});
test('external failure is pausable but semantic and provenance defects never auto-reopen', () => {
  assert.equal(classifyTemporaryBlocker('MODEL_ENTITLEMENT_UNAVAILABLE').status,'PAUSED_EXTERNAL');
  assert.equal(classifyTemporaryBlocker('PROVENANCE_FAILURE').status,'HARD_BLOCKED');
  assert.equal(classifyTemporaryBlocker('BLOCKED_ART_BRIEF').status,'HARD_BLOCKED');
  assert.equal(planWorkAroundTemporaryBlocker('RATE_LIMITED','RUN_TESTS').executable,true);
  assert.equal(planWorkAroundTemporaryBlocker('RATE_LIMITED','PUBLISH').executable,false);
});
