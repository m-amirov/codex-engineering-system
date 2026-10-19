import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { validateWebReview } from '../src/web-delegation.mjs';
import {
  DEV_WEB_HIGH_MODEL,
  DEV_WEB_HIGH_ATTACHMENT_LEASE_FILE,
  DevBrowserHelperClient,
  DevWebHighTransport,
  writeDevWebReceipt
} from '../src/dev-web-high-transport.mjs';

const HEAD = 'a'.repeat(40);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-dev-web-'));
  const original = path.join(projectDir, 'original.png');
  const runtime = path.join(projectDir, 'runtime.png');
  fs.writeFileSync(original, PNG);
  fs.writeFileSync(runtime, Buffer.concat([PNG, Buffer.from('runtime')]));
  const images = [
    { ref: 'S24-original', kind: 'original', path: 'original.png', sha256: sha256(PNG), detail: 'original' },
    { ref: 'S24-runtime', kind: 'runtime', path: 'runtime.png', sha256: sha256(Buffer.concat([PNG, Buffer.from('runtime')])), detail: 'high' }
  ];
  const request = {
    schemaVersion: 1,
    sceneId: 'S24',
    sourceHead: HEAD,
    context: 'S24 source-bound context: Bianca arrives; verify identity, scene action and runtime framing.',
    images
  };
  return { projectDir, request, images };
}

function profile({ home = 'C:/Users/user/.codex-chatgpt-web-dev' } = {}) {
  return {
    home,
    configPath: path.join(home, 'config.json'),
    descriptorPath: path.join(home, 'runtime', 'launcher-browser.json'),
    descriptor: {
      profile: 'development',
      kind: 'codex-web-gpt-launcher',
      helper: { executable: 'C:/Codex Web GPT.exe', script: 'C:/browser-helper.cjs' }
    },
    releaseVersion: '6.1.11',
    mode: 'browser-only',
    solAvailable: true,
    appName: 'Codex Native2 DEV'
  };
}

function reviewerResponse(request, observations = request.images.map(image => ({
  ref: image.ref,
  observation: `${image.ref} shows the supplied scene pixels with the requested narrative cue and readable framing.`
})), overrides = {}) {
  const refs = request.images.map(image => image.ref);
  return JSON.stringify({
    schemaVersion: 1,
    sceneId: request.sceneId,
    sourceHead: request.sourceHead,
    status: 'PASS',
    reviewedItems: [request.sceneId],
    evidenceRefs: refs,
    receivedEvidenceRefs: refs,
    actualPixelsReceived: true,
    decision: 'The scene is independently acceptable for the requested narrative art cue.',
    artAcceptanceProfile: 'NARRATIVE_ART_ACCEPTANCE_V2',
    visualEvidence: observations.map(item => ({
      ref: item.ref,
      path: request.images.find(image => image.ref === item.ref)?.path,
      sha256: request.images.find(image => image.ref === item.ref)?.sha256,
      observation: item.observation
    })),
    findings: [],
    unresolved: [],
    ...overrides
  });
}

function transport(fixtureValue, {
  run,
  sleep,
  profileValue = profile(),
  stableRoutingEnabled = false,
  attachmentPacingDir = path.join(fixtureValue.projectDir, 'pacing'),
  headResolver = () => HEAD
} = {}) {
  return new DevWebHighTransport({
    projectDir: fixtureValue.projectDir,
    profile: profileValue,
    stableRoutingEnabled,
    attachmentPacingDir,
    headResolver,
    helperFactory: () => ({ run, close: async () => {} }),
    sleep: sleep ?? (async () => {}),
    minAttachmentIntervalMs: 0
  });
}

test('DEV unavailable returns an explicit BLOCKED result', async () => {
  const f = fixture();
  const t = new DevWebHighTransport({
    projectDir: f.projectDir,
    profileLoader: () => { throw Object.assign(new Error('DEV launcher is unavailable'), { code: 'DEV_UNAVAILABLE' }); },
    helperFactory: () => { throw new Error('must not start helper'); },
    minAttachmentIntervalMs: 0
  });
  const result = await t.review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.transport.classification, 'DEV_UNAVAILABLE');
});

