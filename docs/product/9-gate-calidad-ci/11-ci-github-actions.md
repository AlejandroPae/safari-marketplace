# US-11 — CI en GitHub Actions

> Subir el gate local (`just check`) a un workflow de GitHub Actions, con el
> mismo Postgres de compose, para que cada push a `main` y cada PR queden
> verificados sin depender de la máquina de nadie.

**Épico:** [Épico 9](./README.md)
**Fecha:** 2026-08-25 (re-refinada el 2026-11-19)
**Status:** Implementado (2026-11-19); con un desvío de scope aprobado: la espera de `just db-up` pasa a TCP (ver «Resultado»). Re-refinada el 2026-11-19 tras la revisión
del sub-agente fable 5 contra `main` @ `7806c9f`. El dueño fijó: `just check`
como gate (D-1), Postgres por `just db-up` (D-2), una receta `install-ci`
(D-3), el scraper sin Playwright (D-4), `DATABASE_URL` en el `env:` del job
(D-5), los CA-5 a CA-8 (D-6), Node por `.nvmrc` (D-7) y el rojo por PR (D-8).
La versión anterior (2026-08-25, con la «Actualización tras el escaneo de
bingo-flow» del 2026-10-24) está en el historial de git.
**Depende de:** US-10 (implementada el 2026-11-18).
**LOC est.:** ~150 (workflow ~100, receta `install-ci` ~15, `.nvmrc`,
README).

## Historia

**Como** dueño del repo, **quiero** que cada push y cada PR corran el mismo
gate que corro en local, **para** que un clon fresco verificable sea una
garantía del repo y no un ritual manual.

## Contexto (verificado el 2026-11-19 sobre `main` @ `7806c9f`)

### El gate

- `just check` (US-10) corre 10 pasos en serie y corta al primer rojo
  (`justfile:347-358`): db build, db lint, db typecheck, api typecheck, api
  lint, admin lint, shop lint, api vitest, db vitest y scraper `db-test`.
  En local tarda 568 s en frío y 340 s en caliente (`justfile:306-307`), sin
  contar instalaciones.
- El lint de la API ya corre **sin `--fix`**: `npx eslint
  "{src,apps,libs,test}/**/*.ts"` (`justfile:352`). El script `lint` del
  `package.json` conserva `--fix` (`apps/api/rest/package.json:27`), pero
  `check` no lo usa. El antiguo CA-9 ya se cumple solo con llamar a
  `just check`.
- La API usa **Vitest 4** con `unplugin-swc` (`apps/api/rest/package.json:28`,
  `vitest.config.ts`), no jest: 45 specs, 37 con `vi.mock('@safari/db')`.
  `packages/db` tiene 38 archivos de test (integración, contra Postgres).
- `just check-full` = `check` + los tres builds (`justfile:390`). No entra en
  esta US (D-1).

### Precondiciones de `check` (`justfile:335-342`)

Si falta algo, sale con código 2 sin correr ningún paso:

- `node_modules` en `apps/`, `apps/api/rest` y `packages/db`. `just install`
  **no** instala `packages/db`: lo hace `just db-build`.
- Postgres por **compose**: `docker compose exec -T postgres pg_isready ...`
  (`justfile:338`). Un service container de Actions no tiene el servicio
  compose `postgres`, así que **`check` no arrancaría** con él.
- El python del venv del scraper (`justfile:341`).

### Instalación y lockfiles

| Directorio | Lockfile | Receta actual | En CI (CA-8) |
|---|---|---|---|
| `apps/` (workspace de yarn v1) | `apps/yarn.lock` | `install-apps`: `yarn install --network-timeout 600000` (`justfile:134-136`) | `yarn install --frozen-lockfile` |
| `apps/api/rest` (fuera del workspace) | `apps/api/rest/yarn.lock` | `install-api`: ídem (`justfile:140-142`) | `yarn install --frozen-lockfile` |
| `packages/db` (npm) | `packages/db/package-lock.json` | `db-build`: `npm install` + `npm run build` (`justfile:528-529`) | `npm ci --ignore-scripts` |

