import { summarizeArtReviewQueue } from './art-review-queue.mjs';
import { classifyWebTransportFailure } from './web-transport-failure.mjs';

const positive = (n, max, label) => {
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new Error(label + ' must be an integer from 1 to ' + max);
};
const sizeOrder = viewport => ['1920x900','390x844','360x640'].indexOf(viewport);

/**
 * Read-only admission planner. Does NOT know the host's upload quota, attach
 * images, generate contact sheets, authenticate a reviewer, or issue art PASS.
 */
export function planWebHighReviewPackets(ledger, receipts, {
  maxAttachments = 2,
  maxFramesPerPacket = 3,
  quotaObservation = null
} = {}) {
  positive(maxAttachments, 10, 'maxAttachments');
  positive(maxFramesPerPacket, 3, 'maxFramesPerPacket');
  const coverage = summarizeArtReviewQueue(ledger, receipts, {limit:1000});

  if (quotaObservation !== null) {
    if (!quotaObservation || typeof quotaObservation.message !== 'string' ||
        !quotaObservation.message.trim() ||
        classifyWebTransportFailure({message:quotaObservation.message,code:quotaObservation.code||''})
          .classification !== 'ATTACHMENT_QUOTA_EXHAUSTED')
      throw new Error('quotaObservation requires a genuine explicit host attachment-quota message');
    return {
      schemaVersion:1,sourceHead:coverage.sourceHead,
      status:'PAUSED_OBSERVED_ATTACHMENT_QUOTA', nextPackets:[],
      queuedFrames:coverage.nextBatch.length,
      requiresRepair:coverage.requiresRepair,
      counts:coverage.counts, rejectedReceipts:coverage.rejected,
      evidenceRef:typeof quotaObservation.evidenceRef==='string' ? quotaObservation.evidenceRef : null,
      warning:'Host upload quota exhausted. No retries, no automatic reset assumption and no independent art PASS.'
    };
  }

  const groups = new Map();
  for (const frame of coverage.nextBatch) {
    const key=frame.sceneId + '\u0000' + frame.cue;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(frame);
  }

  const proposals=[];
  for (const frames of groups.values()) {
    frames.sort((a,b)=>{
      const x=sizeOrder(a.viewport),y=sizeOrder(b.viewport);
      return (x<0?100:x)-(y<0?100:y);
    });
    for (let i=0;i<frames.length;i+=maxFramesPerPacket) {
      const subset=frames.slice(i,i+maxFramesPerPacket);
      proposals.push({
        packetId:'packet-'+(proposals.length+1),
        sceneId:subset[0].sceneId,cue:subset[0].cue,
        attachmentProposal:subset.length>1?'NATIVE_RESOLUTION_CONTACT_SHEET':'INDIVIDUAL_SCREENSHOT',
        attachmentCount:1,viewports:subset.map(f=>f.viewport),
        sourceFrames:subset.map(f=>({
          itemId:f.id,viewport:f.viewport,screenshotSha256:ledger.items.find(x=>x.id===f.id).screenshotSha256,
          productionAssetSha256:ledger.items.find(x=>x.id===f.id).productionAssetSha256
        })),
        mustConfirmEachViewportPixels:true,
        mustIssuePerFrameVerdict:true
      });
    }
  }
  const nextPackets=proposals.slice(0,maxAttachments);
  return {
    schemaVersion:1,sourceHead:coverage.sourceHead,
    status:nextPackets.length?'REVIEW_PACKETS_PREPARED':
      coverage.complete?'NO_PENDING_ART_REVIEW':'REVIEW_REQUIRES_REPAIR_OR_EVIDENCE',
    nextPackets,queuedPackets:proposals.length,
    deferredPackets:Math.max(0,proposals.length-nextPackets.length),
    queuedFrames:coverage.nextBatch.length,requiresRepair:coverage.requiresRepair,
    counts:coverage.counts,rejectedReceipts:coverage.rejected,
    maxAttachments,quotaAvailability:'UNKNOWN_NOT_ATTESTED',
    warning:'Packet plan only. A contact sheet must preserve full-resolution source pixels and be legible. Only independently received, viewport-specific Web review receipts can satisfy the actual acceptance gate.'
  };
}
