#!/usr/bin/env python3
from pathlib import Path
import argparse,json,zipfile,hashlib,re
ASSET_RE=re.compile(r'''(?:src|href)=["'](?!https?:|/sdk\.js|#|data:)([^"']+)["']''')
def validate(zip_path):
    p=Path(zip_path); errors=[]; warnings=[]; entries=[]; assets=[]; sha=None
    if not p.exists(): return {'status':'FAIL','errors':['zip file does not exist'],'warnings':warnings,'entries':entries}
    sha=hashlib.sha256(p.read_bytes()).hexdigest()
    try:
        with zipfile.ZipFile(p) as z:
            bad=z.testzip()
            if bad: errors.append(f'unreadable entry: {bad}')
            entries=sorted(z.namelist())
            for e in entries:
                if '\\' in e: errors.append(f'backslash entry: {e}')
                if e.startswith('dist/'): errors.append('root dist/ folder is not allowed')
                if e.endswith('.map') or e.endswith('~') or '/tmp/' in e or e.startswith('__MACOSX/'): warnings.append(f'suspicious file: {e}')
            if 'index.html' not in entries: errors.append('missing root index.html')
            else:
                html=z.read('index.html').decode('utf-8','replace')
                if '/sdk.js' not in html: errors.append('index.html must reference /sdk.js')
                for m in ASSET_RE.finditer(html):
                    asset=m.group(1).split('?',1)[0].lstrip('./')
                    if asset and asset not in entries: errors.append(f'missing asset referenced by index.html: {asset}')
                    assets.append(asset)
    except zipfile.BadZipFile:
        errors.append('file is not a readable ZIP')
    return {'status':'FAIL' if errors else 'PASS','errors':errors,'warnings':warnings,'entries':entries,'assets':assets,'sha256':sha}
def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('zip'); ap.add_argument('--json',action='store_true'); a=ap.parse_args(argv)
    r=validate(a.zip); print(json.dumps(r,indent=2,ensure_ascii=False) if a.json else '\n'.join([r['status']]+r['errors']+r['warnings']+[f"sha256: {r.get('sha256')}"])); return 0 if r['status']=='PASS' else 1
if __name__=='__main__': raise SystemExit(main())
