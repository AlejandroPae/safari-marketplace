# US-14 — Dockerizar la API REST

> Un Dockerfile multi-stage para `apps/api/rest` que construye `packages/db`
> dentro de la imagen y corre `node dist/main`, integrado al compose junto a
> Postgres.

**Épico:** [Épico 13](./README.md)
**Fecha:** 2026-08-25
**Status:** Implementado (2026-11-19). El dueño fijó DA-3 (`JWT_SECRET`) y
autorizó borrar el volumen para el CA-3.
**Depende de:** ninguna
**LOC est.:** ~150

## Historia
**Como** estudiante, **quiero** levantar la API con `docker compose up api`,
**para** tener el backend reproducible sin instalar Node/yarn en el host y
como pieza base del stack completo (US-15) y del despliegue (Épico 16).

## Contexto

- `api/rest` compila con `yarn build` (nest build) y corre con
  `node dist/main`; lee `PORT` del entorno (fallback 5000).
- Depende de `@safari/db` por `link:../../../packages/db`, cuyo `dist/` y
  `generated/` están gitignored: la imagen DEBE construir `packages/db`
  (npm install + prisma generate + tsup) antes del build de Nest.
- Necesita `DATABASE_URL` (desde la migración de `/api/settings`); dentro de
  la red de compose el host es el servicio `postgres` en su puerto interno
  5432, no `localhost:5433`.

## Scope
**Incluye:** Dockerfile multi-stage de la API (contexto de build que abarque
`packages/db`), `.dockerignore`, servicio `api` en el compose (depends_on
postgres healthy, environment con `PORT` y `DATABASE_URL`), y receta
`just`/documentación mínima para levantarla.
**NO incluye:** dockerizar shop/admin (US-15), CI de imágenes, registry/push,
hot-reload dentro del contenedor, tocar el código de la API.

## Criterios de aceptación

### CA-1 — La imagen construye desde cero
`docker build` termina OK en un working tree limpio (sin `dist/` ni
`node_modules` locales previos), demostrando que `packages/db` se construye
dentro.

### CA-2 — La API responde desde el contenedor
Con `docker compose up`, `curl http://localhost:9001/api/settings` responde
200 con el JSON real (que sale de Postgres, no del mock).

### CA-3 — Espera a la base
El servicio `api` arranca después del healthcheck de Postgres; un
`docker compose up` desde cero (volumen borrado) no deja la API caída por
carrera con la base.

### CA-4 — El flujo actual no se rompe
`just db-up` y el desarrollo nativo (`just api-dev`) siguen funcionando igual.

