# US-106 — Imagen liviana de la API: una sola copia de Prisma, sin el CLI

> La imagen de la API (US-14) pesa 1.47 GB, y casi todo es peso muerto: dos
> copias de Prisma, el CLI de Prisma con sus dependencias y la caché de npm.
> Esta US las quita sin cambiar el comportamiento de la API. Es la segunda
> mitad de la US-105 original, que el dueño partió en dos.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-19
**Status:** Implementado (2026-11-19). Promovida desde `_backlog/` el 2026-11-19
(como parte de la US-105 original), tras la revisión del sub-agente fable 5.
El dueño fijó el mecanismo de D-1.
**Depende de:** [US-105](./105-imagenes-frontend-livianas.md). Las dos tocan
`apps/api/rest/Dockerfile` (US-105 solo fija `NODE_IMAGE`) y `apps/README.md`.
**LOC est.:** ~60

## Historia

**Como** responsable del despliegue, **quiero** que la imagen de la API lleve
solo lo que necesita para correr, **para** que subirla a Docker Hub y bajarla
en Dokploy sea rápido y quepa en una VM modesta.

## Contexto (medido el 2026-11-19 sobre `main` @ `a0e5d44`)

`safari-api` pesa **1.47 GB**. Etapa `runtime` de `apps/api/rest/Dockerfile`:

| Ruta | Tamaño | Principal contenido |
|---|---|---|
| `/repo/apps/api/rest/node_modules` | 443 MB | `@prisma` 166 MB (`@prisma/client` 71 MB, `@prisma/studio-core` 42 MB, `@prisma/engines` 22 MB, `@prisma/dev` 20 MB), `prisma` 41 MB, `effect` 34 MB, `@electric-sql` 25 MB, `typescript` 24 MB |
| `/repo/packages/db/node_modules` | 328 MB | `@prisma` 144 MB, `prisma` 40 MB, `effect` 34 MB, `@electric-sql` 25 MB, `typescript` 23 MB |
| `/root/.npm` + `/root/.cache` | 88 + 23 MB | caché del `npm ci --omit=dev` del runtime (por eso la capa mide 439 MB y el `du` 328) |
| Los dos `dist/` | 13 MB | el código real |

### Hechos verificados

- **La copia de Prisma de la API es 100 % muerta.** La API no declara
  Prisma: le llega por `@safari/db` (`link:` → symlink `node_modules/@safari/db
  -> ../../../../../packages/db`), y el `yarn install --production` de la API
  instala igual las dependencias de ese paquete (`npm ls` marca
  `@prisma/client@7.10.1 extraneous`). En ejecución, desde
  `/repo/packages/db/dist`, `@prisma/client/runtime/client` resuelve a
  `/repo/packages/db/node_modules/...`, porque Node sigue el realpath del
  symlink.
- **El CLI `prisma` no se usa en ejecución.** `packages/db/dist/index.js` solo
  requiere `@prisma/adapter-pg`, `@prisma/client/runtime/client`, `path` y
  `url`, más dos `import()` dinámicos del query compiler wasm de
  `@prisma/client/runtime/`. No hay imports de `prisma` en `packages/db/src`
  ni en `apps/api/rest/src`. `prisma.config.ts` solo lo lee el CLI.
- `packages/db/package.json:31` declara `prisma` en `dependencies`. En
  `@prisma/client@7.10.1`, `prisma` es peer opcional, así que
  `npm ci --omit=dev` no lo reinstala si pasa a `devDependencies`.
- Mover `prisma` a `devDependencies` **no rompe el flujo local**:
  `just db-build` hace `npm install` con dev, y la etapa `db-build` del
  Dockerfile usa `npm ci` completo.
- `typescript` entra en producción por dependencias transitivas
  (`@nestjs/swagger@12.0.2 → typescript@6.0.3`). No es objetivo perseguirlo.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Una sola copia de Prisma (dueño) | `prisma` pasa a `devDependencies` de `packages/db`, regenerando `package-lock.json` con `npm install` (nunca a mano). En la etapa `runtime` se invierte el orden: primero el `yarn install --production` de la API **sin** el `package.json` de `packages/db` en su sitio, para que yarn no instale sus dependencias a través del `link:`; después `npm ci --omit=dev` en `packages/db`. Sobrevive la copia del mismo lock que generó el cliente. **Respaldo,** si yarn v1 no tolera el destino del `link:` sin manifest o el `--frozen-lockfile` exige regenerar el lock: sustituir el symlink por una carpeta real (`node_modules/@safari/db` con `package.json` y `dist`) sin instalar `packages/db` en runtime. En ese caso se exige que las versiones de los dos lockfiles coincidan (R-1). Anotar cuál se usó y por qué. |
