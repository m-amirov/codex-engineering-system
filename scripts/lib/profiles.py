from .config import ROOT

def available_profiles(): return sorted([p.name for p in (ROOT/'profiles').iterdir() if p.is_dir()])
def load_fragment(profile: str) -> str:
    p=ROOT/'profiles'/profile/'AGENTS.fragment.md'
    if not p.exists(): raise ValueError(f'unknown profile: {profile}')
    return p.read_text(encoding='utf-8').strip()
def validate_profiles(profiles):
    av=set(available_profiles()); missing=[p for p in profiles if p not in av]
    if missing: raise ValueError('unknown profiles: '+', '.join(missing))
    if 'common' not in profiles: raise ValueError('common profile is required')
    return ['common']+[p for p in profiles if p!='common']
