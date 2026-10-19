import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { encodeProductionPng } from '../src/art-output-gate.mjs';
import { inspectEpisodeArtFinalization } from '../src/episode-art-finalization.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = (project, name) => path.join(project, ...name.split('/'));
const put = (project, name, bytes) => {
  fs.mkdirSync(path.dirname(rel(project,name)),{recursive:true});
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(typeof bytes === 'string' ? bytes : JSON.stringify(bytes));
  fs.writeFileSync(rel(project,name),buffer);
  return {path:name,sha256:sha(buffer)};
};
const runGit = (project, args) => {
  const r=spawnSync('git',args,{cwd:project,encoding:'utf8',windowsHide:true});
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
};
const png = (width,height) => encodeProductionPng({width,height,pixels:Buffer.alloc(width*height*4)});

function fixture(t) {
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-episode-art-final-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  runGit(project,['init','-q']);
  runGit(project,['config','user.email','test@example.com']);
  runGit(project,['config','user.name','CEOS Test']);
  const original=put(project,'artifacts/images/S24-portrait.png',png(768,1152));
  const landscape=put(project,'artifacts/images/S24-landscape.png',png(1280,720));
  const source = put(project,'narrative/assets.json',{schemaVersion:1,assets:{
    ep2_s24_asset:{
      kind:'production-cg',
      variants:{
        portrait:{src:'/artifacts/images/S24-portrait.png',sha256:original.sha256,dimensions:{width:768,height:1152}},
        landscape:{src:'/artifacts/images/S24-landscape.png',sha256:landscape.sha256,dimensions:{width:1280,height:720}}
      }
    }
  }});
  const episode = put(project,'narrative/episodes/ep-02.json',{
    episode:2,scenes:[{id:'S24',assetId:'ep2_s24_asset'}]
  });
  const graph = put(project,'narrative/graph.json',{
    scenes:[{id:'S24',assetId:'ep2_s24_asset'}]
  });
  runGit(project,['add','narrative/assets.json','narrative/episodes/ep-02.json','narrative/graph.json']);
  runGit(project,['commit','-qm','baseline narrative sources']);
  const head=runGit(project,['rev-parse','HEAD']);
  const capture=put(project,'artifacts/runtime/S24-390x844.png',png(768,1152));
  const refs=['S24-original','S24-runtime'];
  const visualEvidence=[
    {ref:refs[0],...original,observation:'Matteo visibly holds a folder beside the planning sheet while facing Nika.'},
    {ref:refs[1],...capture,observation:'In the player-facing frame both faces and the planning dialogue are legible.'}
  ];
  const review={
    schemaVersion:1,phase:'acceptance',agent:'ceos_art_director_web',
    artAcceptanceProfile:'NARRATIVE_ART_ACCEPTANCE_V2',
    sourceHead:head,status:'PASS',reviewedItems:['S24'],evidenceRefs:refs,
    receivedEvidenceRefs:refs,actualPixelsReceived:true,
    decision:'Player-facing scene is readable, and narrated action needs no literal CG close-up.',
    findings:[],unresolved:[],visualEvidence
  };
  const raw=put(project,'artifacts/evidence/S24-review.raw.txt',JSON.stringify(review));
  const receipt=put(project,'artifacts/evidence/S24-review.json',review);
  const runtime=put(project,'artifacts/evidence/runtime.json',{
    status:'PASS_RUNTIME',sourceHead:head,consoleErrors:[],requestFailures:[],httpErrors:[],
    captures:[{sceneId:'S24',assetId:'ep2_s24_asset',format:'portrait',source:original.path,
      screenshot:capture.path,screenshotSha256:capture.sha256}]
  });
  const narrative=put(project,'artifacts/evidence/narrative.json',{
    status:'PASS',sourceHead:head,validatedScenes:['S24'],errors:[]
  });
  const reconciliation=put(project,'artifacts/evidence/reconciliation.json',{
    status:'PASS',sourceHead:head,acceptedScenes:[{
      sceneId:'S24',assetId:'ep2_s24_asset',receipt:receipt.path,receiptSha256:receipt.sha256,
      receiptSourceHead:head,provenance:'CURRENT_DEV_ONLY_WEB_HIGH'
    }]
  });
  const rights=put(project,'artifacts/evidence/rights.json',{
    entries:[
      {path:original.path,sha256:original.sha256,approvalStatus:'PASS',licenseOrPermission:'Owner-approved project use.'},
      {path:landscape.path,sha256:landscape.sha256,approvalStatus:'PASS',licenseOrPermission:'Owner-approved project use.'}
    ]
  });
  const narrativeInventory={
    episode:{path:episode.path,sha256:episode.sha256},
    graph:{path:graph.path,sha256:graph.sha256},
    assets:{path:source.path,sha256:source.sha256}
  };
  const manifest={
    schemaVersion:1,kind:'EPISODE_ART_FINALIZATION_V1',episodeId:'EP2',
    sourceHead:head,sourceDependencies:[source,episode,graph],authoritativeInventory:narrativeInventory,
    expectedScenes:1,expectedPairs:1,expectedRuntimeCaptures:1,
    scenes:[{id:'S24',assetId:'ep2_s24_asset',pairId:'ep2_s24'}],
    pairs:[{id:'ep2_s24',assetIds:['ep2_s24_asset'],portrait:original,landscape}],
    progressIndexes:[],reviews:[{receipt,raw}],runtimeReport:runtime,
    narrativeReport:narrative,reconciliation,rightsManifest:rights
  };
  const manifestPath='artifacts/episode-finalization.json';
  const save = () => put(project,manifestPath,manifest);
  save();
  return {project,manifest,manifestPath,save,head,source,episode,graph,raw,receipt,original,landscape,capture,runtime,narrative,reconciliation,rights,narrativeInventory};
}

