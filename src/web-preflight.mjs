import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveCodexHome } from './ceos.mjs';

export const DEFAULT_WEB_HEALTH_URL = 'http://127.0.0.1:17841/healthz';

function stripUtf8Bom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function retryAfterSeconds(response, body) {
  const candidates = [
    body?.retry_after_seconds,
    Number.isFinite(body?.retry_after_ms) ? body.retry_after_ms / 1000 : null
  ];
  const header = response?.headers?.get?.('retry-after');
  if (header != null && header !== '') {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) candidates.push(seconds);
    else {
      const at = Date.parse(header);
      if (Number.isFinite(at)) candidates.push(Math.max(0, (at - Date.now()) / 1000));
    }
  }
  const finite = candidates.map(Number).filter(x => Number.isFinite(x) && x >= 0);
  return finite.length ? Math.ceil(Math.max(...finite)) : null;
}

function bodySignalsRateLimit(body) {
  const status = String(body?.status ?? '').toLowerCase();
  const code = String(body?.code ?? body?.error?.code ?? '').toLowerCase();
  const detail = String(body?.reason ?? body?.message ?? body?.error?.message ?? '').toLowerCase();
  return body?.rate_limited === true ||
    status === 'rate_limited' ||
    code === '429' ||
    code === 'rate_limited' ||
    /too many requests|rate[ _-]?limit|usage limit|cooldown/.test(detail);
}

export function readHybridRoutingManifest({ homeDir = os.homedir(), codexHome } = {}) {
  const resolvedCodexHome = resolveCodexHome({ homeDir, codexHome });
  const file = path.join(resolvedCodexHome, 'ceos', 'hybrid-routing.json');
  if (!fs.existsSync(file)) return { file, exists: false, manifest: null, error: null };
  try {
    const text = stripUtf8Bom(fs.readFileSync(file, 'utf8'));
    return { file, exists: true, manifest: JSON.parse(text), error: null };
  } catch (error) {
    return { file, exists: true, manifest: null, error: error.message };
  }
}

export async function webPreflight({
  homeDir = os.homedir(),
  codexHome,
  healthUrl = process.env.CEOS_WEB_HEALTH_URL || DEFAULT_WEB_HEALTH_URL,
  timeoutMs = 1200,
  fetchImpl = globalThis.fetch
} = {}) {
  const routing = readHybridRoutingManifest({ homeDir, codexHome });
  if (routing.error) {
    return {
      status: 'NOT_CONFIGURED', enabled: false, ready: false, fallbackAllowed: true,
      reason: `invalid hybrid-routing manifest: ${routing.error}`,
      manifestFile: routing.file, healthUrl
    };
  }
  if (!routing.exists) {
    return {
      status: 'NOT_CONFIGURED', enabled: false, ready: false, fallbackAllowed: true,
      reason: 'hybrid-routing manifest is missing', manifestFile: routing.file, healthUrl
    };
  }
  if (routing.manifest?.enabled !== true) {
    return {
      status: 'DISABLED', enabled: false, ready: false, fallbackAllowed: true,
      reason: 'Web reasoning routes are disabled by CEOS hybrid-routing policy',
      manifestFile: routing.file, healthUrl
    };
  }
  // An enabled installer-generated manifest with a non-High CEOS Web route is stale.
  // Preflight must not report READY and allow silent execution on a lower Web mode.
  const managedWebRoles = new Set(['ceos_bulk_checker_web', 'ceos_reasoner_web', 'ceos_art_director_web']);
  const routes = routing.manifest?.webAgents;
  if (Array.isArray(routes) && routes.some(route => managedWebRoles.has(route?.name) && route.model !== 'chatgpt-web/high')) {
    return {
      status: 'NOT_CONFIGURED', enabled: false, ready: false, fallbackAllowed: true,
      reason: 'CEOS Web routing manifest contains a non-High managed Web route; reinstall CEOS Web agents with install-hybrid.ps1',
      manifestFile: routing.file, healthUrl
    };
  }
  if (typeof fetchImpl !== 'function') {
    return {
      status: 'UNAVAILABLE', enabled: true, ready: false, fallbackAllowed: true,
      reason: 'fetch is unavailable in this runtime', manifestFile: routing.file, healthUrl
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(healthUrl, { method: 'GET', signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch {}
    const retryAfter = retryAfterSeconds(response, body);
    if (response.status === 429 || bodySignalsRateLimit(body)) {
      return {
        status: 'RATE_LIMITED', enabled: true, ready: false, fallbackAllowed: true,
        reason: response.status === 429 ? 'health endpoint returned HTTP 429' : 'Web bridge reported an explicit rate/cooldown condition',
        manifestFile: routing.file, healthUrl, httpStatus: response.status,
        retryAfterSeconds: retryAfter
      };
    }
    if (!response.ok) {
      return {
        status: 'UNAVAILABLE', enabled: true, ready: false, fallbackAllowed: true,
        reason: `health endpoint returned HTTP ${response.status}`,
        manifestFile: routing.file, healthUrl, httpStatus: response.status
      };
    }
    const healthy = body?.status === 'ok';
    const acceptingTurns = body?.accepting_turns !== false;
    if (!healthy || !acceptingTurns) {
      return {
        status: acceptingTurns ? 'UNAVAILABLE' : 'NOT_ACCEPTING_TURNS',
        enabled: true, ready: false, fallbackAllowed: true,
        reason: !healthy ? 'health endpoint did not report status=ok' : 'Web bridge is not accepting turns',
        manifestFile: routing.file, healthUrl,
        activity: body ? {
          status: body.status ?? null,
          acceptingTurns: body.accepting_turns ?? null,
          activeHttpTurns: body.active_http_turns ?? null,
          activeBrowserTurns: body.active_browser_turns ?? null
        } : null
      };
    }
    return {
      status: 'READY', enabled: true, ready: true, fallbackAllowed: false,
      reason: 'Web reasoning bridge is healthy and accepting turns',
      manifestFile: routing.file, healthUrl,
      activity: {
        status: body.status,
        acceptingTurns: body.accepting_turns ?? true,
        activeHttpTurns: body.active_http_turns ?? null,
        activeBrowserTurns: body.active_browser_turns ?? null
      }
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE', enabled: true, ready: false, fallbackAllowed: true,
      reason: error?.name === 'AbortError' ? `health check timed out after ${timeoutMs}ms` : String(error?.message ?? error),
      manifestFile: routing.file, healthUrl
    };
  } finally {
    clearTimeout(timer);
  }
}
