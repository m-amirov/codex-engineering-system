import unittest, tempfile, zipfile, importlib.util
from pathlib import Path
from scripts.bootstrap_project import bootstrap
from scripts.compose_agents_file import compose
from scripts.validate_repository import validate as validate_repo
from scripts.validate_project import validate as validate_project
from scripts.update_project import update
from scripts.promote_learning import promote

spec=importlib.util.spec_from_file_location('yz','skills/yandex-release-validation/scripts/validate_yandex_zip.py')
yz=importlib.util.module_from_spec(spec); spec.loader.exec_module(yz)

class SystemTests(unittest.TestCase):
    def test_bootstrap_empty_and_validate(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'proj'; r=bootstrap('proj',p,['common','web-app'],dry_run=False)
            self.assertEqual(r['status'],'created')
            self.assertEqual(validate_project(p, strict=True)['status'],'PASS')
    def test_bootstrap_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td); (p/'x.txt').write_text('x')
            with self.assertRaises(FileExistsError): bootstrap('p',p,['common'])
    def test_bootstrap_dry_run(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'p'; r=bootstrap('p',p,['common'],dry_run=True)
            self.assertFalse(p.exists()); self.assertEqual(r['status'],'dry-run')
    def test_compose_deterministic(self):
        a=compose(['common','web-app']); b=compose(['common','web-app'])
        self.assertEqual(a,b); self.assertIn('profiles/web-app',a)
    def test_validate_repository(self):
        self.assertEqual(validate_repo()['status'],'PASS')
    def test_validate_repository_missing_skill(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); (root/'skills/nope').mkdir(parents=True); (root/'VERSION').write_text('0.1.0'); (root/'README.md').write_text('x'); (root/'CHANGELOG.md').write_text('x'); (root/'global').mkdir(); (root/'global/AGENTS.md').write_text('x'); (root/'registry').mkdir(); (root/'registry/skills.yaml').write_text('skills: []'); (root/'registry/profiles.yaml').write_text('profiles: []')
            self.assertEqual(validate_repo(root)['status'],'FAIL')
    def test_update_dry_run_and_project_owned(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'p'; bootstrap('p',p,['common'])
            r=update(p,apply=False)
            self.assertTrue(r['dryRun']); self.assertIn('docs/README.md projectOwned not overwritten',r['protected'])
    def test_promote_duplicate_and_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/'l.yaml'; f.write_text('id: x\ntitle: t\nsourceProject: p\nproblem: p\nrootCause: r\nverifiedResolution: v\nscope: global\nproposedTargets: []\ndate: 2026-07-19\n')
            self.assertIn('evidence required above project scope', promote(f)['errors'])
    def makezip(self,path,files):
        with zipfile.ZipFile(path,'w') as z:
            for n,c in files.items(): z.writestr(n,c)
    def test_zip_posix(self):
        with tempfile.TemporaryDirectory() as td:
            z=Path(td)/'a.zip'; self.makezip(z,{'index.html':'<script src="/sdk.js"></script><script src="assets/a.js"></script>','assets/a.js':'x'})
            self.assertEqual(yz.validate(z)['status'],'PASS')
    def test_zip_backslash(self):
        with tempfile.TemporaryDirectory() as td:
            z=Path(td)/'a.zip'; self.makezip(z,{'index.html':'/sdk.js','assets\\a.js':'x'})
            self.assertEqual(yz.validate(z)['status'],'FAIL')
    def test_zip_no_index(self):
        with tempfile.TemporaryDirectory() as td:
            z=Path(td)/'a.zip'; self.makezip(z,{'a.html':'x'})
            self.assertEqual(yz.validate(z)['status'],'FAIL')
    def test_zip_no_sdk(self):
        with tempfile.TemporaryDirectory() as td:
            z=Path(td)/'a.zip'; self.makezip(z,{'index.html':'<html></html>'})
            self.assertEqual(yz.validate(z)['status'],'FAIL')
if __name__=='__main__': unittest.main()