test('read-only episode art finalization can pass from original bytes and independent reviewer receipts',t=>{
  const f=fixture(t);
  const before=fs.readFileSync(rel(f.project,f.manifestPath));
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'PASS_EPISODE_ART_FINALIZATION',result.problems.join('; '));
  assert.equal(result.releaseReady,false);
  assert.deepEqual(result.coverage,{
    scenes:1,reviewedScenes:1,pairs:1,acceptedPairs:1,productionPng:2,runtimeCaptures:1
  });
  assert.equal(result.historicalRunsSelected,false);
  assert.deepEqual(fs.readFileSync(rel(f.project,f.manifestPath)),before);
});

test('multiple damaged historical runs are not inspected or selected by episode finalization',t=>{
  const f=fixture(t);
  put(f.project,'.ceos-runs/active-a/run.json',{runId:'active-a',pipeline:'production-art'});
  put(f.project,'.ceos-runs/active-b/run.json',{runId:'active-b',pipeline:'production-art'});
  assert.equal(inspectEpisodeArtFinalization(f.project,f.manifestPath).status,'PASS_EPISODE_ART_FINALIZATION');
});

test('narrative source drift blocks acceptance even if existing receipts are unchanged',t=>{
  const f=fixture(t);
  put(f.project,'narrative/assets.json',{schemaVersion:1,assets:[{id:'changed'}]});
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.some(p=>p.includes('SOURCE_DEPENDENCY_0_HASH_MISMATCH')));
});

test('post-review source commit outside evidence directory blocks acceptance',t=>{
  const f=fixture(t);
  put(f.project,'narrative/dialogues.json',{scenes:['changed']});
  runGit(f.project,['add','narrative/dialogues.json']);
  runGit(f.project,['commit','-qm','change source after visual review']);
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.includes('SOURCE_DRIFT_OUTSIDE_EVIDENCE'));
});

test('bad runtime screenshot bytes block acceptance',t=>{
  const f=fixture(t);
  fs.appendFileSync(rel(f.project,f.capture.path),'tamper');
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.some(p=>p.includes('HASH_MISMATCH')));
});

test('raw-response mismatch cannot be upgraded into independent PASS',t=>{
  const f=fixture(t);
  const changed=JSON.parse(fs.readFileSync(rel(f.project,f.raw.path),'utf8'));
  changed.status='REWORK';
  const next=put(f.project,f.raw.path,JSON.stringify(changed));
  f.manifest.reviews[0].raw=next;
  f.save();
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.includes('REVIEW_0_RAW_RECEIPT_MISMATCH'));
});

test('an unsupported reviewer REWORK cannot finalize the scene',t=>{
  const f=fixture(t);
  const changed=JSON.parse(fs.readFileSync(rel(f.project,f.receipt.path),'utf8'));
  changed.status='REWORK';
  f.manifest.reviews[0].receipt=put(f.project,f.receipt.path,changed);
  f.manifest.reviews[0].raw=put(f.project,f.raw.path,JSON.stringify(changed));
  f.save();
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.some(p=>p.includes('WEB_INVALID')));
});

