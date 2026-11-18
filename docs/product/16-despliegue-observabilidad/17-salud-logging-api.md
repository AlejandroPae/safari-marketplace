# US-17 — Endpoint de salud y logging con timestamps en la API

> La API expone `/api/health` (liveness) y `/api/health/ready` (readiness con
> ping a Postgres), y sus logs llevan timestamp y nivel: lo mínimo para que un
> healthcheck de compose/nube no mienta y un incidente sea diagnosticable.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-08-25
**Status:** Implementado (2026-11-18)
**Depende de:** ninguna
**LOC est.:** ~150

## Historia
**Como** operador del stack (compose hoy, nube mañana), **quiero** distinguir
"la API está viva" de "la API puede servir datos", **para** que los
healthchecks reinicien/enruten con criterio y los logs permitan reconstruir
qué pasó y cuándo.

## Contexto

- Hoy no hay endpoint de salud; el healthcheck natural sería `/api/settings`,
  que acopla liveness a Postgres (una base caída haría reiniciar un proceso
  sano).
- `packages/db` tiene `src/health.ts` (verificar qué expone — probablemente
  un ping a la base reutilizable para readiness).
- Los logs de Nest salen sin timestamp configurado; en contenedores, sin
  marca de tiempo por línea un incidente no se puede reconstruir.

## Scope
**Incluye:** módulo de health en `apps/api/rest` con liveness (sin tocar la
base) y readiness (ping real a Postgres vía `@safari/db`), logging de Nest con
timestamp + nivel (logger integrado configurado; sin introducir stack de
observabilidad externo), y actualización del healthcheck del compose (si
US-14/15 ya existen) para usar el endpoint correcto.
**NO incluye:** métricas/Prometheus, tracing, dashboards, alerting, logs de
shop/admin (frontends), rate limiting, autenticación del endpoint.

## Criterios de aceptación

### CA-1 — Liveness sin base
Con Postgres apagado (`just db-down`), `GET /api/health` responde 200 (el
proceso está vivo) mientras `GET /api/health/ready` responde 503 con cuerpo
JSON que nombra la dependencia caída.

### CA-2 — Readiness real
Con la base arriba, `/api/health/ready` responde 200 y su chequeo es un ping
real (verificable apagando la base a mitad de sesión: pasa a 503 sin
reiniciar la API).

### CA-3 — Logs con timestamp y nivel
Cada línea de log de la API lleva timestamp inequívoco y nivel; el arranque y
un request quedan trazados. Evidencia: fragmento real de log pegado.

### CA-4 — Swagger no se rompe
`/docs` sigue sirviendo y el contrato de los endpoints existentes no cambia.

