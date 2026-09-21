import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveCodexHome } from './ceos.mjs';

export const DEFAULT_WEB_HEALTH_URL = 'http://127.0.0.1:17841/healthz';

function stripUtf8Bom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
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
    if (!response.ok) {
      return {
        status: 'UNAVAILABLE', enabled: true, ready: false, fallbackAllowed: true,
        reason: `health endpoint returned HTTP ${response.status}`,
        manifestFile: routing.file, healthUrl, httpStatus: response.status
      };
    }
    let body = null;
    try { body = await response.json(); } catch {}
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
