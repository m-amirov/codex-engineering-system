#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse,json,sys,re
from scripts.lib.config import ROOT, VERSION
from scripts.lib.validation import simple_yaml_ok, validate_json, has_secret
REQ=['README.md','CHANGELOG.md','VERSION','global/AGENTS.md','registry/skills.yaml','registry/profiles.yaml']
def validate(root=ROOT, strict=False):
    errors=[]; warnings=[]
    for r in REQ:
        p=root/r
        if not p.exists(): errors.append(f'missing {r}')
        elif not p.read_text(encoding='utf-8').strip(): errors.append(f'empty {r}')
    for p in sorted(root.rglob('*.json')):
        try: validate_json(p)
        except Exception as e: errors.append(f'invalid json {p.relative_to(root)}: {e}')
    for p in sorted(root.rglob('*.yaml')):
        if 'fixtures/invalid-profile' in p.as_posix():
            continue
        if not simple_yaml_ok(p.read_text(encoding='utf-8')): errors.append(f'invalid yaml subset {p.relative_to(root)}')
    for d in sorted((root/'skills').iterdir() if (root/'skills').exists() else []):
        if d.is_dir() and not (d/'SKILL.md').exists(): errors.append(f'missing SKILL.md {d.relative_to(root)}')
    txt='\n'.join(p.read_text(encoding='utf-8',errors='ignore') for p in root.rglob('*') if p.is_file() and '.git' not in p.parts)
    if has_secret(txt): errors.append('secret-like string detected (redacted)')
    if (root/'VERSION').exists() and (root/'VERSION').read_text().strip()!=VERSION: errors.append('VERSION mismatch')
    # registries paths
    for reg in ['skills','agents','profiles']:
        f=root/'registry'/f'{reg}.yaml'
        if f.exists():
            for m in re.finditer(r'path:\s*([^\n]+)', f.read_text()):
                rel=m.group(1).strip().strip('"')
                if not (root/rel).exists(): errors.append(f'registry path missing {rel}')
    return {'status':'PASS' if not errors else 'FAIL','errors':errors,'warnings':warnings}
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--strict',action='store_true'); ap.add_argument('--json',action='store_true'); a=ap.parse_args(argv)
    r=validate(strict=a.strict)
    print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else '\n'.join([r['status']]+r['errors']+r['warnings']))
    return 0 if r['status']=='PASS' else 1
if __name__=='__main__': raise SystemExit(main())
