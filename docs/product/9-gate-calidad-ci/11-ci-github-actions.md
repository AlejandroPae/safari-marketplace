# US-11 — CI en GitHub Actions

> Subir el gate local (`just check`) a un workflow de GitHub Actions, con el
> mismo Postgres de compose, para que cada push a `main` y cada PR queden
> verificados sin depender de la máquina de nadie.

**Épico:** [Épico 9](./README.md)
**Fecha:** 2026-08-25 (re-refinada el 2026-11-19)
**Status:** Listo para ejecución. Re-refinada el 2026-11-19 tras la revisión
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

- [ ] URL y salida de la corrida verde real (CA-1).
- [ ] Evidencia del rojo en el PR de prueba, PR cerrado y rama borrada (CA-2).
- [ ] Tiempos de las corridas 1 y 2 (CA-3).
- [ ] CA-4 a CA-8 verificados con salida real.
- [ ] `just check` sigue verde en local (Windows) con la receta nueva.
- [ ] Status de esta US actualizado y fila del épico marcada.

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
