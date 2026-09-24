/**
 * LIBELLA — The Universal Panopticon
 * Client Application Logic (Full Real Endpoints, Lens Credentials & Status Control)
 */

let currentLibellaId = 'default';
let currentTimeRange = '24h';
let activeLibellas = [];
let allBreakers = [];

// DOM Elements
const libellaSelect = document.getElementById('libellaSelect');
const rangeSelect = document.getElementById('rangeSelect');
const btnRefresh = document.getElementById('btnRefresh');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Initial Load
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupModals();
  setupAuth();
  setupSimulator();
  setupMountLensDynamicFields();

  const isAuthenticated = await checkAuthStatus();
  if (isAuthenticated) {
    await loadWatchtowers();
    await refreshAll();
  }

  // Polling every 10s if tab is visible and authenticated
  setInterval(() => {
    if (!document.hidden && localStorage.getItem('libella_vault_pat')) {
      refreshAll(false);
    }
  }, 10000);
});

// Tab Navigation
function setupTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');

      if (targetId === 'tab-vitals') {
        drawVitalsChart();
      }
      if (targetId === 'tab-ommatidia') {
        loadMountedLenses();
      }
    });
  });

  rangeSelect.addEventListener('change', () => {
    currentTimeRange = rangeSelect.value;
    refreshAll();
  });

  libellaSelect.addEventListener('change', () => {
    currentLibellaId = libellaSelect.value;
    updateConfigTab();
    refreshAll();
  });

  btnRefresh.addEventListener('click', () => refreshAll(true));
}

