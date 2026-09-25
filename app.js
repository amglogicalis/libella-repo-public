/**
 * LIBELLA — The Universal Panopticon
 * Console Application — Dual-Mode (Local Server + GitHub Pages Direct Vault)
 *
 * Works in two modes automatically detected at runtime:
 *   1. LOCAL MODE  — served by `libella console`, hits /api/* routes on the local Node server
 *   2. PAGES MODE  — served from GitHub Pages, uses GitHub REST API directly with the stored PAT
 *                    to read/write the .libella-storage repository (same data the SDK uses)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Toast notification system (replaces all alert() calls)
// ─────────────────────────────────────────────────────────────────────────────
(function buildToastDOM() {
  if (document.getElementById('toastContainer')) return;
  const c = document.createElement('div');
  c.id = 'toastContainer';
  c.style.cssText =
    'position:fixed;bottom:1.4rem;right:1.4rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;';
  document.body.appendChild(c);
})();

function toast(msg, type = 'info', durationMs = 3500) {
  const container = document.getElementById('toastContainer');
  const colors = {
    success: { bg: 'rgba(20,219,96,0.18)', border: 'rgba(20,219,96,0.6)', icon: '✔' },
    error:   { bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.6)',  icon: '✖' },
    warn:    { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.6)', icon: '⚠' },
    info:    { bg: 'rgba(0,242,254,0.12)',  border: 'rgba(0,242,254,0.4)',  icon: 'ℹ' },
    copy:    { bg: 'rgba(20,219,96,0.18)', border: 'rgba(20,219,96,0.6)', icon: '📋' },
  };
  const c = colors[type] || colors.info;
  const el = document.createElement('div');
  el.style.cssText = `
    background:${c.bg};border:1px solid ${c.border};border-radius:10px;
    padding:0.65rem 1rem;color:#fff;font-family:var(--font-sans);font-size:0.875rem;
    backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,0.5);
    display:flex;align-items:center;gap:0.5rem;pointer-events:all;
    animation:toastIn 0.2s ease;max-width:360px;line-height:1.4;`;
  el.innerHTML = `<span style="font-size:1rem;flex-shrink:0;">${c.icon}</span><span>${escapeHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}

// CSS for toast animation
const _toastStyle = document.createElement('style');
_toastStyle.textContent = `@keyframes toastIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`;
document.head.appendChild(_toastStyle);

// ─────────────────────────────────────────────────────────────────────────────
// 1. VaultClient — Dual-Mode API Layer
//    · In LOCAL mode  → fetches from /api/* (Node.js server)
//    · In PAGES mode  → calls GitHub REST API directly using the stored PAT
// ─────────────────────────────────────────────────────────────────────────────

const VaultClient = (() => {
  let _serverAvailable = null; // null = unknown, true/false = detected
  const GH_API = 'https://api.github.com';

  function getPat()  { return localStorage.getItem('libella_vault_pat') || ''; }
  function getRepo() { return localStorage.getItem('libella_vault_repo') || ''; }
  function getUser() { return localStorage.getItem('libella_vault_user') || ''; }

  /** Check once if local server is running */
  async function detectMode() {
    if (_serverAvailable !== null) return _serverAvailable;
    try {
      const r = await fetch('/api/status', { signal: AbortSignal.timeout(1200) });
      _serverAvailable = r.ok;
    } catch {
      _serverAvailable = false;
    }
    return _serverAvailable;
  }

  /** GitHub REST: read a file from the storage repo (returns parsed JSON or null) */
  async function ghRead(path) {
    const repo = getRepo();
    const pat  = getPat();
    if (!repo || !pat) return null;
    try {
      const r = await fetch(`${GH_API}/repos/${repo}/contents/${path}`, {
        headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (!r.ok) return null;
      const data = await r.json();
      return JSON.parse(atob(data.content.replace(/\s/g, '')));
    } catch { return null; }
  }

  /** GitHub REST: write a file to the storage repo */
  async function ghWrite(path, content, commitMsg) {
    const repo = getRepo();
    const pat  = getPat();
    if (!repo || !pat) throw new Error('No auth');

    // Get current sha for update
    let sha;
    try {
      const r = await fetch(`${GH_API}/repos/${repo}/contents/${path}`, {
        headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (r.ok) { const d = await r.json(); sha = d.sha; }
    } catch {}

    const body = {
      message: commitMsg || `libella: update ${path}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    };
    if (sha) body.sha = sha;

    const r = await fetch(`${GH_API}/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`GitHub write failed: ${r.status}`);
    return true;
  }

  /** GitHub REST: list watchtowers from registry.json */
  async function ghListWatchtowers() {
    const reg = await ghRead('registry.json');
    return Array.isArray(reg) ? reg : [];
  }

  async function ghGetWatchtower(id) {
    const list = await ghListWatchtowers();
    return list.find(w => w.id === id) || null;
  }

  async function ghSaveRegistry(list) {
    return ghWrite('registry.json', list, 'libella: update registry');
  }

  async function ghCreateWatchtower(body) {
    const list = await ghListWatchtowers();
    const id = `libella_${(body.name || 'w').toLowerCase().replace(/[^a-z0-9]/g, '-')}_${Math.random().toString(16).slice(2, 10)}`;
    const ingestKey = `lbk_${Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)}`;
    const wt = {
      id, name: body.name, slug: body.slug || id,
      ingestKey, mountedLenses: [], circuitBreakers: [],
      budgetUsdMonthly: body.budgetUsdMonthly || 50,
      statusPageEnabled: body.statusPageEnabled !== false,
      statusPageAccess: body.statusPageAccess || 'public',
      createdAt: new Date().toISOString(),
    };
    list.push(wt);
    await ghSaveRegistry(list);
    return wt;
  }

  async function ghUpdateWatchtower(id, body) {
    const list = await ghListWatchtowers();
    const idx = list.findIndex(w => w.id === id);
    if (idx < 0) return null;
    Object.assign(list[idx], body);
    await ghSaveRegistry(list);
    return list[idx];
  }

  async function ghDeleteWatchtower(id) {
    const list = await ghListWatchtowers();
    const filtered = list.filter(w => w.id !== id);
    await ghSaveRegistry(filtered);
    return true;
  }

  async function ghMountLens(libId, type, name, config) {
    const list = await ghListWatchtowers();
    const idx = list.findIndex(w => w.id === libId);
    if (idx < 0) throw new Error('Watchtower not found');
    const lens = {
      id: `lens_${type}_${Math.random().toString(16).slice(2, 10)}`,
      type, name, config: config || {}, enabled: true,
      createdAt: new Date().toISOString(),
    };
    if (!list[idx].mountedLenses) list[idx].mountedLenses = [];
    list[idx].mountedLenses.push(lens);
    await ghSaveRegistry(list);
    return lens;
  }

  async function ghUpdateLens(libId, lensId, body) {
    const list = await ghListWatchtowers();
    const wIdx = list.findIndex(w => w.id === libId);
    if (wIdx < 0) return null;
    const lIdx = (list[wIdx].mountedLenses || []).findIndex(l => l.id === lensId);
    if (lIdx < 0) return null;
    Object.assign(list[wIdx].mountedLenses[lIdx], body);
    await ghSaveRegistry(list);
    return list[wIdx].mountedLenses[lIdx];
  }

  async function ghUnmountLens(libId, lensId) {
    const list = await ghListWatchtowers();
    const wIdx = list.findIndex(w => w.id === libId);
    if (wIdx < 0) return false;
    list[wIdx].mountedLenses = (list[wIdx].mountedLenses || []).filter(l => l.id !== lensId);
    await ghSaveRegistry(list);
    return true;
  }

  async function ghAddBreaker(libId, body) {
    const list = await ghListWatchtowers();
    const idx = list.findIndex(w => w.id === libId);
    if (idx < 0) throw new Error('Watchtower not found');
    const rule = {
      id: `cb_${Math.random().toString(16).slice(2, 10)}`,
      libellaId: libId,
      name: body.name,
      metric: body.metric,
      op: body.op || '>',
      threshold: Number(body.threshold),
      windowMinutes: body.windowMinutes ? Number(body.windowMinutes) : 60,
      actionType: body.actionType,
      actionTarget: body.actionTarget,
      status: 'closed',
      createdAt: new Date().toISOString(),
    };
    if (!list[idx].circuitBreakers) list[idx].circuitBreakers = [];
    list[idx].circuitBreakers.push(rule);
    await ghSaveRegistry(list);
    return rule;
  }

  async function ghListBreakers(libId) {
    const wt = await ghGetWatchtower(libId);
    return wt?.circuitBreakers || [];
  }

  async function ghUpdateBreaker(libId, ruleId, body) {
    const list = await ghListWatchtowers();
    const wIdx = list.findIndex(w => w.id === libId);
    if (wIdx < 0) return null;
    const bIdx = (list[wIdx].circuitBreakers || []).findIndex(b => b.id === ruleId);
    if (bIdx < 0) return null;
    Object.assign(list[wIdx].circuitBreakers[bIdx], body);
    await ghSaveRegistry(list);
    return list[wIdx].circuitBreakers[bIdx];
  }

  async function ghDeleteBreaker(libId, ruleId) {
    const list = await ghListWatchtowers();
    const wIdx = list.findIndex(w => w.id === libId);
    if (wIdx < 0) return false;
    list[wIdx].circuitBreakers = (list[wIdx].circuitBreakers || []).filter(b => b.id !== ruleId);
    await ghSaveRegistry(list);
    return true;
  }

  async function ghSetAiModel(libId, payload) {
    const list = await ghListWatchtowers();
    const idx = list.findIndex(w => w.id === libId);
    if (idx < 0) throw new Error('Watchtower not found');
    if (!list[idx].customAiPricing) list[idx].customAiPricing = {};
    list[idx].customAiPricing[payload.model] = {
      inputPer1M: Number(payload.inputPer1M ?? payload.inputPricePer1M ?? 0),
      outputPer1M: Number(payload.outputPer1M ?? payload.outputPricePer1M ?? 0),
      ...(payload.cachedInputPer1M !== undefined && { cachedInputPer1M: Number(payload.cachedInputPer1M) }),
      ...(payload.provider && { provider: payload.provider }),
      ...(payload.monthlyBudgetCap && { monthlyBudgetCap: Number(payload.monthlyBudgetCap) }),
    };
    await ghSaveRegistry(list);
    return true;
  }

  async function ghRemoveAiModel(libId, model) {
    const list = await ghListWatchtowers();
    const idx = list.findIndex(w => w.id === libId);
    if (idx < 0) return false;
    if (list[idx].customAiPricing) delete list[idx].customAiPricing[model];
    await ghSaveRegistry(list);
    return true;
  }

  async function ghGetAiModels(libId) {
    const wt = await ghGetWatchtower(libId);
    return { ...(wt?.customAiPricing || {}) };
  }

  // ── Events (read hot events from vault/events/ path in GH repo) ──
  async function ghReadEvents(libId, range) {
    const events = await ghRead(`vault/${libId}/events.json`) || [];
    const now = Date.now();
    const msMap = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
    const windowMs = msMap[range] || msMap['24h'];
    return events.filter(e => new Date(e.timestamp || e.createdAt || 0).getTime() > now - windowMs);
  }

  async function ghAppendEvent(libId, event) {
    const existing = await ghRead(`vault/${libId}/events.json`) || [];
    existing.push({ ...event, timestamp: event.timestamp || new Date().toISOString() });
    // Keep last 500 events
    const trimmed = existing.slice(-500);
    await ghWrite(`vault/${libId}/events.json`, trimmed, `libella: ingest event to ${libId}`);
  }

  // ── Compute vitals from raw events (pages mode only) ──
  function computeVitalsFromEvents(events) {
    const metrics = events.filter(e => e.type === 'metric');
    if (metrics.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, rps: 0, count: 0, errorCount: 0, errorRatePercent: 0, buckets: [] };
    const latencies = metrics.map(e => e.value || 0).sort((a, b) => a - b);
    const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
    const p = (pct) => latencies[Math.floor(latencies.length * pct / 100)] || 0;
    const errors = metrics.filter(e => e.isError || (e.statusCode && e.statusCode >= 500));
    const rps = metrics.length > 0 ? (metrics.length / 3600).toFixed(2) : 0;
    // Build 12 time buckets
    const sorted = [...metrics].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const bucketCount = 12;
    const buckets = [];
    if (sorted.length >= 1) {
      const tMin = new Date(sorted[0].timestamp).getTime();
      const tMax = new Date(sorted[sorted.length - 1].timestamp).getTime() || tMin + 1;
      const step = Math.max((tMax - tMin) / bucketCount, 1);
      for (let i = 0; i < bucketCount; i++) {
        const bStart = tMin + i * step;
        const bEnd = bStart + step;
        const slice = sorted.filter(e => {
          const t = new Date(e.timestamp).getTime();
          return t >= bStart && t < bEnd;
        });
        const bAvg = slice.length ? Math.round(slice.reduce((s, e) => s + (e.value || 0), 0) / slice.length) : 0;
        buckets.push({ avgLatency: bAvg, count: slice.length });
      }
    }
    return {
      avg, p50: p(50), p95: p(95), p99: p(99),
      rps, count: metrics.length,
      errorCount: errors.length,
      errorRatePercent: metrics.length ? parseFloat((errors.length / metrics.length * 100).toFixed(1)) : 0,
      buckets,
    };
  }

  function computeFinOpsFromEvents(events, range) {
    const costs = events.filter(e => e.type === 'cost' || e.type === 'ai_cost');
    const totalCostUsd = costs.reduce((s, e) => s + (e.costUsd || 0), 0);
    const days = { '1h': 1/24, '24h': 1, '7d': 7, '30d': 30 }[range] || 1;
    const dailyCostUsd = (totalCostUsd / days).toFixed(4);
    const projectedMonthlyCostUsd = (Number(dailyCostUsd) * 30).toFixed(2);

    const byModel = {};
    const byProvider = {};
    let totalIn = 0, totalOut = 0;
    for (const e of costs) {
      const model = e.model || 'unknown';
      const prov = e.provider || 'other';
      if (!byModel[model]) byModel[model] = { costUsd: 0, inputTokens: 0, outputTokens: 0 };
      byModel[model].costUsd = parseFloat((byModel[model].costUsd + (e.costUsd || 0)).toFixed(6));
      byModel[model].inputTokens += e.inputTokens || 0;
      byModel[model].outputTokens += e.outputTokens || 0;
      byProvider[prov] = parseFloat(((byProvider[prov] || 0) + (e.costUsd || 0)).toFixed(6));
      totalIn += e.inputTokens || 0;
      totalOut += e.outputTokens || 0;
    }

    return {
      totalCostUsd: totalCostUsd.toFixed(4),
      dailyCostUsd,
      projectedMonthlyCostUsd,
      aiTokensTotal: { input: totalIn, output: totalOut },
      byModel,
      byProvider,
    };
  }

  function computeLogsFromEvents(events, { level, search, limit } = {}) {
    let logs = events.filter(e => e.type === 'log');
    if (level) logs = logs.filter(l => (l.level || 'info').toLowerCase() === level);
    if (search) {
      const s = search.toLowerCase();
      logs = logs.filter(l => JSON.stringify(l).toLowerCase().includes(s));
    }
    return logs.slice(-( limit || 200)).reverse();
  }

  function computePulseFromEvents(events) {
    const pulses = events.filter(e => e.type === 'pulse' || e.status);
    const last = pulses[pulses.length - 1];
    return {
      overallStatus: last?.status || 'operational',
      activeIncidents: [],
      uptime: 100,
    };
  }

  // ── Public API ──
  async function call(method, path, body) {
    const isServer = await detectMode();

    if (isServer) {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body && method !== 'GET') opts.body = JSON.stringify(body);
      const r = await fetch(path, opts);
      if (!r.ok && r.status !== 404) return null;
      try { return await r.json(); } catch { return null; }
    }

    // ── Pages / direct GitHub mode ──
    return null; // fallback handled per-endpoint below
  }

  return {
    detectMode,
    async listWatchtowers() {
      if (await detectMode()) {
        return (await call('GET', '/api/libellas')) || [];
      }
      return ghListWatchtowers();
    },
    async createWatchtower(body) {
      if (await detectMode()) return call('POST', '/api/libellas', body);
      return ghCreateWatchtower(body);
    },
    async updateWatchtower(id, body) {
      if (await detectMode()) return call('PUT', `/api/libellas/${id}`, body);
      return ghUpdateWatchtower(id, body);
    },
    async deleteWatchtower(id) {
      if (await detectMode()) return call('DELETE', `/api/libellas/${id}`);
      return ghDeleteWatchtower(id);
    },
    async getVitals(libId, range) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/vitals?range=${range}`);
      const events = await ghReadEvents(libId, range);
      return computeVitalsFromEvents(events);
    },
    async getLogs(libId, range, level, search, limit) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/logs?range=${range}&level=${level||''}&search=${encodeURIComponent(search||'')}&limit=${limit||100}`);
      const events = await ghReadEvents(libId, range);
      return computeLogsFromEvents(events, { level, search, limit });
    },
    async getFinOps(libId, range) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/finops?range=${range}`);
      const events = await ghReadEvents(libId, range);
      return computeFinOpsFromEvents(events, range);
    },
    async getPulse(libId) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/pulse`);
      const events = await ghReadEvents(libId, '24h');
      return computePulseFromEvents(events);
    },
    async createIncident(libId, body) {
      if (await detectMode()) return call('POST', `/api/libellas/${libId}/incidents`, body);
      // In pages mode, store incident as a pulse event
      const inc = { id: `inc_${Date.now()}`, ...body, timestamp: new Date().toISOString(), type: 'pulse', status: 'degraded' };
      await ghAppendEvent(libId, inc);
      return inc;
    },
    async resolveIncident(libId, incId, message) {
      if (await detectMode()) return call('POST', `/api/libellas/${libId}/incidents/${incId}/resolve`, { message });
      return { success: true };
    },
    async listBreakers(libId) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/breakers`) || [];
      return ghListBreakers(libId);
    },
    async createBreaker(libId, body) {
      if (await detectMode()) return call('POST', `/api/libellas/${libId}/breakers`, { ...body, libellaId: libId });
      return ghAddBreaker(libId, body);
    },
    async updateBreaker(libId, ruleId, body) {
      if (await detectMode()) return call('PUT', `/api/libellas/${libId}/breakers/${ruleId}`, body);
      return ghUpdateBreaker(libId, ruleId, body);
    },
    async deleteBreaker(libId, ruleId) {
      if (await detectMode()) return call('DELETE', `/api/libellas/${libId}/breakers/${ruleId}`);
      return ghDeleteBreaker(libId, ruleId);
    },
    async evalBreakers(libId) {
      if (await detectMode()) return call('POST', `/api/libellas/${libId}/breakers/evaluate`);
      return [];
    },
    async listLenses(libId) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/lenses`) || [];
      const wt = await ghGetWatchtower(libId);
      return wt?.mountedLenses || [];
    },
    async mountLens(libId, type, name, config) {
      if (await detectMode()) return call('POST', `/api/libellas/${libId}/lenses`, { type, name, config });
      return ghMountLens(libId, type, name, config);
    },
    async updateLens(libId, lensId, body) {
      if (await detectMode()) return call('PUT', `/api/libellas/${libId}/lenses/${lensId}`, body);
      return ghUpdateLens(libId, lensId, body);
    },
    async unmountLens(libId, lensId) {
      if (await detectMode()) return call('DELETE', `/api/libellas/${libId}/lenses/${lensId}`);
      return ghUnmountLens(libId, lensId);
    },
    async listAiModels(libId) {
      if (await detectMode()) return call('GET', `/api/libellas/${libId}/ai-models`) || {};
      return ghGetAiModels(libId);
    },
    async setAiModel(libId, payload) {
      if (await detectMode()) return call('POST', `/api/libellas/${libId}/ai-models`, payload);
      return ghSetAiModel(libId, payload);
    },
    async removeAiModel(libId, model) {
      if (await detectMode()) return call('DELETE', `/api/libellas/${libId}/ai-models/${encodeURIComponent(model)}`);
      return ghRemoveAiModel(libId, model);
    },
    async ingest(libId, lensType, payload) {
      if (await detectMode()) {
        return call('POST', '/api/ingest', { lensType, payload, libellaId: libId });
      }
      // In pages mode: parse locally and store events
      const event = {
        id: `evt_${Date.now()}`,
        libellaId: libId,
        type: lensType === 'ai' ? 'cost' : (payload.level ? 'log' : 'metric'),
        ...payload,
        timestamp: new Date().toISOString(),
      };
      await ghAppendEvent(libId, event);
      return { success: true, ingested: 1 };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// 2. App State
// ─────────────────────────────────────────────────────────────────────────────
let currentLibellaId = 'default';
let currentTimeRange = '24h';
let activeLibellas = [];
let allBreakers = [];

const libellaSelect  = document.getElementById('libellaSelect');
const rangeSelect    = document.getElementById('rangeSelect');
const btnRefresh     = document.getElementById('btnRefresh');
const tabButtons     = document.querySelectorAll('.tab-btn');
const tabPanes       = document.querySelectorAll('.tab-pane');

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupModals();
  setupAuth();
  setupSimulator();
  setupMountLensDynamicFields();

  // Show detected mode in topbar once server check completes
  VaultClient.detectMode().then(isLocal => {
    const modeEl = document.getElementById('consoleModeTag');
    if (modeEl) {
      modeEl.textContent  = isLocal ? 'local' : 'pages';
      modeEl.title = isLocal ? 'Servidor local detectado — API /api/* activa' : 'GitHub Pages — operando directamente contra GitHub API';
      modeEl.style.color  = isLocal ? 'var(--primary)' : '#00f2fe';
    }
  });

  const isAuthenticated = await checkAuthStatus();
  if (isAuthenticated) {
    await loadWatchtowers();
    await refreshAll();
  }

  setInterval(() => {
    if (!document.hidden && localStorage.getItem('libella_vault_pat')) {
      refreshAll(false);
    }
  }, 15000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tab Navigation
// ─────────────────────────────────────────────────────────────────────────────
function setupTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
      if (targetId === 'tab-vitals')    drawVitalsChart();
      if (targetId === 'tab-ommatidia') loadMountedLenses();
    });
  });

  rangeSelect?.addEventListener('change', () => {
    currentTimeRange = rangeSelect.value;
    refreshAll();
  });

  libellaSelect?.addEventListener('change', () => {
    currentLibellaId = libellaSelect.value;
    updateConfigTab();
    refreshAll();
  });

  btnRefresh?.addEventListener('click', () => refreshAll(true));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Watchtowers
