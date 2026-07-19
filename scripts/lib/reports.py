import json

def emit(data, as_json=False):
    if as_json: print(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True))
    else:
        for k,v in data.items(): print(f'{k}: {v}')