## Escenarios Gherkin
```gherkin
Feature: API en contenedor
  Scenario: CA-2 — settings desde el contenedor
    Given docker compose up con la base sembrada
    When pido GET /api/settings en el puerto publicado
    Then recibo 200 con el payload de settings desde Postgres
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `apps/api/rest/Dockerfile` (o raíz, según contexto de build elegido) | multi-stage build |
| `.dockerignore` | excluir node_modules/.next/dist locales |
| `docker-compose.yml` | servicio `api` |
| `justfile` | receta para el stack dockerizado (si el design la define acá y no en US-15) |

## Definición de Done
- [x] Salida real (resumida) del `docker build` limpio pegada.
- [x] Salida real del `curl` a `/api/settings` contra el contenedor pegada.
- [x] Evidencia del CA-3 (up desde volumen borrado) pegada.
- [x] Salida real de `just verify` (o su equivalente parcial para la API) pegada.
- [x] Status de esta US actualizado y fila del épico marcada.

## Notas para el agente ejecutor
- El contexto de build debe incluir `packages/db` Y `apps/api/rest`: decidir
  en el design si el contexto es la raíz del repo con `.dockerignore` fuerte
  (recomendación inicial) o un contexto compuesto.
- `db/schema.sql`/seed siguen aplicándose por `just db-migrate` (D-2 del
  épico): la imagen de la API no siembra la base.

## Resultado (2026-11-19, rama `feat/us-14-dockerizar-api` sobre `main` @ `5751d42`)

### Decisiones tomadas al ejecutar

- **DA-1 — Contexto de build: la raíz del repo.** Es la recomendación de las
  notas. El Dockerfile vive en `apps/api/rest/Dockerfile` y el
  `.dockerignore` de la raíz es una **lista blanca**: excluye todo y readmite
  `apps/api/rest` y `packages/db`, menos `node_modules`, `dist`,
  `generated`, `coverage`, `.env*` y logs. US-15 añadirá ahí sus carpetas.
- **DA-2 — Tres etapas** (D-1 del épico): `db-build` (npm ci + `prisma
  generate` + tsup), `api-build` (yarn install + `nest build`) y `runtime`
  (`npm ci --omit=dev` y `yarn install --production` más los dos `dist/`).
  La imagen reproduce la estructura del repo (`/repo/packages/db`,
  `/repo/apps/api/rest`) para que el `link:../../../packages/db` resuelva
  igual que en el host. Corre como el usuario `node`, con
  `NODE_ENV=production`.
- **DA-3 — `JWT_SECRET` (decisión del dueño):** valor de desarrollo
  sobreescribible en el compose, `${JWT_SECRET:-solo-desarrollo-local-no-usar-en-la-nube}`,
  igual que las credenciales de Postgres que ya están versionadas ahí. La US
  solo nombraba `PORT` y `DATABASE_URL`, pero la API no arranca sin
  `JWT_SECRET` (`jwt-options.ts` lanza). También va `SHOP_URL`, con el
  mismo default que el código.
- **DA-4 — CA corporativo como secreto de build.** El primer `docker build`
  falló en `prisma generate`:

  ```text
  Error: request to https://binaries.prisma.sh/all_commits/d1b3f377.../linux-musl-openssl-3.0.x/schema-engine.gz.sha256
  failed, reason: unable to get local issuer certificate
  ```

  Zscaler inspecciona el TLS y el contenedor no confía en su CA. El Dockerfile
  monta un secreto de BuildKit opcional, `extra_ca`, en cada `RUN` que sale a
  la red, con `NODE_EXTRA_CA_CERTS` en el propio `RUN` y no en un `ENV`.
  Compose lo toma de la variable `NODE_EXTRA_CA_CERTS` del host; si no está,
  usa el archivo vacío `apps/api/rest/no-extra-ca.txt` (no `.pem`:
  `apps/.gitignore` ignora `*.pem`). Sin CA, Node avisa y sigue con los suyos.
- **DA-5 — Receta `just api-docker`** (y `api-docker-down`): corre
  `just db-up` (que siembra, D-2), `docker compose up -d --build api` y espera
  a que `/api/settings` responda. El servicio `api` no lleva perfil: `just
  db-up` sigue levantando solo `postgres` porque lo nombra.

### Qué cambió

| Archivo | Cambio |
|---|---|
| `apps/api/rest/Dockerfile` | nuevo: multi-stage, secreto `extra_ca` opcional |
| `.dockerignore` (raíz) | nuevo: lista blanca |
| `apps/api/rest/no-extra-ca.txt` | nuevo: reemplazo vacío del secreto |
| `docker-compose.yml` | servicio `api` (`depends_on` healthy, `environment`, puerto 9001) y secreto `extra_ca` |
| `justfile` | grupo `docker`: `api-docker`, `api-docker-down`; el comentario de `db-down` avisa de que también apaga la API |
| `apps/README.md` | subsección «Alternativa: la API en contenedor (US-14)» |

No se tocó el código de la API (NO incluye).

### CA-1 — La imagen construye desde cero

Build sin caché (`--no-cache`), con el CA corporativo:

```text
$ time docker build --no-cache --progress=plain --secret id=extra_ca,src="$NODE_EXTRA_CA_CERTS" \
    -f apps/api/rest/Dockerfile -t safari-api:us14 .
