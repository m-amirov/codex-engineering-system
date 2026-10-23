/**
 * Narrative Art Acceptance V3: one story-first reviewer verdict for identity,
 * wardrobe, action and readable runtime framing. This module validates
 * independently reported observations; it does NOT inspect pixels or confer
 * reviewer/provenance trust.
 */
export const NARRATIVE_ART_ACCEPTANCE_V3 = 'NARRATIVE_ART_ACCEPTANCE_V3';
const SEVERITY = new Set(['P0','P1','P2','P3']);
const BLOCKING_IMPACTS = new Set([
  'WRONG_CHARACTER', 'ESSENTIAL_CHARACTER_UNRECOGNIZABLE',
  'MATERIAL_WARDROBE_CONTRADICTION', 'WRONG_ACTOR_OR_ACTION',
  'WRONG_LOCATION_OR_TIME', 'NARRATIVE_CONTINUITY_CONTRADICTION',
  'STORY_CRITICAL_PROP_MISSING', 'STORY_CRITICAL_PROP_OBSCURED',
  'ESSENTIAL_SUBJECT_CROPPED', 'CRITICAL_SCENE_MAPPING',
  'DIALOGUE_OR_CONTROLS_UNREADABLE', 'MATERIAL_RUNTIME_READABILITY'
]);
const DIMENSIONS = ['identityStatus','wardrobeStatus','storyActionStatus','dualFormatStatus'];
const text = x => typeof x === 'string' && x.trim().length > 0;
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/i.test(x);
const statuses = new Set(['PASS','REWORK']);
export const ART_V3_REVIEW_GUIDANCE = Object.freeze([
  'Evaluate combined player experience: authored cue, dialogue, original art and real runtime frame.',
  'Check recognizable correct characters and apparent age/hair; scene-appropriate costume and significant wardrobe continuity; story action and location; key subjects visible in dialogue-safe area.',
  'Only verified materially misleading identity, meaningful costume contradiction, wrong actor/action, wrong location/time, missing visually essential plot prop or unreadable story-critical UI can block.',
  'Do not require literal depiction of a narrated action if dialogue already explains it and image does not contradict it.',
  'Minor accessories, clothing folds, skin details, hands, background decorations, minor color/lighting variations and justified repeated outfits are advisory P2/P3, never automatic REWORK.',
  'For any P0/P1, cite exact authored cue, received pixel evidence reference, observation and concrete player comprehension impact. Do not infer or invent observations.',
  'Issue one explicit PASS, PASS_WITH_NOTES, or REWORK. Do not turn prior REWORK into PASS without new independent review of relevant corrected/unchanged images and documented resolution.',
  'No preview, config flag, textual brief or owner opinion can substitute for actual received pixels, transport receipts and independent review.'
]);

export function assessArtFindingsV3(findings) {
  const errors=[],blockingFindings=[],advisoryFindings=[],seen=new Set();
  if (!Array.isArray(findings)) return {
    ok:false,verdict:'INVALID_FINDINGS',errors:['findings must be an array'],blockingFindings,advisoryFindings
  };
  for (const f of findings) {
    if (!f || !text(f.id) || !SEVERITY.has(f.severity) || !['OPEN','RESOLVED'].includes(f.status)) {
      errors.push('finding requires id, P0-P3 severity and OPEN/RESOLVED status');continue;
    }
    if (seen.has(f.id)) { errors.push('duplicate finding: '+f.id);continue; }
    seen.add(f.id);
    if (f.status==='RESOLVED') continue;
    const blocking = f.severity==='P0' || f.severity==='P1';
    if (f.materialPlayerImpact===true && !blocking)
      errors.push(f.id+': material P2/P3 requires new independent P0/P1 classification with evidence; do not silently pass');
    if (blocking) {
      if (!BLOCKING_IMPACTS.has(f.impactCode))
        errors.push(f.id+': unrecognized blocking impactCode');
      if (f.visualRequired===false && f.materialPlayerImpact===false)
        errors.push(f.id+': nonvisual nonmaterial cue is not a blocker');
      if (!text(f.authoredCue) || !text(f.observation) || !text(f.playerImpact) ||
          !text(f.evidenceRef) || f.actualPixelsReceived!==true)
        errors.push(f.id+': blocking issue must cite source cue, pixel evidence and player impact');
      blockingFindings.push(f);
    } else advisoryFindings.push(f);
  }
  return {ok:errors.length===0,verdict:errors.length?'INVALID_FINDINGS':
    blockingFindings.length?'REWORK':advisoryFindings.length?'PASS_WITH_NOTES':'PASS',
    errors,blockingFindings,advisoryFindings};
}