- Ninguna receta congela hoy el lockfile. Los Dockerfiles sí lo hacen
  (`apps/api/rest/Dockerfile:35,50`, `apps/shop/Dockerfile:36`).
- `packages/db` tiene `"prepare": "npm run build"`. Sin `--ignore-scripts`,
  `npm ci` dispara `prisma generate` + tsup, que el paso 1 de `check` repite
  (~107 s).
- La API depende de `"@safari/db": "link:../../../packages/db"`.
- La variante GraphQL (`apps/admin/graphql`) se instala por el workspace
  `admin/*` (`apps/package.json:7-10`). Se acepta: un lockfile congelado
  instala todos los workspaces.

### Base de datos

- `just db-up` levanta `postgres:16.14-alpine3.23` (`docker-compose.yml:18`)
  en el puerto **5433** con `safari`/`safari`/`safari_scraper`, y `db-migrate`
  aplica `CREATE EXTENSION pg_trgm`, `db/schema.sql`, `db/seed.sql` y
  `VACUUM ANALYZE` (`justfile:418-423`). También copia
  `services/scraper-worker/.env.example` a `.env` (`justfile:410-413`).
- ubuntu-latest trae Docker y compose v2: `just db-up` corre igual que en
  local.
- Los tests de `packages/db` leen `DATABASE_URL` por `import 'dotenv/config'`
  y `client.ts:27-30` lanza si falta. **Ninguna receta crea
  `packages/db/.env`** (`just env` solo crea los de shop, admin y API,
  `justfile:58-60`). En un clon limpio, el paso 9 fallaría sin la variable.
  El valor local es el de `packages/db/.env.example:2`.
- El paso 10 (`db-test`) inyecta `DB_URL` con valor por defecto
  (`justfile:22,444`).

### Scraper

- `check` solo corre `just db-test` (`test_pipeline.py`, ~5 s), que importa
  `psycopg` e `itemadapter` (`pipelines.py:1-9`). **No necesita Chromium.**
- `just scraper-install` instala además Chromium de Playwright
  (`justfile:553`). En CI basta el venv más
  `pip install -r requirements.txt`.

### Entorno y plataforma

- Variables que lee `apps/api/rest/src`: `STRIPE_API_KEY`, `JWT_SECRET`
  (diferida, `auth/jwt-options.ts:26-36`), `JWT_EXPIRES_IN`, `PORT`,
  `PAYPAL_SANDBOX_*`, `SHOP_URL` y `DEFAULT_CURRENCY`. Ningún spec usa
  `JWT_SECRET`, `AuthModule` ni `AppModule`, y `vitest.config.ts` no tiene
  `setupFiles`. **Inferido, no medido:** los tests de la API pasan sin
  ninguna variable.
- El lint de shop y admin no lee entorno; `check` no exige ningún `.env`.
- El `justfile` es portable: `set shell := ["bash", "-uc"]` (`justfile:14`),
  shebangs de bash o node, `VENV_BIN` por sistema operativo (`justfile:27`) y
  `.gitattributes` con LF. Usa `[group]`, `[doc]` y `[working-directory]`: el
  `just` de apt probablemente sea demasiado viejo. En local: just 1.54.0.
- Node: no hay `.nvmrc`, `engines` ni `packageManager`. La cabecera del
  justfile dice «Node 20+» (`justfile:11`), pero `doctor` exige 22.22.3+ (o
  24.15+) para el CLI de Nest 12 (`justfile:279-291`).
- El repo es **público** (`github.com/rcuello/safari-marketplace`): Actions no
  consume cuota de minutos. No hay ramas remotas aparte de `main`.

### Referencia: bingo-flow

`C:\DevOps\MyGitHub\games\bingo-flow\.github\workflows\ci.yml` (US-30 de
bingo-flow):