test('DEV helper acknowledges prompt selection and send activation', async () => {
  const client = new DevBrowserHelperClient(profile());
  const sent = [];
  client.send = async message => { sent.push(message); };
  const id = 'devweb_test_ack';
  client.pending.set(id, {
    prompt: 'review supplied pixels',
    images: [{ ref: 'original', imageUrl: 'data:image/png;base64,AA==', detail: 'high' }],
    submitted: false,
    attachmentAccepted: false,
    resolve: () => {},
    reject: () => {}
  });
  client.handleLine(JSON.stringify({ type: 'event', id, event: 'prepared_selected' }), () => {}, () => {});
  client.handleLine(JSON.stringify({ type: 'event', id, event: 'send_activated' }), () => {}, () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent, [
    {
      type: 'prepared_selected_ack',
      id,
      prepared: {
        text: 'review supplied pixels',
        images: [{ ref: 'original', imageUrl: 'data:image/png;base64,AA==', detail: 'high' }]
      }
    },
    { type: 'send_activation_ack', id }
  ]);
});

test('fenced JSON is accepted without relaxing source-bound pixel validation', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({ text: `Here is the requested result:\n\n\`\`\`json\n${reviewerResponse(f.request)}\n\`\`\``, submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'PASS');
  assert.equal(result.receipt.actualPixelsReceived, true);
  assert.equal(result.receipt.normalization.responseFormat, 'fenced-json');
});

test('Markdown-escaped JSON is normalized without changing reviewer semantics', async () => {
  const f = fixture();
  const malformed = reviewerResponse(f.request).replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('_', '\\_');
  const result = await transport(f, {
    run: async () => ({ text: malformed, submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'PASS');
  assert.equal(result.receipt.normalization.responseFormat, 'markdown-escaped-json');
  assert.equal(result.receipt.actualPixelsReceived, true);
});

test('missing required reviewer envelope fields is NOT_VERIFIED and is not synthesized', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({
      text: reviewerResponse(f.request, undefined, { receivedEvidenceRefs: undefined }),
      submitted: true
    })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'REVIEW_ENVELOPE_INVALID');
  assert.equal(result.transport.stableBridgeUsed, false);
  assert.match(result.validationErrors.join('; '), /receivedEvidenceRefs/);
});

test('multiple JSON objects are rejected even when one object says PASS', async () => {
  const f = fixture();
  const first = reviewerResponse(f.request);
  const second = reviewerResponse(f.request, undefined, { status: 'REWORK' });
  const result = await transport(f, {
    run: async () => ({ text: `${first}\n${second}`, submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'MULTIPLE_JSON_OBJECTS');
});

test('pixel observations are required for every original and runtime ref', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({
      text: reviewerResponse(f.request, [{
        ref: f.images[0].ref,
        observation: 'The original image is visible and readable.'
      }]),
      submitted: true
    })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'PIXEL_OBSERVATIONS_INVALID');
});

test('invalid reviewer verdict is rejected before receipt creation', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({
      text: reviewerResponse(f.request, undefined, { status: 'APPROVE' }),
      submitted: true
    })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'REVIEW_ENVELOPE_INVALID');
  assert.match(result.validationErrors.join('; '), /status/);
});

test('reviewer source HEAD mismatch is NOT_VERIFIED even when request and project HEAD match', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({
      text: reviewerResponse(f.request, undefined, { sourceHead: 'd'.repeat(40) }),
      submitted: true
    })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'REVIEW_ENVELOPE_INVALID');
  assert.match(result.validationErrors.join('; '), /sourceHead/);
});