| D-2 | Caché de npm | El `RUN` del `npm ci --omit=dev` termina con `npm cache clean --force` y borra `/root/.cache`, en la misma capa. |
| D-3 | Meta de tamaño | La API queda en **≤ 600 MB**, y en ningún caso por encima del 50 % de su tamaño actual (≤ 0.73 GB). Si no llega, **detenerse y reportar** qué lo impide. |
| D-4 | Lo que no cambia | Puerto 9001, healthcheck `/api/health/ready`, `init: true`, secreto `extra_ca`, usuario `node`, variables de ejecución, y que la imagen se construya desde la raíz con `link:` a `packages/db` (US-14). |

## Scope

**Incluye:**

- `apps/api/rest/Dockerfile` (etapa `runtime`; la `NODE_IMAGE` ya la fijó US-105);
- `packages/db/package.json` y `packages/db/package-lock.json`;
- `apps/api/rest/yarn.lock`, solo si D-1 obliga a regenerarlo (con `yarn install`);
- `apps/README.md`: el tamaño de la API.

**NO incluye:**

- sacar `typescript` de producción si exige parchear dependencias de terceros;
- quitar `dotenv` de `dependencies` de `packages/db` (solo lo usan los tests y `prisma.config.ts`);
- cambiar la API o `packages/db` fuera de lo anterior;
- distroless, multi-arquitectura, CI o Docker Hub.

## Criterios de aceptación

### CA-0 — Línea base
Antes de tocar nada: `docker images safari-api`, `GET /api/settings` (200,
5504 bytes) y el login de `admin@demo.com` contra la imagen actual, pegados en
la evidencia.

### CA-1 — Tamaño
Tabla antes/después con la salida de `docker images safari-api`. Se cumple D-3.

### CA-2 — La API sigue viva
Con `just stack-up`:

- `/api/health/ready` responde 200;
- `/api/settings` da 200 con 5504 bytes;
- el login de `admin@demo.com` devuelve un token válido (se usa en una ruta protegida);
- `just verify` en verde.

### CA-3 — Una sola copia de Prisma, sin CLI
Dentro de la imagen:

- `ls /repo/apps/api/rest/node_modules/prisma` y `ls /repo/packages/db/node_modules/prisma` **fallan**;
- `find / -path '*@prisma/client/package.json' -not -path '/proc/*'` da **una sola** línea;
- la versión de esa copia es la que fija `packages/db/package-lock.json`.

### CA-4 — Sin caché de npm
`du -sh /root/.npm /root/.cache` dentro de la imagen falla o da 0.

### CA-5 — El flujo local no cambia
- `just db-build` y `just db-check` en verde (con `just db-up`);
- `just check` en verde;
- `just api-dev` responde en `/api/settings` con el contenedor de la API abajo.

### CA-6 — Parada limpia
`docker compose stop api` en menos de 10 s, con código 0 o 143.

## Escenarios Gherkin

```gherkin
Feature: Imagen de la API liviana sin cambiar el comportamiento

  Scenario: CA-3 — una sola copia de Prisma
    Given la imagen safari-api construida con esta US
    When busco package.json de @prisma/client dentro de la imagen
    Then encuentro una sola copia
    And no existe el CLI prisma en ningún node_modules

  Scenario: CA-2 — la API responde igual
    Given el stack arriba con la imagen nueva de la API
    When pido GET /api/settings
    Then recibo 200 con 5504 bytes
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/rest/Dockerfile` | Runtime: orden de installs (D-1), limpieza de caché (D-2) |
| `packages/db/package.json` + `package-lock.json` | `prisma` a `devDependencies` |
| `apps/api/rest/yarn.lock` | Solo si D-1 lo exige |
| `apps/README.md` | Tamaño de la API |

## Definición de Done

- [x] CA-0 a CA-6 verificados, con la salida real pegada en «Resultado».
- [x] `just check` en verde, con la salida pegada.
- [x] Status de esta US en `Implementado` y fila del Épico 16 marcada.