- actions fijadas por SHA: líneas 5-7 (la razón), 26, 30 y 32;
- `permissions: contents: read`: líneas 15-16;
- `concurrency` con `cancel-in-progress`: líneas 18-20;
- `--frozen-lockfile`: líneas 37-40;
- `env:` ficticio con comentario: líneas 49-62.

bingo-flow corre sin Postgres; safari no puede (CA-4). Sus imágenes van en
un `images.yml` aparte, con `workflow_run`: el patrón para el Épico 16.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Qué corre | `just check` en cada corrida. `check-full` y los builds de imágenes quedan para el Épico 16 (un workflow aparte). |
| D-2 | Postgres | `just db-up` con compose en el runner: la misma imagen fijada, la misma migración, y la precondición de `check` se cumple sin tocarla. **No** se usa service container (la D-2 del épico queda superada). |
| D-3 | Instalación | Receta nueva `install-ci` en el `justfile` (grupo `setup`): `yarn install --frozen-lockfile` en `apps/` y en `apps/api/rest`, y `npm ci --ignore-scripts` en `packages/db` (el build lo hace el paso 1 de `check`). El workflow solo llama recetas. `just install` y `db-build` no cambian. |
| D-4 | Scraper | Se crea el venv y se instala `requirements.txt` con caché de pip, **sin** Playwright ni Chromium. Si hace falta, el ejecutor lo pone en la receta `install-ci` o en un paso del workflow, y documenta por qué. |
| D-5 | Entorno | `DATABASE_URL=postgresql://safari:safari@localhost:5433/safari_scraper` en el `env:` del job, con un comentario: es la credencial local de compose, no un secreto. Para la API no se declara nada mientras el clon limpio confirme que sus tests pasan sin variables. Si alguna hace falta, se declara con un valor evidentemente ficticio, al estilo de bingo-flow. Ningún secreto real entra al workflow. |
| D-6 | Endurecimiento | CA-5 a CA-8 (SHA, permisos, `concurrency` y lockfiles congelados). |
| D-7 | Node | `.nvmrc` en la raíz con `22.22.3`; el workflow usa `node-version-file: .nvmrc`. Se corrige «Node 20+» en `justfile:11`. |
| D-8 | Rojo de prueba | CA-2 con una rama `ci/prueba-rojo` y un PR que se cierra sin merge; la rama se borra después. |
| D-9 | Forma del workflow | Un solo job en serie que llama a `just check`; no se reparte el gate en jobs paralelos. Disparadores: `pull_request`, `push` a `main` y `workflow_dispatch`, sin `paths-ignore`. `timeout-minutes: 30`. |
| D-10 | Herramientas | `just` con `extractions/setup-just` fijada por SHA y `just-version: 1.54.0`. Python 3.11+ con `actions/setup-python`. Caché de yarn con `setup-node` (`cache: yarn` y `cache-dependency-path` con los dos `yarn.lock`), más una entrada para npm. No se cachea `node_modules` de entrada: se decide con los números de CA-3. |

## Scope

**Incluye:**
- `.github/workflows/ci.yml`;
- la receta `install-ci` en el `justfile` y la corrección de «Node 20+»
  (`justfile:11`);
- `.nvmrc`;
- `README.md` raíz: badge y una línea de cómo se verifica el repo (cambio
  mínimo, sin reescribirlo);
- `apps/README.md` o el comentario de `check`: una línea que diga que el CI
  corre la misma receta.

**NO incluye:**
- despliegue o CD, y el build de imágenes (Épico 16, con un `images.yml`
  aparte);
- `check-full` en CI;
- matrix de versiones de Node;
- publicación de artefactos;
- `just audit` (US-73) en CI;
- protección de rama en `main` exigiendo el check: es el siguiente paso, del
  dueño;
- escribir tests nuevos o tocar la composición de `check` (US-10);
- crear `packages/db/.env` desde `just env` (arreglaría el clon limpio local;
  va en otra US si se quiere);
