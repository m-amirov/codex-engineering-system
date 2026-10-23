import fs from 'node:fs';
import path from 'node:path';

const SAFE = /^[A-Za-z][A-Za-z0-9_-]{0,120}$/;
const LEGACY = /^S\d{2,3}$/;
const EPISODE = /^EP([1-9]\d*)$/i;

function readGraph(projectDir) {
  const root = fs.realpathSync(projectDir);
  const filename = path.join(root, 'narrative', 'graph.json');
  if (!fs.existsSync(filename)) return null;
  const actual = fs.realpathSync(filename);
  if (!actual.startsWith(root + path.sep)) throw new Error('NARRATIVE_GRAPH_OUTSIDE_PROJECT');
  const value = JSON.parse(fs.readFileSync(actual, 'utf8'));
  if (!Array.isArray(value?.scenes) || value.scenes.some(scene => !SAFE.test(scene?.id ?? '')))
    throw new Error('NARRATIVE_GRAPH_INVALID');
  const ids = value.scenes.map(scene => scene.id);
  if (new Set(ids).size !== ids.length) throw new Error('NARRATIVE_GRAPH_DUPLICATE_SCENE');
  return value;
}

/** Canonical scene IDs come from the authored graph, never invented S-number aliases. */
export function resolveAuthoredSceneId(projectDir, sceneId, { legacy = true } = {}) {
  if (typeof sceneId !== 'string' || !SAFE.test(sceneId))
    return { ok: false, code: 'SCENE_ID_INVALID', sceneId };
  let graph;
  try { graph = readGraph(projectDir); }
  catch (error) { return { ok: false, code: error.message, sceneId }; }
  const entry = graph?.scenes.find(scene => scene.id === sceneId);
  if (entry) return { ok: true, code: 'AUTHORED_SCENE', sceneId, episode: entry.episode ?? null };
  if (legacy && LEGACY.test(sceneId))
    return { ok: true, code: 'LEGACY_S_NUMBERED_SCENE', sceneId, episode: null };
  return { ok: false, code: graph ? 'SCENE_NOT_IN_NARRATIVE_GRAPH' : 'NARRATIVE_GRAPH_MISSING', sceneId };
}

export function resolveEpisodeIdentity(episodeId, episodeDocument, graph) {
  const match = typeof episodeId === 'string' && EPISODE.exec(episodeId);
  if (!match) return { ok: false, code: 'EPISODE_ID_INVALID' };
  const number = Number(match[1]);
  const declared = episodeDocument?.episode;
  const declaredId = episodeDocument?.episodeId;
  if (declared !== number && String(declaredId ?? '').toUpperCase() !== 'EP' + number)
    return { ok: false, code: 'AUTHORITATIVE_EPISODE_MISMATCH' };
  if (!Array.isArray(episodeDocument?.scenes) || !Array.isArray(graph?.scenes))
    return { ok: false, code: 'AUTHORITATIVE_SCENES_INVALID' };
  const actual = episodeDocument.scenes;
  const expected = graph.scenes.filter(scene => scene.episode === number);
  if (!expected.length || actual.length !== expected.length ||
      actual.some(scene => !expected.some(record => record.id === scene?.id)))
    return { ok: false, code: 'AUTHORITATIVE_EPISODE_SCENE_SET_MISMATCH' };
  return { ok: true, code: 'EPISODE_RESOLVED', episodeId: 'EP' + number, number };
}

export function expectedEpisodePath(episodeId) {
  const match = typeof episodeId === 'string' && EPISODE.exec(episodeId);
  if (!match) return null;
  return 'narrative/episodes/ep-' + String(Number(match[1])).padStart(2, '0') + '.json';
}
