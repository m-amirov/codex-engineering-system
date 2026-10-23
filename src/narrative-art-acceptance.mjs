/** NARRATIVE_ART_ACCEPTANCE_V2: a policy decision over supplied findings, not a reviewer. */
export const NARRATIVE_ART_ACCEPTANCE_V2 = 'NARRATIVE_ART_ACCEPTANCE_V2';

/**
 * Story-first, dialogue-aware review instructions. These guide the independent
 * reviewer; they do not grant a local author or transport an automatic PASS.
 */
export const NARRATIVE_ART_STORY_FIRST_GUIDANCE = Object.freeze([
  'Judge what the player understands from the combined dialogue, narrative text, original image and player-facing runtime frame, not from an isolated CG.',
  'An action clearly conveyed by the dialogue does not have to be depicted literally in the CG unless the authored cue explicitly makes seeing it essential.',
  'Do not report P1 merely because a prop, calendar change or minor gesture mentioned in narration is not visibly illustrated; distinguish omission from a contradictory image.',
  'Still block verifiable wrong characters, actors, meaningful actions, locations, timeline, unreadable critical UI and other material contradictions.',
  'Before assigning P0/P1 or blocking P2, cite the exact authored cue, observed pixels and concrete player-facing comprehension impact; cosmetic framing is advisory.',
  'Use only P0, P1, P2 or P3 severity (never major/minor). PASS with nonblocking P2/P3 findings and an empty unresolved list; REWORK only for proven open blockers.',
  'Owner decisions are review context, not evidence of pixel inspection or an instruction to PASS; preserve independent reviewer judgment.'
]);

const SEVERITIES = new Set(['P0','P1','P2','P3']);
const STATES = new Set(['OPEN','RESOLVED']);
const PLOT_BLOCKERS = new Set([
  'WRONG_CHARACTER', 'WRONG_ACTOR_OR_ACTION', 'WRONG_LOCATION_OR_TIME',
  'STORY_CRITICAL_PROP_MISSING', 'STORY_CRITICAL_PROP_OBSCURED',
  'ESSENTIAL_CHARACTER_UNRECOGNIZABLE', 'NARRATIVE_CONTINUITY_CONTRADICTION',
  'DIALOGUE_OR_CONTROLS_UNREADABLE', 'CRITICAL_SCENE_MAPPING'
]);
const P2_MATERIAL = new Set([
  'ESSENTIAL_GESTURE_UNREADABLE', 'ESSENTIAL_SUBJECT_CROPPED',
  'STORY_ACTION_UNREADABLE', 'MATERIAL_RUNTIME_READABILITY'
]);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/**
 * Classification requires a cue, actual received pixels and player impact
 * for any BLOCKING observation. P2 is advisory by default. This does not
 * authenticate reviewers or turn subjective metadata into independent PASS.
 */
export function assessNarrativeArtFindings(findings) {
  const invalid = reason => ({
    ok:false, verdict:'INVALID_FINDINGS', errors:[reason], blockingFindings:[], advisoryFindings:[]
  });
  if (!Array.isArray(findings)) return invalid('findings must be an array');
  const errors=[],seen=new Set(),blockingFindings=[],advisoryFindings=[];
  for (const f of findings) {
    if (!f || !nonempty(f.id) || !SEVERITIES.has(f.severity) || !STATES.has(f.status)) {
      errors.push('Each finding requires a unique id, P0-P3 severity and OPEN/RESOLVED status');
      continue;
    }
    if (seen.has(f.id)) { errors.push('Duplicate finding id: '+f.id); continue; }
    seen.add(f.id);
    if (f.status==='RESOLVED') continue;
    const p2Claim=f.severity==='P2' && f.materialPlayerImpact===true;
    const blocking=f.severity==='P0' || f.severity==='P1' || p2Claim;
    if (f.severity==='P3' && f.materialPlayerImpact===true)
      errors.push(f.id+': P3 cannot claim blocking player impact; provide new pixel-backed P0/P1/P2 finding');
    if (f.severity==='P2' && f.materialPlayerImpact!==undefined &&
        typeof f.materialPlayerImpact!=='boolean')
      errors.push(f.id+': materialPlayerImpact must be boolean');
    // An expressly non-visual, non-material omission cannot be labelled a
    // blocking P1. Refuse a contradictory finding instead of silently
    // downgrading the independent reviewer's declared severity or verdict.
    if (f.severity==='P1' && f.visualRequired===false && f.materialPlayerImpact===false &&
        ['STORY_CRITICAL_PROP_MISSING','STORY_CRITICAL_PROP_OBSCURED','WRONG_ACTOR_OR_ACTION'].includes(f.impactCode))
      errors.push(f.id+': non-visual, non-material narrative cue cannot be a blocking P1; independent reviewer must reclassify');
    if (f.visualRequired!==undefined && typeof f.visualRequired!=='boolean')
      errors.push(f.id+': visualRequired must be boolean when supplied');
    if (blocking) {
      const permitted=f.severity==='P2'?P2_MATERIAL:PLOT_BLOCKERS;
      if (!permitted.has(f.impactCode))
        errors.push(f.id+': invalid or missing blocking impactCode for '+f.severity);
      if (!nonempty(f.authoredCue) || !nonempty(f.observation) ||
          !nonempty(f.playerImpact) || !nonempty(f.evidenceRef) ||
          f.actualPixelsReceived!==true)
        errors.push(f.id+': blocking finding needs authored cue, actual pixels, observation, player impact and evidenceRef');
      blockingFindings.push(f);
    } else {
      advisoryFindings.push(f);
    }
  }
  return {
    ok:errors.length===0,
    verdict:errors.length?'INVALID_FINDINGS':blockingFindings.length?'REWORK_REQUIRED':
      advisoryFindings.length?'ACCEPTABLE_WITH_NOTES':'ACCEPTABLE',
    errors,blockingFindings,advisoryFindings
  };
}
