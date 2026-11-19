# US-15 — Compose del stack completo con healthchecks

> `docker compose up` levanta Postgres + API + tienda + admin con
> healthchecks y dependencias ordenadas, y `just verify` pasa contra los
> contenedores.

**Épico:** [Épico 13](./README.md)
**Fecha:** 2026-08-25
**Status:** Implementado (2026-11-19). El dueño fijó DA-1 a DA-4 (abajo) y
autorizó borrar el volumen para el CA-4.
**Depende de:** US-14, [US-102](./102-urls-configurables-en-ejecucion.md) y [US-104](./104-build-shop-sin-api.md) (añadidas el 2026-11-18: URLs en ejecución y build de la tienda sin la API)
**LOC est.:** ~250

## Historia
**Como** profesor que demuestra sistemas distribuidos, **quiero** levantar el
marketplace completo con un comando, **para** enseñar la arquitectura sin
gastar la primera hora de clase en tres terminales y dos instalaciones de
yarn.

## Contexto

- US-14 deja Postgres + API en compose; faltan shop y admin.
- Riesgo central heredado del épico (R-1): las `NEXT_PUBLIC_*` se inlinean en
  build time y el navegador las usa desde el host (`localhost:9001`), pero el
  SSR corre dentro de la red de compose. La imagen de los frontends se
  construye con la URL pública y el SSR debe poder resolverla (extra_hosts,
  o URL interna para SSR si el código lo permite — decidir en el design con
  evidencia del código del framework REST del shop).
- `next build` requiere los `.env` con placeholders resueltos; el patrón está
  en `just env`.
- **Nota de [US-102](./102-urls-configurables-en-ejecucion.md) (2026-11-19):**
  el R-1 ya está resuelto. Ningún frontend lee la URL de la API de una
  `NEXT_PUBLIC_*`: el navegador va por `/backend` y el SSR del shop por
  `API_INTERNAL_URL`, de ejecución. Los args de build para
  `NEXT_PUBLIC_REST_API_ENDPOINT` ya no hacen falta. Quedan en build la
  `NEXT_PUBLIC_SHOP_URL` del admin, hasta US-103, y las demás `NEXT_PUBLIC_*`
  de configuración.
- **Nota de [US-103](./103-shop-url-en-ejecucion-admin.md) (2026-11-19):** la
  URL de la tienda en el admin también es de ejecución: `SHOP_URL`, servida
  por `/api/runtime-config`. El contenedor del admin la recibe por
  `environment`, no como arg de build.

## Scope
**Incluye:** Dockerfiles multi-stage de `apps/shop` y `apps/admin/rest`,
servicios en el compose con healthchecks y `depends_on` correctos, args de
build para las `NEXT_PUBLIC_*`, receta `just` para levantar/bajar el stack
completo, y sección nueva en `apps/README.md` documentando el camino Docker.
**NO incluye:** la variante GraphQL, hot-reload en contenedores, TLS/dominios,
registry/push de imágenes, despliegue remoto (Épico 16).

## Criterios de aceptación

### CA-1 — Un comando, stack completo
Desde un working tree limpio (con imágenes ya construidas), un solo comando
(`docker compose up` o su receta just) deja los 4 servicios corriendo.

### CA-2 — `just verify` contra contenedores
`just verify` pasa: API 200 en `/api/settings`, shop 200 en `/en` con product
cards, admin 200 en `/en/login`.

### CA-3 — Healthchecks honestos
Cada servicio de app tiene healthcheck propio; `docker compose ps` los muestra
healthy, y matar la base pone unhealthy a la API (no silencio).

### CA-4 — Arranque ordenado desde cero
`docker compose down -v && up` (base vacía) termina con el stack sano y la
base sembrada (esquema+seed aplicados por el mecanismo D-2 del épico).

