import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeProductionPng } from '../src/art-output-gate.mjs';
import { createSourceBoundRevalidation, inspectSourceBoundRevalidation } from '../src/source-bound-revalidation.mjs';
import { discoverArtProgress, inspectArtProgress } from '../src/art-progress.mjs';

const ceosRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const abs = (project, relative) => path.join(project, relative);
const mkdir = (project, relative) => fs.mkdirSync(path.dirname(abs(project, relative)), { recursive: true });
const write = (project, relative, bytes) => {
  mkdir(project, relative);
  fs.writeFileSync(abs(project, relative), bytes);
  return sha(bytes);
};
const writeJson = (project, relative, value) => write(project, relative, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
const readJson = (project, relative) => JSON.parse(fs.readFileSync(abs(project, relative), 'utf8'));
const png = (value) => encodeProductionPng({ width: 16, height: 16, pixels: Buffer.alloc(16 * 16 * 4, value) });

function git(project, args) {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-source-bound-revalidation-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  git(project, ['init', '--quiet']);
  git(project, ['config', 'user.email', 'ceos-test@example.invalid']);
  git(project, ['config', 'user.name', 'CEOS Test']);

  const pairs = [
    ['S19', 'ep2-morning-brief-cg', 'ep2_morning_brief', 'brief'],
    ['S20', 'ep2-wedding-budget-cg', 'ep2_wedding_budget', 'budget'],
    ['S21', 'ep2-workday-inventory-cg', 'ep2_workday_inventory', 'inventory'],
    ['S22', 'ep2-family-rehearsal-cg', 'ep2_family_rehearsal', 'family'],
    ['S23', 'ep2-family-rehearsal-response-cg', 'ep2_family_rehearsal_response', 'response']
  ];
  const files = new Map();
  const assets = {};
  const ledgerAssets = [];
  for (const [pairId, assetId, sceneId, slug] of pairs) {
    const portrait = `assets/production/cg/${slug}.png`;
    const landscape = `assets/production/cg/${slug}-landscape.png`;
    const portraitBytes = png(80 + pairs.findIndex(item => item[0] === pairId));
    const landscapeBytes = png(120 + pairs.findIndex(item => item[0] === pairId));
    const portraitSha = write(project, portrait, portraitBytes);
    const landscapeSha = write(project, landscape, landscapeBytes);
    files.set(pairId, { portrait, landscape, portraitBytes, landscapeBytes, portraitSha, landscapeSha });
    assets[assetId] = {
      src: `/${portrait}`,
      kind: 'production-cg',
      variants: {
        portrait: { src: `/${portrait}`, sha256: portraitSha, dimensions: { width: 16, height: 16 } },
        landscape: { src: `/${landscape}`, sha256: landscapeSha, dimensions: { width: 16, height: 16 } }
      }
    };
    ledgerAssets.push({ id: pairId, assets: [
      { path: portrait, bytes: portraitBytes.length, sha256: portraitSha, dimensions: '16x16' },
      { path: landscape, bytes: landscapeBytes.length, sha256: landscapeSha, dimensions: '16x16' }
    ] });
  }
  const graph = { scenes: pairs.map(([, assetId, sceneId]) => ({ id: sceneId, assetId })) };
  const dimensions = { sourcePng: { portrait: { width: 16, height: 16 }, desktop: { width: 16, height: 16 } } };
  const episode = { episode: 2, scenes: pairs.map(([, , sceneId]) => ({ id: sceneId })) };
  writeJson(project, 'narrative/graph.json', graph);
  writeJson(project, 'narrative/assets.json', { schemaVersion: 1, status: 'OLD', assets });
  writeJson(project, 'narrative/episodes/ep-02.json', episode);
  writeJson(project, 'config/production-art-dimensions.json', dimensions);
  git(project, ['add', '.']);
  git(project, ['commit', '--quiet', '-m', 'historical source']);
  const historicalHead = git(project, ['rev-parse', 'HEAD']);
  const historicalHashes = ['narrative/graph.json', 'narrative/assets.json', 'narrative/episodes/ep-02.json', 'config/production-art-dimensions.json']
    .map(relative => ({ path: relative, bytes: fs.statSync(abs(project, relative)).size, sha256: sha(fs.readFileSync(abs(project, relative))) }));

  const currentAssets = readJson(project, 'narrative/assets.json');
  currentAssets.status = 'CURRENT_MAPPING_WITH_DEFERRED_S24_S26';
  currentAssets.assets['ep2-deferred-s24-cg'] = { src: '/assets/deferred-s24.png', kind: 'production-cg' };
  writeJson(project, 'narrative/assets.json', currentAssets);

  const mechanicalPath = 'artifacts/revalidation/s19-s23-mechanical.json';
  const inspected = [...files.entries()].flatMap(([pairId, item]) => [
    { path: abs(project, item.portrait), status: 'PASS_ART_OUTPUT_MECHANICAL', sha256: item.portraitSha, bytes: item.portraitBytes.length, dimensions: { width: 16, height: 16 }, id: `${pairId}-portrait` },
    { path: abs(project, item.landscape), status: 'PASS_ART_OUTPUT_MECHANICAL', sha256: item.landscapeSha, bytes: item.landscapeBytes.length, dimensions: { width: 16, height: 16 }, id: `${pairId}-landscape` }
  ]);
  writeJson(project, mechanicalPath, { status: 'PASS_ART_BATCH_MECHANICAL', inspected });

  const ledgerPath = 'artifacts/production-art/stage9.4/STAGE9_4_S19_S23_ACCEPTANCE_LEDGER_20261016.json';
  writeJson(project, ledgerPath, {
    schemaVersion: 1,
    kind: 'STAGE9_4_SOURCE_BOUND_ACCEPTANCE_LEDGER',
    currentHead: historicalHead,
    currentness: { mode: 'DEPENDENCY_BASED_REUSE', productInputsUnchanged: true },
    progress: { plannedPairs: 25, plannedPngs: 50, acceptedPairs: 5, acceptedPngs: 10, acceptedPairIds: pairs.map(item => item[0]) },
    dependencyEvidence: historicalHashes,
    mechanicalRevalidation: { status: 'PASS_ART_BATCH_MECHANICAL' },
    groups: [{ pairs: pairs.map(item => item[0]), pairsDetail: ledgerAssets }],
    boundary: { episodeFinalAcceptance: false, releaseReady: false }
  });

  const contractPath = 'artifacts/revalidation/stage9-4-s19-s23-art-progress-index.json';
  const contract = createSourceBoundRevalidation(project, ledgerPath, {
    deferredPairs: ['S24', 'S25', 'S26'],
    mechanicalReceiptPath: mechanicalPath
  });
  writeJson(project, contractPath, contract);
  return { project, pairs, files, ledgerPath, mechanicalPath, contractPath, contract };
}

test('source-bound revalidation proves unchanged S19-S23 mappings without rewriting the historical ledger', t => {
  const x = fixture(t);
  const beforeLedger = fs.readFileSync(abs(x.project, x.ledgerPath));
  const result = inspectSourceBoundRevalidation(x.project, x.contractPath);
  assert.equal(result.status, 'PASS_ART_PROGRESS_REVALIDATED', JSON.stringify(result));
  assert.equal(result.acceptedPairs, 5);
  assert.equal(result.acceptedPng, 10);
  assert.deepEqual(result.impact.affectedAcceptedPairs, []);
  assert.equal(result.visualReevaluation.status, 'NOT_REQUIRED');
  assert.deepEqual(result.deferredPairs.map(item => item.id), ['S24', 'S25', 'S26']);
  assert.deepEqual(fs.readFileSync(abs(x.project, x.ledgerPath)), beforeLedger);
});

test('art-progress selects and validates the new source-bound index while keeping deferred pairs separate', t => {
  const x = fixture(t);
  const discovered = discoverArtProgress(x.project);
  assert.equal(discovered.indexPath, x.contractPath);
  const result = inspectArtProgress(x.project, discovered.indexPath);
  assert.equal(result.status, 'PASS_ART_PROGRESS_REVALIDATED', JSON.stringify(result));
  assert.equal(result.acceptedPairs, 5);
  assert.equal(result.remainingPairs, 20);
  assert.equal(result.releaseReady, false);
  assert.equal(result.finalEpisodeAcceptance, 'NOT_VERIFIED');
});

test('source-bound revalidation fails closed on accepted mapping drift and PNG tampering', t => {
  const x = fixture(t);
  const originalAssets = fs.readFileSync(abs(x.project, 'narrative/assets.json'));
  const assets = readJson(x.project, 'narrative/assets.json');
  assets.assets['ep2-morning-brief-cg'].variants.portrait.src = '/assets/production/cg/tampered.png';
  writeJson(x.project, 'narrative/assets.json', assets);
  let result = inspectSourceBoundRevalidation(x.project, x.contractPath);
  assert.equal(result.status, 'BLOCKED_ART_PROGRESS');
  assert.ok(result.problems.some(problem => /REVALIDATION_EVIDENCE_MISMATCH|RUNTIME_ASSET_PATH_INVALID|ACCEPTED_ASSET_MAPPING_AMBIGUOUS/.test(problem)), JSON.stringify(result));
  fs.writeFileSync(abs(x.project, 'narrative/assets.json'), originalAssets);

  fs.appendFileSync(abs(x.project, x.files.get('S19').portrait), 'tamper');
  result = inspectSourceBoundRevalidation(x.project, x.contractPath);
  assert.equal(result.status, 'BLOCKED_ART_PROGRESS');
  assert.ok(result.problems.some(problem => /REVALIDATION_EVIDENCE_MISMATCH|RUNTIME_ASSET_DIMENSIONS|RUNTIME_ASSET_HASH|PNG_STRUCTURE_INCOMPLETE/.test(problem)), JSON.stringify(result));
});

test('source-bound revalidation rejects contract scope promotion and historical ledger mutation', t => {
  const x = fixture(t);
  const contract = readJson(x.project, x.contractPath);
  contract.deferredPairs[0].id = 'S19';
  const tamperedContract = 'artifacts/revalidation/tampered-contract.json';
  writeJson(x.project, tamperedContract, contract);
  let result = inspectSourceBoundRevalidation(x.project, tamperedContract);
  assert.equal(result.status, 'BLOCKED_ART_PROGRESS');
  assert.ok(result.problems.includes('DEFERRED_PAIR_OVERLAPS_ACCEPTED_SCOPE'));

  const ledger = readJson(x.project, x.ledgerPath);
  ledger.progress.acceptedPairIds[0] = 'S24';
  writeJson(x.project, x.ledgerPath, ledger);
  result = inspectSourceBoundRevalidation(x.project, x.contractPath);
  assert.equal(result.status, 'BLOCKED_ART_PROGRESS');
  assert.ok(result.problems.some(problem => /REVALIDATION_EVIDENCE_MISMATCH|HISTORICAL_LEDGER/.test(problem)));
});

test('CLI creates a new contract only and never overwrites an existing evidence file', t => {
  const x = fixture(t);
  const output = 'artifacts/revalidation/cli-contract.json';
  const cli = path.join(ceosRoot, 'bin', 'ceos.mjs');
  const result = spawnSync(process.execPath, [cli, 'art-progress-revalidate', '--project', x.project,
    '--ledger', x.ledgerPath, '--mechanical-receipt', x.mechanicalPath,
    '--deferred-pairs', 'S24;S25;S26', '--output', output, '--json'], { cwd: x.project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(inspectSourceBoundRevalidation(x.project, output).status, 'PASS_ART_PROGRESS_REVALIDATED');
  const again = spawnSync(process.execPath, [cli, 'art-progress-revalidate', '--project', x.project,
    '--ledger', x.ledgerPath, '--mechanical-receipt', x.mechanicalPath,
    '--deferred-pairs', 'S24;S25;S26', '--output', output, '--json'], { cwd: x.project, encoding: 'utf8' });
  assert.notEqual(again.status, 0);
});
