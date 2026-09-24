<p align="center">
  <a href="https://amglogicalis.github.io/libella-repo-public/" target="_blank">
    <img src="assets/logo_libella.png" alt="Libella Panopticon Logo" width="160" />
  </a>
</p>

<h1 align="center">LIBELLA — The Universal Panopticon</h1>

<p align="center">
  <strong>$0 Real-Time Telemetry, Edge Time-Series & Multi-Cloud FinOps Engine</strong><br>
  <em>Observabilidad Universal, Lentes Polimórficas (Ommatidia), Tetrapteryx & Circuit Breakers Autónomos</em>
</p>

<p align="center">
  <a href="https://amglogicalis.github.io/libella-repo-public/"><img src="https://img.shields.io/badge/🌐_Web_Console-Live_24%2F7-14db60?style=for-the-badge" alt="Web Console Live" /></a>
  <a href="https://amglogicalis.github.io/libella-repo-public/status.html"><img src="https://img.shields.io/badge/📊_Status_Page-Public-00e5ff?style=for-the-badge" alt="Status Page" /></a>
  <a href="https://www.npmjs.com/package/terra-libella"><img src="https://img.shields.io/badge/NPM-terra--libella_v1.0.0-10b981?style=for-the-badge&logo=npm" alt="NPM Version" /></a>
  <img src="https://img.shields.io/badge/Dependencies-0_Runtime-success?style=for-the-badge" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/Infrastructure-$0_Zero_Cost-brightgreen?style=for-the-badge" alt="Zero Cost" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

---

## 🚀 Acceso Directo al Panóptico

