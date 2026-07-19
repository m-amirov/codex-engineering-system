#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse,json,datetime,re
from scripts.lib.config import ROOT
from scripts.lib.filesystem import atomic_write
from scripts.lib.validation import simple_yaml_ok
REQ=['id','title','sourceProject','problem','rootCause','verifiedResolution','scope','proposedTargets','date']
def parse_simple(path):
    data={}; cur=None
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'): continue
        if line.startswith('  -') and cur: data.setdefault(cur,[]).append(line.split('-',1)[1].strip()); continue
        if ':' in line and not line.startswith(' '):
            k,v=line.split(':',1); cur=k.strip(); data[cur]=v.strip() or []
    return data
def promote(file,apply=False):
    p=Path(file); data=parse_simple(p); errors=[]
    for k in REQ:
        if k not in data or data[k] in ('',[]): errors.append(f'missing {k}')
    if data.get('scope')!='project' and not data.get('evidence'): errors.append('evidence required above project scope')
    changelog=ROOT/'CHANGELOG.md'; exists=data.get('id','') in changelog.read_text(encoding='utf-8')
    if exists: errors.append('duplicate learning id')
    report={'status':'FAIL' if errors else ('APPLIED' if apply else 'DRY-RUN'),'errors':errors,'target':'CHANGELOG.md'}
    if apply and not errors:
        atomic_write(changelog, changelog.read_text(encoding='utf-8')+f"\n- Learning {data['id']}: {data['title']} ({data['scope']}).\n")
    return report
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--file',required=True); ap.add_argument('--apply',action='store_true'); ap.add_argument('--json',action='store_true'); a=ap.parse_args(argv)
    r=promote(a.file,a.apply); print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else str(r)); return 0 if not r['errors'] else 2
if __name__=='__main__': raise SystemExit(main())