- sacar `admin/graphql` del workspace.

## Criterios de aceptación

### CA-1 — Workflow verde en un push real
El workflow corre en GitHub sobre un push real a `main` y termina verde,
ejecutando `just check` con sus 10 pasos. Se pega la URL de la corrida y el
resumen de `check: VERDE`.

### CA-2 — Rojo detectable
En la rama `ci/prueba-rojo`, un commit con un fallo inyectado (por ejemplo,
un test de la API que falla) se abre como PR. El workflow queda en rojo en el
paso correcto de `check`. Se pega la evidencia, el PR se cierra sin merge y la
rama se borra.

### CA-3 — Caché efectiva
Una segunda corrida con los lockfiles sin cambios restaura las cachés
(`cache-hit` en el log) y baja el tiempo de los pasos de instalación. Se pegan
los tiempos de instalación y el total de las dos corridas. No hay umbral
numérico.

### CA-4 — Postgres real, esquema real
El job levanta Postgres con `just db-up`: `pg_trgm`, `schema.sql`, `seed.sql`
y `VACUUM ANALYZE`. Los pasos 9 (`db vitest`) y 10 (`db-test`) corren contra
esa base, sin mocks ni SQLite.

### CA-5 — Actions fijadas por SHA
Toda `uses:` apunta a un SHA de commit completo, con el tag legible en un
comentario de la misma línea (`actions/checkout@<sha> # vX.Y.Z`). Incluye la
acción de `just`. El ejecutor verifica cada SHA contra el tag en GitHub al
escribir el workflow.

### CA-6 — Permisos mínimos del token
`permissions: contents: read` a nivel de workflow.

### CA-7 — Corridas superadas se cancelan
`concurrency` agrupado por workflow y ref, con `cancel-in-progress: true`. Se
verifica con dos pushes seguidos a la rama de CA-2 (la primera corrida queda
«cancelled»).

### CA-8 — Lockfiles congelados
Ninguna instalación del CI reescribe un lockfile (`install-ci`, D-3), y el
árbol queda limpio tras instalar: un paso `git diff --exit-code` después de
la instalación lo comprueba. Se verifica que un lockfile desincronizado pone
el workflow en rojo. Si `yarn --frozen-lockfile` con workspaces no detecta la
desincronización, se anota con la salida real y el `git diff --exit-code`
queda como red.

## Escenarios Gherkin

```gherkin
Feature: CI del monorepo
  Scenario: CA-1 — push verde
    Given el workflow ci.yml en main
    When pusheo un commit que pasa just check en local
    Then el workflow corre just check y termina verde en GitHub

  Scenario: CA-2 — PR rojo
    Given una rama ci/prueba-rojo con un test de la API que falla
    When abro un PR contra main
    Then el workflow termina en rojo en el paso "api vitest" de just check
    And el PR se cierra sin merge

  Scenario: CA-8 — lockfile desincronizado
    Given un package.json con una dependencia que no está en su lockfile
    When corre el workflow
    Then la instalación falla y el workflow termina en rojo
```

## Archivos a crear o modificar

| Archivo | Cambio |
|---------|--------|
| `.github/workflows/ci.yml` | el workflow |
| `justfile` | receta `install-ci`; «Node 20+» → la versión real |
| `.nvmrc` | `22.22.3` |
| `README.md` | badge y una línea (cambio mínimo) |

## Definición de Done

- [x] URL y salida de la corrida verde real (CA-1).
- [x] Evidencia del rojo en el PR de prueba, PR cerrado y rama borrada (CA-2).
- [x] Tiempos de las corridas 1 y 2 (CA-3).
- [x] CA-4 a CA-8 verificados con salida real.
- [x] `just check` sigue verde en local (Windows) con la receta nueva.
- [x] Status de esta US actualizado y fila del épico marcada.

## Riesgos

