#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse, json, sys
from scripts.lib.config import VERSION, ROOT
from scripts.lib.profiles import validate_profiles, load_fragment
from scripts.lib.filesystem import atomic_write
BEGIN='<!-- FOUNDATION:MANAGED:BEGIN codex-engineering-system -->'
END='<!-- FOUNDATION:MANAGED:END codex-engineering-system -->'
def compose(profiles, local_block=''):
    order=validate_profiles(profiles); seen=set(); parts=[f'Foundation version: {VERSION}']
    base=(ROOT/'global/AGENTS.md').read_text(encoding='utf-8').strip(); parts.append('## Source: global/AGENTS.md\n'+base)
    for p in order:
        frag=load_fragment(p)
        if frag not in seen: parts.append(f'## Source: profiles/{p}/AGENTS.fragment.md\n'+frag); seen.add(frag)
    body='\n\n'.join(parts)
    return f'# Project AGENTS.md\n\n{BEGIN}\n{body}\n{END}\n\n## Local project instructions\n{local_block or "<!-- PROJECT: add local instructions here -->"}\n'
def update_managed(existing, managed):
    if BEGIN in existing and END in existing:
        pre=existing.split(BEGIN)[0]; post=existing.split(END,1)[1]
        return pre+managed.split(BEGIN,1)[1].split(END)[0].join([BEGIN,END])+post
    return managed

def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--output'); ap.add_argument('--profiles',nargs='+',required=True); ap.add_argument('--local-block',default=''); ap.add_argument('--dry-run',action='store_true'); ap.add_argument('--check',action='store_true'); ap.add_argument('--json',action='store_true')
    a=ap.parse_args(argv)
    try: text=compose(a.profiles,a.local_block)
    except Exception as e: print(e,file=sys.stderr); return 2
    changed=True
    if a.output:
        out=Path(a.output); final=text if not out.exists() else update_managed(out.read_text(encoding='utf-8'),text)
        changed=(not out.exists()) or out.read_text(encoding='utf-8')!=final
        if a.check and changed: print('AGENTS.md is not up to date'); return 1
        if not a.dry_run and not a.check: atomic_write(out,final)
    else: final=text
    if a.json: print(json.dumps({'changed':changed,'profiles':a.profiles,'foundationVersion':VERSION},indent=2))
    elif a.dry_run or not a.output: print(final)
    return 0
if __name__=='__main__': raise SystemExit(main())
