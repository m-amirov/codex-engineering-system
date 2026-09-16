// Intentionally small YAML subset for CEOS manifests: nested maps, scalars and inline arrays.
// It rejects unsupported list-block syntax instead of guessing.
function stripComment(line) {
  let single = false, double = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single && line[i - 1] !== '\\') double = !double;
    else if (c === '#' && !single && !double && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function splitInlineArray(s) {
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  const out = [];
  let buf = '', single = false, double = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single && body[i - 1] !== '\\') double = !double;
    if (c === ',' && !single && !double) {
      out.push(parseScalar(buf.trim())); buf = ''; continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(parseScalar(buf.trim()));
  return out;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return {};
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) return splitInlineArray(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    if (s[0] === '"') return JSON.parse(s);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

export function parseYamlLite(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const uncommented = stripComment(lines[idx]).replace(/\s+$/, '');
    if (!uncommented.trim()) continue;
    if (/\t/.test(uncommented.match(/^\s*/)?.[0] ?? '')) throw new Error(`Tabs are not supported in YAML indentation (line ${idx + 1})`);
    const indent = uncommented.length - uncommented.trimStart().length;
    const line = uncommented.trimStart();
    if (line.startsWith('- ')) throw new Error(`Block arrays are not supported; use inline arrays [a, b] (line ${idx + 1})`);
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error(`Expected key: value at line ${idx + 1}`);
    const key = line.slice(0, colon).trim();
    const rawValue = line.slice(colon + 1).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error(`Unsupported key '${key}' at line ${idx + 1}`);

    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).obj;
    if (Object.prototype.hasOwnProperty.call(parent, key)) throw new Error(`Duplicate key '${key}' at line ${idx + 1}`);
    const value = parseScalar(rawValue);
    parent[key] = value;
    if (rawValue === '') stack.push({ indent, obj: value });
  }
  return root;
}