## Riesgos

- **R-1 — Deriva de versión de Prisma.** El cliente generado sale del
  `package-lock.json` de `packages/db`. Si la copia que sobrevive en runtime
  sale del `yarn.lock` de la API (respaldo de D-1), las dos pueden divergir.
  Hoy ambas son 7.10.1. CA-3 lo vigila.
- **R-2 — `yarn install --frozen-lockfile` de la API** puede no tolerar el
  cambio en el manifest de `@safari/db`. Es una prueba de 5 minutos; si
  falla, regenerar el lock con `yarn install` o pasar al respaldo.
- **R-3 — Docker Desktop inestable** (incidente de US-15). Se admite cierre
  parcial con evidencia de lo verificado y lo pendiente.

## Notas para el agente ejecutor

- Leer antes US-14 (Dockerfile de la API) y US-105 (que deja `NODE_IMAGE`
  fijada).
- Detrás de Zscaler, construir con el secreto `extra_ca` (`just api-docker`).
- Las decisiones son del dueño. Si una choca con lo que encuentres, **detente
  y pregunta**.

## Resultado (2026-11-19, rama `feat/us-106-imagen-api-liviana` sobre `main` @ `4f91371`)

### Qué cambió

| Archivo | Cambio |
|---|---|
| `packages/db/package.json` | `prisma` pasa de `dependencies` a `devDependencies` |
| `packages/db/package-lock.json` | regenerado con `npm install`: solo cambia la marca `devOptional` de las 134 entradas del árbol del CLI; ninguna versión |
| `apps/api/rest/Dockerfile` | runtime: primero el `yarn install --production` de la API sin el manifest de `packages/db`, después `npm ci --omit=dev --omit=optional` en `packages/db` con `npm cache clean --force` y `rm -rf /root/.npm /root/.cache` |
| `apps/api/rest/yarn.lock` | **sin cambios**: `--frozen-lockfile` lo acepta tal cual (R-2 no se materializó) |
| `apps/README.md` | peso de la API y el porqué de una sola copia de Prisma |

### Cómo se llegó al mecanismo (D-1)

1. **El origen de la copia duplicada.** El `yarn.lock` de la API trae
   entradas para `@prisma/adapter-pg`, `@prisma/client` y el resto: yarn v1
   **sí** instala las dependencias del paquete enlazado por `link:`.
2. **Prueba aislada** (un Dockerfile de prueba en el scratchpad): yarn con el
   destino del `link:` vacío.

   ```text
   caso A rc=0
   Done in 57.40s.
   prisma en api: ls: node_modules/@prisma/client: No such file or directory ls: node_modules/prisma: No such file or directory
   link: lrwxrwxrwx    1 root     root   26 Nov 19 20:14 db -> ../../../../../packages/db
   tamaño: 121.7M
   ```

   El mecanismo preferido funciona: no hizo falta el respaldo.
3. **Primer build: 830 MB, por encima de la meta.** El CLI seguía dentro:

   ```text
   144.3M  /repo/packages/db/node_modules/@prisma
   40.2M   /repo/packages/db/node_modules/prisma
   33.8M   /repo/packages/db/node_modules/effect
   25.4M   /repo/packages/db/node_modules/@electric-sql
   ```

   npm marca el árbol del CLI como `devOptional`: es devDependency y, a la
   vez, peer opcional de `@prisma/client`. `--omit=dev` conserva lo
   opcional. Clasificando el lock:

   ```text
   dev 167 | devOptional 134 (el árbol del CLI) | prod 23 | optional 1 pg-cloudflare
   ```

   Lo único `optional` de verdad es `pg-cloudflare`, que `pg` solo carga
   dentro de Cloudflare Workers. Con `--omit=optional` quedan exactamente
   los 23 de producción. Es un detalle de D-1, no un cambio de mecanismo; va
   comentado en el Dockerfile.

### CA-0 — Línea base (imagen de `main` @ `4f91371`)

```text
imagen: 1.47GB
health/ready: 200
settings: 200 5504B
login admin@demo.com: token de 256 caracteres
ruta protegida /api/me con el token: 200
ruta protegida /api/me sin token: 401
products total: 1199
442.4M  /repo/apps/api/rest/node_modules
328.0M  /repo/packages/db/node_modules
/repo/packages/db/node_modules/@prisma/client/package.json
/repo/apps/api/rest/node_modules/@prisma/client/package.json
```