## Escenarios Gherkin
```gherkin
Feature: Stack completo en compose
  Scenario: CA-2 — smoke oficial
    Given el stack levantado con la receta just
    When corro just verify
    Then los tres servicios responden 200 con contenido real
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `apps/shop/Dockerfile` | multi-stage con build args NEXT_PUBLIC_* |
| `apps/admin/rest/Dockerfile` | ídem |
| `docker-compose.yml` | servicios shop/admin + healthchecks + orden |
| `justfile` | recetas del stack dockerizado |
| `apps/README.md` | sección del camino Docker |

## Definición de Done
- [x] Salida real de `docker compose ps` con los 4 servicios healthy pegada.
- [x] Salida real de `just verify` en verde contra los contenedores pegada.
- [x] Evidencia del CA-4 (up desde volumen borrado) pegada.
- [x] Tiempos de build documentados (R-2 del épico).
- [x] Status de esta US actualizado y fila del épico marcada.

## Notas para el agente ejecutor
- Es la US más pesada del épico por los builds de Next en Docker: si el design
  concluye que shop y admin no caben juntos en una sesión, PARAR y proponer el
  split (shop primero) antes de ejecutar a medias.
- No usar `APPLICATION_MODE=production` para silenciar errores de TS en el
  build sin decirlo: si hace falta, queda documentado en el Dockerfile y en el
  reporte.

## Resultado (2026-11-19, rama `feat/us-15-compose-stack-completo` sobre `main` @ `f22d205`)

### Decisiones del dueño al ejecutar

| # | Tema | Decisión |
|---|---|---|
| DA-1 | `/backend` en el compose | **Proxy Caddy** (`docker/Caddyfile`): publica 3003 y 3002 y enruta `/backend/*` a `api:9001/api/*`, como Dokploy. El rewrite de `next.config.js` solo existe en `next dev` (US-102); sin proxy, todo lo que el navegador pide a `/backend` daría 404. |
| DA-2 | Siembra (D-2 del épico) | **Servicio `db-init`**: un `postgres:16-alpine` que corre los mismos `db/schema.sql` y `db/seed.sql` (montados, no copiados) que `just db-migrate` y termina. La API espera a `service_completed_successfully`. |
| DA-3 | Chequeo de tipos | **La tienda los comprueba; el admin no.** El `tsc` del admin falla con `TS2688: Cannot find type definition file for 'minimatch'` (hallazgo de US-10, comprobado de nuevo hoy), así que su Dockerfile lleva `APPLICATION_MODE=production` y lo explica en un comentario. |
| DA-4 | Estructura | **Dos Dockerfiles separados**, `apps/shop/Dockerfile` y `apps/admin/rest/Dockerfile`, como en la tabla de la US. Para no pagar dos veces el install del workspace, sus etapas `deps` y `prod-deps` son idénticas byte a byte y BuildKit las reutiliza por contenido (medido abajo: el admin no reinstala). |

### Decisiones técnicas

- **Contexto de build: la raíz del repo**, como en US-14. El `.dockerignore`
  readmite el workspace de `apps/`: `package.json`, `yarn.lock`,
  `tailwind-v3-colors.js` (lo leen los dos `tailwind.config.js`), `shop/`,
  `admin/rest/` y solo el `package.json` de `admin/graphql`. Yarn v1 con
  `--frozen-lockfile` exige todos los workspaces del lockfile. También excluye
  `.next` y `*.tsbuildinfo`.
- **Cuatro etapas por imagen:**
  - `deps`: install completo, para el build.
  - `prod-deps`: install `--production`, lo que se embarca.
  - `config`: los `ARG`/`ENV` de las `NEXT_PUBLIC_*`, que heredan
    `build` y `runtime` porque `next-i18next.config.js` las lee también al
    arrancar.
  - `build` + `runtime`: `next start -p 3000` lanzado con `node`, sin yarn
    delante, y `init: true` en el compose para que `SIGTERM` llegue a Next.
- **Variables de ejecución en el compose:**
  - **Tienda:** `API_INTERNAL_URL=http://api:9001/api`,
    `NEXTAUTH_URL=http://localhost:3003`, `NEXTAUTH_URL_INTERNAL=http://localhost:3000`
    (las llamadas de next-auth desde el servidor no pueden ir a
    `localhost:3003` dentro del contenedor) y `SECRET`, con un valor de
    desarrollo sobreescribible como `JWT_SECRET` (`SHOP_SECRET`).
  - **Admin:** `SHOP_URL`.
- **CA de Zscaler también en runtime** de tienda y admin. El optimizador de
  imágenes de Next descarga las fotos del seed desde
  `pickbazarlaravel.s3...amazonaws.com` (3188 URLs en `db/seed.sql`) y,
  detrás de Zscaler, sin el CA fallaría. Va como secreto de compose en
  `/run/secrets/extra_ca`.
- **Healthchecks:**
  - API: `wget /api/health/ready`, que consulta la base (US-17).
  - Tienda: `wget /en`. Admin: `wget /en/login`.
  - Tienda y admin con `start_period` de 60 s.
  - El proxy no tiene healthcheck propio: depende de que tienda y admin estén
    healthy.
- **`just api-docker` ya no llama a `just db-up`**: la siembra la hace
  `db-init`, del que depende la API. Llamarlo sembraría dos veces.

### Qué cambió

| Archivo | Cambio |
|---|---|
| `apps/shop/Dockerfile` | nuevo: deps / prod-deps / config / build / runtime, con tipos |
| `apps/admin/rest/Dockerfile` | nuevo: ídem, con `APPLICATION_MODE=production` en el build (DA-3) |
| `docker/Caddyfile` | nuevo: proxy de 3003 y 3002 con `/backend` |
| `docker-compose.yml` | servicios `db-init`, `shop`, `admin` y `proxy`; healthcheck y dependencia de `db-init` en `api`; el secreto `extra_ca` también en runtime |
| `.dockerignore` | readmite el workspace de `apps/`; excluye `.next` y `*.tsbuildinfo` |
| `justfile` | `stack-up` y `stack-down`; `api-docker` sin `db-up` |
| `apps/README.md` | subsección «Alternativa: el stack completo en contenedores (US-15)»; la de US-14 apunta a `db-init` |

### Tiempos de build (R-2 del épico)

Con caché previa solo de la imagen base `node:22-alpine`, detrás de Zscaler:

```text
$ time docker build --progress=plain --secret id=extra_ca,src="$NODE_EXTRA_CA_CERTS" -f apps/shop/Dockerfile -t safari-shop .
#13 [deps 7/7] RUN ... yarn install --frozen-lockfile ...                DONE 605.7s
#12 [prod-deps 7/7] RUN ... yarn install --frozen-lockfile --production  DONE 520.5s   (en paralelo)
#20 [build 5/5] RUN yarn build:rest                                     DONE 203.8s
      Running TypeScript ...
      Finished TypeScript in 38.4s ...
      ✓ Compiled successfully in 66s
      ✓ Generating static pages using 11 workers (29/29) in 3.5s
#24 exporting to image                                                  DONE 181.5s
real    23m20.778s     rc=0

$ time docker build ... -f apps/admin/rest/Dockerfile -t safari-admin .
#6 … #10 CACHED        (las etapas deps y prod-deps, compartidas con la tienda)
#19 6.201   Skipping validation of types
#19 126.9 ✓ Compiled successfully in 111s
#19 148.5 ✓ Generating static pages using 11 workers (77/77) in 6.3s
real    6m43.770s      rc=0

$ docker images
safari-admin  2.07GB
safari-shop   1.86GB
safari-api    1.47GB
```

El build de la tienda, sin API, deja los 59 avisos `[ssr]` de US-104 y las
29 páginas de siempre.

### CA-1 — Un comando, stack completo

Con las imágenes ya construidas y los puertos libres:

```text
$ time just stack-up
 Container safari-postgres  Healthy
 Container safari-db-init  Started
 Container safari-db-init  Exited
 Container safari-api  Healthy
 Container safari-admin  Healthy
 Container safari-shop  Healthy
 Container safari-proxy  Started
esperando a que los servicios esten healthy listo
NAME              STATUS
safari-admin      Up 12 seconds (healthy)
safari-api        Up 29 seconds (healthy)
safari-postgres   Up 37 seconds (healthy)
safari-proxy      Up 4 seconds
safari-shop       Up 12 seconds (healthy)
tienda http://localhost:3003  admin http://localhost:3002  API http://localhost:9001/api
real    0m59.114s
```

El working tree no influye: el `.dockerignore` deja fuera `node_modules`,
`dist`, `.next` y `generated` (comprobado para el contexto en US-14), y
todo se construye dentro.

### CA-2 — `just verify` contra contenedores

```text
$ just verify
OK   API    :9001/api/settings  200  5503B  480ms
OK   Shop   :3003/en  200  192788B  27ms  cards:30
OK   Admin  :3002/en/login  200  73118B  26ms  cards:1
```

Además del smoke, el camino del navegador a través del proxy:

```text
GET :3003/backend/settings -> 200 5504B
GET :3002/backend/settings -> 200 5504B
POST :3002/backend/token (admin@demo.com) -> {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
optimizador /_next/image?url=https%3A%2F%2Fpickbazarlaravel.s3...  -> 200 image/png
GET /en/products/apples (primera visita, ruta dinámica) -> 200 112543B 0.128s
```

### CA-3 — Healthchecks honestos

`docker compose stop postgres` con el stack arriba:

```text
--- base parada +15s
safari-admin Up 56 seconds (healthy)
safari-api Up About a minute (healthy)
safari-shop Up 56 seconds (healthy)
--- base parada +30s
safari-admin Up About a minute (healthy)
safari-api Up About a minute (unhealthy)
safari-shop Up About a minute (healthy)
18:30:46 exit=1 wget: server returned error: HTTP/1.1 503 Service Unavailable
$ docker compose start postgres
--- base de vuelta +10s: safari-api Up 2 minutes (healthy)
settings -> 200
```

La API pasa a `unhealthy` en cuanto fallan 3 sondas seguidas de 10 s, y
vuelve sola en menos de 10 s cuando vuelve la base. Tienda y admin siguen
`healthy` a propósito: sirven las páginas ya generadas (US-104), y su sonda
mide su propio proceso, no la base.

### CA-4 — Arranque ordenado desde cero

`docker compose down -v` (autorizado por el dueño) y `just stack-up`:

```text
 Volume safari-marketplace_postgres-data  Removed
--- up desde cero 13:32:02
 Volume "safari-marketplace_postgres-data"  Created
 Container safari-postgres  Healthy
 Container safari-db-init  Started
 Container safari-db-init  Exited
 ... (api, shop y admin healthy; proxy started)
real    0m37.854s
safari-db-init  | esquema y datos de referencia aplicados
/safari-db-init exit=0 2026-11-19T18:32:22.836Z -> 2026-11-19T18:32:25.039Z
/safari-api StartedAt=2026-11-19T18:32:25.563Z
$ just verify
OK   API    :9001/api/settings  200  5503B  495ms
OK   Shop   :3003/en  200  192788B  19ms  cards:30
OK   Admin  :3002/en/login  200  73118B  16ms  cards:1
products total: 1199
```

`db-init` siembra el volumen vacío en 2.2 s, y la API arranca 0.5 s después
de que termine.

### Recetas y flujo actual

```text
$ just api-docker            (con el stack arriba)
esperando a la API... lista en http://localhost:9001/api
$ just stack-down
 Container safari-postgres  Stopped
stack-down en 3s
safari-admin Exited (143)   safari-api Exited (143)   safari-shop Exited (143)
safari-db-init Exited (0)   safari-postgres Exited (0)   safari-proxy Exited (0)
$ just db-up
  * esquema y datos de referencia aplicados
safari-postgres Up 8 seconds (healthy)      (solo Postgres, como antes)
```

Exit 143 en los tres Node: `SIGTERM` atendido, no un kill a los 10 s.

### Incidente de entorno durante la ejecución

A mitad de la verificación, Docker Desktop (4.34.3) dejó de montar carpetas
del host:

```text
mkdir /run/desktop/mnt/host/c: file exists
```

Tras reiniciarlo, el motor tampoco arrancaba:

```text
running engine: waiting for the Docker API: context deadline exceeded
no connected VM
```

Ni `wsl --shutdown` ni el primer arranque tras reiniciar la máquina lo
arreglaron. En un arranque posterior, sin cambiar de versión (sigue en
4.34.3), el motor levantó, y todo lo de arriba se midió desde entonces. Las
imágenes y los volúmenes sobrevivieron. Causa probable: WSL se actualizó solo
a la 3.0.5 (kernel 6.18) el 2026-11-10, y Docker Desktop es de 2024. Si
vuelve a pasar, actualizar Docker Desktop. No es un defecto del repo.

### Hallazgos que no se accionaron (NO incluye)

- **Imágenes grandes:** 1.86 GB la tienda y 2.07 GB el admin. Embarcan los
  `node_modules` de producción del workspace entero, incluido
  `admin/graphql`. `output: 'standalone'` las bajaría a unos cientos de MB,
  pero toca los `next.config.js` y el trazado de archivos en un monorepo. Es
  candidato para el Épico 16, igual que el peso de la API (US-14).
- **El admin sigue sin chequeo de tipos** hasta que alguien resuelva
  `TS2688 minimatch`. El Dockerfile dice qué línea quitar.
- **Sin cache mounts de yarn:** el R-2 del épico los proponía. Con las etapas
  compartidas, un rebuild solo reinstala si cambia un `package.json` o el
  `yarn.lock`; en ese caso vuelven los ~10 min.
- **CLAUDE.md** sigue diciendo que `docker-compose.yml` es «Solo Postgres 16»
  y no menciona `just api-docker` ni `just stack-up`. Es del dueño.