/** Evaluate coherent independent reviewer output and its unified wardrobe subchecks.
 * Authentication, receipt hashes, image byte integrity and source HEAD are
 * separately enforced by the transport + evidence gates.
 */
export function validateArtReviewV3(review) {
  const errors=[];
  if (!review || review.artAcceptanceProfile!==NARRATIVE_ART_ACCEPTANCE_V3)
    return {ok:false,verdict:'INVALID',errors:['independent V3 profile is required']};
  if (!['PASS','PASS_WITH_NOTES','REWORK'].includes(review.status))
    errors.push('V3 status must be PASS, PASS_WITH_NOTES or REWORK');
  if (review.actualPixelsReceived!==true)
    errors.push('actualPixelsReceived true from real reviewer required');
  const findings=assessArtFindingsV3(review.findings);
  if (!findings.ok) errors.push(...findings.errors);
  if (findings.ok && review.status!==findings.verdict)
    errors.push('reviewer status disagrees with blocking/advisory findings: '+findings.verdict);
  if (!Array.isArray(review.unresolved) ||
      review.unresolved.some(id => !findings.blockingFindings.some(f => f.id===id)))
    errors.push('unresolved may contain only currently blocking P0/P1 finding ids');
  if (findings.blockingFindings.length && !findings.blockingFindings.every(f=>review.unresolved?.includes(f.id)))
    errors.push('all open P0/P1 blockers must be unresolved');
  const cast=review.requiredCast;
  if (!Array.isArray(cast) || cast.some(id=>!text(id)) || new Set(cast).size!==cast.length)
    errors.push('requiredCast must list unique authored character IDs (empty for scenery-only)');
  const assess=review.wardrobeAssessments;
  if (!Array.isArray(assess) || assess.length!==(Array.isArray(cast)?cast.length:-1))
    errors.push('one unified character/wardrobe assessment required per cast member');
  if (Array.isArray(cast) && Array.isArray(assess)) {
    const seen=new Set();
    const images=new Set(Array.isArray(review.visualEvidence)?review.visualEvidence.map(e=>e.ref):[]);
    for (const item of assess) {
      if (!cast.includes(item?.characterId) || seen.has(item.characterId)) {
        errors.push('unknown/duplicate wardrobe character');continue;
      }
      seen.add(item.characterId);
      if (!text(item.identityObservation) || !text(item.wardrobeObservation) ||
          !text(item.actionObservation))
        errors.push('character assessment requires actual identity, clothing and action observations: '+item.characterId);
      if (!Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length ||
          item.evidenceRefs.some(ref=>!images.has(ref)))
        errors.push('character evidence refs must link to actually reviewed images: '+item.characterId);
      for (const key of DIMENSIONS)
        if (!statuses.has(item[key])) errors.push('invalid '+key+': '+item.characterId);
      if (DIMENSIONS.some(key=>item[key]==='REWORK') &&
          !findings.blockingFindings.some(f=>f.characterId===item.characterId))
        errors.push('material dimension REWORK must cite a P0/P1 finding for character: '+item.characterId);
      if (review.status!=='REWORK' && DIMENSIONS.some(key=>item[key]==='REWORK'))
        errors.push('cannot PASS with material character/wardrobe REWORK: '+item.characterId);
    }
  }
  if (!Array.isArray(review.visualEvidence) || !review.visualEvidence.length ||
      review.visualEvidence.some(x=>!text(x.ref) || !text(x.path) || !sha(x.sha256) ||
        !text(x.observation) || x.observation.trim().length<20))
    errors.push('real image evidence with SHA-256 and substantive observations is required');
  return {ok:errors.length===0,verdict:errors.length?'INVALID':review.status,
    errors,blockingFindings:findings.blockingFindings,advisoryFindings:findings.advisoryFindings};
}

export function isArtV3Accepted(status) { return status==='PASS' || status==='PASS_WITH_NOTES'; }