### CA-1 — Tamaño

```text
$ docker images safari-api
safari-api   379e4b8f22a2   504MB      (antes 1.47GB)
```

| Ruta | Antes | Después |
|---|---|---|
| `apps/api/rest/node_modules` | 442 MB | 122 MB |
| `packages/db/node_modules` | 328 MB | 76 MB |
| `/root/.npm` + `/root/.cache` | ~111 MB | — |
| **Imagen** | **1.47 GB** | **504 MB** (−66 %; D-3: ≤ 600 MB ✅) |

### CA-2 — La API sigue viva

Con el stack completo arriba sobre la imagen nueva:

```text
$ just verify
OK   API    :9001/api/settings  200  5503B  556ms
OK   Shop   :3003/en  200  192788B  27ms  cards:30
OK   Admin  :3002/en/login  200  73118B  22ms  cards:1
imagen: 504MB
health/ready: 200
settings: 200 5504B
login admin@demo.com: token de 256 caracteres
ruta protegida /api/me con el token: 200
ruta protegida /api/me sin token: 401
products total: 1199
logs api con cannot find module|pg-cloudflare: 0
```

Las líneas funcionales son idénticas a las de CA-0 (`diff`).

### CA-3 y CA-4 — Una sola copia de Prisma, sin CLI ni caché

```text
== CA-3
ls: /repo/apps/api/rest/node_modules/prisma: No such file or directory
ls: /repo/packages/db/node_modules/prisma: No such file or directory
copias de @prisma/client:
/repo/packages/db/node_modules/@prisma/client/package.json
versión de esa copia: 7.10.1
versión en packages/db/package-lock.json: 7.10.1
== CA-4
du: /root/.npm: No such file or directory
du: /root/.cache: No such file or directory
```

### CA-5 — El flujo local no cambia

```text
$ just db-build
CJS ⚡️ Build success in 552ms
DTS ⚡️ Build success in 27232ms
db-build rc=0
$ just check
OK    [1/10] packages/db build  35s
OK    [2/10] packages/db lint  8s
OK    [3/10] packages/db typecheck  12s
OK    [4/10] api/rest typecheck  65s
OK    [5/10] api/rest lint  75s
OK    [6/10] admin/rest lint  138s
OK    [7/10] shop lint  22s
OK    [8/10] api/rest test  59s       (Test Files 44 passed, Tests 710 passed)
OK    [9/10] packages/db test  80s    (Test Files 38 passed, Tests 499 passed)
OK    [10/10] scraper db-test  4s
check: VERDE (10 pasos, 499s)
$ just db-check
 Test Files  38 passed (38)
      Tests  499 passed (499)
$ just api-dev        (con el contenedor de la API abajo)
api-dev /api/settings: 200 5504B
```

### CA-6 — Parada limpia

```text
$ docker compose stop api
stop api tardó 1411 ms
safari-api Exited (143) 1 second ago
```

### Tiempos

El primer build tras el cambio tardó 4 min 28 s, reutilizando las etapas
`db-build` y `api-build`; la corrección de `--omit=optional`, 38 s.
Primero se rehace el `yarn install` de la API y después el `npm ci`.

### Incidente

Un `just stack-up` se quedó colgado 11 minutos en `docker compose up -d --build`
sin escribir nada. El build por separado salió de caché en segundos, y
`docker compose up -d` sin `--build` levantó el stack normalmente. Es la
misma inestabilidad de Docker Desktop de US-15 (R-3), no un efecto de esta
US.

Al terminar se apagaron `api-dev` (por su PID raíz) y el stack. Los puertos
quedaron libres.

### Hallazgos que no se accionaron (NO incluye)

- **Quedan 12 carpetas de scope vacías** en `packages/db/node_modules`
  (`@biomejs`, `@vitest`…), de 4 KB cada una: un resto de npm, sin
  archivos.
- **`typescript` (24 MB) sigue en producción** por `@nestjs/swagger`, y
  `dotenv` en `dependencies` de `packages/db`. Los dos estaban fuera de
  alcance.
- **CLAUDE.md** sigue diciendo que `docker-compose.yml` es «Solo Postgres
  16». Es del dueño.