test('missing scene coverage cannot be inferred from manifest counts',t=>{
  const f=fixture(t);
  f.manifest.scenes.push({id:'S25',pairId:'ep2_s24'});
  f.manifest.expectedScenes=2;
  f.manifest.narrativeReport=put(f.project,f.narrative.path,{
    status:'PASS',sourceHead:f.head,validatedScenes:['S24','S25'],errors:[]
  });
  f.save();
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.includes('MANIFEST_SCENE_INVENTORY_MISMATCH'));
});

test('authoritative authored inventory rejects a signed-looking manifest subset',t=>{
  const f=fixture(t);
  const episode=JSON.parse(fs.readFileSync(rel(f.project,f.episode.path),'utf8'));
  episode.scenes.push({id:'S25',assetId:'ep2_s24_asset'});
  const graph=JSON.parse(fs.readFileSync(rel(f.project,f.graph.path),'utf8'));
  graph.scenes.push({id:'S25',assetId:'ep2_s24_asset'});
  fs.writeFileSync(rel(f.project,f.episode.path),JSON.stringify(episode));
  fs.writeFileSync(rel(f.project,f.graph.path),JSON.stringify(graph));
  runGit(f.project,['add',f.episode.path,f.graph.path]);
  runGit(f.project,['commit','-qm','authoritative inventory expands']);
  f.manifest.sourceHead=runGit(f.project,['rev-parse','HEAD']);
  const episodeRef={path:f.episode.path,sha256:sha(fs.readFileSync(rel(f.project,f.episode.path)))};
  const graphRef={path:f.graph.path,sha256:sha(fs.readFileSync(rel(f.project,f.graph.path)))};
  f.manifest.sourceDependencies=[f.source,episodeRef,graphRef];
  f.manifest.authoritativeInventory={episode:f.manifest.sourceDependencies[1],graph:f.manifest.sourceDependencies[2],assets:f.source};
  f.save();
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.includes('MANIFEST_SCENE_INVENTORY_MISMATCH'));
});

test('runtime asset mapping is checked against the authored inventory',t=>{
  const f=fixture(t);
  f.manifest.runtimeReport=put(f.project,f.runtime.path,{
    status:'PASS_RUNTIME',sourceHead:f.head,consoleErrors:[],requestFailures:[],httpErrors:[],
    captures:[{sceneId:'S24',assetId:'wrong-asset',format:'portrait',source:f.original.path,
      screenshot:f.capture.path,screenshotSha256:f.capture.sha256}]
  });
  f.save();
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.includes('RUNTIME_CAPTURE_0_ASSET_MAPPING_MISMATCH'));
});

test('production rights must be hash-bound for every accepted image',t=>{
  const f=fixture(t);
  f.manifest.rightsManifest=undefined;
  f.save();
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.ok(result.problems.includes('RIGHTS_MANIFEST_REQUIRED'));
});

test('evidence-only commits after the pinned source head remain acceptable',t=>{
  const f=fixture(t);
  put(f.project,'artifacts/evidence/post-head-note.json',{kind:'evidence-only'});
  runGit(f.project,['add','artifacts/evidence/post-head-note.json']);
  runGit(f.project,['commit','-qm','evidence-only finalization note']);
  const result=inspectEpisodeArtFinalization(f.project,f.manifestPath);
  assert.equal(result.status,'PASS_EPISODE_ART_FINALIZATION',result.problems.join('; '));
});

test('malformed manifests and unsafe paths return NOT_VERIFIED without filesystem mutations',t=>{
  const f=fixture(t);
  assert.equal(inspectEpisodeArtFinalization(f.project,'../secrets.json').status,'NOT_VERIFIED');
  put(f.project,'artifacts/episode-finalization.json',{schemaVersion:1,kind:'NOT_A_CONTRACT'});
  assert.equal(inspectEpisodeArtFinalization(f.project,f.manifestPath).status,'NOT_VERIFIED');
  f.manifest.scenes='invalid';
  f.save();
  assert.equal(inspectEpisodeArtFinalization(f.project,f.manifestPath).status,'NOT_VERIFIED');
});

test('CLI episode-art-finalize returns JSON PASS while never claiming release readiness',t=>{
  const f=fixture(t);
  const cli=path.resolve('bin/ceos.mjs');
  const r=spawnSync(process.execPath,[cli,'episode-art-finalize','--project',f.project,
    '--manifest',f.manifestPath,'--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).status,'PASS_EPISODE_ART_FINALIZATION');
  assert.equal(JSON.parse(r.stdout).releaseReady,false);
});