#9  [db-build 4/6] RUN ... npm ci --ignore-scripts                              DONE 113.4s
#11 [db-build 6/6] RUN ... DATABASE_URL=postgresql://build:build@... npm run build  DONE 64.0s
#19 [api-build 5/7] RUN ... yarn install --frozen-lockfile --non-interactive    DONE 346.9s
#21 [api-build 7/7] RUN yarn build                                             DONE 56.6s
      $ rimraf dist
      $ nest build
      Done in 54.83s.
#8  [runtime 4/9] RUN ... npm ci --omit=dev --ignore-scripts                    DONE 106.9s
#15 [runtime 8/9] RUN ... yarn install --frozen-lockfile --production ...       DONE 378.0s
#23 naming to docker.io/library/safari-api:us14                                DONE 135.6s
real    15m0.637s
rc=0
$ docker images safari-api:us14 --format '{{.Size}}'
1.47GB
```

La parte de la capa de datos ocurre dentro de la imagen: `prisma generate` y
tsup en `db-build`. «Working tree limpio» se demuestra con lo que realmente
entra al contexto. Una imagen de prueba que copia el contexto tal cual
(`COPY . /ctx`, con el mismo `.dockerignore`) da:

```text
node_modules/dist/generated en el contexto: 0
raiz: apps packages  | apps: api
7.9M    /ctx
```

Y la imagen final no lleva secretos:

```text
secrets montados: ls: /run/secrets: No such file or directory
variables NODE_*: NODE_VERSION=22.22.2
NODE_ENV=production
archivos .env fuera de node_modules: 0
usuario: node
packages/db: dist node_modules package-lock.json package.json
api/rest: dist node_modules package.json yarn.lock
442.5M  /repo/apps/api/rest/node_modules
328.0M  /repo/packages/db/node_modules
6.4M    /repo/apps/api/rest/dist
```

Ese build sin caché usó una versión previa del Dockerfile que fijaba
`NODE_EXTRA_CA_CERTS` en un `ENV` de etapa, y por eso `nest build` avisaba
de que no encontraba el CA. La versión final lo pasa a cada `RUN` y no cambia
ningún comando. Con ella, `docker compose up -d --build api` rehízo las
etapas `db-build` y `api-build` en 9m11s, incluido `just db-up`; la API de
CA-2 a CA-4 corre sobre esa imagen. Sin `NODE_EXTRA_CA_CERTS`
(`NODE_EXTRA_CA_CERTS= docker compose build api`), compose acepta el archivo
de reemplazo y el build sale de caché. Desde cero, sin el CA, este equipo no
pasaría `prisma generate`. Eso es lo esperado detrás de Zscaler y no se
volvió a medir.

### CA-2 — La API responde desde el contenedor

```text
$ docker compose logs api | tail -2
safari-api  | ... [NestApplication] Nest application successfully started
safari-api  | ... [Bootstrap] Application is running on: http://[::1]:9001/api
$ curl -s -w '%{http_code} %{size_download}B' http://localhost:9001/api/settings
200 5504B
{"id":1,"options":{"seo":{"ogImage":null,"ogTitle":null,"metaTags":null, ...
```

5504 bytes, el mismo tamaño que el precedente de la migración de
`/api/settings`. Que sale de Postgres y no del mock se ve parando la base con
el contenedor de la API vivo:

```text
settings (base arriba): 200
health/ready (base arriba): 200
 Container safari-postgres  Stopped
settings (base parada): 500 {"statusCode":500,"message":"Internal server error"}
health/ready (base parada): 503 {"status":"error","checks":{"database":{"status":"down","latency_ms":2003}}}
 Container safari-postgres  Started
settings (base de vuelta): 200
```

La API se recupera sola al volver la base, sin reiniciar el contenedor.

### CA-3 — Espera a la base

`docker compose down -v` (autorizado por el dueño) y `up` desde el volumen
borrado:

```text
 Volume safari-marketplace_postgres-data  Removed
--- up desde cero 09:53:07
 Volume "safari-marketplace_postgres-data"  Created
 Container safari-postgres  Started
 Container safari-postgres  Waiting
 Container safari-postgres  Healthy
 Container safari-api  Starting
 Container safari-api  Started
/safari-postgres StartedAt=2026-11-19T14:53:12.500Z
/safari-api StartedAt=2026-11-19T14:53:23.730Z
healthcheck de postgres: 14:53:17.97 exit=2 | 14:53:23.08 exit=0
safari-api Up 19 seconds
safari-postgres Up 30 seconds (healthy)
... Nest application successfully started
health: 200 {"status":"ok"}
health/ready: 200 {"status":"ok","checks":{"database":{"status":"up","latency_ms":785}}}
settings: 500 {"statusCode":500,"message":"Internal server error"}
```

El primer healthcheck falla (exit=2) y el contenedor de la API no arranca
hasta 0.65 s después del primero que pasa. La API queda arriba. `settings` da
500 porque el volumen nuevo no tiene esquema: sembrar es de `just db-migrate`
(D-2), no de la imagen. Tras sembrar:

```text
$ just db-migrate
  * esquema y datos de referencia aplicados
settings tras db-migrate: 200 5504B
products total: 1199 primero: apples
```

`just api-docker` hace las dos cosas en orden; con la imagen ya construida:

```text
$ time just api-docker
 Container safari-postgres  Healthy
 Container safari-api  Started
esperando a la API.......... lista en http://localhost:9001/api
real    0m48.470s
```

### CA-4 — El flujo actual no se rompe

`just db-up` con el servicio `api` ya definido levanta solo `postgres` y
siembra igual:

```text
$ just db-up
...
  * esquema y datos de referencia aplicados
$ just api-docker-down
 Container safari-api  Stopped
safari-postgres Up 8 minutes (healthy)
9001 libre
```

`just verify` con la API **en contenedor**, con shop y admin nativos
(`just shop-dev`, `just admin-dev`):

```text
OK   API    :9001/api/settings  200  5503B  623ms
OK   Shop   :3003/en  200  191897B  1361ms  cards:30
OK   Admin  :3002/en/login  200  72554B  118ms  cards:1
```

Y con la API **nativa** (`just api-dev`), tras apagar el contenedor:

```text
OK   API    :9001/api/settings  200  5503B  503ms
OK   Shop   :3003/en  200  191897B  1989ms  cards:30
OK   Admin  :3002/en/login  200  72554B  1418ms  cards:1
```

Al terminar se apagaron los tres servidores por su PID raíz y el contenedor
de la API. Postgres queda arriba y sembrado.

### Hallazgos que no se accionaron (NO incluye)

- **La imagen pesa 1.47 GB.** Casi todo son `node_modules` de producción:
  442 MB de la API y 328 MB de `packages/db`, que declara `prisma` (el CLI)
  como dependencia y no como devDependency. Adelgazarla (mover `prisma` a dev,
  podar dependencias de la API sin uso) toca código y `package.json`. Es
  candidata para el Épico 16.
- **El build tarda ~15 min detrás de Zscaler**, casi todo en los dos `yarn
  install` (~6 min cada uno). Un cache mount de yarn (R-2 del épico) lo
  acortaría en rebuilds con dependencias cambiadas. Queda para US-15, que
  añade los dos builds de Next.
- **`just db-down` y `just db-reset` apagan también la API en contenedor**,
  porque usan `docker compose down`. Se anotó en el comentario de `db-down`;
  el comportamiento no se cambió.
- **`just --fmt --check` ya fallaba en `main`** antes de esta US. No se
  reformateó el justfile.
- **CLAUDE.md sigue diciendo que `docker-compose.yml` es «Solo Postgres 16»**
  y no menciona `just api-docker`. Esta US no lo incluye; queda para el dueño.