- **R-1 — Tiempo.** Sin medir: unos 15-20 min por corrida con la caché de
  descargas caliente, y más de 25 min en frío (las instalaciones de yarn
  dominan). `check` corta al primer rojo, así que un PR con dos fallos
  necesita dos corridas. Si la corrida caliente pasa de ~15 min, **parar y
  proponer el recorte en US-10**, no bifurcar el gate en silencio.
- **R-2 — Caché de yarn v1.** `setup-node` solo cachea las descargas, no
  `node_modules`: el enlazado de `apps/` seguirá costando minutos. Cachear
  `node_modules` es frágil con el `link:` de `@safari/db`.
- **R-3 — `--frozen-lockfile` con workspaces.** En yarn v1 no siempre detecta
  la desincronización; por eso CA-8 suma `git diff --exit-code`.
- **R-4 — Tests de la API sin `.env`.** No está verificado en un clon limpio
  (D-5). Si fallan por una variable, se declara con un valor ficticio.
- **R-5 — SHA de actions.** Los de bingo-flow son de octubre; se toman los
  vigentes y se verifican contra el tag.
- **R-6 — Docker en el runner.** `just db-up` descarga la imagen de Postgres
  en cada corrida (~100 MB). Es aceptable; se mide en CA-3.

## Notas para el agente ejecutor

- Leer antes US-10 (la receta y sus precondiciones) y el `justfile`
  completo.
- Antes de escribir el workflow, probar en un clon limpio y sin `.env` (en
  local o en el primer push) que `install-ci` + `db-up` + el venv + `check`
  pasan solo con `DATABASE_URL` (D-5).
- `install-ci` tiene que funcionar también en Windows con Git Bash (es una
  receta del `justfile`), aunque solo el CI la use.
- Las decisiones son del dueño. Si una choca con el código o con la
  documentación de GitHub Actions, **detente y pregunta**.
- Pushear la rama de CA-2 y abrir el PR es una acción visible en GitHub:
  confirmar con el dueño justo antes.

## Resultado (2026-11-19)

Commits en `main`:
- `f1067fe`: el workflow, `install-ci`, `.nvmrc` y el badge;
- `093791c`: la espera de `db-up` por TCP.

Corridas en https://github.com/rcuello/safari-marketplace/actions/workflows/ci.yml.

### Qué se hizo

- **`.github/workflows/ci.yml`:** un job en `ubuntu-latest` con
  `timeout-minutes: 30`. Prepara Node (`.nvmrc`), yarn, npm, Python 3.13 y
  just 1.54.0. Después llama recetas: `just install-ci`, un `git status` +
  `git diff --exit-code`, `just db-up` y `just check`. `DATABASE_URL` va en
  el `env:` del job, comentada como credencial local de compose.
- **Actions fijadas** (SHA resuelto con `gh api repos/<r>/git/ref/tags/<t>`
  y comprobado con `gh api repos/<r>/commits/<t>`; los cuatro tags son
  ligeros):

  | Action | Tag | SHA | Publicado |
  |---|---|---|---|
  | `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-20 |
  | `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | 2026-10-08 |
  | `actions/setup-python` | v7.1.0 | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | 2026-10-22 |
  | `extractions/setup-just` | v4 | `53165ef7e734c5c07cb06b3c8e7b647c5aa16db3` | 2026-04-05 |

  `setup-just` v4 instala a su vez `extractions/setup-crate`, que su propio
  `action.yaml` fija por SHA (`0551596…`, v2.0.0).
- **`setup-node` se llama dos veces,** con la misma `.nvmrc`. Admite un solo
  gestor de caché por llamada: la primera es para yarn (los dos `yarn.lock`)
  y la segunda para npm (`packages/db`).
- **`justfile`:**
  - receta `install-ci`;
  - la cabecera dice «Node 22.22.3+ (.nvmrc)» en vez de «Node 20+»;
  - una línea en el comentario de `check` sobre el CI;
  - la espera de `db-up` por TCP (desvío, ver abajo).
