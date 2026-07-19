#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse, json, sys, datetime
from scripts.lib.config import VERSION, ROOT
from scripts.lib.profiles import validate_profiles
from scripts.lib.filesystem import atomic_write, copy_text
from scripts.compose_agents_file import compose

def bootstrap(name,path,profiles,force=False,dry_run=False):
    profs=validate_profiles(profiles); dest=Path(path)
    if dest.exists() and any(dest.iterdir()) and not force: raise FileExistsError(f'{dest} is not empty; use --force')
    files={
      'project.profile.yaml': f'schemaVersion: 1\nfoundationVersion: {VERSION}\nproject:\n  name: {name}\nprofiles: {json.dumps(profs)}\nrequiredSkills: [implementation-cycle, documentation-sync]\n',
      'AGENTS.md': compose(profs),
      '.codex/config.toml': f'# Generated project-local example; no secrets.\n[foundation]\nversion = "{VERSION}"\n',
      'docs/bootstrap-report.md': f'# Bootstrap Report\n\nProject: {name}\nFoundation: {VERSION}\nProfiles: {", ".join(profs)}\nDate: {datetime.date.today().isoformat()}\n'
    }
    for doc in ['README.template.md','PRODUCT.md','ARCHITECTURE.md','DEVELOPMENT.md','TESTING.md','RELEASE.md','STATUS.md','SECURITY.md','CHANGELOG.md']:
        files['docs/'+doc.replace('.template','')]=(ROOT/'docs-templates'/doc).read_text(encoding='utf-8')
    if dry_run: return {'status':'dry-run','path':str(dest),'files':sorted(files)}
    dest.mkdir(parents=True,exist_ok=True)
    for rel,text in files.items():
        target=dest/rel
        if target.exists() and not force: raise FileExistsError(target)
        atomic_write(target,text)
    return {'status':'created','path':str(dest),'files':sorted(files)}
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--name',required=True); ap.add_argument('--path',required=True); ap.add_argument('--profiles',nargs='+',required=True); ap.add_argument('--force',action='store_true'); ap.add_argument('--dry-run',action='store_true'); ap.add_argument('--json',action='store_true')
    a=ap.parse_args(argv)
    try: r=bootstrap(a.name,a.path,a.profiles,a.force,a.dry_run)
    except FileExistsError as e: print(e,file=sys.stderr); return 3
    except Exception as e: print(e,file=sys.stderr); return 2
    print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else f"{r['status']}: {r['path']}")
    return 0
if __name__=='__main__': raise SystemExit(main())