## Escenarios Gherkin
```gherkin
Feature: Salud honesta de la API
  Scenario: CA-1 — base caída
    Given la API corriendo y Postgres apagado
    When pido /api/health y /api/health/ready
    Then health responde 200 y ready responde 503 nombrando a la base
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `apps/api/rest/src/health/` (módulo nuevo) | controller + service de liveness/readiness |
| `apps/api/rest/src/main.ts` | logger con timestamp/nivel |
| `packages/db/src/health.ts` | solo si el ping reutilizable falta o no sirve tal cual |
| `docker-compose.yml` | healthcheck de la API apuntando a /api/health (si el servicio ya existe) |

## Definición de Done
- [x] Salida real de los `curl` del CA-1 (ambos endpoints, base abajo y arriba) pegada.
- [x] Fragmento real de logs con timestamps pegado.
- [x] Salida real de `just verify` en verde.
- [x] Status de esta US actualizado y fila del épico marcada.

## Resultado (2026-11-18, rama `feat/us-17-salud-logging` sobre `main` @ `cbff44e`)

### Qué se hizo

- **Módulo `src/health/`** (controller y service), público con `@Public()`.
  No usa `@nestjs/terminus`: un controller a mano cumple los CA.
  - `GET /api/health` es la liveness y no toca la base.
  - `GET /api/health/ready` es la readiness. Llama a `pingDatabase()` de
    `@safari/db`, que ya existía (`SELECT 1` con timeout de 2 s), y responde
    200 o 503 con `{status, checks: {database: {status, latency_ms}}}`.
  - El 503 nombra la dependencia, pero no trae el mensaje del driver, que
    puede llevar host y puerto, porque el endpoint es público. El mensaje va
    al log como `WARN [HealthService]`.
- **Logger** (`src/common/logging.ts`):
  - `IsoConsoleLogger` es el `ConsoleLogger` de Nest con el timestamp en
    ISO 8601 UTC, en vez de `toLocaleString()` (`11/18/2026, 10:35:24 AM`,
    que depende del locale y no dice la zona).
  - `requestLogger` deja una línea `[HTTP]` por request: método, ruta sin
    query string, status y ms.
  - El `console.log` del arranque pasa a `Logger('Bootstrap')`.
- **`@safari/db`: `setPrismaLogSink()`**, por decisión del dueño durante la
  US («Encauzarlo por Nest»).
  - Prisma imprimía por su cuenta un bloque `prisma:error …` multilínea, sin
    timestamp ni nivel. Ahora `error` y `warn` salen como eventos
    (`emit: 'event'`) y pasan por un sink.
  - Por defecto el sink imprime lo mismo que antes. La API lo apunta al
    Logger de Nest (`ERROR [Prisma]`, en una sola línea).
  - `client.ts` no estaba en la lista de archivos de la US.
- **Compose:** no se tocó. US-14 y US-15 no existen todavía y el compose solo
  tiene Postgres.

### CA-1 y CA-2 — `curl` con la base arriba, abajo y otra vez arriba, sin reiniciar la API

```
=== CA-2: base arriba
health         {"status":"ok"}  -> 200
health/ready   {"status":"ok","checks":{"database":{"status":"up","latency_ms":754}}}  -> 200
=== CA-1: just db-down con la API corriendo
 Network safari-marketplace_default  Removed
health         {"status":"ok"}  -> 200
health/ready   {"status":"error","checks":{"database":{"status":"down","latency_ms":45}}}  -> 503
settings con la base abajo -> 500
=== base arriba otra vez, misma API
  * esquema y datos de referencia aplicados