// ─────────────────────────────────────────────────────────────────────────────
async function loadWatchtowers() {
  try {
    activeLibellas = await VaultClient.listWatchtowers();
    libellaSelect.innerHTML = '';
    for (const w of activeLibellas) {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.innerText = w.name;
      libellaSelect.appendChild(opt);
    }
    if (activeLibellas.length > 0) {
      if (!activeLibellas.some((w) => w.id === currentLibellaId)) {
        currentLibellaId = activeLibellas[0].id;
      }
      libellaSelect.value = currentLibellaId;
      updateConfigTab();
    }
  } catch (err) {
    console.warn('loadWatchtowers error', err);
    if (activeLibellas.length === 0) {
      const u = localStorage.getItem('libella_vault_user') || 'user';
      activeLibellas = [{
        id: 'default', name: `Default (@${u})`, slug: 'default',
        ingestKey: `lbk_default`, budgetUsdMonthly: 50,
        statusPageEnabled: true, statusPageAccess: 'public', mountedLenses: [],
      }];
      libellaSelect.innerHTML = '<option value="default">Default Watchtower</option>';
      currentLibellaId = 'default';
      updateConfigTab();
    }
  }
}

async function refreshAll(showLoading = true) {
  if (showLoading) btnRefresh.innerText = '⌛...';
  await Promise.all([
    loadVitals(),
    loadLogs(),
    loadFinOps(),
    loadBreakers(),
    loadMountedLenses(),
    loadIncidents(),
  ]);
  if (showLoading) btnRefresh.innerText = '🔄 Actualizar';
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Vitals
// ─────────────────────────────────────────────────────────────────────────────
let latestVitals = null;

async function loadVitals() {
  try {
    const data = await VaultClient.getVitals(currentLibellaId, currentTimeRange);
    if (!data) return;
    latestVitals = data;
    document.getElementById('valAvgLatency').innerText = `${data.avg} ms`;
    document.getElementById('valP95Latency').innerText = `${data.p95} ms`;
    document.getElementById('valP50').innerText        = `${data.p50}ms`;
    document.getElementById('valP99').innerText        = `${data.p99}ms`;
    document.getElementById('valRps').innerText        = `${data.rps}`;
    document.getElementById('valCount').innerText      = `${data.count}`;
    document.getElementById('valErrorRate').innerText  = `${data.errorRatePercent}%`;
    document.getElementById('valErrorCount').innerText = `${data.errorCount}`;
    drawVitalsChart();
  } catch {}
}

function drawVitalsChart() {
  const canvas = document.getElementById('vitalsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const rect  = canvas.getBoundingClientRect();
  canvas.width  = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += h / 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const hasData = latestVitals && latestVitals.count > 0 && latestVitals.buckets?.length > 0;

  if (!hasData) {
    ctx.beginPath();
    ctx.moveTo(0, h - 25); ctx.lineTo(w, h - 25);
    ctx.strokeStyle = 'rgba(20,219,96,0.3)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '13px Outfit,sans-serif';
    ctx.fillStyle = 'rgba(156,163,175,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('Sin métricas registradas en este intervalo', w / 2, h / 2);
    return;
  }

  const buckets = latestVitals.buckets;
  const maxVal  = Math.max(...buckets.map(b => b.avgLatency || 1), 20);
  const step    = w / (buckets.length - 1 || 1);
  const points  = buckets.map((b, i) => ({
    x: i * step,
    y: h - ((b.avgLatency || 0) / maxVal) * (h * 0.75) - 20,
  }));

  const bezier = (pts) => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cx, pts[i - 1].y, cx, pts[i].y, pts[i].x, pts[i].y);
    }
  };

  // Fill
  ctx.beginPath(); bezier(points);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(20,219,96,0.35)'); grad.addColorStop(1, 'rgba(20,219,96,0)');
  ctx.fillStyle = grad; ctx.fill();

  // Stroke
  ctx.beginPath(); bezier(points);
  ctx.strokeStyle = '#14db60'; ctx.lineWidth = 2.5; ctx.stroke();

  // Dots
  for (const pt of points) {
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#14db60'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Incidents (Pulse)
// ─────────────────────────────────────────────────────────────────────────────
async function loadIncidents() {
  try {
    const data = await VaultClient.getPulse(currentLibellaId);
    if (!data) return;
    const container = document.getElementById('activeIncidentsContainer');
    const incs = data.activeIncidents || [];
    if (incs.length === 0) {
      container.innerHTML = `<div style="color:var(--text-gray);font-size:0.85rem;padding:0.4rem 0;">✔ Todos los sistemas operativos (Estado: <strong style="color:var(--primary);">${(data.overallStatus || 'OPERATIONAL').toUpperCase()}</strong>). Sin incidentes activos.</div>`;
      return;
    }
    container.innerHTML = incs.map(inc => {
      const sevColor = inc.severity === 'critical' ? 'var(--danger)' : inc.severity === 'major' ? 'var(--warning)' : '#38bdf8';
      const dateStr  = (inc.timestamp || '').slice(0, 19).replace('T', ' ') || 'Reciente';
      return `<div style="background:var(--bg-surface);border:1px solid ${sevColor};padding:0.75rem 1rem;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;color:#fff;"><span class="badge" style="background:${sevColor};color:#000;margin-right:0.4rem;">${(inc.severity||'MAJOR').toUpperCase()}</span>${escapeHtml(inc.title)}</div>
          <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.25rem;">${escapeHtml(inc.message||inc.description||'')}</div>
          <div style="font-size:0.75rem;color:var(--text-gray);margin-top:0.25rem;">Declarado: ${dateStr}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openResolveIncidentModal('${inc.id}','${escapeHtml(inc.title)}')">Resolver</button>
      </div>`;
    }).join('');
  } catch {}
}

window.openResolveIncidentModal = (incId, title) => {
  document.getElementById('resolveIncId').value = incId;
  document.getElementById('resolveIncText').innerText = `Vas a marcar como resuelto: "${title}"`;
  document.getElementById('modalResolveIncident').style.display = 'flex';
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Logs
// ─────────────────────────────────────────────────────────────────────────────
let allLogs = [];

async function loadLogs() {
  const level  = document.getElementById('logLevelSelect')?.value || '';
  const search = document.getElementById('logSearchInput')?.value || '';
  try {
    const data = await VaultClient.getLogs(currentLibellaId, currentTimeRange, level, search);
    if (!data) return;
    allLogs = data;
    renderLogs(allLogs);
  } catch {}
}

function renderLogs(logs) {
  const stream = document.getElementById('logsStream');
  document.getElementById('logsCountBadge').innerText = `${logs.length} trazas`;
  if (logs.length === 0) {
    stream.innerHTML = '<div style="color:var(--text-gray);padding:1rem;text-align:center;">No hay registros para este filtro</div>';
    return;
  }
  stream.innerHTML = logs.map(l => {
    const time = (l.timestamp || '').slice(11, 19) || 'now';
    const lvl  = (l.level || 'info').toLowerCase();
    const tags = l.tags ? ` <span style="color:var(--text-gray);font-size:0.75rem;">${JSON.stringify(l.tags)}</span>` : '';
    return `<div class="log-row">
      <span class="log-time">${time}</span>
      <span class="log-level ${lvl}">[${(l.level||'info').toUpperCase()}]</span>
      <span class="log-msg">${escapeHtml(l.message||l.msg||'')}${tags}</span>
    </div>`;
  }).join('');
}

document.getElementById('logSearchInput')?.addEventListener('input', () => loadLogs());
document.getElementById('logLevelSelect')?.addEventListener('change', () => loadLogs());

// ─────────────────────────────────────────────────────────────────────────────
// 9. FinOps — fixed per-model token display
// ─────────────────────────────────────────────────────────────────────────────
async function loadFinOps() {
  try {
    const f = await VaultClient.getFinOps(currentLibellaId, currentTimeRange);
    if (!f) return;
    document.getElementById('valTotalCost').innerText     = `$${f.totalCostUsd}`;
    document.getElementById('valDailyCost').innerText     = `$${f.dailyCostUsd}/d`;
    document.getElementById('valProjectedCost').innerText = `$${f.projectedMonthlyCostUsd}/m`;
    document.getElementById('valAiTokens').innerText      = (f.aiTokensTotal.input + f.aiTokensTotal.output).toLocaleString();
    document.getElementById('valTokensIn').innerText      = f.aiTokensTotal.input.toLocaleString();
    document.getElementById('valTokensOut').innerText     = f.aiTokensTotal.output.toLocaleString();

    // ── AI table — per-model tokens (fix: use model-specific values, not totals) ──
    const tbody  = document.getElementById('aiTableBody');
    const models = Object.entries(f.byModel || {});
    if (models.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;text-align:center;color:var(--text-gray);">Sin eventos de IA registrados</td></tr>';
    } else {
      const totalCost = models.reduce((s, [, d]) => s + (d.costUsd || 0), 0) || 1;
      tbody.innerHTML = models.map(([m, d]) => {
        const pct = ((d.costUsd / totalCost) * 100).toFixed(1);
        const tokens = (d.inputTokens + d.outputTokens).toLocaleString();
        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
          <td style="padding:0.75rem;font-weight:600;color:#fff;">${escapeHtml(m)}</td>
          <td style="padding:0.75rem;font-family:var(--font-mono);">↑ ${d.inputTokens?.toLocaleString()||0} / ↓ ${d.outputTokens?.toLocaleString()||0}</td>
          <td style="padding:0.75rem;font-family:var(--font-mono);">${tokens}</td>
          <td style="padding:0.75rem;color:var(--primary);font-family:var(--font-mono);">$${d.costUsd?.toFixed(6)||0}</td>
          <td style="padding:0.75rem;">
            <div style="background:rgba(20,219,96,0.12);border-radius:4px;overflow:hidden;width:80px;height:8px;">
              <div style="background:var(--primary);height:100%;width:${pct}%;"></div>
            </div>
            <span style="font-size:0.72rem;color:var(--text-muted);">${pct}%</span>
          </td>
        </tr>`;
      }).join('');
    }

    // ── Provider breakdown ──
    const provBox = document.getElementById('providerBreakdownContainer');
    const provs   = Object.entries(f.byProvider || {});
    provBox.innerHTML = provs.length === 0
      ? '<div style="color:var(--text-gray);font-size:0.84rem;">Sin datos por proveedor</div>'
      : provs.map(([p, amt]) => `
        <div style="background:var(--bg-surface);border:1px solid var(--primary-border);padding:0.8rem 1.2rem;border-radius:10px;min-width:140px;">
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">${escapeHtml(p)}</div>
          <div style="font-size:1.25rem;font-weight:800;color:#fff;font-family:var(--font-mono);margin-top:0.2rem;">$${amt}</div>
        </div>`).join('');

    // ── Active AI model rates bar ──
    const pricingBar = document.getElementById('activeAiPricingBar');
    if (pricingBar) {
      try {
        const allRates = await VaultClient.listAiModels(currentLibellaId);
        const keys = Object.keys(allRates).filter(k => k !== 'default').slice(0, 8);
        pricingBar.innerHTML = keys.map(k => {
          const r = allRates[k];
          const prov = r.provider ? `[${r.provider.toUpperCase()}] ` : '';
          const cached = r.cachedInputPer1M !== undefined ? ` | Cache: $${r.cachedInputPer1M}` : '';
          const cap = r.monthlyBudgetCap ? ` | Cap: $${r.monthlyBudgetCap}/m` : '';
          return `<span class="ai-preset-tag" title="In: $${r.inputPer1M} | Out: $${r.outputPer1M}${cached}${cap}">
            <span>🤖</span> <strong>${escapeHtml(prov + k)}</strong>: In $${r.inputPer1M} / Out $${r.outputPer1M}${cached}
            <button onclick="removeAiModel('${escapeHtml(k)}')" title="Eliminar" style="background:none;border:none;cursor:pointer;color:var(--danger);margin-left:0.3rem;font-size:0.85rem;padding:0;">✖</button>
          </span>`;
        }).join('');
      } catch {}
    }
  } catch {}
}

window.removeAiModel = async (model) => {
  if (!confirm(`¿Eliminar la tarifa personalizada del modelo '${model}'?`)) return;
  await VaultClient.removeAiModel(currentLibellaId, model);
  await loadFinOps();
  toast(`Modelo '${model}' eliminado`, 'success');
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. Circuit Breakers — with windowMinutes
// ─────────────────────────────────────────────────────────────────────────────
async function loadBreakers() {
  try {
    const list = await VaultClient.listBreakers(currentLibellaId);
    allBreakers = list || [];
    const tbody = document.getElementById('breakersTableBody');
    if (allBreakers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:1rem;text-align:center;color:var(--text-gray);">No hay disyuntores activos</td></tr>';
      return;
    }
    tbody.innerHTML = allBreakers.map(b => {
      const isTripped = b.status === 'tripped';
      const stBadge = isTripped
        ? '<span class="badge badge-danger">DISPARADO</span>'
        : '<span class="badge badge-success">CERRADO</span>';
      const last = b.lastTriggeredAt ? b.lastTriggeredAt.slice(11, 19) : 'Nunca';
      const win  = b.windowMinutes ? `${b.windowMinutes}m` : '60m';
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="padding:0.6rem;">${stBadge}</td>
        <td style="padding:0.6rem;font-weight:600;color:#fff;">${escapeHtml(b.name)}</td>
        <td style="padding:0.6rem;font-family:var(--font-mono);">${b.metric} ${b.op} ${b.threshold}</td>
        <td style="padding:0.6rem;color:var(--text-muted);">${win}</td>
        <td style="padding:0.6rem;text-transform:uppercase;">${b.actionType}</td>
        <td style="padding:0.6rem;color:var(--text-muted);font-size:0.8rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.actionTarget)}</td>
        <td style="padding:0.6rem;color:var(--text-gray);">${last}</td>
        <td style="padding:0.6rem;text-align:right;">
          <button class="btn btn-ghost btn-sm" onclick="openEditBreakerModal('${b.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteBreaker('${b.id}')" title="Eliminar" style="color:var(--danger);">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch {}
}

window.openEditBreakerModal = (ruleId) => {
  const b = allBreakers.find(r => r.id === ruleId);
  if (!b) return;
  document.getElementById('editBrkId').value        = b.id;
  document.getElementById('editBrkName').value      = b.name;
  document.getElementById('editBrkMetric').value    = b.metric;
  document.getElementById('editBrkThreshold').value = b.threshold;
  document.getElementById('editBrkActionType').value = b.actionType;
  document.getElementById('editBrkTarget').value    = b.actionTarget;
  document.getElementById('editBrkWindow').value    = b.windowMinutes || 60;
  document.getElementById('modalEditBreaker').style.display = 'flex';
};

window.deleteBreaker = async (ruleId) => {
  if (!confirm(`¿Eliminar el disyuntor '${ruleId}'?`)) return;
  try {
    await VaultClient.deleteBreaker(currentLibellaId, ruleId);
    await loadBreakers();
    toast('Disyuntor eliminado', 'success');
  } catch (err) { toast('Error al eliminar breaker: ' + err.message, 'error'); }
};

document.getElementById('btnEvalBreakers')?.addEventListener('click', async () => {
  try {
    const results = await VaultClient.evalBreakers(currentLibellaId);
    await loadBreakers();
    toast(`${(results||[]).length} reglas evaluadas`, 'info');
  } catch {}
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Lenses (Ommatidia) — Full CRUD with real per-type config
// ─────────────────────────────────────────────────────────────────────────────
async function loadMountedLenses() {
  const container = document.getElementById('mountedLensesList');
  if (!container) return;

  const currentW = activeLibellas.find(w => w.id === currentLibellaId);
  const host = window.location.origin || 'http://localhost:4578';
  const key  = currentW?.ingestKey || 'lbk_live';

  let lenses = [];
  try {
    lenses = await VaultClient.listLenses(currentLibellaId) || [];
  } catch {
    lenses = currentW?.mountedLenses || [];
  }

  if (!lenses || lenses.length === 0) {
    container.innerHTML = `<div style="background:var(--bg-surface);border:1px dashed var(--primary-border);border-radius:10px;padding:1.5rem;text-align:center;">
      <p style="color:var(--text-gray);font-size:0.9rem;margin-bottom:0.8rem;">No hay lentes montadas en este Watchtower.</p>
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('modalMountLens').style.display='flex'">+ Montar Lente (Vercel, AWS, Upstash, IA, OTel)</button>
    </div>`;
    return;
  }

  container.innerHTML = lenses.map(l => {
    const ingestUrl = `${host}/api/ingest?key=${key}&lens=${l.id}&type=${l.type}`;
    const cfg = l.config || {};

    const details = [];
    if (l.type === 'vercel') {
      if (cfg.vercelProjectId)  details.push(`Project: <code>${escapeHtml(cfg.vercelProjectId)}</code>`);
      if (cfg.vercelDrainId)    details.push(`Drain ID: <code>${escapeHtml(cfg.vercelDrainId)}</code>`);
      if (cfg.vercelEnvironment) details.push(`Entorno: <code>${cfg.vercelEnvironment}</code>`);
      if (cfg.webhookSecret)    details.push(`Secret: <code>••••••••</code>`);
    } else if (l.type === 'aws' || l.type === 'cloud') {
      if (cfg.awsRegion)        details.push(`Región: <code>${escapeHtml(cfg.awsRegion)}</code>`);
      if (cfg.awsLogGroupName)  details.push(`Log Group: <code>${escapeHtml(cfg.awsLogGroupName)}</code>`);
      if (cfg.awsSnsTopicArn)   details.push(`SNS ARN: <code>${escapeHtml(cfg.awsSnsTopicArn)}</code>`);
      if (cfg.s3Bucket)         details.push(`S3: <code>${escapeHtml(cfg.s3Bucket)}</code>`);
    } else if (l.type === 'upstash') {
      if (cfg.upstashRestUrl)       details.push(`REST URL: <code>${escapeHtml(cfg.upstashRestUrl)}</code>`);
      if (cfg.upstashDatabaseName)  details.push(`DB: <code>${escapeHtml(cfg.upstashDatabaseName)}</code>`);
      if (cfg.upstashReadToken)     details.push(`Token: <code>••••••••</code>`);
    } else if (l.type === 'ai') {
      if (cfg.aiProvider)      details.push(`Provider: <code>${escapeHtml(cfg.aiProvider)}</code>`);
      if (cfg.aiDefaultModel)  details.push(`Model: <code>${escapeHtml(cfg.aiDefaultModel)}</code>`);
      if (cfg.aiApiKey)        details.push(`API Key: <code>••••••••</code>`);
      if (cfg.aiProxyBaseUrl)  details.push(`Proxy: <code>${escapeHtml(cfg.aiProxyBaseUrl)}</code>`);
    } else if (l.type === 'otel' || l.type === 'otlp') {
      if (cfg.otlpProtocol)    details.push(`Protocolo: <code>${escapeHtml(cfg.otlpProtocol)}</code>`);
      if (cfg.otlpPort)        details.push(`Puerto: <code>${cfg.otlpPort}</code>`);
      if (cfg.otlpServiceName) details.push(`Servicio: <code>${escapeHtml(cfg.otlpServiceName)}</code>`);
    } else if (l.type === 'terra') {
      if (cfg.terraAppName)      details.push(`App Terra: <code>${escapeHtml(cfg.terraAppName)}</code>`);
      if (cfg.terraStorageVault) details.push(`Vault: <code>${escapeHtml(cfg.terraStorageVault)}</code>`);
    } else {
      if (cfg.byolAuthHeader)  details.push(`Auth: <code>${escapeHtml(cfg.byolAuthHeader)}</code>`);
      if (cfg.byolLatencyField) details.push(`Latencia: <code>${escapeHtml(cfg.byolLatencyField)}</code>`);
      if (cfg.byolErrorField)  details.push(`Error: <code>${escapeHtml(cfg.byolErrorField)}</code>`);
    }

    const detailsStr = details.length > 0
      ? details.join(' &bull; ')
      : '<span style="color:var(--text-gray);">Configuración por defecto — listo para ingesta HTTP</span>';

    let guideSnippet = '';
    if (l.type === 'vercel') {
      guideSnippet = `// En Vercel: Project Settings → Log Drains → Add Log Drain (JSON)\nURL: ${ingestUrl}\nSecret: ${cfg.webhookSecret || '(Opcional)'}`;
    } else if (l.type === 'aws' || l.type === 'cloud') {
      guideSnippet = `# AWS CLI Subscription Filter:\naws logs put-subscription-filter \\\n  --log-group-name "${cfg.awsLogGroupName || '/aws/lambda/my-service'}" \\\n  --filter-name "LibellaFilter" \\\n  --destination-arn "${cfg.awsSnsTopicArn || 'arn:aws:sns:...'}" \\\n  --filter-pattern ""`;
    } else if (l.type === 'ai') {
      guideSnippet = `// En tu SDK de Node / Edge:\nawait libella.aiCost({\n  model: '${cfg.aiDefaultModel || 'gpt-4o'}',\n  inputTokens: 500, outputTokens: 120,\n  libellaId: '${currentLibellaId}'\n});`;
    } else if (l.type === 'otel' || l.type === 'otlp') {
      guideSnippet = `# OpenTelemetry Collector config:\nexporters:\n  otlphttp:\n    endpoint: "${ingestUrl}"\n    headers:\n      x-libella-id: "${currentLibellaId}"`;
    } else {
      guideSnippet = `# Ingesta directa vía cURL:\ncurl -X POST "${ingestUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"api_latency_ms","value":142,"unit":"ms"}'`;
    }

    const enabledBadge = l.enabled !== false
      ? '<span class="badge badge-success">Activa</span>'
      : '<span class="badge" style="background:rgba(239,68,68,0.15);color:var(--danger);">Desactivada</span>';

    return `<div style="background:var(--bg-surface);border:1px solid var(--primary-border);padding:1rem 1.2rem;border-radius:12px;margin-bottom:0.8rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;">
        <div>
          <div style="font-weight:700;color:#fff;font-size:1rem;display:flex;align-items:center;gap:0.5rem;">
            <span>${escapeHtml(l.name)}</span>
            <span class="badge" style="background:rgba(20,219,96,0.15);color:var(--primary);font-family:var(--font-mono);font-size:0.75rem;">${l.type.toUpperCase()}</span>
            ${enabledBadge}
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:0.25rem;">ID: ${l.id}</div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick="toggleLensGuide('${l.id}')">ℹ️ Guía</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditLensModal('${l.id}')">✏️ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleLensEnabled('${l.id}',${l.enabled!==false})" title="${l.enabled!==false?'Desactivar':'Activar'}">${l.enabled!==false?'⏸':'▶'}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteLens('${l.id}')" style="color:var(--danger);">🗑️</button>
        </div>
      </div>
      <div style="margin-top:0.8rem;font-size:0.82rem;color:#cbd5e1;background:rgba(0,0,0,0.3);padding:0.6rem 0.8rem;border-radius:8px;border:1px solid rgba(255,255,255,0.04);">${detailsStr}</div>
      <div style="margin-top:0.8rem;">
        <label style="font-size:0.74rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;">Webhook / Ingestion URL:</label>
        <div style="display:flex;gap:0.4rem;margin-top:0.25rem;">
          <input type="text" class="search-input" readonly value="${ingestUrl}" id="url_${l.id}" style="font-family:var(--font-mono);font-size:0.78rem;width:100%;color:var(--primary);">
          <button class="btn btn-primary btn-sm" onclick="copyToClipboard('url_${l.id}')">📋 Copiar</button>
        </div>
      </div>
      <div id="guide_${l.id}" style="display:none;margin-top:0.8rem;background:#020604;border:1px solid var(--primary-border);border-radius:8px;padding:0.8rem;">
        <div style="font-size:0.78rem;font-weight:700;color:var(--primary);margin-bottom:0.4rem;">Instrucciones de Integración:</div>
        <pre style="margin:0;font-family:var(--font-mono);font-size:0.76rem;color:#86efac;overflow-x:auto;white-space:pre-wrap;">${escapeHtml(guideSnippet)}</pre>
      </div>
    </div>`;
  }).join('');
}

window.toggleLensGuide = (lensId) => {
  const el = document.getElementById(`guide_${lensId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.toggleLensEnabled = async (lensId, currentlyEnabled) => {
  try {
    await VaultClient.updateLens(currentLibellaId, lensId, { enabled: !currentlyEnabled });
    await loadMountedLenses();
    toast(`Lente ${currentlyEnabled ? 'desactivada' : 'activada'}`, 'info');
  } catch (err) { toast('Error al actualizar lente: ' + err.message, 'error'); }
};

window.copyToClipboard = (elementId) => {
  const el = document.getElementById(elementId);
  if (el) {
    navigator.clipboard.writeText(el.value).then(() => toast('URL copiada al portapapeles', 'copy'));
  }
};

window.openEditLensModal = async (lensId) => {
  // Find the lens in loaded data
  let lens = null;
  try {
    const lenses = await VaultClient.listLenses(currentLibellaId);
    lens = lenses.find(l => l.id === lensId);
  } catch {}
  if (!lens) {
    const currentW = activeLibellas.find(w => w.id === currentLibellaId);
    lens = (currentW?.mountedLenses || []).find(l => l.id === lensId);
  }
  if (!lens) return;

  document.getElementById('editLensId').value   = lens.id;
  document.getElementById('editLensName').value = lens.name;

  // Show type-specific config fields
  const cfg = lens.config || {};
  const type = lens.type;
  document.getElementById('editLensTypeTag').textContent = type.toUpperCase();

  // Hide all
  document.querySelectorAll('.edit-lens-fields').forEach(d => d.style.display = 'none');

  // Show relevant
  const fieldsMap = {
    vercel: 'editFieldsVercel', 'aws': 'editFieldsAws', cloud: 'editFieldsAws',
    upstash: 'editFieldsUpstash', ai: 'editFieldsAi',
    otel: 'editFieldsOtel', otlp: 'editFieldsOtel',
    terra: 'editFieldsTerra', byol: 'editFieldsByol',
  };
  const targetFields = fieldsMap[type];
  if (targetFields) {
    const el = document.getElementById(targetFields);
    if (el) el.style.display = 'block';
  }

  // Populate fields
  if (type === 'vercel') {
    setValue('editVSecret',     cfg.webhookSecret || '');
    setValue('editVProjectId',  cfg.vercelProjectId || '');
    setValue('editVDrainId',    cfg.vercelDrainId || '');
    setValue('editVEnv',        cfg.vercelEnvironment || 'production');
  } else if (type === 'aws' || type === 'cloud') {
    setValue('editAwsRegion',   cfg.awsRegion || 'us-east-1');
    setValue('editAwsLogGroup', cfg.awsLogGroupName || '');
    setValue('editAwsSnsArn',   cfg.awsSnsTopicArn || '');
    setValue('editAwsS3',       cfg.s3Bucket || '');
  } else if (type === 'upstash') {
    setValue('editUpstashUrl',   cfg.upstashRestUrl || '');
    setValue('editUpstashToken', cfg.upstashReadToken || '');
    setValue('editUpstashDb',    cfg.upstashDatabaseName || '');
  } else if (type === 'ai') {
    setValue('editAiProvider',   cfg.aiProvider || 'openai');
    setValue('editAiModel',      cfg.aiDefaultModel || 'gpt-4o');
    setValue('editAiApiKey',     cfg.aiApiKey || '');
    setValue('editAiProxyUrl',   cfg.aiProxyBaseUrl || '');
  } else if (type === 'otel' || type === 'otlp') {
    setValue('editOtelProto',    cfg.otlpProtocol || 'http/json');
    setValue('editOtelPort',     cfg.otlpPort || '4318');
    setValue('editOtelService',  cfg.otlpServiceName || '');
  } else if (type === 'terra') {
    setValue('editTerraApp',     cfg.terraAppName || 'formica');
    setValue('editTerraVault',   cfg.terraStorageVault || '');
  } else if (type === 'byol') {
    setValue('editByolAuth',     cfg.byolAuthHeader || '');
    setValue('editByolLatency',  cfg.byolLatencyField || 'duration_ms');
    setValue('editByolError',    cfg.byolErrorField || 'error');
    setValue('editByolTagsMap',  cfg.byolTagsMapping || '');
  }

  document.getElementById('modalEditLens').style.display = 'flex';
};

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

window.deleteLens = async (lensId) => {
  if (!confirm(`¿Desmontar la lente '${lensId}'?`)) return;
  try {
    await VaultClient.unmountLens(currentLibellaId, lensId);
    await loadMountedLenses();
    toast('Lente desmontada', 'success');
  } catch (err) { toast('Error al desmontar: ' + err.message, 'error'); }
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. Ingest Simulator
// ─────────────────────────────────────────────────────────────────────────────
function setupSimulator() {
  const send = async (lensType, payload) => {
    try {
      await VaultClient.ingest(currentLibellaId, lensType, payload);
      await refreshAll(false);
      toast(`Telemetría simulada: ${lensType}`, 'success', 2000);
    } catch {}
  };

  document.getElementById('simVercel')?.addEventListener('click', () =>
    send('vercel', { proxy: { statusCode: 200, duration: 118 + Math.floor(Math.random() * 50), path: '/api/v1/users' }, message: 'Vercel Function OK' }));

  document.getElementById('simOpenAi')?.addEventListener('click', () =>
    send('ai', { provider: 'openai', model: 'gpt-4o', inputTokens: 600 + Math.floor(Math.random() * 200), outputTokens: 150 + Math.floor(Math.random() * 50), latencyMs: 380 }));

  document.getElementById('simClaude')?.addEventListener('click', () =>
    send('ai', { provider: 'anthropic', model: 'claude-3-5-sonnet', inputTokens: 1000 + Math.floor(Math.random() * 300), outputTokens: 250 + Math.floor(Math.random() * 100), latencyMs: 440 }));

  document.getElementById('simUpstash')?.addEventListener('click', () =>
    send('upstash', { commands: 450, memoryUsageBytes: 1024 * 1024 * 12, databaseName: 'redis-cache-prod' }));

  document.getElementById('simSpike')?.addEventListener('click', () =>
    send('byol', { name: 'database_query_duration_ms', value: 2850, unit: 'ms', tags: { query: 'SELECT * FROM big_orders' } }));

  document.getElementById('simFatal')?.addEventListener('click', () =>
    send('byol', { level: 'fatal', message: 'CRITICAL [FATAL 500]: Database connection pool exhausted', tags: { service: 'payment-gateway', cluster: 'us-east-1' } }));

  document.getElementById('simGemini')?.addEventListener('click', () =>
    send('ai', { provider: 'google', model: 'gemini-1.5-pro', inputTokens: 2000 + Math.floor(Math.random() * 500), outputTokens: 400 + Math.floor(Math.random() * 200), latencyMs: 620 }));

  document.getElementById('simRateLimit')?.addEventListener('click', () =>
    send('byol', { level: 'warn', message: 'WARN [429] Rate limit hit — exponential backoff applied', statusCode: 429, tags: { service: 'openai-proxy', retryAfter: 30 } }));

  document.getElementById('simDeepSeek')?.addEventListener('click', () =>
    send('ai', { provider: 'deepseek', model: 'deepseek-chat', inputTokens: 3000 + Math.floor(Math.random() * 1000), outputTokens: 800 + Math.floor(Math.random() * 400), latencyMs: 210 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Config Tab — dynamic snippet
// ─────────────────────────────────────────────────────────────────────────────
function updateConfigTab() {
  const current = activeLibellas.find(w => w.id === currentLibellaId);
  if (!current) return;

  document.getElementById('cfgId').value    = current.id;
  document.getElementById('cfgName').value  = current.name;
  document.getElementById('cfgKey').value   = current.ingestKey || 'lbk_live';
  document.getElementById('cfgBudget').value = current.budgetUsdMonthly || 50;

  const statusChk = document.getElementById('cfgStatusPageEnabled');
  if (statusChk) statusChk.checked = current.statusPageEnabled !== false;
  const statusAccess = document.getElementById('cfgStatusPageAccess');
  if (statusAccess) statusAccess.value = current.statusPageAccess || 'public';

  // Dynamic snippet with real watchtower ID and ingest key
  const snippet = `import { Libella } from 'terra-libella';

// Option 1 — Full SDK (Node.js / Edge runtime)
const libella = new Libella({
  libellaId: '${current.id}',
  vaultToken: process.env.GITHUB_PAT,
  storageRepo: '${localStorage.getItem('libella_vault_repo') || '<user>/.libella-storage'}',
});

// Track a request latency
await libella.metric('checkout_latency_ms', 145, { libellaId: '${current.id}' });

// Track an AI cost
await libella.aiCost({
  model: 'gpt-4o',
  inputTokens: 500,
  outputTokens: 120,
  cachedTokens: 80,
  libellaId: '${current.id}',
});

// Option 2 — Webhook ingest (any language / HTTP)
// POST to: /api/ingest?key=${current.ingestKey || 'YOUR_INGEST_KEY'}&type=byol
// Body: { "name": "api_latency_ms", "value": 142 }

// Option 3 — CLI
// libella ingest --metric checkout_latency_ms 145 --libella ${current.id}
// libella ingest --ai gpt-4o --input 500 --output 120 --libella ${current.id}`;

  document.getElementById('codeSnippetNode').innerText = snippet;
}

document.getElementById('btnCopyKey')?.addEventListener('click', () => {
  const key = document.getElementById('cfgKey').value;
  navigator.clipboard.writeText(key).then(() => toast('Ingest Key copiada', 'copy'));
});

document.getElementById('btnSaveWatchtowerConfig')?.addEventListener('click', async () => {
  const name             = document.getElementById('cfgName').value.trim();
  const budget           = Number(document.getElementById('cfgBudget').value);
  const statusPageEnabled = document.getElementById('cfgStatusPageEnabled').checked;
  const statusPageAccess = document.getElementById('cfgStatusPageAccess').value;
  try {
    await VaultClient.updateWatchtower(currentLibellaId, { name, budgetUsdMonthly: budget, statusPageEnabled, statusPageAccess });
    toast('Configuración guardada', 'success');
    await loadWatchtowers();
  } catch (err) { toast('Error al guardar: ' + err.message, 'error'); }
});

document.getElementById('btnEditWatchtower')?.addEventListener('click', () => {
  const current = activeLibellas.find(w => w.id === currentLibellaId);
  if (!current) return;
  document.getElementById('editWName').value   = current.name;
  document.getElementById('editWBudget').value = current.budgetUsdMonthly || 50;
  document.getElementById('editWStatusEnabled').checked = current.statusPageEnabled !== false;
  document.getElementById('editWStatusAccess').value    = current.statusPageAccess || 'public';
  document.getElementById('modalEditWatchtower').style.display = 'flex';
});

document.getElementById('btnCancelEditW')?.addEventListener('click', () => {
  document.getElementById('modalEditWatchtower').style.display = 'none';
});

document.getElementById('btnSaveEditW')?.addEventListener('click', async () => {
  const name             = document.getElementById('editWName').value.trim();
  const budget           = Number(document.getElementById('editWBudget').value);
  const statusPageEnabled = document.getElementById('editWStatusEnabled').checked;
  const statusPageAccess = document.getElementById('editWStatusAccess').value;
  if (!name) return toast('Especifica un nombre', 'warn');
  try {
    await VaultClient.updateWatchtower(currentLibellaId, { name, budgetUsdMonthly: budget, statusPageEnabled, statusPageAccess });
    document.getElementById('modalEditWatchtower').style.display = 'none';
    await loadWatchtowers();
    refreshAll();
    toast('Watchtower actualizado', 'success');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
});

document.getElementById('btnDeleteWatchtower')?.addEventListener('click', async () => {
  if (!confirm(`¿Eliminar Watchtower '${currentLibellaId}' y toda su configuración?`)) return;
  try {
    await VaultClient.deleteWatchtower(currentLibellaId);
    currentLibellaId = 'default';
    await loadWatchtowers();
    refreshAll();
    toast('Watchtower eliminado', 'success');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Modals setup
// ─────────────────────────────────────────────────────────────────────────────
function setupModals() {
  // ── New Watchtower ──
  const mW = document.getElementById('modalNewWatchtower');
  document.getElementById('btnNewWatchtower')?.addEventListener('click', () => mW.style.display = 'flex');
  document.getElementById('btnCancelNewW')?.addEventListener('click', () => mW.style.display = 'none');
  document.getElementById('btnSaveNewW')?.addEventListener('click', async () => {
    const name             = document.getElementById('newWName').value.trim();
    const budget           = Number(document.getElementById('newWBudget').value) || 50;
    const statusPageEnabled = document.getElementById('newWStatusEnabled').checked;
    const statusPageAccess = document.getElementById('newWStatusAccess').value;
    if (!name) return toast('Especifica un nombre', 'warn');
    try {
      await VaultClient.createWatchtower({ name, budgetUsdMonthly: budget, statusPageEnabled, statusPageAccess });
      mW.style.display = 'none';
      document.getElementById('newWName').value = '';
      await loadWatchtowers();
      refreshAll();
      toast(`Watchtower '${name}' creado`, 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── Mount Lens ──
  const mML = document.getElementById('modalMountLens');
  document.getElementById('btnMountLens')?.addEventListener('click', () => mML.style.display = 'flex');
  document.getElementById('btnCancelMountLens')?.addEventListener('click', () => mML.style.display = 'none');
  document.getElementById('btnSaveMountLens')?.addEventListener('click', async () => {
    const type = document.getElementById('mountLensType').value;
    const name = document.getElementById('mountLensName').value.trim() || `${type.toUpperCase()} Lens`;
    const config = collectLensConfig(type, 'mount');
    try {
      await VaultClient.mountLens(currentLibellaId, type, name, config);
      mML.style.display = 'none';
      await loadMountedLenses();
      toast(`Lente '${name}' montada`, 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── Edit Lens ──
  const mEL = document.getElementById('modalEditLens');
  document.getElementById('btnCancelEditLens')?.addEventListener('click', () => mEL.style.display = 'none');
  document.getElementById('btnSaveEditLens')?.addEventListener('click', async () => {
    const lensId = document.getElementById('editLensId').value;
    const name   = document.getElementById('editLensName').value.trim();
    if (!name) return toast('Especifica un nombre', 'warn');
    // Collect config from edit fields
    const allLenses = await VaultClient.listLenses(currentLibellaId).catch(() => []);
    const lens = allLenses.find(l => l.id === lensId);
    const type = lens?.type || 'byol';
    const config = collectLensConfig(type, 'edit');
    try {
      await VaultClient.updateLens(currentLibellaId, lensId, { name, config });
      mEL.style.display = 'none';
      await loadMountedLenses();
      toast('Lente actualizada', 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── New Breaker ──
  const mB = document.getElementById('modalNewBreaker');
  document.getElementById('btnNewBreaker')?.addEventListener('click', () => mB.style.display = 'flex');
  document.getElementById('btnCancelBrk')?.addEventListener('click', () => mB.style.display = 'none');
  document.getElementById('btnSaveBrk')?.addEventListener('click', async () => {
    const name        = document.getElementById('brkName').value.trim();
    const metric      = document.getElementById('brkMetric').value;
    const threshold   = Number(document.getElementById('brkThreshold').value);
    const actionType  = document.getElementById('brkActionType').value;
    const actionTarget = document.getElementById('brkTarget').value.trim();
    const windowMinutes = Number(document.getElementById('brkWindow').value) || 60;
    if (!name || !actionTarget) return toast('Completa todos los campos requeridos', 'warn');
    try {
      await VaultClient.createBreaker(currentLibellaId, { name, metric, op: '>', threshold, actionType, actionTarget, windowMinutes });
      mB.style.display = 'none';
      await loadBreakers();
      toast(`Breaker '${name}' creado`, 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── Edit Breaker ──
  const mEB = document.getElementById('modalEditBreaker');
  document.getElementById('btnCancelEditBrk')?.addEventListener('click', () => mEB.style.display = 'none');
  document.getElementById('btnSaveEditBrk')?.addEventListener('click', async () => {
    const ruleId      = document.getElementById('editBrkId').value;
    const name        = document.getElementById('editBrkName').value.trim();
    const metric      = document.getElementById('editBrkMetric').value;
    const threshold   = Number(document.getElementById('editBrkThreshold').value);
    const actionType  = document.getElementById('editBrkActionType').value;
    const actionTarget = document.getElementById('editBrkTarget').value.trim();
    const windowMinutes = Number(document.getElementById('editBrkWindow').value) || 60;
    try {
      await VaultClient.updateBreaker(currentLibellaId, ruleId, { name, metric, op: '>', threshold, actionType, actionTarget, windowMinutes });
      mEB.style.display = 'none';
      await loadBreakers();
      toast('Breaker actualizado', 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── Custom AI Model ──
  const mAi       = document.getElementById('modalNewAiModel');
  const selPreset  = document.getElementById('aiModelPreset');
  const selProvider = document.getElementById('aiModelProvider');
  const inpModel   = document.getElementById('aiModelName');
  const inpInPrice = document.getElementById('aiModelInputPrice');
  const inpOutPrice = document.getElementById('aiModelOutputPrice');
  const inpCachedPrice = document.getElementById('aiModelCachedPrice');
  const inpMonthlyCap = document.getElementById('aiModelMonthlyCap');

  const AI_PRESET_MAP = {
    'gpt-4o':              { provider:'openai',    model:'gpt-4o',              inPrice:2.50,  outPrice:10.00, cachedPrice:1.25  },
    'gpt-4o-mini':         { provider:'openai',    model:'gpt-4o-mini',         inPrice:0.15,  outPrice:0.60,  cachedPrice:0.075 },
    'o1':                  { provider:'openai',    model:'o1',                  inPrice:15.00, outPrice:60.00, cachedPrice:7.50  },
    'o1-mini':             { provider:'openai',    model:'o1-mini',             inPrice:3.00,  outPrice:12.00, cachedPrice:1.50  },
    'claude-3-5-sonnet':   { provider:'anthropic', model:'claude-3-5-sonnet',   inPrice:3.00,  outPrice:15.00, cachedPrice:0.30  },
    'claude-3-5-haiku':    { provider:'anthropic', model:'claude-3-5-haiku',    inPrice:0.80,  outPrice:4.00,  cachedPrice:0.08  },
    'claude-3-opus':       { provider:'anthropic', model:'claude-3-opus',       inPrice:15.00, outPrice:75.00, cachedPrice:1.50  },
    'deepseek-chat':       { provider:'deepseek',  model:'deepseek-chat',       inPrice:0.14,  outPrice:0.28,  cachedPrice:0.014 },
    'deepseek-reasoner':   { provider:'deepseek',  model:'deepseek-reasoner',   inPrice:0.55,  outPrice:2.19,  cachedPrice:0.14  },
    'gemini-1.5-pro':      { provider:'google',    model:'gemini-1.5-pro',      inPrice:3.50,  outPrice:10.50, cachedPrice:0.875 },
    'gemini-1.5-flash':    { provider:'google',    model:'gemini-1.5-flash',    inPrice:0.075, outPrice:0.30,  cachedPrice:0.018 },
    'gemini-2.0-flash':    { provider:'google',    model:'gemini-2.0-flash',    inPrice:0.10,  outPrice:0.40,  cachedPrice:0.025 },
    'llama-3.3-70b':       { provider:'groq',      model:'llama-3.3-70b',       inPrice:0.59,  outPrice:0.79,  cachedPrice:0     },
    'llama-3.1-8b':        { provider:'groq',      model:'llama-3.1-8b',        inPrice:0.05,  outPrice:0.08,  cachedPrice:0     },
    'qwen-2.5-72b':        { provider:'groq',      model:'qwen-2.5-72b',        inPrice:0.60,  outPrice:0.80,  cachedPrice:0     },
  };

  selPreset?.addEventListener('change', () => {
    const p = AI_PRESET_MAP[selPreset.value];
    if (!p) return;
    if (selProvider) selProvider.value = p.provider;
    if (inpModel)    inpModel.value    = p.model;
    if (inpInPrice)  inpInPrice.value  = p.inPrice;
    if (inpOutPrice) inpOutPrice.value = p.outPrice;
    if (inpCachedPrice) inpCachedPrice.value = p.cachedPrice;
    if (inpMonthlyCap)  inpMonthlyCap.value  = '';
  });

  document.getElementById('btnNewAiModel')?.addEventListener('click', () => mAi.style.display = 'flex');
  document.getElementById('btnCancelAiModel')?.addEventListener('click', () => mAi.style.display = 'none');
  document.getElementById('btnSaveAiModel')?.addEventListener('click', async () => {
    const model      = inpModel?.value.trim();
    const provider   = selProvider?.value || 'custom';
    const inPrice    = Number(inpInPrice?.value || 0);
    const outPrice   = Number(inpOutPrice?.value || 0);
    const cachedPrice = inpCachedPrice?.value !== '' ? Number(inpCachedPrice.value) : undefined;
    const monthlyCap = inpMonthlyCap?.value !== '' ? Number(inpMonthlyCap.value) : undefined;
    if (!model) return toast('Especifica el nombre del modelo', 'warn');
    try {
      await VaultClient.setAiModel(currentLibellaId, {
        model, provider,
        inputPer1M: inPrice, inputPricePer1M: inPrice,
        outputPer1M: outPrice, outputPricePer1M: outPrice,
        cachedInputPer1M: cachedPrice,
        monthlyBudgetCap: monthlyCap,
      });
      mAi.style.display = 'none';
      await loadFinOps();
      toast(`Modelo '${model}' configurado — $${inPrice} In / $${outPrice} Out`, 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── New Incident ──
  const mInc = document.getElementById('modalNewIncident');
  document.getElementById('btnNewIncident')?.addEventListener('click', () => mInc.style.display = 'flex');
  document.getElementById('btnCancelIncident')?.addEventListener('click', () => mInc.style.display = 'none');
  document.getElementById('btnSaveIncident')?.addEventListener('click', async () => {
    const title    = document.getElementById('incTitle').value.trim();
    const severity = document.getElementById('incSeverity').value;
    const message  = document.getElementById('incMessage').value.trim();
    if (!title) return toast('Especifica un título', 'warn');
    try {
      await VaultClient.createIncident(currentLibellaId, { title, severity, message });
      mInc.style.display = 'none';
      await loadIncidents();
      toast(`Incidente declarado: ${title}`, 'warn');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });

  // ── Resolve Incident ──
  const mRI = document.getElementById('modalResolveIncident');
  document.getElementById('btnCancelResolveInc')?.addEventListener('click', () => mRI.style.display = 'none');
  document.getElementById('btnConfirmResolveInc')?.addEventListener('click', async () => {
    const incId   = document.getElementById('resolveIncId').value;
    const message = document.getElementById('resolveIncMsg').value.trim();
    try {
      await VaultClient.resolveIncident(currentLibellaId, incId, message);
      mRI.style.display = 'none';
      await loadIncidents();
      toast('Incidente resuelto', 'success');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. Lens config collector helper (reused by mount + edit)
// ─────────────────────────────────────────────────────────────────────────────
function collectLensConfig(type, prefix) {
  const p = prefix === 'edit' ? 'edit' : '';
  const g = (suffix) => {
    const id = p ? `${p}${suffix.charAt(0).toUpperCase() + suffix.slice(1)}` : suffix;
    return document.getElementById(id)?.value?.trim() || '';
  };
  const config = {};
  if (type === 'vercel') {
    if (p === 'edit') {
      config.webhookSecret     = document.getElementById('editVSecret')?.value.trim();
      config.vercelProjectId   = document.getElementById('editVProjectId')?.value.trim();
      config.vercelDrainId     = document.getElementById('editVDrainId')?.value.trim();
      config.vercelEnvironment = document.getElementById('editVEnv')?.value;
    } else {
      config.webhookSecret     = document.getElementById('vSecret')?.value.trim();
      config.vercelProjectId   = document.getElementById('vProjectId')?.value.trim();
      config.vercelDrainId     = document.getElementById('vDrainId')?.value.trim();
      config.vercelEnvironment = document.getElementById('vEnv')?.value;
    }
  } else if (type === 'aws' || type === 'cloud') {
    if (p === 'edit') {
      config.awsRegion      = document.getElementById('editAwsRegion')?.value.trim();
      config.awsLogGroupName = document.getElementById('editAwsLogGroup')?.value.trim();
      config.awsSnsTopicArn = document.getElementById('editAwsSnsArn')?.value.trim();
      config.s3Bucket       = document.getElementById('editAwsS3')?.value.trim();
    } else {
      config.awsRegion      = document.getElementById('awsRegion')?.value.trim();
      config.awsLogGroupName = document.getElementById('awsLogGroup')?.value.trim();
      config.awsSnsTopicArn = document.getElementById('awsSnsArn')?.value.trim();
    }
  } else if (type === 'upstash') {
    if (p === 'edit') {
      config.upstashRestUrl     = document.getElementById('editUpstashUrl')?.value.trim();
      config.upstashReadToken   = document.getElementById('editUpstashToken')?.value.trim();
      config.upstashDatabaseName = document.getElementById('editUpstashDb')?.value.trim();
    } else {
      config.upstashRestUrl     = document.getElementById('upstashUrl')?.value.trim();
      config.upstashReadToken   = document.getElementById('upstashToken')?.value.trim();
      config.upstashDatabaseName = document.getElementById('upstashDb')?.value.trim();
    }
  } else if (type === 'ai') {
    if (p === 'edit') {
      config.aiProvider      = document.getElementById('editAiProvider')?.value;
      config.aiDefaultModel  = document.getElementById('editAiModel')?.value.trim();
      config.aiApiKey        = document.getElementById('editAiApiKey')?.value.trim();
      config.aiProxyBaseUrl  = document.getElementById('editAiProxyUrl')?.value.trim();
    } else {
      config.aiProvider      = document.getElementById('aiProviderSelect')?.value;
      config.aiDefaultModel  = document.getElementById('aiDefaultModel')?.value.trim();
      config.aiApiKey        = document.getElementById('aiApiKey')?.value.trim();
      config.aiProxyBaseUrl  = document.getElementById('aiProxyUrl')?.value.trim();
    }
  } else if (type === 'otel' || type === 'otlp') {
    if (p === 'edit') {
      config.otlpProtocol   = document.getElementById('editOtelProto')?.value;
      config.otlpPort       = document.getElementById('editOtelPort')?.value.trim();
      config.otlpServiceName = document.getElementById('editOtelService')?.value.trim();
    } else {
      config.otlpProtocol   = document.getElementById('otelProto')?.value;
      config.otlpServiceName = document.getElementById('otelServiceName')?.value.trim();
    }
  } else if (type === 'terra') {
    if (p === 'edit') {
      config.terraAppName      = document.getElementById('editTerraApp')?.value;
      config.terraStorageVault = document.getElementById('editTerraVault')?.value.trim();
    } else {
      config.terraAppName      = document.getElementById('terraAppSelect')?.value;
      config.terraStorageVault = document.getElementById('terraVaultRepo')?.value.trim();
    }
  } else if (type === 'byol') {
    if (p === 'edit') {
      config.byolAuthHeader   = document.getElementById('editByolAuth')?.value.trim();
      config.byolLatencyField = document.getElementById('editByolLatency')?.value.trim();
      config.byolErrorField   = document.getElementById('editByolError')?.value.trim();
      config.byolTagsMapping  = document.getElementById('editByolTagsMap')?.value.trim();
    } else {
      config.byolAuthHeader   = document.getElementById('byolAuth')?.value.trim();
      config.byolLatencyField = document.getElementById('byolLatency')?.value.trim();
      config.byolErrorField   = document.getElementById('byolError')?.value.trim();
    }
  }
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Mount Lens dynamic fields (type selector)
// ─────────────────────────────────────────────────────────────────────────────
function setupMountLensDynamicFields() {
  const select  = document.getElementById('mountLensType');
  const preview = document.getElementById('mountPreviewEndpoint');
  if (!select) return;

  const updateFields = () => {
    const type   = select.value;
    const host   = window.location.origin || 'http://localhost:4578';
    const key    = activeLibellas.find(w => w.id === currentLibellaId)?.ingestKey || 'lbk_live';
    if (preview) preview.innerText = `${host}/api/ingest?key=${key}&type=${type}`;
    document.querySelectorAll('.lens-provider-fields').forEach(d => d.style.display = 'none');
    const map = { vercel:'fieldsVercel', aws:'fieldsAws', cloud:'fieldsAws', upstash:'fieldsUpstash', ai:'fieldsAi', otel:'fieldsOtel', otlp:'fieldsOtel', terra:'fieldsTerra', byol:'fieldsByol' };
    const el = document.getElementById(map[type]);
    if (el) el.style.display = 'block';
  };

  select.addEventListener('change', updateFields);
  updateFields();
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. Authentication
// ─────────────────────────────────────────────────────────────────────────────
function setupAuth() {
  const btnAuthLogin = document.getElementById('btnAuthLogin');
  const authPatInput = document.getElementById('authPatInput');
  const btnLogout    = document.getElementById('btnLogout');

  btnAuthLogin?.addEventListener('click', () => handleAuthLogin());
  authPatInput?.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuthLogin(); });
  btnLogout?.addEventListener('click', () => handleAuthLogout());
}

async function checkAuthStatus() {
  const token = localStorage.getItem('libella_vault_pat');
  const mAuth = document.getElementById('modalAuthLogin');
  const userProfile = document.getElementById('userProfile');

  if (!token) {
    if (mAuth) mAuth.style.display = 'flex';
    if (userProfile) userProfile.style.display = 'none';
    return false;
  }

  const cachedUser   = localStorage.getItem('libella_vault_user');
  const cachedAvatar = localStorage.getItem('libella_vault_avatar');
  if (cachedUser) {
    renderUserProfile(cachedUser, cachedAvatar);
    if (mAuth) mAuth.style.display = 'none';
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`Token inválido (HTTP ${res.status})`);
    const userData = await res.json();
    localStorage.setItem('libella_vault_user', userData.login);
    localStorage.setItem('libella_vault_avatar', userData.avatar_url || '');
    localStorage.setItem('libella_vault_repo', `${userData.login}/.libella-storage`);
    renderUserProfile(userData.login, userData.avatar_url);
    if (mAuth) mAuth.style.display = 'none';
    return true;
  } catch (err) {
    console.warn('GitHub PAT validation error:', err);
    localStorage.removeItem('libella_vault_pat');
    localStorage.removeItem('libella_vault_user');
    localStorage.removeItem('libella_vault_avatar');
    localStorage.removeItem('libella_vault_repo');
    if (userProfile) userProfile.style.display = 'none';
    showAuthError('Tu sesión ha expirado o el token no es válido. Introduce tu PAT de nuevo.');
    if (mAuth) mAuth.style.display = 'flex';
    return false;
  }
}

async function handleAuthLogin() {
  const tokenInput   = document.getElementById('authPatInput');
  const btnAuthLogin = document.getElementById('btnAuthLogin');
  const mAuth        = document.getElementById('modalAuthLogin');
  const token        = tokenInput?.value.trim() || '';

  if (!token) { showAuthError('Introduce tu Personal Access Token (PAT) de GitHub.'); return; }
  if (btnAuthLogin) { btnAuthLogin.disabled = true; btnAuthLogin.innerText = 'Validando...'; }
  hideAuthError();

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`Token inválido o sin permisos (HTTP ${res.status}). Asegúrate de que tenga permisos 'repo'.`);
    const userData = await res.json();
    localStorage.setItem('libella_vault_pat', token);
    localStorage.setItem('libella_vault_user', userData.login);
    localStorage.setItem('libella_vault_avatar', userData.avatar_url || '');
    localStorage.setItem('libella_vault_repo', `${userData.login}/.libella-storage`);
    renderUserProfile(userData.login, userData.avatar_url);
    if (mAuth) mAuth.style.display = 'none';
    if (tokenInput) tokenInput.value = '';
    await loadWatchtowers();
    await refreshAll();
    toast(`Bienvenido, @${userData.login}`, 'success');
  } catch (err) {
    showAuthError(err.message || 'Error autenticando con GitHub.');
  } finally {
    if (btnAuthLogin) { btnAuthLogin.disabled = false; btnAuthLogin.innerText = '🔑 Iniciar Sesión en Libella'; }
  }
}

function handleAuthLogout() {
  localStorage.removeItem('libella_vault_pat');
  localStorage.removeItem('libella_vault_user');
  localStorage.removeItem('libella_vault_avatar');
  localStorage.removeItem('libella_vault_repo');
  const userProfile = document.getElementById('userProfile');
  const mAuth = document.getElementById('modalAuthLogin');
  const tokenInput = document.getElementById('authPatInput');
  if (userProfile) userProfile.style.display = 'none';
  if (tokenInput) tokenInput.value = '';
  hideAuthError();
  if (mAuth) mAuth.style.display = 'flex';
}

function renderUserProfile(username, avatarUrl) {
  const userProfile    = document.getElementById('userProfile');
  const userDisplayName = document.getElementById('userDisplayName');
  const userAvatar     = document.getElementById('userAvatar');
  if (userDisplayName) userDisplayName.innerText = `@${username}`;
  if (userAvatar) userAvatar.src = avatarUrl || 'assets/logo_libella.png';
  if (userProfile) userProfile.style.display = 'flex';
}

function showAuthError(msg) {
  const errBox = document.getElementById('authErrorMsg');
  if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
}

function hideAuthError() {
  const errBox = document.getElementById('authErrorMsg');
  if (errBox) { errBox.innerText = ''; errBox.style.display = 'none'; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. Utilities
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