| Recurso | Enlace Directo | Descripción |
| :--- | :--- | :--- |
| 🛸 **Consola Web Online** | [**Abrir Libella Studio**](https://amglogicalis.github.io/libella-repo-public/) | Dashboard interactivo en GitHub Pages para monitorizar métricas, logs y FinOps. |
| 📊 **Página de Estado Pública** | [**Ver Status Page**](https://amglogicalis.github.io/libella-repo-public/status.html) | Semáforo de salud global, barra de uptime de 30 días e historial de incidentes. |
| 📦 **Paquete Global NPM** | `npm install -g terra-libella` | CLI y SDK TypeScript isomórfico con cero dependencias en runtime. |

---

## 👁️ Visión y Metáfora Biológica

En la industria actual, la monitorización de sistemas representa un impuesto oculto masivo: plataformas como Datadog, New Relic, Grafana Cloud o Dynatrace cobran tarifas exorbitantes simplemente por ingerir eventos, almacenar logs de series temporales y renderizar gráficas.

**Libella** se inspira en la libélula (*Libellula* / *Odonata*), un prodigio evolutivo de la visión y la aerodinámica:
* **Visión Omnidireccional de 360° (*Ommatidia Engine*)**: Más de 30.000 lentes hexagonales le otorgan percepción perimetral absoluta sin puntos ciegos.
* **Cuatro Alas Asíncronas e Independientes (*Tetrapteryx*)**: Vuelo estacionario (*hovering*), maniobra instantánea y aceleración supersensible sin consumo energético en reposo.
* **Depredación de Anomalías**: Detección de patrones y cortes de fugas presupuestarias a milisegundos de producirse.

Libella elimina los servidores permanentes de ingesta y las bases de datos de pago: la telemetría se normaliza mediante **Lentes Polimórficas**, reside en caliente en el vault de Git (`.libella-storage`), se consolida en frío en **GitHub Releases** mediante el **Cronógrafo**, y se visualiza a 0ms en el Edge a **coste $0**.

---

## 🏛️ Arquitectura del Sistema

```
                                  🛸 LIBELLA ENGINE
                        (The Universal Edge Panopticon)
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  🛸 LAS LIBELLAS              👁️ OMMATIDIA ENGINE            🦅 TETRAPTERYX
(Watchtowers Aisladas          (7 Lentes de Ingesta           (4 Cuadrantes de
Multi-Proyecto/Entorno)         Polimórficas & OTLP)           Observabilidad)
  • E-Commerce Prod              • CloudWatch / Azure / GCP     • 1. Vitals (Metrics)
  • AI Agents Lab                • Vercel / Netlify / PaaS      • 2. Logs & Stream
  • Terra Core Mesh              • Upstash / Data / Caching     • 3. FinOps & Costs
  • Custom Watchtower            • AI & LLMOps (Token FinOps)   • 4. Pulse & Status
                                 • OpenTelemetry (OTLP JSON)
                                 • Terra Native Link
                                 • BYOL (Custom Schema)
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  ⚡ CIRCUIT BREAKER            🗄️ EL CRONÓGRAFO              🖥️ PANOPTICON CONSOLE
(Disyuntor Presupuestario     (Compresión Columnar           (Online GitHub Pages &
 & Alertas Agnósticas)         & Roll-ups Estadísticos)       Localhost Port Config)
  • Generic Webhook POST         • Hot 24h Git Ingestion        • Zero-framework Vanilla
  • GitHub Repo Dispatch         • Cold Releases Roll-ups       • Canvas/SVG Microcharts
  • Discord / Slack / Telegram   • Zero runtime dependencies    • Dedicated Status Pages
```

---

## 🧩 Los Componentes Nucleares de Libella

### 1. 🛸 Las Libellas (Watchtower Registry)
Unidades de aislamiento multi-tenant y multi-proyecto. Cada **Libella** es un centinela independiente que vigila un producto o entorno:
- **Identificador y Token Criptográfico Únicos**: `libellaId` y clave de ingesta `lbk_...` (HMAC SHA-256) para aislar la telemetría de diferentes clientes o servicios.
- **Presupuestos y Techos Propios**: Límites de gasto diarios y mensuales en dólares.
- **Status Page Dedicada**: Cada Libella puede generar y publicar su propia página de estado pública (`status.html?id=mi-watchtower`).

### 2. 👁️ Ommatidia Engine (7 Lentes Polimórficas)
Libella se adapta a cualquier emisor del mundo sin forzar esquemas rígidos:
1. **Multi-Cloud Lens (AWS, GCP, Azure)**: Ingesta de métricas de CloudWatch, Azure Monitor y reportes de facturación (*Cost & Usage*).
2. **PaaS & Serverless Lens (Vercel, Netlify, Railway, Cloudflare)**: Captura directa de *Log Drains*, tiempos de ejecución serverless y errores 5xx.
3. **Data & Caching Lens (Upstash, Supabase, Neon, Redis)**: Monitorización de comandos por segundo y memoria consumida frente a cuotas de planes gratuitos.
4. **AI & LLMOps Lens (OpenAI, Anthropic, Gemini, Groq, OpenRouter)**: Rastreo de tokens de entrada/salida y cálculo automático del coste exacto en dólares por modelo (`gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro`, etc.).
5. **OpenTelemetry Lens (OTLP JSON)**: Compatibilidad directa con el estándar de la industria. Si tu backend en Go, Java o Python usa OTel, solo apuntas la URL de exportación a Libella.
6. **Terra Native Lens**: Integración nativa con Formica, MockHive, Phryx, Syncada y Mantx.
7. **BYOL (*Bring Your Own Logs*)**: Ingesta libre de cualquier JSON arbitrario con inferencia inteligente de campos.

### 3. 🦅 Tetrapteryx (Los 4 Cuadrantes de Observabilidad)
* **Vitals**: Latencia en percentiles (`p50`, `p90`, `p95`, `p99`), rendimiento (`RPS`), tasa de error (%) y gráficas continuas en Canvas con interpolación Bézier.
* **Logs & Trazas**: Explorador estructurado con filtros por severidad (`DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`) y búsqueda en texto completo.
* **FinOps & Cuotas**: Cuadro financiero unificado con gasto total, burn-rate diario, proyección mensual, tabla de modelos de IA y desglose por proveedor cloud.
* **Pulse & Status Pages**: Detección de incidentes según SLOs, cálculo de uptime a 30 días y página pública de estado.

### 4. ⚡ Circuit Breaker Autónomo (Disyuntor de Costes y Salud)
Mecanismo de reacción defensiva **100% independiente y agnóstico** para evitar facturas sorpresa o cascadas de error:
- **Reglas de Umbral**: e.g., `cost_daily_usd > 15.0`, `error_rate_percent > 10%`, `p95_latency_ms > 2000`.
- **Action Hooks Despachados**:
  - **Webhook HTTP Genérico**: Envía un `POST` firmado por HMAC a cualquier URL que definas (tu API en Vercel, un endpoint en Express, AWS Lambda) para activar modo mantenimiento o degradar servicios.
  - **GitHub Repository Dispatch**: Despacha un evento nativo a GitHub Actions para pausar un runner o revocar claves temporales.
  - **Alertas Enriquecidas**: Dispara notificaciones inmediatas a Discord, Slack o Telegram.

### 5. 🗄️ El Cronógrafo & Almacenamiento Columnar Efímero ($0 Coste)
- **Ventana Caliente (Últimas 24h)**: Registros JSON atómicos organizados por Libella en el repositorio `.libella-storage`.
- **Roll-ups de Larga Duración**: Tareas periódicas del Cronógrafo agregan métricas por hora/día, calculan resúmenes estadísticos compactos y publican los bloques consolidados como **Releases de GitHub** usando la API REST nativa (`fetch`).
- **Resultado**: El histórico anual ocupa megabytes mínimos, carga instantáneamente en la consola web y el almacenamiento es **$0 perpetuo**.

---

## 💻 Instalación y Uso del CLI

### Instalación Global
```bash
npm install -g terra-libella
# o ejecuta directamente vía npx:
npx terra-libella status
```

### Comandos Principales

#### 1. Diagnóstico del Vault
```bash
libella doctor
# o
libella status
```

#### 2. Gestión de Watchtowers (Las Libellas)
```bash
# Crear un nuevo centinela con presupuesto mensual
libella create "E-Commerce Prod" --budget 75 --slug ecommerce-prod

# Listar watchtowers activos
libella list

# Inspeccionar configuración, claves y lentes
libella inspect ecommerce-prod

# Eliminar un watchtower
libella delete ecommerce-prod
```

#### 3. Montar Lentes (Ommatidia)
```bash
# Montar lente de IA / LLMOps
libella lens add ecommerce-prod --type ai --name "OpenAI & Claude LLMOps"

# Montar lente de Vercel
libella lens add ecommerce-prod --type vercel --name "Vercel Serverless"

# Listar lentes activas
libella lens list ecommerce-prod
```

#### 4. Ingesta de Telemetría
```bash
# Ingestar latencia
libella ingest --libella ecommerce-prod --metric checkout_duration --val 135 --unit ms

# Ingestar log estructurado
libella ingest --libella ecommerce-prod --log "Payment captured successfully" --level info

# Ingestar consumo de IA (calcula coste en dólares automáticamente)
libella ingest --libella ecommerce-prod --ai --model gpt-4o --input 850 --output 210

# Ingestar gasto cloud directo
libella ingest --libella ecommerce-prod --cost 1.45 --provider aws
```

#### 5. Consultas de los 4 Cuadrantes (Tetrapteryx)
```bash
# Consultar métricas de latencia y percentiles
libella query vitals --libella ecommerce-prod --range 24h

# Consultar logs de error
libella query logs --libella ecommerce-prod --level error

# Consultar estado financiero FinOps
libella query finops --libella ecommerce-prod --range 30d

# Consultar estado de salud y uptime
libella query pulse --libella ecommerce-prod
```

#### 6. Circuit Breakers (Disyuntores)
```bash
# Añadir regla de disyuntor por coste diario
libella breaker add --libella ecommerce-prod --name "Tope Gasto Diario" \
  --metric cost_daily_usd --op ">" --threshold 10 \
  --action webhook --target "https://api.mi-tienda.com/emergency-throttle"

# Listar reglas
libella breaker list --libella ecommerce-prod

# Evaluar reglas en caliente
libella breaker eval --libella ecommerce-prod
```

#### 7. El Cronógrafo (Compresión $0)
```bash
# Ejecutar compresión columnar y roll-ups
libella chronograph --libella ecommerce-prod
```

#### 8. Consola Web Localhost con Puerto Configurable
```bash
# Inicia la consola web local en el puerto por defecto (3377)
libella console

# Inicia en un puerto personalizado y abre el navegador
libella console --port 4500 --open
```

---

## 🛠️ Uso del SDK TypeScript (Zero-Dependencies)

El SDK de Libella es isomórfico y opera en Node.js, Deno, Bun, Cloudflare Workers, Next.js y Edge Runtimes:

```typescript
import { Libella } from 'terra-libella';

// 1. Inicializar cliente del Panóptico
const libella = new Libella({
  libellaId: 'ecommerce-prod',
  vaultToken: process.env.GITHUB_PAT,
  storageRepo: 'mi-org/.libella-storage'
});

// 2. Registrar métricas de rendimiento
await libella.metric('order_checkout_ms', 142, { plan: 'enterprise', region: 'eu-west-1' });

// 3. Registrar logs estructurados
await libella.log('info', 'Order #98124 processed successfully', {
  orderId: 'ord_98124',
  amountUsd: 129.99
});

// 4. Registrar consumo FinOps de IA (Tokens & Coste dinámico)
await libella.aiCost({
  provider: 'openai',
  model: 'gpt-4o',
  inputTokens: 1200,
  outputTokens: 380,
  operation: 'order_summarizer'
});

// 5. Consultar los 4 Cuadrantes programáticamente
const vitals = await libella.getVitals('24h');
console.log(`Latencia p95: ${vitals.p95}ms, Tasa de error: ${vitals.errorRatePercent}%`);

const finops = await libella.getFinOps('30d');
console.log(`Gasto acumulado: $${finops.totalCostUsd} USD (Media: $${finops.dailyCostUsd}/día)`);

// 6. Levantar consola web local programáticamente
const srv = await libella.startConsole({ port: 4800 });
console.log(`Consola activa en: ${srv.url}`);
```

---

## 🧪 Verificación E2E Real y Transparente

Libella incluye una suite de pruebas E2E que valida de forma 100% real cada componente contra el almacenamiento, el servidor HTTP y los disyuntores:

```bash
node tests/e2e.test.js
```

**Resultado de las pruebas de ejecución:**
```text
>>> Iniciando Batería de Pruebas E2E Reales de LIBELLA...

1. Inicializando Storage Vault...
   ✔ Storage Type: github-storage-vault (Online)
2. Creando Watchtower de Prueba...
   ✔ Watchtower Creado: ID=libella_e2e-sentinel_26944d16
3. Montando Lentes Polimórficas...
   ✔ Lentes montadas con éxito: [ai], [vercel]
4. Ingestando Telemetría Multidimensional...
   ✔ 4 cuadrantes ingeridos (Vitals, Logs, FinOps, Pulse).
5. Consultando Métricas Agregadas (Tetrapteryx)...
   ✔ Vitals: Avg=645ms, p50=125ms, p95=1950ms, Errors=1 (25%)
   ✔ Logs [ERROR]: Encontradas 1 trazas (Esperado: 1)
   ✔ FinOps: Gasto Total=$0.027 USD, Tokens Totales=4950
     Desglose por Proveedor: { openai: 0.0075, anthropic: 0.0195 }
   ✔ Pulse: Estado=DEGRADED, Uptime=100%
6. Probando Circuit Breaker Autónomo...
   ✔ Breaker creado: ID=cb_491912cc, Regla=error_count > 0
   ✔ Evaluación de Disyuntor: Tripped=true (Val=1, Umbral=0)
7. Probando Compresión del Cronógrafo...
   ✔ Cronógrafo ejecutado: 1 rollup(s) generados
8. Levantando Servidor Local de Consola Web en Puerto 4578...
   ✔ Servidor levantado en: http://127.0.0.1:4578
   ✔ GET /api/status HTTP 200 (App: LIBELLA)
   ✔ POST /api/ingest HTTP 200 (Ingested: 1 events)
9. Limpiando Watchtower de Prueba...
   ✔ Watchtower eliminado correctamente.

✔ TODAS LAS PRUEBAS E2E DE LIBELLA HAN PASADO EXITOSAMENTE (100% REALES).
```

---

## 📄 Licencia

Publicado bajo licencia de código abierto **MIT**. Desarrollado bajo la filosofía del [Ecosistema Terra](https://github.com/amglogicalis/Terra) — Infraestructura Efímera de Coste $0.