// Watchtowers API
async function loadWatchtowers() {
  try {
    const res = await fetch('/api/libellas');
    if (res.ok) {
      activeLibellas = await res.json();
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
    }
  } catch (err) {
    console.warn('Using offline / static fallback for watchtowers', err);
    // Provide a default offline mirror entry if none loaded
    if (activeLibellas.length === 0) {
      const u = localStorage.getItem('libella_vault_user') || 'user';
      activeLibellas = [
        {
          id: 'default',
          name: `Default Watchtower (@${u})`,
          slug: 'default',
          ingestKey: `lbk_${u}_live`,
          budgetUsdMonthly: 50,
          statusPageEnabled: true,
          statusPageAccess: 'public',
          mountedLenses: [
            {
              id: 'lens_byol_default',
              type: 'byol',
              name: 'BYOL Universal Ingest Lens',
              enabled: true,
              config: { ingestUrl: '/api/ingest?key=lbk_live_demo&type=byol' },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];
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

// -------------------------------------------------------------
// 1. Quadrant: Vitals & Chart (100% Real Zero-State Baseline)
// -------------------------------------------------------------
let latestVitals = null;

async function loadVitals() {
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/vitals?range=${currentTimeRange}`);
    if (res.ok) {
      latestVitals = await res.json();
      document.getElementById('valAvgLatency').innerText = `${latestVitals.avg} ms`;
      document.getElementById('valP95Latency').innerText = `${latestVitals.p95} ms`;
      document.getElementById('valP50').innerText = `${latestVitals.p50}ms`;
      document.getElementById('valP99').innerText = `${latestVitals.p99}ms`;
      document.getElementById('valRps').innerText = `${latestVitals.rps}`;
      document.getElementById('valCount').innerText = `${latestVitals.count}`;
      document.getElementById('valErrorRate').innerText = `${latestVitals.errorRatePercent}%`;
      document.getElementById('valErrorCount').innerText = `${latestVitals.errorCount}`;
      drawVitalsChart();
    }
  } catch {}
}

function drawVitalsChart() {
  const canvas = document.getElementById('vitalsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Background Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += h / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const hasData = latestVitals && latestVitals.count > 0 && latestVitals.buckets && latestVitals.buckets.length > 0;

  if (!hasData) {
    // 100% Real Zero-State Baseline (No synthetic sine-wave mocks)
    ctx.beginPath();
    ctx.moveTo(0, h - 25);
    ctx.lineTo(w, h - 25);
    ctx.strokeStyle = 'rgba(20, 219, 96, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '13px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(156, 163, 175, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('Sin métricas registradas en este intervalo (0 ops analizadas)', w / 2, h / 2);
    return;
  }

  const buckets = latestVitals.buckets;
  const maxVal = Math.max(...buckets.map((b) => b.avgLatency || 1), 20);

  // Draw smooth path
  ctx.beginPath();
  const step = w / (buckets.length - 1 || 1);
  const points = buckets.map((b, i) => {
    const x = i * step;
    const y = h - ((b.avgLatency || 0) / maxVal) * (h * 0.75) - 20;
    return { x, y };
  });

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
  }

  // Fill gradient
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(20, 219, 96, 0.35)');
  grad.addColorStop(1, 'rgba(20, 219, 96, 0.0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = '#14db60';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Glow points
  for (const pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#14db60';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// -------------------------------------------------------------
// Incidents (Pulse) Live Management
// -------------------------------------------------------------
async function loadIncidents() {
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/pulse`);
    if (res.ok) {
      const data = await res.json();
      const container = document.getElementById('activeIncidentsContainer');
      const incs = data.activeIncidents || [];
      if (incs.length === 0) {
        container.innerHTML = `<div style="color:var(--text-gray); font-size:0.85rem; padding:0.4rem 0;">✔ Todos los sistemas operativos (Estado: <strong style="color:var(--primary);">${(data.overallStatus || 'OPERATIONAL').toUpperCase()}</strong>). Sin incidentes activos.</div>`;
        return;
      }
      container.innerHTML = incs.map((inc) => {
        const sevColor = inc.severity === 'critical' ? 'var(--danger)' : inc.severity === 'major' ? 'var(--warning)' : '#38bdf8';
        const dateStr = inc.timestamp ? inc.timestamp.slice(0, 19).replace('T', ' ') : 'Reciente';
        return `
          <div style="background:var(--bg-surface); border:1px solid ${sevColor}; padding:0.75rem 1rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; color:#fff;">
                <span class="badge" style="background:${sevColor}; color:#000; margin-right:0.4rem;">${(inc.severity || 'MAJOR').toUpperCase()}</span>
                ${escapeHtml(inc.title)}
              </div>
              <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(inc.message || inc.description || '')}</div>
              <div style="font-size:0.75rem; color:var(--text-gray); margin-top:0.25rem;">Declarado: ${dateStr}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openResolveIncidentModal('${inc.id}', '${escapeHtml(inc.title)}')">Resolver</button>
          </div>
        `;
      }).join('');
    }
  } catch {}
}

window.openResolveIncidentModal = (incId, title) => {
  document.getElementById('resolveIncId').value = incId;
  document.getElementById('resolveIncText').innerText = `Vas a marcar como resuelto el incidente: "${title}"`;
  document.getElementById('modalResolveIncident').style.display = 'flex';
};

// -------------------------------------------------------------
// 2. Quadrant: Logs
// -------------------------------------------------------------
let allLogs = [];

async function loadLogs() {
  const level = document.getElementById('logLevelSelect').value;
  const search = document.getElementById('logSearchInput').value;

  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/logs?range=${currentTimeRange}&level=${level}&search=${encodeURIComponent(search)}`);
    if (res.ok) {
      allLogs = await res.json();
      renderLogs(allLogs);
    }
  } catch {}
}

function renderLogs(logs) {
  const stream = document.getElementById('logsStream');
  document.getElementById('logsCountBadge').innerText = `${logs.length} trazas`;

  if (logs.length === 0) {
    stream.innerHTML = '<div style="color:var(--text-gray); padding:1rem; text-align:center;">No hay registros para este filtro</div>';
    return;
  }

  stream.innerHTML = logs.map((l) => {
    const time = (l.timestamp || '').slice(11, 19) || 'now';
    const lvl = (l.level || 'info').toLowerCase();
    return `
      <div class="log-row">
        <span class="log-time">${time}</span>
        <span class="log-level ${lvl}">[${(l.level || 'info').toUpperCase()}]</span>
        <span class="log-msg">${escapeHtml(l.message || '')}</span>
      </div>
    `;
  }).join('');
}

document.getElementById('logSearchInput')?.addEventListener('input', () => loadLogs());
document.getElementById('logLevelSelect')?.addEventListener('change', () => loadLogs());

// -------------------------------------------------------------
// 3. Quadrant: FinOps
// -------------------------------------------------------------
async function loadFinOps() {
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/finops?range=${currentTimeRange}`);
    if (res.ok) {
      const f = await res.json();
      document.getElementById('valTotalCost').innerText = `$${f.totalCostUsd}`;
      document.getElementById('valDailyCost').innerText = `$${f.dailyCostUsd}/d`;
      document.getElementById('valProjectedCost').innerText = `$${f.projectedMonthlyCostUsd}/m`;
      document.getElementById('valAiTokens').innerText = (f.aiTokensTotal.input + f.aiTokensTotal.output).toLocaleString();
      document.getElementById('valTokensIn').innerText = f.aiTokensTotal.input.toLocaleString();
      document.getElementById('valTokensOut').innerText = f.aiTokensTotal.output.toLocaleString();

      // Render AI Table
      const tbody = document.getElementById('aiTableBody');
      const models = Object.entries(f.byModel || {});
      if (models.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:1rem; text-align:center; color:var(--text-gray);">Sin eventos de IA registrados</td></tr>';
      } else {
        tbody.innerHTML = models.map(([m, cost]) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
            <td style="padding:0.75rem; font-weight:600; color:#fff;">${escapeHtml(m)}</td>
            <td style="padding:0.75rem; font-family:var(--font-mono);">${(f.aiTokensTotal.input + f.aiTokensTotal.output).toLocaleString()}</td>
            <td style="padding:0.75rem; color:var(--primary); font-family:var(--font-mono);">$${cost}</td>
            <td style="padding:0.75rem;"><span class="badge badge-success">Activo</span></td>
          </tr>
        `).join('');
      }

      // Render Providers
      const provBox = document.getElementById('providerBreakdownContainer');
      const providers = Object.entries(f.byProvider || {});
      provBox.innerHTML = providers.map(([p, amt]) => `
        <div style="background:var(--bg-surface); border:1px solid var(--primary-border); padding:0.8rem 1.2rem; border-radius:10px; min-width:140px;">
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">${escapeHtml(p)}</div>
          <div style="font-size:1.25rem; font-weight:800; color:#fff; font-family:var(--font-mono); margin-top:0.2rem;">$${amt}</div>
        </div>
      `).join('');
    }
  } catch {}
}

// -------------------------------------------------------------
// 4. Quadrant: Circuit Breakers (Full CRUD)
// -------------------------------------------------------------
async function loadBreakers() {
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/breakers`);
    if (res.ok) {
      allBreakers = await res.json();
      const tbody = document.getElementById('breakersTableBody');
      if (allBreakers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:1rem; text-align:center; color:var(--text-gray);">No hay disyuntores activos para esta Libella</td></tr>';
        return;
      }

      tbody.innerHTML = allBreakers.map((b) => {
        const isTripped = b.status === 'tripped';
        const stBadge = isTripped
          ? '<span class="badge badge-danger">DISPARADO</span>'
          : '<span class="badge badge-success">CERRADO</span>';
        const last = b.lastTriggeredAt ? b.lastTriggeredAt.slice(11, 19) : 'Nunca';

        return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
            <td style="padding:0.6rem;">${stBadge}</td>
            <td style="padding:0.6rem; font-weight:600; color:#fff;">${escapeHtml(b.name)}</td>
            <td style="padding:0.6rem; font-family:var(--font-mono);">${b.metric} ${b.op} ${b.threshold}</td>
            <td style="padding:0.6rem; text-transform:uppercase;">${b.actionType}</td>
            <td style="padding:0.6rem; color:var(--text-muted); font-size:0.8rem;">${escapeHtml(b.actionTarget)}</td>
            <td style="padding:0.6rem; color:var(--text-gray);">${last}</td>
            <td style="padding:0.6rem; text-align:right;">
              <button class="btn btn-ghost btn-sm" onclick="openEditBreakerModal('${b.id}')" title="Editar">✏️</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteBreaker('${b.id}')" title="Eliminar" style="color:var(--danger);">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch {}
}

window.openEditBreakerModal = (ruleId) => {
  const b = allBreakers.find((r) => r.id === ruleId);
  if (!b) return;
  document.getElementById('editBrkId').value = b.id;
  document.getElementById('editBrkName').value = b.name;
  document.getElementById('editBrkMetric').value = b.metric;
  document.getElementById('editBrkThreshold').value = b.threshold;
  document.getElementById('editBrkActionType').value = b.actionType;
  document.getElementById('editBrkTarget').value = b.actionTarget;
  document.getElementById('modalEditBreaker').style.display = 'flex';
};

window.deleteBreaker = async (ruleId) => {
  if (!confirm(`¿Eliminar de forma permanente el disyuntor '${ruleId}'?`)) return;
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/breakers/${ruleId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadBreakers();
    }
  } catch (err) {
    alert('Error al eliminar breaker: ' + err.message);
  }
};

document.getElementById('btnEvalBreakers')?.addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/breakers/evaluate`, { method: 'POST' });
    if (res.ok) {
      const results = await res.json();
      await loadBreakers();
      alert(`Evaluadas ${results.length} reglas de Circuit Breaker.`);
    }
  } catch {}
});

// -------------------------------------------------------------
// 5. Quadrant: Lenses (Ommatidia Engine Full CRUD & Real Config)
// -------------------------------------------------------------
async function loadMountedLenses() {
  const container = document.getElementById('mountedLensesList');
  if (!container) return;

  const currentW = activeLibellas.find((w) => w.id === currentLibellaId);
  const host = window.location.origin || 'http://localhost:4578';
  const key = currentW?.ingestKey || 'lbk_live';

  let lenses = [];

  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/lenses`);
    if (res.ok) {
      lenses = await res.json();
    } else {
      lenses = currentW?.mountedLenses || [];
    }
  } catch {
    lenses = currentW?.mountedLenses || [];
  }

  if (!lenses || lenses.length === 0) {
    container.innerHTML = `
      <div style="background:var(--bg-surface); border:1px dashed var(--primary-border); border-radius:10px; padding:1.5rem; text-align:center;">
        <p style="color:var(--text-gray); font-size:0.9rem; margin-bottom:0.8rem;">
          No hay lentes montadas en este Watchtower.
        </p>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('modalMountLens').style.display='flex'">
          + Montar Lente (Vercel, AWS, Upstash, IA, OTel)
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = lenses.map((l) => {
    const ingestUrl = `${host}/api/ingest?key=${key}&lens=${l.id}&type=${l.type}`;
    const cfg = l.config || {};
    
    // Format active credentials/params
    const details = [];
    if (l.type === 'vercel') {
      if (cfg.vercelProjectId) details.push(`Project: <code>${escapeHtml(cfg.vercelProjectId)}</code>`);
      if (cfg.vercelEnvironment) details.push(`Entorno: <code>${cfg.vercelEnvironment}</code>`);
      if (cfg.webhookSecret) details.push(`Secret: <code>••••••••</code>`);
    } else if (l.type === 'aws') {
      if (cfg.awsRegion) details.push(`Región: <code>${escapeHtml(cfg.awsRegion)}</code>`);
      if (cfg.awsLogGroupName) details.push(`Log Group: <code>${escapeHtml(cfg.awsLogGroupName)}</code>`);
      if (cfg.awsSnsTopicArn) details.push(`SNS ARN: <code>${escapeHtml(cfg.awsSnsTopicArn)}</code>`);
    } else if (l.type === 'upstash') {
      if (cfg.upstashRestUrl) details.push(`REST URL: <code>${escapeHtml(cfg.upstashRestUrl)}</code>`);
      if (cfg.upstashDatabaseName) details.push(`DB: <code>${escapeHtml(cfg.upstashDatabaseName)}</code>`);
      if (cfg.upstashReadToken) details.push(`Token: <code>••••••••</code>`);
    } else if (l.type === 'ai') {
      if (cfg.aiProvider) details.push(`Provider: <code>${escapeHtml(cfg.aiProvider)}</code>`);
      if (cfg.aiDefaultModel) details.push(`Model: <code>${escapeHtml(cfg.aiDefaultModel)}</code>`);
      if (cfg.aiProxyBaseUrl) details.push(`Proxy: <code>${escapeHtml(cfg.aiProxyBaseUrl)}</code>`);
    } else if (l.type === 'otel') {
      if (cfg.otlpProtocol) details.push(`Protocolo: <code>${escapeHtml(cfg.otlpProtocol)}</code>`);
      if (cfg.otlpServiceName) details.push(`Servicio: <code>${escapeHtml(cfg.otlpServiceName)}</code>`);
    } else if (l.type === 'terra') {
      if (cfg.terraAppName) details.push(`App Terra: <code>${escapeHtml(cfg.terraAppName)}</code>`);
      if (cfg.terraStorageVault) details.push(`Vault: <code>${escapeHtml(cfg.terraStorageVault)}</code>`);
    } else {
      if (cfg.byolAuthHeader) details.push(`Auth: <code>${escapeHtml(cfg.byolAuthHeader)}</code>`);
      if (cfg.byolLatencyField) details.push(`Latencia: <code>${escapeHtml(cfg.byolLatencyField)}</code>`);
    }

    const detailsStr = details.length > 0
      ? details.join(' • ')
      : '<span style="color:var(--text-gray);">Configuración por defecto lista para ingesta HTTP</span>';

    // Provider Specific Setup Guide
    let guideSnippet = '';
    if (l.type === 'vercel') {
      guideSnippet = `// En Vercel: Project Settings > Log Drains > Add Log Drain (JSON)
URL: ${ingestUrl}
Secret: ${cfg.webhookSecret || '(Opcional)'}`;
    } else if (l.type === 'aws') {
      guideSnippet = `# AWS CLI Subscription Filter:
aws logs put-subscription-filter \\
  --log-group-name "${cfg.awsLogGroupName || '/aws/lambda/my-service'}" \\
  --filter-name "LibellaFilter" \\
  --destination-arn "${cfg.awsSnsTopicArn || 'arn:aws:sns:...'}" \\
  --filter-pattern ""`;
    } else if (l.type === 'ai') {
      guideSnippet = `// En tu SDK de Node / Edge:
await libella.aiCost({
  model: '${cfg.aiDefaultModel || 'gpt-4o'}',
  inputTokens: 500,
  outputTokens: 120,
  libellaId: '${currentLibellaId}'
});`;
    } else {
      guideSnippet = `# Ingesta Directa vía cURL / Webhook:
curl -X POST "${ingestUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "api_latency_ms", "value": 142, "unit": "ms"}'`;
    }

    return `
      <div style="background:var(--bg-surface); border:1px solid var(--primary-border); padding:1rem 1.2rem; border-radius:12px; margin-bottom:0.8rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-weight:700; color:#fff; font-size:1rem; display:flex; align-items:center; gap:0.5rem;">
              <span>${escapeHtml(l.name)}</span>
              <span class="badge" style="background:rgba(20,219,96,0.15); color:var(--primary); font-family:var(--font-mono); font-size:0.75rem;">${l.type.toUpperCase()}</span>
              <span class="badge badge-success">Activa</span>
            </div>
            <div style="font-size:0.78rem; color:var(--text-muted); font-family:var(--font-mono); margin-top:0.25rem;">
              ID: ${l.id}
            </div>
          </div>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-ghost btn-sm" onclick="toggleLensGuide('${l.id}')">ℹ️ Guía de Conexión</button>
            <button class="btn btn-ghost btn-sm" onclick="openEditLensModal('${l.id}', '${escapeHtml(l.name)}')" title="Editar">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteLens('${l.id}')" title="Desmontar" style="color:var(--danger);">🗑️</button>
          </div>
        </div>

        <div style="margin-top:0.8rem; font-size:0.82rem; color:#cbd5e1; background:rgba(0,0,0,0.3); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.04);">
          ${detailsStr}
        </div>

        <div style="margin-top:0.8rem;">
          <label style="font-size:0.74rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Webhook Ingestion URL (Copia esta dirección en tu proveedor):</label>
          <div style="display:flex; gap:0.4rem; margin-top:0.25rem;">
            <input type="text" class="search-input" readonly value="${ingestUrl}" id="url_${l.id}" style="font-family:var(--font-mono); font-size:0.78rem; width:100%; color:var(--primary);">
            <button class="btn btn-primary btn-sm" onclick="copyToClipboard('url_${l.id}')">📋 Copiar</button>
          </div>
        </div>

        <!-- Accordion Guide -->
        <div id="guide_${l.id}" style="display:none; margin-top:0.8rem; background:#020604; border:1px solid var(--primary-border); border-radius:8px; padding:0.8rem;">
          <div style="font-size:0.78rem; font-weight:700; color:var(--primary); margin-bottom:0.4rem;">Instrucciones de Integración:</div>
          <pre style="margin:0; font-family:var(--font-mono); font-size:0.76rem; color:#86efac; overflow-x:auto;">${escapeHtml(guideSnippet)}</pre>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleLensGuide = (lensId) => {
  const el = document.getElementById(`guide_${lensId}`);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
};

window.copyToClipboard = (elementId) => {
  const el = document.getElementById(elementId);
  if (el) {
    navigator.clipboard.writeText(el.value);
    alert('URL de ingesta copiada al portapapeles.');
  }
};

window.openEditLensModal = (lensId, name) => {
  document.getElementById('editLensId').value = lensId;
  document.getElementById('editLensName').value = name;
  document.getElementById('modalEditLens').style.display = 'flex';
};

window.deleteLens = async (lensId) => {
  if (!confirm(`¿Desmontar y eliminar la lente '${lensId}' de este Watchtower?`)) return;
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/lenses/${lensId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadMountedLenses();
    }
  } catch (err) {
    alert('Error al desmontar lente: ' + err.message);
  }
};

function setupMountLensDynamicFields() {
  const select = document.getElementById('mountLensType');
  const preview = document.getElementById('mountPreviewEndpoint');
  if (!select) return;

  const updateFields = () => {
    const type = select.value;
    const host = window.location.origin || 'http://localhost:4578';
    const currentW = activeLibellas.find((w) => w.id === currentLibellaId);
    const key = currentW?.ingestKey || 'lbk_live';

    if (preview) {
      preview.innerText = `${host}/api/ingest?key=${key}&type=${type}`;
    }

    // Hide all
    document.querySelectorAll('.lens-provider-fields').forEach((div) => {
      div.style.display = 'none';
    });

    // Show selected
    if (type === 'vercel') document.getElementById('fieldsVercel')?.style.setProperty('display', 'block');
    if (type === 'aws') document.getElementById('fieldsAws')?.style.setProperty('display', 'block');
    if (type === 'upstash') document.getElementById('fieldsUpstash')?.style.setProperty('display', 'block');
    if (type === 'ai') document.getElementById('fieldsAi')?.style.setProperty('display', 'block');
    if (type === 'otel') document.getElementById('fieldsOtel')?.style.setProperty('display', 'block');
    if (type === 'terra') document.getElementById('fieldsTerra')?.style.setProperty('display', 'block');
    if (type === 'byol') document.getElementById('fieldsByol')?.style.setProperty('display', 'block');
  };

  select.addEventListener('change', updateFields);
  updateFields();
}

// -------------------------------------------------------------
// 6. Ingest Simulator (Live Click & Test)
// -------------------------------------------------------------
function setupSimulator() {
  const send = async (lensType, payload) => {
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Libella-Id': currentLibellaId,
        },
        body: JSON.stringify({ lensType, payload }),
      });
      if (res.ok) {
        await refreshAll(false);
      }
    } catch {}
  };

  document.getElementById('simVercel')?.addEventListener('click', () => {
    send('vercel', {
      proxy: { statusCode: 200, duration: 118 + Math.floor(Math.random() * 20), path: '/api/v1/users' },
      message: 'Vercel Serverless Function Executed Successfully',
    });
  });

  document.getElementById('simOpenAi')?.addEventListener('click', () => {
    send('ai', {
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 600 + Math.floor(Math.random() * 200),
      outputTokens: 150 + Math.floor(Math.random() * 50),
      latencyMs: 380,
    });
  });

  document.getElementById('simClaude')?.addEventListener('click', () => {
    send('ai', {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      inputTokens: 1000 + Math.floor(Math.random() * 300),
      outputTokens: 250 + Math.floor(Math.random() * 100),
      latencyMs: 440,
    });
  });

  document.getElementById('simUpstash')?.addEventListener('click', () => {
    send('upstash', {
      commands: 450,
      memoryUsageBytes: 1024 * 1024 * 12,
      databaseName: 'redis-cache-prod',
    });
  });

  document.getElementById('simSpike')?.addEventListener('click', () => {
    send('byol', {
      name: 'database_query_duration_ms',
      value: 2850,
      unit: 'ms',
      tags: { query: 'SELECT * FROM big_orders' },
    });
  });

  document.getElementById('simFatal')?.addEventListener('click', () => {
    send('byol', {
      level: 'fatal',
      message: 'CRITICAL [FATAL 500]: Database connection pool exhausted',
      tags: { service: 'payment-gateway', cluster: 'us-east-1' },
    });
  });
}

// -------------------------------------------------------------
// 7. Config Watchtower & Modals
// -------------------------------------------------------------
function updateConfigTab() {
  const current = activeLibellas.find((w) => w.id === currentLibellaId);
  if (!current) return;

  document.getElementById('cfgId').value = current.id;
  document.getElementById('cfgName').value = current.name;
  document.getElementById('cfgKey').value = current.ingestKey || 'lbk_live';
  document.getElementById('cfgBudget').value = current.budgetUsdMonthly || 50;

  // Status Page Controls
  const statusChk = document.getElementById('cfgStatusPageEnabled');
  if (statusChk) statusChk.checked = current.statusPageEnabled !== false;

  const statusAccess = document.getElementById('cfgStatusPageAccess');
  if (statusAccess) statusAccess.value = current.statusPageAccess || (current.statusPageEnabled !== false ? 'public' : 'private');

  const nodeSnippet = `import { Libella } from 'terra-libella';

const libella = new Libella({
  libellaId: '${current.id}',
  vaultToken: process.env.GITHUB_PAT
});

// Registrar métricas y llamadas AI
await libella.metric('checkout_latency_ms', 145);
await libella.aiCost({ model: 'gpt-4o', inputTokens: 500, outputTokens: 120 });`;
  document.getElementById('codeSnippetNode').innerText = nodeSnippet;
}

document.getElementById('btnCopyKey')?.addEventListener('click', () => {
  const key = document.getElementById('cfgKey').value;
  navigator.clipboard.writeText(key);
  alert('Ingest Key copiada al portapapeles');
});

// Save from tab 6 directly
document.getElementById('btnSaveWatchtowerConfig')?.addEventListener('click', async () => {
  const name = document.getElementById('cfgName').value.trim();
  const budget = Number(document.getElementById('cfgBudget').value);
  const statusPageEnabled = document.getElementById('cfgStatusPageEnabled').checked;
  const statusPageAccess = document.getElementById('cfgStatusPageAccess').value;

  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, budgetUsdMonthly: budget, statusPageEnabled, statusPageAccess }),
    });
    if (res.ok) {
      alert('Configuración de Watchtower y Status Page actualizada con éxito.');
      await loadWatchtowers();
    }
  } catch (err) {
    alert('Error al guardar configuración: ' + err.message);
  }
});

// Watchtower Top Controls (Edit & Delete)
document.getElementById('btnEditWatchtower')?.addEventListener('click', () => {
  const current = activeLibellas.find((w) => w.id === currentLibellaId);
  if (!current) return;
  document.getElementById('editWName').value = current.name;
  document.getElementById('editWBudget').value = current.budgetUsdMonthly || 50;
  document.getElementById('editWStatusEnabled').checked = current.statusPageEnabled !== false;
  document.getElementById('editWStatusAccess').value = current.statusPageAccess || 'public';
  document.getElementById('modalEditWatchtower').style.display = 'flex';
});

document.getElementById('btnCancelEditW')?.addEventListener('click', () => {
  document.getElementById('modalEditWatchtower').style.display = 'none';
});

document.getElementById('btnSaveEditW')?.addEventListener('click', async () => {
  const name = document.getElementById('editWName').value.trim();
  const budget = Number(document.getElementById('editWBudget').value);
  const statusPageEnabled = document.getElementById('editWStatusEnabled').checked;
  const statusPageAccess = document.getElementById('editWStatusAccess').value;
  if (!name) return alert('Especifica un nombre');

  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, budgetUsdMonthly: budget, statusPageEnabled, statusPageAccess }),
    });
    if (res.ok) {
      document.getElementById('modalEditWatchtower').style.display = 'none';
      await loadWatchtowers();
      refreshAll();
    }
  } catch (err) {
    alert('Error al actualizar Watchtower: ' + err.message);
  }
});

document.getElementById('btnDeleteWatchtower')?.addEventListener('click', async () => {
  if (!confirm(`¿Eliminar Watchtower '${currentLibellaId}' y toda su configuración asociada?`)) return;
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}`, { method: 'DELETE' });
    if (res.ok) {
      currentLibellaId = 'default';
      await loadWatchtowers();
      refreshAll();
    }
  } catch (err) {
    alert('Error al eliminar Watchtower: ' + err.message);
  }
});

function setupModals() {
  // New Watchtower Modal
  const mWatchtower = document.getElementById('modalNewWatchtower');
  document.getElementById('btnNewWatchtower')?.addEventListener('click', () => {
    mWatchtower.style.display = 'flex';
  });
  document.getElementById('btnCancelNewW')?.addEventListener('click', () => {
    mWatchtower.style.display = 'none';
  });
  document.getElementById('btnSaveNewW')?.addEventListener('click', async () => {
    const name = document.getElementById('newWName').value.trim();
    const budget = Number(document.getElementById('newWBudget').value) || 50;
    const statusPageEnabled = document.getElementById('newWStatusEnabled').checked;
    const statusPageAccess = document.getElementById('newWStatusAccess').value;
    if (!name) return alert('Especifica un nombre');

    try {
      const res = await fetch('/api/libellas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budgetUsdMonthly: budget, statusPageEnabled, statusPageAccess }),
      });
      if (res.ok) {
        mWatchtower.style.display = 'none';
        await loadWatchtowers();
        refreshAll();
      }
    } catch {}
  });

  // Mount Lens Modal
  const mMountLens = document.getElementById('modalMountLens');
  document.getElementById('btnMountLens')?.addEventListener('click', () => {
    mMountLens.style.display = 'flex';
  });
  document.getElementById('btnCancelMountLens')?.addEventListener('click', () => {
    mMountLens.style.display = 'none';
  });
  document.getElementById('btnSaveMountLens')?.addEventListener('click', async () => {
    const type = document.getElementById('mountLensType').value;
    const name = document.getElementById('mountLensName').value.trim() || `${type.toUpperCase()} Lens`;

    // Extract real provider-specific configuration
    const config = {};
    if (type === 'vercel') {
      config.webhookSecret = document.getElementById('vSecret')?.value.trim();
      config.vercelProjectId = document.getElementById('vProjectId')?.value.trim();
      config.vercelEnvironment = document.getElementById('vEnv')?.value;
    } else if (type === 'aws') {
      config.awsRegion = document.getElementById('awsRegion')?.value.trim();
      config.awsLogGroupName = document.getElementById('awsLogGroup')?.value.trim();
      config.awsSnsTopicArn = document.getElementById('awsSnsArn')?.value.trim();
    } else if (type === 'upstash') {
      config.upstashRestUrl = document.getElementById('upstashUrl')?.value.trim();
      config.upstashReadToken = document.getElementById('upstashToken')?.value.trim();
      config.upstashDatabaseName = document.getElementById('upstashDb')?.value.trim();
    } else if (type === 'ai') {
      config.aiProvider = document.getElementById('aiProviderSelect')?.value;
      config.aiDefaultModel = document.getElementById('aiDefaultModel')?.value.trim();
      config.aiProxyBaseUrl = document.getElementById('aiProxyUrl')?.value.trim();
    } else if (type === 'otel') {
      config.otlpProtocol = document.getElementById('otelProto')?.value;
      config.otlpServiceName = document.getElementById('otelServiceName')?.value.trim();
    } else if (type === 'terra') {
      config.terraAppName = document.getElementById('terraAppSelect')?.value;
      config.terraStorageVault = document.getElementById('terraVaultRepo')?.value.trim();
    } else if (type === 'byol') {
      config.byolAuthHeader = document.getElementById('byolAuth')?.value.trim();
      config.byolLatencyField = document.getElementById('byolLatency')?.value.trim();
      config.byolErrorField = document.getElementById('byolError')?.value.trim();
    }

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/lenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, config }),
      });
      if (res.ok) {
        mMountLens.style.display = 'none';
        await loadMountedLenses();
      }
    } catch {}
  });

  // Edit Lens Modal
  const mEditLens = document.getElementById('modalEditLens');
  document.getElementById('btnCancelEditLens')?.addEventListener('click', () => {
    mEditLens.style.display = 'none';
  });
  document.getElementById('btnSaveEditLens')?.addEventListener('click', async () => {
    const lensId = document.getElementById('editLensId').value;
    const name = document.getElementById('editLensName').value.trim();
    if (!name) return alert('Especifica un nombre');

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/lenses/${lensId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        mEditLens.style.display = 'none';
        await loadMountedLenses();
      }
    } catch {}
  });

  // New Breaker Modal
  const mBreaker = document.getElementById('modalNewBreaker');
  document.getElementById('btnNewBreaker')?.addEventListener('click', () => {
    mBreaker.style.display = 'flex';
  });
  document.getElementById('btnCancelBrk')?.addEventListener('click', () => {
    mBreaker.style.display = 'none';
  });
  document.getElementById('btnSaveBrk')?.addEventListener('click', async () => {
    const name = document.getElementById('brkName').value.trim();
    const metric = document.getElementById('brkMetric').value;
    const threshold = Number(document.getElementById('brkThreshold').value);
    const actionType = document.getElementById('brkActionType').value;
    const actionTarget = document.getElementById('brkTarget').value.trim();

    if (!name || !actionTarget) return alert('Completa todos los campos');

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/breakers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          metric,
          op: '>',
          threshold,
          actionType,
          actionTarget,
        }),
      });
      if (res.ok) {
        mBreaker.style.display = 'none';
        await loadBreakers();
      }
    } catch {}
  });

  // Edit Breaker Modal
  const mEditBrk = document.getElementById('modalEditBreaker');
  document.getElementById('btnCancelEditBrk')?.addEventListener('click', () => {
    mEditBrk.style.display = 'none';
  });
  document.getElementById('btnSaveEditBrk')?.addEventListener('click', async () => {
    const ruleId = document.getElementById('editBrkId').value;
    const name = document.getElementById('editBrkName').value.trim();
    const metric = document.getElementById('editBrkMetric').value;
    const threshold = Number(document.getElementById('editBrkThreshold').value);
    const actionType = document.getElementById('editBrkActionType').value;
    const actionTarget = document.getElementById('editBrkTarget').value.trim();

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/breakers/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          metric,
          op: '>',
          threshold,
          actionType,
          actionTarget,
        }),
      });
      if (res.ok) {
        mEditBrk.style.display = 'none';
        await loadBreakers();
      }
    } catch {}
  });

  // Custom AI Model Modal
  const mAi = document.getElementById('modalNewAiModel');
  document.getElementById('btnNewAiModel')?.addEventListener('click', () => {
    mAi.style.display = 'flex';
  });
  document.getElementById('btnCancelAiModel')?.addEventListener('click', () => {
    mAi.style.display = 'none';
  });
  document.getElementById('btnSaveAiModel')?.addEventListener('click', async () => {
    const model = document.getElementById('aiModelName').value.trim();
    const inPrice = Number(document.getElementById('aiModelInputPrice').value);
    const outPrice = Number(document.getElementById('aiModelOutputPrice').value);
    if (!model) return alert('Especifica el nombre del modelo');

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/ai-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, inputPricePer1M: inPrice, outputPricePer1M: outPrice }),
      });
      if (res.ok) {
        mAi.style.display = 'none';
        await loadFinOps();
        alert(`Modelo '${model}' configurado ($${inPrice} / $${outPrice} por 1M)`);
      }
    } catch {}
  });

  // New Incident Modal
  const mInc = document.getElementById('modalNewIncident');
  document.getElementById('btnNewIncident')?.addEventListener('click', () => {
    mInc.style.display = 'flex';
  });
  document.getElementById('btnCancelIncident')?.addEventListener('click', () => {
    mInc.style.display = 'none';
  });
  document.getElementById('btnSaveIncident')?.addEventListener('click', async () => {
    const title = document.getElementById('incTitle').value.trim();
    const severity = document.getElementById('incSeverity').value;
    const message = document.getElementById('incMessage').value.trim();
    if (!title) return alert('Especifica un título');

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, severity, message }),
      });
      if (res.ok) {
        mInc.style.display = 'none';
        await loadIncidents();
      }
    } catch {}
  });

  // Resolve Incident Modal
  const mResolveInc = document.getElementById('modalResolveIncident');
  document.getElementById('btnCancelResolveInc')?.addEventListener('click', () => {
    mResolveInc.style.display = 'none';
  });
  document.getElementById('btnConfirmResolveInc')?.addEventListener('click', async () => {
    const incId = document.getElementById('resolveIncId').value;
    const message = document.getElementById('resolveIncMsg').value.trim();

    try {
      const res = await fetch(`/api/libellas/${currentLibellaId}/incidents/${incId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        mResolveInc.style.display = 'none';
        await loadIncidents();
      }
    } catch {}
  });

}

// -------------------------------------------------------------
// Authentication & User Profile Management (Standard Terra PAT)
// -------------------------------------------------------------
function setupAuth() {
  const btnAuthLogin = document.getElementById('btnAuthLogin');
  const authPatInput = document.getElementById('authPatInput');
  const btnLogout = document.getElementById('btnLogout');

  btnAuthLogin?.addEventListener('click', () => handleAuthLogin());
  authPatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuthLogin();
  });

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

  // If cached user info exists, render immediately to avoid UI flash
  const cachedUser = localStorage.getItem('libella_vault_user');
  const cachedAvatar = localStorage.getItem('libella_vault_avatar');
  if (cachedUser) {
    renderUserProfile(cachedUser, cachedAvatar);
    if (mAuth) mAuth.style.display = 'none';
  }

  // Validate token with GitHub API
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`Token inválido (HTTP ${res.status})`);
    }

    const userData = await res.json();
    localStorage.setItem('libella_vault_user', userData.login);
    localStorage.setItem('libella_vault_avatar', userData.avatar_url || '');
    localStorage.setItem('libella_vault_repo', `${userData.login}/.libella-storage`);

    renderUserProfile(userData.login, userData.avatar_url);
    if (mAuth) mAuth.style.display = 'none';
    return true;
  } catch (err) {
    console.warn('GitHub PAT validation error:', err);
    // If unauthorized or bad token, force login popup
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
  const tokenInput = document.getElementById('authPatInput');
  const btnAuthLogin = document.getElementById('btnAuthLogin');
  const mAuth = document.getElementById('modalAuthLogin');
  const token = tokenInput ? tokenInput.value.trim() : '';

  if (!token) {
    showAuthError('Por favor, introduce tu Personal Access Token (PAT) de GitHub.');
    return;
  }

  if (btnAuthLogin) {
    btnAuthLogin.disabled = true;
    btnAuthLogin.innerText = 'Validando con GitHub...';
  }
  hideAuthError();

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`Token inválido o sin permisos (HTTP ${res.status}). Comprueba que tenga permisos 'repo'.`);
    }

    const userData = await res.json();
    localStorage.setItem('libella_vault_pat', token);
    localStorage.setItem('libella_vault_user', userData.login);
    localStorage.setItem('libella_vault_avatar', userData.avatar_url || '');
    localStorage.setItem('libella_vault_repo', `${userData.login}/.libella-storage`);

    renderUserProfile(userData.login, userData.avatar_url);

    if (mAuth) mAuth.style.display = 'none';
    if (tokenInput) tokenInput.value = '';

    // Load watchtowers and refresh dashboard
    await loadWatchtowers();
    await refreshAll();
  } catch (err) {
    showAuthError(err.message || 'Error autenticando con GitHub. Comprueba tu token o conexión.');
  } finally {
    if (btnAuthLogin) {
      btnAuthLogin.disabled = false;
      btnAuthLogin.innerText = '🔑 Iniciar Sesión en Libella';
    }
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
  const userProfile = document.getElementById('userProfile');
  const userDisplayName = document.getElementById('userDisplayName');
  const userAvatar = document.getElementById('userAvatar');

  if (userDisplayName) userDisplayName.innerText = `@${username}`;
  if (userAvatar) userAvatar.src = avatarUrl || 'assets/logo_libella.png';
  if (userProfile) userProfile.style.display = 'flex';
}

function showAuthError(msg) {
  const errBox = document.getElementById('authErrorMsg');
  if (errBox) {
    errBox.innerText = msg;
    errBox.style.display = 'block';
  }
}

function hideAuthError() {
  const errBox = document.getElementById('authErrorMsg');
  if (errBox) {
    errBox.innerText = '';
    errBox.style.display = 'none';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