- **`README.md` raíz:** el badge y una línea.

### Desvío de scope: la espera de `just db-up` (aprobado por el dueño)

La segunda corrida (44671084568, `workflow_dispatch`) falló en `just db-up`:

```text
 Container safari-postgres Started
esperando a Postgres. listo
docker compose exec -T postgres psql ... -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  the database system is shutting down
error: recipe `db-migrate` failed on line 439 with exit code 2
```

El fallo es anterior a esta US:
- Con un volumen nuevo, la imagen de Postgres inicializa con un servidor
  temporal que solo escucha en el socket, y lo apaga al terminar.
- `pg_isready` por socket daba «listo» con ese servidor temporal.
- Además, el bucle seguía aunque se agotaran los 30 s.

En local pasa lo mismo tras `just db-reset`; la primera corrida verde fue
suerte.

El arreglo (`093791c`):
- la espera usa `pg_isready -h 127.0.0.1`, donde el servidor temporal no
  escucha;
- si a los 30 s Postgres no está listo, `db-up` falla con
  «Postgres no respondió en 30 s».

### CA-1 — Workflow verde en un push real

Corrida 44670519644 (push de `f1067fe` a `main`) y corrida 44675521321
(push de `093791c`), las dos `success`. Pasos de la segunda:

```text
Run just install-ci: success 04:36:55 -> 04:37:45
Árbol limpio tras instalar: success
Run just db-up: success
  esperando a Postgres. listo
Run just check: success 04:37:54 -> 04:39:25
OK    [1/10] packages/db build  16s
OK    [2/10] packages/db lint  0s
OK    [3/10] packages/db typecheck  5s
OK    [4/10] api/rest typecheck  6s
OK    [5/10] api/rest lint  10s
OK    [6/10] admin/rest lint  10s
OK    [7/10] shop lint  6s
OK    [8/10] api/rest test  11s
OK    [9/10] packages/db test  26s
OK    [10/10] scraper db-test  1s
check: VERDE (10 pasos, 91s)
```

Versiones en el runner: node v22.22.3, yarn 1.22.22, npm 10.9.8,
Python 3.13.18, just 1.54.0, Docker Compose v5.1.3. Los tests: API
`Test Files 45 passed (45)` / `Tests 713 passed (713)`; `packages/db`
`Test Files 38 passed (38)` / `Tests 499 passed (499)`.

`check` tarda 91 s en el runner y 493 s en local (Windows con Zscaler, el
mismo día). La corrida completa queda muy por debajo del umbral de ~15 min
de R-1.

### CA-2 — Rojo detectable

En el PR #1 (rama `ci/prueba-rojo`), el commit cambia `status: 'ok'` por
`'ROTO-A-PROPOSITO'` en `health.controller.spec.ts`. Corrida 44676013568,
`failure`:

```text
Run just check: failure
AssertionError: expected { status: 'ok', …(1) } to deeply equal { status: 'ROTO-A-PROPOSITO', …(1) }
OK    [1/10] packages/db build  15s
...
OK    [7/10] shop lint  6s
FALLA [8/10] api/rest test  11s  (exit 1)
check: ROJO en 'api/rest test'
```

`gh pr close 1 --delete-branch`: el PR quedó `CLOSED merged=null`.
`git ls-remote --heads origin` solo lista `refs/heads/main`.

### CA-3 — Caché efectiva

| Corrida | Caché | `install-ci` | Restaurar caché (setup-node yarn) | Job completo |
|---|---|---|---|---|
| 44670519644 (1.ª, push) | `yarn cache is not found`, ídem npm y pip | 110 s (03:51:43 → 03:53:33) | 5 s | 4 min 09 s |
| 44675521321 (push, lockfiles sin cambios) | `Cache restored from key: node-cache-Linux-x64-yarn-5233…`, ídem npm y pip | 50 s (04:36:55 → 04:37:45) | 25 s | 3 min 16 s |

