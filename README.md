# Latin Leap Dealflow Intelligence

> Sistema automatizado de identificación y evaluación de startups early-stage en LATAM hispanohablante.

---

## ¿Qué es?

Latin Leap Dealflow es una herramienta de inteligencia de inversión que escanea automáticamente cada lunes fuentes como Y Combinator, LinkedIn, Crunchbase y aceleradoras LATAM, evalúa cada startup con un scorecard de inteligencia artificial calibrado para etapa pre-seed y seed, y envía al equipo un resumen semanal por Telegram con las mejores oportunidades — incluyendo ficha completa, razones de inversión y puntaje detallado. El equipo también accede a un dashboard web para explorar el pipeline de 86 startups, filtrar por industria, etapa o fuente, y exportar los mejores deals a Excel. Todo corre de forma autónoma a un costo de menos de $1 al mes, eliminando por completo la búsqueda y evaluación manual de dealflow.

---

## Arquitectura

```
Fuentes (YC · LinkedIn · Crunchbase · Aceleradoras)
    ↓
Apify — Web scraping automatizado
    ↓
Claude API — Scoring IA (5 dimensiones)
    ↓
Pipedream — Orquestación (cron: lunes 9am BOG)
    ↓
Telegram — Notificación semanal al equipo
Dashboard — Acceso web del equipo (Vercel)
```

---

## Stack tecnológico

| Componente | Herramienta | Función |
|---|---|---|
| Scraping | Apify | Recolección de startups de fuentes públicas |
| IA / Scoring | Claude API (Haiku) | Evaluación automática con scorecard |
| Orquestación | Pipedream | Workflow semanal automatizado |
| Notificaciones | Telegram Bot | Resumen y deal-by-deal al equipo |
| Dashboard | React + Recharts | Visualización y filtrado del pipeline |
| Hosting | Vercel / Stackblitz | Acceso web sin instalación |

---

## Scorecard — criterios de evaluación

El sistema evalúa cada startup en 5 dimensiones calibradas para inversión early-stage:

| Dimensión | Peso | Descripción |
|---|---|---|
| Team / Founders | 25% | Experiencia y track record del equipo fundador |
| Market Size | 25% | Tamaño del mercado total direccionable en LATAM |
| Geografía | 20% | Operación en LATAM hispanohablante |
| Sector | 15% | Potencial del vertical en la región |
| Traction / MVP | 15% | Señales de validación tempranas |

### Clasificación

- **STRONG FIT** — Score ≥ 70 → Agendar primera reunión
- **WATCH** — Score 55–69 → Seguimiento cercano
- **PASS** — Score < 55 → No avanza

---

## Tesis de inversión

| Etapa | Capital típico | Qué existe | Valoración |
|---|---|---|---|
| Pre-seed | $100K – $1M | Solo idea y equipo fundador | $1M – $5M |
| Seed | $1M – $5M | MVP o primeros usuarios | $5M – $15M |

**Geografía:** LATAM hispanohablante — México, Colombia, Chile, Perú, Argentina, Ecuador

---

## Pipeline inicial

86 startups curadas de:
- Y Combinator (W24, S24, W25)
- Crunchbase (rondas recientes)
- 500 LATAM
- Startup Chile
- Endeavor
- NXTP Labs
- F6S
- LinkedIn

---

## Costo operativo

| Componente | Costo mensual |
|---|---|
| Pipedream | Gratis |
| Claude API | ~$0.20 |
| Apify | Gratis (tier gratuito) |
| Telegram | Gratis |
| Hosting | Gratis |
| **Total** | **~$0.20/mes** |

---

## Archivos del proyecto

| Archivo | Descripción |
|---|---|
| `latinleap-dealflow.jsx` | Código fuente del dashboard React |
| `latinleap-pipedream-workflow.json` | Workflow de Pipedream para importar |
| `latinleap-apify-steps.json` | Pasos de scraping con Apify |
| `latinleap-arquitectura-simple.jpg` | Diagrama de arquitectura del sistema |

---

## Setup rápido

### Dashboard
1. Abre [CodeSandbox](https://codesandbox.io) → New Sandbox → React
2. Reemplaza `App.js` con el contenido de `latinleap-dealflow.jsx`
3. Instala dependencias: `npm install recharts`
4. Comparte la URL generada con el equipo

### Automatización semanal
1. Crea cuenta en [Pipedream](https://pipedream.com)
2. Importa el workflow de `latinleap-pipedream-workflow.json`
3. Configura las variables de entorno:
   - `ANTHROPIC_KEY` → API key de Anthropic
   - `TELEGRAM_TOKEN` → Token del bot de Telegram
   - `TELEGRAM_CHAT` → Chat ID del grupo
4. Deploy — corre automáticamente cada lunes a las 9am hora Bogotá

### Telegram
1. Crea el bot con `@BotFather` → `/newbot`
2. Crea un grupo y agrega el bot
3. Obtén el Chat ID entrando a `https://api.telegram.org/bot{TOKEN}/getUpdates`

---

## Construido con

- [Claude API](https://anthropic.com) — Anthropic
- [Pipedream](https://pipedream.com)
- [Apify](https://apify.com)
- [React](https://react.dev) + [Recharts](https://recharts.org)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

*Latin Leap · USD 20M Fund · Pre-seed & Seed · LATAM Hispanohablante*
