#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import argparse,json,shutil,datetime
from scripts.lib.config import ROOT, VERSION
BEGIN='# FOUNDATION:MANAGED:BEGIN codex-engineering-system'; END='# FOUNDATION:MANAGED:END codex-engineering-system'
def install(apply=False,home=None):
    base=Path(home) if home else Path.home(); cfg=base/'.codex'/'config.toml'
    block=f'{BEGIN}\n[foundation]\nversion = "{VERSION}"\nroot = "{ROOT.as_posix()}"\n{END}\n'
    report={'dryRun':not apply,'target':str(cfg),'rollback':'restore backup file if created','wouldAdd':block}
    if apply:
        cfg.parent.mkdir(parents=True,exist_ok=True)
        old=cfg.read_text(encoding='utf-8') if cfg.exists() else ''
        if cfg.exists(): shutil.copy2(cfg,cfg.with_suffix('.toml.bak-'+datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')))
        if BEGIN not in old: cfg.write_text(old+'\n'+block,encoding='utf-8')
    return report
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--apply',action='store_true'); ap.add_argument('--json',action='store_true'); a=ap.parse_args(argv)
    r=install(a.apply); print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else str(r)); return 0
if __name__=='__main__': raise SystemExit(main())
