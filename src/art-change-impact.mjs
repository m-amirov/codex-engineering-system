import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

/**
 * Read-only impact planner. It never issues an artistic PASS or rewrites
 * evidence. The existing independent acceptance gate remains authoritative.
 */
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const HEAD=/^[a-f0-9]{40}$/i;
const HASH=/^[a-f0-9]{64}$/i;
const isSafe=p=>typeof p==='string' && p.length>0 && !path.isAbsolute(p) &&
  !p.includes('\\') && p.split('/').every(x=>x && x!=='.' && x!=='..');
function read(root,rel) {
  if(!isSafe(rel)) throw Error('IMPACT_UNSAFE_PATH');
  const canonical=fs.realpathSync(path.resolve(root,rel));
  if(!canonical.startsWith(root+path.sep)||!fs.statSync(canonical).isFile())
    throw Error('IMPACT_PATH_OUTSIDE_PROJECT');
  return fs.readFileSync(canonical);
}
const git=(root,args)=>{
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:15000,windowsHide:true});
  if(result.status!==0) throw Error('IMPACT_GIT_INVALID:'+String(result.stderr).slice(0,150));
  return result.stdout.trim();
};
function fromGit(root,head,rel) {
  if(!HEAD.test(head)||!isSafe(rel)) throw Error('IMPACT_HISTORICAL_SOURCE_INVALID');
  return execFileSync('git',['show',head+':'+rel],{cwd:root,timeout:15000,windowsHide:true,maxBuffer:25*1024*1024});
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function sceneProjection(bytes,rel,sceneId,assetIds) {
  const obj=JSON.parse(bytes.toString('utf8'));
  if(rel==='narrative/graph.json'||/^narrative\/episodes\/ep-\d+\.json$/.test(rel)) {
    if(!Array.isArray(obj.scenes)) throw Error('IMPACT_NARRATIVE_INVALID');
    const scene=obj.scenes.find(s=>s?.id===sceneId);
    const shared={...obj,scenes:undefined};
    return {scene,shared};
  }
  if(rel==='narrative/assets.json') {
    const map=obj.assets;
    if(!map || typeof map!=='object') throw Error('IMPACT_ASSETS_INVALID');
    const owned=Object.fromEntries((assetIds??[]).map(id=>[id,Array.isArray(map)?map.find(x=>x.id===id):map[id]]));
    const shared={...obj,assets:undefined};
    return {scene:owned,shared};
  }
  return null;
}
/**
 * Rows {sceneId, assetIds[], dependencies:[{path,sha256}], receipt:{path,sha256}}
 * must cover the full review-relevant source projection. The caller may not
 * promote eligibility to PASS until validating the original independent
 * reviewer and receipt against the unchanged source pixels.
 */
export function planChangedSceneReviews(projectDir, {
  sourceHead, currentHead, rows, sharedDependencies = [], evidenceProfile = null
}={}) {
  const blocked=(code,reason)=>({status:'BLOCKED_IMPACT_ANALYSIS',code,reason,
    needsReview:[],reuseCandidates:[]});
  try {
    const root=fs.realpathSync(projectDir);
    if(!HEAD.test(sourceHead??'')||!HEAD.test(currentHead??'')||
        git(root,['rev-parse','HEAD'])!==currentHead)
      return blocked('SOURCE_HEAD_INVALID','current HEAD mismatch');
    git(root,['merge-base','--is-ancestor',sourceHead,currentHead]);
    if(!Array.isArray(rows)||!rows.length || !Array.isArray(sharedDependencies))
      return blocked('SCOPE_INVALID','source-bound rows and global dependencies required');
    const ids=rows.map(x=>x?.sceneId);
    if(new Set(ids).size!==ids.length || ids.some(x=>typeof x!=='string'||!x))
      return blocked('DUPLICATE_SCENE','unique scene IDs required');
    const changed=git(root,['diff','--name-only','--no-renames',sourceHead,currentHead,'--'])
      .split('\n').filter(Boolean);
    const impacted=new Map(rows.map(x=>[x.sceneId,[]]));
    const globallyImpacted=[];
    const allDeps=[...sharedDependencies,...rows.flatMap(x=>x.dependencies??[])];
    if(allDeps.some(x=>!isSafe(x?.path)||!HASH.test(x?.sha256??'')))
      return blocked('DEPENDENCY_MANIFEST_INVALID','path and 64-hex hash required');
    // Independent evidence must already exist and match its recorded digest.
    for(const row of rows) {
      if(!Array.isArray(row.dependencies)||!row.dependencies.length||
          !Array.isArray(row.assetIds)||!row.assetIds.length ||
          !isSafe(row.receipt?.path)||!HASH.test(row.receipt?.sha256??''))
        return blocked('INCOMPLETE_SOURCE_PROJECTION','scene dependencies, assets and receipt required');
      if(sha(read(root,row.receipt.path))!==row.receipt.sha256.toLowerCase())
        return blocked('RECEIPT_CHANGED','immutable reviewer receipt hash mismatch');
      for(const dep of row.dependencies) {
        const historical=sha(fromGit(root,sourceHead,dep.path));
        if(historical!==dep.sha256.toLowerCase())
          return blocked('SOURCE_DEPENDENCY_MISMATCH','historical declared hash not in source commit: '+dep.path);
        // Shared authored JSON files are projected per scene below. Their
        // whole-file hash changes when an unrelated scene is edited.
        if (!/^narrative\/(?:graph|assets)\.json$|^narrative\/episodes\/ep-\d+\.json$/.test(dep.path)) {
          try {if(sha(read(root,dep.path))!==historical) impacted.get(row.sceneId).push(dep.path)}
          catch { impacted.get(row.sceneId).push(dep.path) }
        }
      }
    }
    for(const dep of sharedDependencies) {
      if(sha(fromGit(root,sourceHead,dep.path))!==dep.sha256.toLowerCase() ||
        sha(read(root,dep.path))!==dep.sha256.toLowerCase())
        globallyImpacted.push(dep.path);
    }
    // Changes to shared runtime/CSS/canon code are conservatively global.
    // A graph or assets change is projected to each scene and shared metadata.
    for(const file of changed) {
      if(/^docs\/|^tests\/|^artifacts\/evidence\/|^\.github\/|^README\.md$/.test(file)) continue;
      const scoped=rows.filter(row=>row.dependencies.some(x=>x.path===file));
      if(/^narrative\/graph\.json$|^narrative\/assets\.json$|^narrative\/episodes\/ep-\d+\.json$/.test(file)) {
        let oldBytes,newBytes;
        try { oldBytes=fromGit(root,sourceHead,file);newBytes=read(root,file); }
        catch {globallyImpacted.push(file);continue}
        let sharedMismatch=false;
        for(const row of rows) {
          try {
            const old=sceneProjection(oldBytes,file,row.sceneId,row.assetIds);
            const current=sceneProjection(newBytes,file,row.sceneId,row.assetIds);
            if(!equal(old.shared,current.shared)) sharedMismatch=true;
            if(!equal(old.scene,current.scene)) impacted.get(row.sceneId).push(file);
          } catch {sharedMismatch=true;}
        }
        if(sharedMismatch) globallyImpacted.push(file);
      } else if(scoped.length>0) {
        for(const row of scoped) impacted.get(row.sceneId).push(file);
      } else if(/^artifacts\/(?:images|production-art\/.+\/images)\//.test(file)) {
        // No matching dependency is proof of omission, not permission to reuse.
        globallyImpacted.push(file);
      } else {
        globallyImpacted.push(file);
      }
    }
    const needsReview=[],reuseCandidates=[];
    for(const row of rows) {
      const causes=[...new Set([...globallyImpacted,...impacted.get(row.sceneId)])];
      if(causes.length) needsReview.push({sceneId:row.sceneId,causes});
      else reuseCandidates.push({sceneId:row.sceneId,sourceHead,currentHead,
        receipt:row.receipt,dependencies:row.dependencies,assetIds:row.assetIds,
        status:'REVALIDATION_REQUIRED_NOT_ACCEPTED'});
    }
    return {status:'PASS_IMPACT_PLAN',profile:evidenceProfile,sourceHead,currentHead,
      changedPaths:changed,needsReview,reuseCandidates,
      warning:'Read-only eligibility only; never automatically convert old REWORK or unauthenticated receipts to PASS.'};
  } catch(error) {return blocked('IMPACT_EVIDENCE_INVALID',error.message)}
}