test('reviewer visual evidence with a substituted SHA is rejected', async () => {
  const f = fixture();
  const tampered = JSON.parse(reviewerResponse(f.request));
  tampered.visualEvidence[1].sha256 = 'c'.repeat(64);
  const result = await transport(f, {
    run: async () => ({ text: JSON.stringify(tampered), submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'PIXEL_OBSERVATIONS_INVALID');
  assert.match(result.validationErrors.join('; '), /SHA-256/);
});

test('one same-context schema repair is allowed only after complete pixel observations exist', async () => {
  const f = fixture();
  const calls = [];
  const first = reviewerResponse(f.request, undefined, { reviewedItems: undefined });
  const second = reviewerResponse(f.request);
  const result = await transport(f, {
    run: async request => {
      calls.push(request);
      return { text: calls.length === 1 ? first : second, submitted: true };
    }
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].retainConversation, true);
  assert.equal(calls[1].requireRetainedConversation, true);
  assert.equal(calls[0].conversationKey, calls[1].conversationKey);
  assert.equal(calls[1].images.length, 0);
  assert.equal(result.receipt.normalization.schemaRepairAttempted, true);
});

test('Markdown-escaped JSON is fixed locally without an unnecessary second turn', async () => {
  const f = fixture();
  const calls = [];
  const malformed = reviewerResponse(f.request).replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('_', '\\_');
  const result = await transport(f, {
    run: async request => {
      calls.push(request);
      return { text: calls.length === 1 ? malformed : reviewerResponse(f.request), submitted: true };
    }
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].images.length, 2);
  assert.equal(result.receipt.normalization.schemaRepairAttempted, false);
});

test('schema repair is attempted at most once and cannot create a PASS from a second invalid response', async () => {
  const f = fixture();
  let calls = 0;
  const incomplete = reviewerResponse(f.request, undefined, { reviewedItems: undefined });
  const result = await transport(f, {
    run: async () => {
      calls += 1;
      return { text: incomplete, submitted: true };
    }
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(calls, 2);
  assert.equal(result.normalization.schemaRepairAttempted, true);
});

test('attachment transport failure retries only the failed turn twice', async () => {
  const f = fixture();
  let calls = 0;
  const delays = [];
  const result = await transport(f, {
    run: async () => {
      calls += 1;
      throw Object.assign(new Error('ChatGPT attachment upload failed before the prompt was sent'), {
        code: 'chatgpt_attachment_upload_failed'
      });
    },
    sleep: async ms => delays.push(ms)
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.transport.classification, 'ATTACHMENT_TRANSPORT');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [30_000, 60_000]);
});

test('reviewer response without all supplied pixels is NOT_VERIFIED', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({ text: reviewerResponse(f.request, [{
      ref: f.images[0].ref,
      observation: 'Only the original source image was observed.'
    }]), submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'PIXEL_OBSERVATIONS_INVALID');
});

test('wrong PNG SHA-256 is rejected before any DEV turn', async () => {
  const f = fixture();
  let calls = 0;
  const bad = structuredClone(f.request);
  bad.images[0].sha256 = 'b'.repeat(64);
  const result = await transport(f, {
    run: async () => { calls += 1; return { text: 'must not run', submitted: true }; }
  }).review(bad, { currentHead: HEAD });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failureType, 'PROVENANCE_FAILURE');
  assert.equal(calls, 0);
});

test('stale source HEAD is rejected before any DEV turn', async () => {
  const f = fixture();
  let calls = 0;
  const result = await transport(f, {
    run: async () => { calls += 1; return { text: 'must not run', submitted: true }; }
  }).review(f.request, { currentHead: 'c'.repeat(40) });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failureType, 'PROVENANCE_FAILURE');
  assert.equal(calls, 0);
});

test('a supplied --head cannot bypass the actual project HEAD', async () => {
  const f = fixture();
  let calls = 0;
  const result = await transport(f, {
    headResolver: () => 'b'.repeat(40),
    run: async () => { calls += 1; return { text: reviewerResponse(f.request), submitted: true }; }
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failureType, 'PROVENANCE_FAILURE');
  assert.equal(result.transport.classification, 'PROVENANCE_FAILURE');
  assert.match(result.transport.detail, /supplied HEAD|actual project HEAD/i);
  assert.equal(calls, 0);
});

test('PASS with an open blocking narrative finding is rejected as contradictory', async () => {
  const f = fixture();
  const finding = {
    id: 'S24-F01',
    severity: 'P1',
    status: 'OPEN',
    impactCode: 'STORY_CRITICAL_PROP_MISSING',
    authoredCue: 'The shared calendar loses the couple designation.',
    observation: 'The supplied pixels do not show the required calendar change.',
    playerImpact: 'The canonical boundary action is not visually established.',
    evidenceRef: f.images[0].ref,
    actualPixelsReceived: true
  };
  const result = await transport(f, {
    run: async () => ({ text: reviewerResponse(f.request, undefined, { findings: [finding] }), submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'NARRATIVE_VERDICT_CONTRADICTION');
  assert.match(result.validationErrors.join('; '), /blocking/i);
});

test('empty independent observations cannot become a visual PASS', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async () => ({ text: reviewerResponse(f.request, []), submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.reasonCode, 'PIXEL_OBSERVATIONS_INVALID');
});

test('successful DEV review returns a source-bound CEOS visual-content receipt', async () => {
  const f = fixture();
  const result = await transport(f, {
    run: async request => ({
      text: reviewerResponse(f.request),
      submitted: true,
      attachmentAccepted: request.images.length === 2
    })
  }).review(f.request, {
    currentHead: HEAD,
    evidenceArtifact: 'artifacts/evidence/dev-web/S24.json'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.receipt.sourceHead, HEAD);
  assert.equal(result.receipt.transport.actualProjectHead, HEAD);
  assert.equal(result.receipt.model, DEV_WEB_HIGH_MODEL);
  assert.equal(result.receipt.actualPixelsReceived, true);
  assert.equal(result.receipt.artAcceptanceProfile, 'NARRATIVE_ART_ACCEPTANCE_V2');
  assert.equal(fs.existsSync(path.join(f.projectDir, 'artifacts', 'evidence', 'dev-web', 'S24.S24.raw.txt')), true);
  assert.equal(result.receipt.normalization.rawResponseArtifacts.length, 1);
  assert.equal(validateWebReview(result.receipt, {
    pipeline: 'production-art',
    phase: 'acceptance',
    currentHead: HEAD,
    visual: true,
    assurance: 'visual-content',
    artAcceptanceProfile: 'NARRATIVE_ART_ACCEPTANCE_V2'
  }).length, 0);
  const receiptFile = path.join(f.projectDir, 'artifacts', 'evidence', 'dev-web', 'S24.json');
  writeDevWebReceipt(f.projectDir, 'artifacts/evidence/dev-web/S24.json', result.receipt);
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).sourceHead, HEAD);
});

test('DEV transport works while Stable routing is disabled', async () => {
  const f = fixture();
  const result = await transport(f, {
    stableRoutingEnabled: false,
    run: async () => ({ text: reviewerResponse(f.request), submitted: true })
  }).review(f.request, { currentHead: HEAD });
  assert.equal(result.status, 'PASS');
  assert.equal(result.receipt.stableBridgeUsed, false);
});

test('batch reviews are sequential and respect attachment pacing', async () => {
  const f = fixture();
  const calls = [];
  const sleeps = [];
  const t = new DevWebHighTransport({
    projectDir: f.projectDir,
    profile: profile(),
    helperFactory: () => ({
      run: async request => { calls.push(request.sceneId); return { text: reviewerResponse(request), submitted: true }; },
      close: async () => {}
    }),
    sleep: async ms => sleeps.push(ms),
    minAttachmentIntervalMs: 20_000,
    attachmentPacingDir: path.join(f.projectDir, 'pacing'),
    headResolver: () => HEAD,
    now: (() => { let value = 1000; return () => value; })()
  });
  const second = structuredClone(f.request);
  second.sceneId = 'S25';
  second.images = second.images.map(image => ({ ...image, ref: image.ref.replace('S24', 'S25') }));
  const results = await t.reviewBatch([f.request, second], { currentHead: HEAD });
  assert.deepEqual(calls, ['S24', 'S25']);
  assert.equal(results.length, 2);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 20_000);
});

test('attachment pacing persists across transport instances and recovers stale leases', async () => {
  const f = fixture();
  const pacingDir = path.join(f.projectDir, 'shared-pacing');
  fs.mkdirSync(pacingDir, { recursive: true });
  fs.writeFileSync(path.join(pacingDir, DEV_WEB_HIGH_ATTACHMENT_LEASE_FILE), JSON.stringify({
    schemaVersion: 1,
    token: 'stale',
    createdAt: 0,
    expiresAt: 1
  }));
  let now = 1_000;
  const sleeps = [];
  const run = async request => ({ text: reviewerResponse({ ...f.request, sceneId: request.sceneId }), submitted: true });
  const first = new DevWebHighTransport({
    projectDir: f.projectDir,
    profile: profile({ home: path.join(f.projectDir, 'dev-home') }),
    helperFactory: () => ({ run, close: async () => {} }),
    attachmentPacingDir: pacingDir,
    minAttachmentIntervalMs: 20_000,
    headResolver: () => HEAD,
    now: () => now,
    sleep: async ms => { sleeps.push(ms); now += ms; }
  });
  const second = new DevWebHighTransport({
    projectDir: f.projectDir,
    profile: profile({ home: path.join(f.projectDir, 'dev-home') }),
    helperFactory: () => ({ run, close: async () => {} }),
    attachmentPacingDir: pacingDir,
    minAttachmentIntervalMs: 20_000,
    headResolver: () => HEAD,
    now: () => now,
    sleep: async ms => { sleeps.push(ms); now += ms; }
  });
  const firstResult = await first.review(f.request, { currentHead: HEAD, evidenceArtifact: 'artifacts/evidence/dev-web/first.json' });
  const secondResult = await second.review(f.request, { currentHead: HEAD, evidenceArtifact: 'artifacts/evidence/dev-web/second.json' });
  assert.equal(firstResult.status, 'PASS');
  assert.equal(secondResult.status, 'PASS');
  assert.deepEqual(sleeps, [20_000]);
  assert.equal(fs.existsSync(path.join(pacingDir, DEV_WEB_HIGH_ATTACHMENT_LEASE_FILE)), false);
});

test('concurrent transport instances serialize attachment-bearing turns', async () => {
  const f = fixture();
  const pacingDir = path.join(f.projectDir, 'concurrent-pacing');
  const calls = [];
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  let releaseFirst;
  const firstTurn = new Promise(resolve => { releaseFirst = resolve; });
  const run = async () => {
    calls.push('turn');
    if (calls.length === 1) {
      firstStarted();
      await firstTurn;
    }
    return { text: reviewerResponse(f.request), submitted: true };
  };
  const makeTransport = () => new DevWebHighTransport({
    projectDir: f.projectDir,
    profile: profile({ home: path.join(f.projectDir, 'dev-home') }),
    helperFactory: () => ({ run, close: async () => {} }),
    attachmentPacingDir: pacingDir,
    minAttachmentIntervalMs: 0,
    headResolver: () => HEAD,
    sleep: async ms => { await new Promise(resolve => setTimeout(resolve, Math.min(ms, 5))); }
  });
  const first = makeTransport();
  const second = makeTransport();
  const firstPromise = first.review(f.request, { currentHead: HEAD, evidenceArtifact: 'artifacts/evidence/dev-web/concurrent-first.json' });
  await started;
  const secondPromise = second.review(f.request, { currentHead: HEAD, evidenceArtifact: 'artifacts/evidence/dev-web/concurrent-second.json' });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls.length, 1);
  releaseFirst();
  const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(firstResult.status, 'PASS');
  assert.equal(secondResult.status, 'PASS');
  assert.equal(calls.length, 2);
});

test('retained conversation failure is a clear blocker and never starts a replacement image review', async () => {
  const f = fixture();
  let calls = 0;
  const malformed = reviewerResponse(f.request, undefined, { reviewedItems: undefined });
  const result = await transport(f, {
    run: async request => {
      calls += 1;
      if (calls === 1) return { text: malformed, submitted: true };
      throw Object.assign(new Error('The retained ChatGPT conversation is no longer available.'), {
        code: 'RETAINED_CONVERSATION_UNAVAILABLE'
      });
    }
  }).review(f.request, { currentHead: HEAD, evidenceArtifact: 'artifacts/evidence/dev-web/retained.json' });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'RETAINED_CONVERSATION_UNAVAILABLE');
  assert.equal(result.transport.classification, 'RETAINED_CONVERSATION_UNAVAILABLE');
  assert.equal(result.transport.schemaRepairAttempted, true);
  assert.equal(calls, 2);
  assert.deepEqual(result.transport.attachmentRefs, f.request.images.map(image => image.ref));
  assert.equal(result.transport.replacementImageReviewStarted, false);
});
