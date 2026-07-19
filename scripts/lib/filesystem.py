from pathlib import Path
import tempfile, os, shutil

def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name+'.', text=True)
    with os.fdopen(fd,'w',encoding='utf-8') as f: f.write(text)
    Path(tmp).replace(path)

def copy_text(src: Path, dst: Path, force: bool=False) -> None:
    if dst.exists() and not force: raise FileExistsError(dst)
    atomic_write(dst, src.read_text(encoding='utf-8'))
