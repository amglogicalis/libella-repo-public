/**
 * LIBELLA — The Universal Panopticon
 * Client Application Logic
 */

let currentLibellaId = 'default';
let currentTimeRange = '24h';
let activeLibellas = [];
let vitalsChartInstance = null;

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
  setupSimulator();
  await loadWatchtowers();
  await refreshAll();

  // Polling every 10s if tab is visible
  setInterval(() => {
    if (!document.hidden) {
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
        currentLibellaId = activeLibellas[0].id;
        libellaSelect.value = currentLibellaId;
        updateConfigTab();
      }
    }
  } catch (err) {
    console.warn('Using offline / static fallback for watchtowers', err);
  }
}

async function refreshAll(showLoading = true) {
  if (showLoading) btnRefresh.innerText = '⌛...';
  await Promise.all([
    loadVitals(),
    loadLogs(),
    loadFinOps(),
    loadBreakers(),
  ]);
  if (showLoading) btnRefresh.innerText = '🔄 Actualizar';
}

// -------------------------------------------------------------
// 1. Quadrant: Vitals
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

  const buckets = (latestVitals && latestVitals.buckets && latestVitals.buckets.length > 0)
    ? latestVitals.buckets
    : Array.from({ length: 12 }, (_, i) => ({ avgLatency: 20 + Math.sin(i) * 15 }));

  const maxVal = Math.max(...buckets.map((b) => b.avgLatency || 10), 50);

  // Background Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += h / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw smooth path
  ctx.beginPath();
  const step = w / (buckets.length - 1 || 1);
  const points = buckets.map((b, i) => {
    const x = i * step;
    const y = h - (b.avgLatency / maxVal) * (h * 0.75) - 20;
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
    const lvl = l.level.toLowerCase();
    return `
      <div class="log-row">
        <span class="log-time">${time}</span>
        <span class="log-level ${lvl}">[${l.level.toUpperCase()}]</span>
        <span class="log-msg">${escapeHtml(l.message)}</span>
      </div>
    `;
  }).join('');
}

document.getElementById('logSearchInput').addEventListener('input', () => loadLogs());
document.getElementById('logLevelSelect').addEventListener('change', () => loadLogs());

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
            <td style="padding:0.75rem; font-weight:600; color:#fff;">${m}</td>
            <td style="padding:0.75rem; font-family:var(--font-mono);">${f.aiTokensTotal.input + f.aiTokensTotal.output}</td>
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
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">${p}</div>
          <div style="font-size:1.25rem; font-weight:800; color:#fff; font-family:var(--font-mono); margin-top:0.2rem;">$${amt}</div>
        </div>
      `).join('');
    }
  } catch {}
}

// -------------------------------------------------------------
// 4. Quadrant: Circuit Breakers
// -------------------------------------------------------------
async function loadBreakers() {
  try {
    const res = await fetch(`/api/libellas/${currentLibellaId}/breakers`);
    if (res.ok) {
      const list = await res.json();
      const tbody = document.getElementById('breakersTableBody');
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:1rem; text-align:center; color:var(--text-gray);">No hay disyuntores activos para esta Libella</td></tr>';
        return;
      }

      tbody.innerHTML = list.map((b) => {
        const isTripped = b.status === 'tripped';
        const stBadge = isTripped
          ? '<span class="badge badge-danger">DISPARADO</span>'
          : '<span class="badge badge-success">CERRADO</span>';
        const last = b.lastTriggeredAt ? b.lastTriggeredAt.slice(11, 19) : 'Nunca';

        return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
            <td style="padding:0.6rem;">${stBadge}</td>
            <td style="padding:0.6rem; font-weight:600; color:#fff;">${b.name}</td>
            <td style="padding:0.6rem; font-family:var(--font-mono);">${b.metric} ${b.op} ${b.threshold}</td>
            <td style="padding:0.6rem; text-transform:uppercase;">${b.actionType}</td>
            <td style="padding:0.6rem; color:var(--text-muted); font-size:0.8rem;">${b.actionTarget}</td>
            <td style="padding:0.6rem; color:var(--text-gray);">${last}</td>
          </tr>
        `;
      }).join('');
    }
  } catch {}
}

