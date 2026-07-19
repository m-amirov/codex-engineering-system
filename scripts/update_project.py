#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse,json,shutil,datetime
from scripts.compose_agents_file import compose
from scripts.lib.filesystem import atomic_write
POLICY={'AGENTS.md':'mergeable','project.profile.yaml':'managed','docs/README.md':'projectOwned'}
def update(path,apply=False):
    root=Path(path); report={'dryRun':not apply,'changes':[],'conflicts':[],'protected':[]}
    if not root.exists(): report['conflicts'].append('project path missing'); return report
    pp=root/'project.profile.yaml'; profs=['common']
    if pp.exists():
        txt=pp.read_text(encoding='utf-8')
        for p in ['web-app','browser-extension','automation-tool','phaser-game','yandex-games']:
            if p in txt: profs.append(p)
    target=root/'AGENTS.md'; new=compose(profs)
    if target.exists() and target.read_text(encoding='utf-8')!=new:
        report['changes'].append('AGENTS.md managed section')
        if apply:
            backup=target.with_suffix(target.suffix+'.bak-'+datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S'))
            shutil.copy2(target,backup); atomic_write(target,new)
    if (root/'docs/README.md').exists(): report['protected'].append('docs/README.md projectOwned not overwritten')
    return report
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--path',required=True); ap.add_argument('--apply',action='store_true'); ap.add_argument('--json',action='store_true'); a=ap.parse_args(argv)
    r=update(a.path,a.apply); print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else ('APPLY' if a.apply else 'DRY-RUN')+': '+str(r)); return 4 if r['conflicts'] else 0
if __name__=='__main__': raise SystemExit(main())
