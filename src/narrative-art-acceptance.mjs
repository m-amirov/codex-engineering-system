/** NARRATIVE_ART_ACCEPTANCE_V2: a policy decision over supplied findings, not a reviewer. */
export const NARRATIVE_ART_ACCEPTANCE_V2 = 'NARRATIVE_ART_ACCEPTANCE_V2';

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