Con la caché, la instalación baja de 110 s a 50 s, más 25 s de restaurar
~1.8 GB. El yarn de `apps/` pasa de 60.8 s a 25.2 s. La corrida
`workflow_dispatch` 44671084568, que falló en `db-up`, ya había restaurado
las tres cachés con un `install-ci` de 50 s. No se cachea `node_modules`: con
estos números no hace falta (D-10).

### CA-4 — Postgres real, esquema real

`just db-up` en el runner hace el pull de `postgres:16.14-alpine3.23` y aplica
`pg_trgm`, `schema.sql`, `seed.sql` y `VACUUM ANALYZE`:

```text
docker compose exec -T postgres psql ... -c "VACUUM ANALYZE;"
  * esquema y datos de referencia aplicados
  + services/scraper-worker/.env creado
```

Contra esa base corren `[9/10] packages/db test` (38 archivos de
integración) y `[10/10] scraper db-test`.

### CA-5 a CA-7 — SHA, permisos y concurrencia

- **CA-5:** las cuatro `uses:` llevan el SHA completo y el tag en un
  comentario (tabla de arriba).
- **CA-6:** `permissions: contents: read` a nivel de workflow.
- **CA-7:** `concurrency: ci-${{ github.workflow }}-${{ github.ref }}` con
  `cancel-in-progress: true`. En el PR #1, un segundo push 15 s después del
  primero canceló la corrida anterior:

  ```text
  in_progress  ...  pull_request  44676013568  11s
  completed    cancelled  ...  pull_request  44675972930  26s
  ```

### CA-8 — Lockfiles congelados

Un commit en el PR #1 agregó `"left-pad": "1.3.0"` al `package.json` de la
API, sin tocar su `yarn.lock`. Corrida 44676408923, `failure` en el paso de
instalación:

```text
Run just install-ci: failure
error Your lockfile needs to be updated, but yarn was run with `--frozen-lockfile`.
error: recipe `install-ci` failed with exit code 1
```

En las corridas verdes, el paso «Árbol limpio tras instalar» termina sin
salida: ninguna instalación cambió un archivo versionado.

### Entorno sin `.env` (D-5)

El runner es un clon limpio, sin ningún `.env`. Con solo `DATABASE_URL` en
el `env:` del job, los diez pasos pasan, también `[8/10] api/rest test`. La
inferencia de R-4 queda confirmada: los tests de la API no necesitan
variables.

### `just check` en local (Windows), con la receta nueva

`just install-ci` en Git Bash (48 s; `npm ci --ignore-scripts` reinstaló
`packages/db`, `added 325 packages`) y después `just db-up` y `just check`:

```text
OK    [1/10] packages/db build  83s
OK    [2/10] packages/db lint  2s
OK    [3/10] packages/db typecheck  8s
OK    [4/10] api/rest typecheck  42s
OK    [5/10] api/rest lint  58s
OK    [6/10] admin/rest lint  117s
OK    [7/10] shop lint  31s
OK    [8/10] api/rest test  65s
OK    [9/10] packages/db test  84s
OK    [10/10] scraper db-test  3s
check: VERDE (10 pasos, 493s)
```

`just db-up` con la espera nueva, sobre la base ya levantada, termina con
`* esquema y datos de referencia aplicados`. La carrera con volumen nuevo la
cubren las corridas del CI, que parten de cero.

### Fuera de esta US (no se tocó)

- **Protección de rama en `main`** exigiendo el check `CI / check`: es el
  siguiente paso y le corresponde al dueño.
- **`just env` no crea `packages/db/.env`:** en un clon limpio local, el paso
  9 de `check` sigue necesitando la variable.
- **Las actions de JavaScript corren en Node 24** (`using: node24` en el
  `action.yml` de `checkout` v7.0.1 y `setup-node` v7.1.0). No afecta al Node 22 del proyecto.
