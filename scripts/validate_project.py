#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse,json,re
from scripts.lib.config import VERSION
from scripts.lib.validation import simple_yaml_ok
DOCS=['README.md','PRODUCT.md','ARCHITECTURE.md','DEVELOPMENT.md','TESTING.md','RELEASE.md','STATUS.md','SECURITY.md']
def validate(path, profile=None, strict=False):
    root=Path(path); errors=[]; warnings=[]
    pp=root/'project.profile.yaml'
    if not pp.exists(): errors.append('missing project.profile.yaml')
    else:
        txt=pp.read_text(encoding='utf-8')
        if not simple_yaml_ok(txt): errors.append('invalid project.profile.yaml')
        if f'foundationVersion: {VERSION}' not in txt: errors.append('foundation version mismatch')
        if profile and profile not in txt: errors.append(f'profile not selected: {profile}')
    ag=root/'AGENTS.md'
    if not ag.exists(): errors.append('missing AGENTS.md')
    elif '<!-- FOUNDATION:MANAGED:BEGIN' not in ag.read_text(encoding='utf-8'): errors.append('missing managed AGENTS section')
    for d in DOCS:
        if not (root/'docs'/d).exists(): errors.append(f'missing docs/{d}')
    if strict:
        for p in root.rglob('*.md'):
            if '<!-- PROJECT:' in p.read_text(encoding='utf-8'): warnings.append(f'placeholder remains {p.relative_to(root)}')
    return {'status':'PASS' if not errors else 'FAIL','errors':errors,'warnings':warnings,'note':'production tests are not inferred by this validator'}
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--path',required=True); ap.add_argument('--profile'); ap.add_argument('--json',action='store_true'); ap.add_argument('--strict',action='store_true'); a=ap.parse_args(argv)
    r=validate(a.path,a.profile,a.strict); print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else '\n'.join([r['status']]+r['errors']+r['warnings']+[r['note']]))
    return 0 if r['status']=='PASS' else 1
if __name__=='__main__': raise SystemExit(main())
