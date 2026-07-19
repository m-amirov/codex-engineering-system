from pathlib import Path
import json, re
SECRET=re.compile(r'(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*[A-Za-z0-9_\-]{12,}')
def simple_yaml_ok(text:str)->bool:
    for ln in text.splitlines():
        if not ln.strip() or ln.lstrip().startswith('#'): continue
        if '\t' in ln: return False
        ind=len(ln)-len(ln.lstrip(' '))
        if ind%2: return False
        s=ln.strip()
        if s.startswith('- '): continue
        if ':' not in s: return False
    return True
def validate_json(path:Path): json.loads(path.read_text(encoding='utf-8'))
def has_secret(text): return bool(SECRET.search(text))
