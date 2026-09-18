import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('0.5.x Web agents are reasoning-only and assume no local tools', () => {
  assert.match(read('VERSION').trim(), /^0\.5\./);
  const bulk = read('agents/ceos-bulk-checker-web.toml');
  const reasoner = read('agents/ceos-reasoner-web.toml');
  const artDirector = read('agents/ceos-art-director-web.toml');
  assert.match(bulk, /name = "ceos_bulk_checker_web"/);
  assert.match(bulk, /model = "chatgpt-web\/light"/);
  assert.match(bulk, /must not inspect the repository or invoke tools/i);
  assert.match(reasoner, /name = "ceos_reasoner_web"/);
  assert.match(reasoner, /model = "chatgpt-web\/medium"/);
  assert.match(reasoner, /must not inspect the repository or invoke tools/i);
  assert.match(artDirector, /name = "ceos_art_director_web"/);
  assert.match(artDirector, /model = "chatgpt-web\/high"/);
  assert.match(artDirector, /must not inspect the repository/i);
  assert.match(artDirector, /must not.*generate.*files|do not invoke tools, generate image files/is);
  assert.equal(fs.existsSync(path.join(root, 'agents/ceos-explorer-web.toml')), false);
});

test('hybrid policy keeps evidence gathering, image persistence and critical path native', () => {
  const global = read('global/AGENTS.md');
  const policy = read('policies/model-routing.md');
  assert.match(global, /MCP \/ Full Harness is not required and must not be assumed/i);
  assert.match(global, /If fresh repository\/tool evidence is required, route natively/i);
  assert.match(global, /Web analysis is advisory reasoning over supplied evidence/i);
  assert.match(global, /ceos_asset_generator/);
  assert.match(global, /fallback is allowed at most once/i);
  assert.match(policy, /Web output is not independent evidence of repository or production state/i);
  assert.match(policy, /Actual file persistence.*remain native/is);
  assert.match(policy, /image-generation availability must be observed, not assumed/i);
});

test('production-art skill separates Web art direction from native generation', () => {
  const skill = read('skills/production-art/SKILL.md');
  const nativeAgent = read('agents/ceos-asset-generator.toml');
  assert.match(skill, /ceos_art_director_web/);
  assert.match(skill, /ceos_asset_generator/);
  assert.match(skill, /asset manifest/i);
  assert.match(skill, /canon/i);
  assert.match(skill, /image-generation capability/i);
  assert.match(skill, /BLOCKED/i);
  assert.match(skill, /visual-qa/);
  assert.match(nativeAgent, /native image-generation capability/i);
  assert.match(nativeAgent, /otherwise stop and report the missing capability/i);
});

test('audit-repair-loop locks target scope and makes Web routing observable', () => {
  const skill = read('skills/audit-repair-loop/SKILL.md');
  const global = read('global/AGENTS.md');
  const policy = read('policies/model-routing.md');
  assert.match(skill, /## Scope lock/);
  assert.match(skill, /release\/publication\/submission readiness/i);
  assert.match(skill, /must not turn the target verdict into `FAIL`, `BLOCKED`, or `ESCALATE`/i);
  assert.match(skill, /ceos web-preflight --json/);
  assert.match(skill, /must.*be delegated to `ceos_bulk_checker_web` or `ceos_reasoner_web`/is);
  assert.match(skill, /web_agents_used\[\]/);
  assert.match(global, /must not silently expand the user's target/i);
  assert.match(global, /do not silently skip Web/i);
  assert.match(policy, /READY.*substantive audit must actually use/is);
  assert.match(policy, /Web preflight status/i);
});

test('Windows hybrid installer detects packaged launcher and records no-MCP contract', () => {
  const installer = read('scripts/install-hybrid.ps1');
  assert.match(installer, /Programs\\Codex Web GPT\\Codex Web GPT\.exe/);
  assert.match(installer, /packaged-codex-web-gpt-detected/);
  assert.match(installer, /routingMode = 'reasoning-only'/);
  assert.match(installer, /mcpRequired = \$false/);
  assert.match(installer, /localToolsAssumed = \$false/);
  assert.match(installer, /Refusing to replace non-CEOS agent target/);
  assert.match(installer, /ceos-art-director-web\.toml/);
  assert.match(installer, /chatgpt-web\/high/);
  assert.match(installer, /ceos-explorer-web\.toml/);
  assert.match(installer, /single-native-fallback-on-transport-backend-failure-only/);
});

test('Windows hybrid installer writes JSON as UTF-8 without BOM', () => {
  const installer = read('scripts/install-hybrid.ps1');
  assert.match(installer, /System\.Text\.UTF8Encoding\(\$false\)/);
  assert.match(installer, /System\.IO\.File\]::WriteAllText\(\$ManifestFile, \$ManifestJson, \$Utf8NoBom\)/);
  assert.doesNotMatch(installer, /Set-Content\s+\$ManifestFile\s+-Encoding\s+utf8/i);
});

test('global Windows installer forwards hybrid options with named PowerShell splatting', () => {
  const installer = read('scripts/install-global.ps1');
  assert.match(installer, /\$HybridParams\s*=\s*@\{\s*Web\s*=\s*\$Web\s*\}/);
  assert.match(installer, /\$HybridParams\.CodexHome\s*=\s*\$CodexHome/);
  assert.match(installer, /install-hybrid\.ps1'\)\s+@HybridParams/);
  assert.doesNotMatch(installer, /\$HybridArgs\s*=\s*@\('-Web'/);
});