document.getElementById('btnEvalBreakers').addEventListener('click', async () => {
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
// 5. Ingest Simulator (Live Click & Test)
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

  document.getElementById('simVercel').addEventListener('click', () => {
    send('vercel', {
      proxy: { statusCode: 200, duration: 118 + Math.floor(Math.random() * 20), path: '/api/v1/users' },
      message: 'Vercel Serverless Function Executed Successfully',
    });
  });

  document.getElementById('simOpenAi').addEventListener('click', () => {
    send('ai', {
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 600 + Math.floor(Math.random() * 200),
      outputTokens: 150 + Math.floor(Math.random() * 50),
      latencyMs: 380,
    });
  });

  document.getElementById('simClaude').addEventListener('click', () => {
    send('ai', {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      inputTokens: 1000 + Math.floor(Math.random() * 300),
      outputTokens: 250 + Math.floor(Math.random() * 100),
      latencyMs: 440,
    });
  });

  document.getElementById('simUpstash').addEventListener('click', () => {
    send('upstash', {
      commands: 450,
      memoryUsageBytes: 1024 * 1024 * 12,
      databaseName: 'redis-cache-prod',
    });
  });

  document.getElementById('simSpike').addEventListener('click', () => {
    send('byol', {
      name: 'database_query_duration_ms',
      value: 2850,
      unit: 'ms',
      tags: { query: 'SELECT * FROM big_orders' },
    });
  });

  document.getElementById('simFatal').addEventListener('click', () => {
    send('byol', {
      level: 'fatal',
      message: 'CRITICAL [FATAL 500]: Database connection pool exhausted',
      tags: { service: 'payment-gateway', cluster: 'us-east-1' },
    });
  });
}

// -------------------------------------------------------------
// 6. Config Watchtower & Modals
// -------------------------------------------------------------
function updateConfigTab() {
  const current = activeLibellas.find((w) => w.id === currentLibellaId);
  if (!current) return;

  document.getElementById('cfgId').value = current.id;
  document.getElementById('cfgName').value = current.name;
  document.getElementById('cfgKey').value = current.ingestKey || 'lbk_live';
  document.getElementById('cfgBudget').value = current.budgetUsdMonthly || 50;

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

document.getElementById('btnCopyKey').addEventListener('click', () => {
  const key = document.getElementById('cfgKey').value;
  navigator.clipboard.writeText(key);
  alert('Ingest Key copiada al portapapeles');
});

function setupModals() {
  // Watchtower Modal
  const mWatchtower = document.getElementById('modalNewWatchtower');
  document.getElementById('btnNewWatchtower').addEventListener('click', () => {
    mWatchtower.style.display = 'flex';
  });
  document.getElementById('btnCancelNewW').addEventListener('click', () => {
    mWatchtower.style.display = 'none';
  });
  document.getElementById('btnSaveNewW').addEventListener('click', async () => {
    const name = document.getElementById('newWName').value.trim();
    const budget = Number(document.getElementById('newWBudget').value) || 50;
    if (!name) return alert('Especifica un nombre');

    try {
      const res = await fetch('/api/libellas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budgetUsdMonthly: budget }),
      });
      if (res.ok) {
        mWatchtower.style.display = 'none';
        await loadWatchtowers();
        refreshAll();
      }
    } catch {}
  });

  // Breaker Modal
  const mBreaker = document.getElementById('modalNewBreaker');
  document.getElementById('btnNewBreaker').addEventListener('click', () => {
    mBreaker.style.display = 'flex';
  });
  document.getElementById('btnCancelBrk').addEventListener('click', () => {
    mBreaker.style.display = 'none';
  });
  document.getElementById('btnSaveBrk').addEventListener('click', async () => {
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
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