health         {"status":"ok"}  -> 200
health/ready   {"status":"ok","checks":{"database":{"status":"up","latency_ms":35}}}  -> 200
```

La latencia de la primera readiness (754 ms) incluye abrir la conexión. Con la
base abajo, `/api/settings` da 500: es la razón para no usarlo como
healthcheck.

### CA-3 — Fragmento real del log (`just api-dev`)

```
[Nest] 23828  - 2026-11-18T16:57:09.410Z     LOG [NestFactory] Starting Nest application...
[Nest] 23828  - 2026-11-18T16:57:09.437Z     LOG [InstanceLoader] HealthModule dependencies initialized
[Nest] 23828  - 2026-11-18T16:57:09.963Z     LOG [RoutesResolver] HealthController {/api/health}:
[Nest] 23828  - 2026-11-18T16:57:09.963Z     LOG [RouterExplorer] Mapped {/api/health, GET} route
[Nest] 23828  - 2026-11-18T16:57:09.976Z     LOG [NestApplication] Nest application successfully started
[Nest] 23828  - 2026-11-18T16:57:09.983Z     LOG [Bootstrap] Application is running on: http://[::1]:9001/api
[Nest] 23828  - 2026-11-18T16:57:10.712Z     LOG [HTTP] GET /api/health 200 21.6ms
[Nest] 23828  - 2026-11-18T16:57:11.625Z     LOG [HTTP] GET /api/health/ready 200 759.0ms
[Nest] 23828  - 2026-11-18T16:57:14.087Z     LOG [HTTP] GET /api/health 200 3.0ms
[Nest] 23828  - 2026-11-18T16:57:14.294Z   ERROR [Prisma] Invalid `prisma.$queryRaw()` invocation:
[Nest] 23828  - 2026-11-18T16:57:14.294Z    WARN [HealthService] Postgres no responde: Invalid `prisma.$queryRaw()` invocation:
[Nest] 23828  - 2026-11-18T16:57:14.296Z     LOG [HTTP] GET /api/health/ready 503 48.3ms
[Nest] 23828  - 2026-11-18T16:57:28.649Z     LOG [HTTP] GET /api/health 200 1.1ms
[Nest] 23828  - 2026-11-18T16:57:28.823Z     LOG [HTTP] GET /api/health/ready 200 36.7ms
```

Lo único que queda sin prefijo:

- **Líneas de continuación de una entrada multilínea.** Su primera línea ya
  lleva timestamp y nivel: el `WARN Duplicate DTO detected…` de Swagger al
  arrancar y el stack del `ERROR [ExceptionsHandler]` del 500 de
  `/api/settings`.
- **21 `console.log` heredados de Pickbazar** en `auth`, `imports`, `payment`,
  `payment-intent`, `payment-method`, `uploads` y `users`. No se tocaron:
  fuera de alcance (ver abajo).

### CA-4 — Swagger y contratos

```
settings 200 5504B
docs 200
swagger paths 177 [ '/api/health', '/api/health/ready' ]
```

`/api/settings` mide los mismos 5504 bytes que antes, y `/docs` y
`/docs-json` sirven, con los dos endpoints nuevos.

### Verificación

```
npx vitest run (apps/api/rest)  Test Files 39 passed (39) · Tests 653 passed (653)   (antes 37/646: +7)
npx tsc --noEmit -p tsconfig.json   TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"   ESLINT=0
just db-check                   Test Files 37 passed (37) · Tests 483 passed (483)   (antes 36/481: +2)
just build-api                  Done in 43.19s. BUILD_API=0
just verify
OK   API    :9001/api/settings  200  5503B  550ms
OK   Shop   :3003/en  200  191897B  490ms  cards:30
OK   Admin  :3002/en/login  200  72554B  3058ms  cards:1
```

Tests nuevos:

- `health.controller.spec.ts` (4 tests): ruta pública; la liveness no toca la
  base; readiness 200; readiness 503 sin el mensaje del driver.
- `logging.spec.ts` (3 tests): formato ISO de la línea; `oneLine`.
- `client.integration.test.ts` en `packages/db` (2 tests): un error de
  consulta llega al sink y no a la consola; con `null` vuelve a
  `prisma:error …`.
- `biome check` de `client.ts` y del test sale limpio. El aviso
  `organizeImports` de `index.ts` ya estaba en `HEAD`.

### Incidencia durante la verificación

En la primera corrida en vivo, los `curl` los respondió otra API. Era un
`nest start --watch` huérfano, lanzado por el agente a las 9:12 para
verificar el upgrade de Next a 16.4.5. Al apagarlo se mató solo el proceso
del puerto, y el watcher siguió relanzando la API. Lo delató el log: dos
procesos escribían en el mismo archivo, con bytes NUL y timestamps fuera de
orden. El `api-dev` nuevo había muerto con `EADDRINUSE`. Se mataron los dos
árboles desde su raíz y se repitió todo. La evidencia de arriba es de la
segunda corrida, un solo proceso (pid 23828). El mismo huérfano explica el
`EADDRINUSE` de US-12; su doc queda corregido.

### Fuera de alcance, mencionado

- **Los 21 `console.log` heredados.** Pasarlos al Logger es una US aparte, y
  los de pagos encajan con US-87. Ojo con `auth.service.ts:321`, que vuelca
  el `socialLoginDto` completo, con el token del proveedor social.
- **El healthcheck del compose para la API.** Llega con US-14 y US-15, que
  deben usar `/api/health` para reiniciar y `/api/health/ready` para
  enrutar.
- **La línea `[HTTP]` de cada healthcheck** puede hacer ruido cuando un
  orquestador consulte cada pocos segundos. Si molesta, filtrar
  `/api/health*` es un cambio de una línea.

## Notas para el agente ejecutor
- Revisar primero `packages/db/src/health.ts`: si ya expone el ping, la US es
  mayormente wiring en Nest.
- No usar `@nestjs/terminus` sin verificar compatibilidad con Nest 9 del
  árbol; si complica, un controller a mano cumple igual el CA.
