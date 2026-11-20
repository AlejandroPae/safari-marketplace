# US-109 — CI con pasos segregados, builds y resumen visible

> El CI de US-11 ejecuta las 1212 pruebas, pero todo va dentro de un solo
> step, «Run just check», y la página de la ejecución no muestra qué se
> compiló ni qué se probó. Además no corre los builds (`check-full`), así que
> un error de `next build` pasa en verde. Esta US deja cada paso visible en
> Actions y suma los builds. Es la base de US-110 (imágenes), US-111 y US-112
> (despliegue).

**Épico:** [Épico 9](./README.md)
**Fecha:** 2026-11-20
**Status:** Implementado (2026-11-20). Promovida desde `_backlog/` el 2026-11-20,
tras la revisión del sub-agente fable 5. El dueño fijó cómo se vigilan los
tipos (D-6), un solo job (D-3), este épico, y que todo el CI/CD vive en
`ci.yml`.
**Depende de:** US-11 (implementada). Va **antes** de US-110, US-111 y
US-112: todas tocan `.github/workflows/ci.yml`.
**LOC est.:** ~150-180

## Historia

**Como** docente que publica la aplicación de referencia, **quiero** ver en
GitHub Actions cada paso del CI por separado (instalación, lint, typecheck,
pruebas y builds) con su tiempo y su resultado, **para** saber de un vistazo
qué falló y mostrar a los estudiantes cómo se ve un pipeline de verdad.

## Contexto (verificado el 2026-11-20 sobre `main` @ `5d168a0`)

### Lo que hace hoy `.github/workflows/ci.yml`

- Disparadores: `pull_request`, `push` a `main` y `workflow_dispatch`, con
  `concurrency` (`ci-${{ github.workflow }}-${{ github.ref }}`,
  `cancel-in-progress: true`).
- Un job, `check`, en `ubuntu-latest` con `timeout-minutes: 30`. El log de la
  corrida #7 dice `Image: ubuntu-26.04` (versión `20261111.196.1`).
- Pasos: checkout, `setup-node` dos veces (cachés de yarn y npm),
  `setup-python`, `setup-just`, «Versiones», `just install-ci`, «Árbol limpio
  tras instalar», `just db-up` y `just check`. Son cuatro actions distintas,
  fijadas por SHA con el tag en comentario, y `permissions: contents: read`.

### Corrida #7 (44677171842), medida con `gh run view --json jobs`

| Tramo | Duración |
|---|---|
| Job completo | 3 min 9 s |
| Preparación (checkout, `setup-*`, cachés) | 35 s |
| `just install-ci` | 50 s |
| `just db-up` | 10 s |
| `just check` | 91 s |

Los 10 subpasos corrieron (713 pruebas de la API y 499 de `packages/db`),
pero quedan escondidos en un solo step y no se escribe nada en
`$GITHUB_STEP_SUMMARY`.

### Cómo está hecho `just check` (`justfile:351-405`)

Es un script bash con cuatro partes:
- precondiciones, que salen con código 2;
- un array `pasos=( "nombre|dir|comando" ... )` (líneas 368-379);
- un bucle con `(cd "$raiz/$dir" && eval "$cmd")`: el `cd` normaliza la
  unidad para vitest en Windows;
- un resumen, con corte al primer rojo y el resto «no ejecutado».

`check-full` (`justfile:411`) agrega `build-api`, `build-admin` y
`build-shop`, que ya son recetas.

### Los builds no comprueban tipos (hallazgo de la revisión)

- `apps/shop/next.config.js:79-84` y `apps/admin/rest/next.config.js:67-72`
  activan `typescript.ignoreBuildErrors` cuando
  `APPLICATION_MODE === 'production'`. Las dos plantillas la traen así
  (`apps/shop/.env.template:7`, `apps/admin/rest/.env.template:11`), y
  `just env` las copia. Con ese `.env`, `just build-shop` y
  `just build-admin` **no** comprueban tipos (US-102 y US-80 ya lo
  registraron: «Skipping validation of types»).
- El comentario de `justfile:345-346` («`next build` ya comprueba los
  tipos») es inexacto.
- **Tienda:** `tsc --noEmit` da rc=0 (US-102). Su imagen Docker comprueba
  tipos, porque no define la variable.
- **Admin:** `tsc --noEmit` da rc=2 por TS2688 (`minimatch`). Su Dockerfile
  fija `APPLICATION_MODE=production` (US-15 DA-3), así que no comprueba tipos
  en ningún lado.

### Builds

- No necesitan Postgres ni la API (US-104).
- `build-api` necesita `packages/db/dist/`: la API depende de `@safari/db`
  por `link:`. En el job actual, el paso 1 de `check` (`packages/db build`)
  ya lo construye.
- En local (Windows con Zscaler): `nest build` 45-103 s, admin ~190 s,
  tienda 80-122 s. Sin medir en el runner; por la proporción de `check`
  (91 s contra 493 s), unos 1.5-2 min los tres.

### Otros

- La rama `ci/prueba-rojo` de US-11 **ya no existe** en el remoto
  (`git ls-remote --heads origin` solo lista `main`). Si aparece en
  `git branch -a`, es una referencia local vieja: `git fetch --prune`.
- La protección de `main` no existe, por decisión del dueño (2026-11-20,
  «todavía no»).
- `README.md:6` describe el CI; también lo hacen el comentario de `check`
  (`justfile:320-348`) y `CLAUDE.md:38`. Este último es del dueño y no se
  toca.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Una sola fuente de verdad | `just check` acepta un **filtro opcional**: `just check` corre los 10 pasos como hoy, y `just check <id>` corre solo ese. Cada entrada del array gana un id corto (`db-build`, `db-lint`, `db-typecheck`, `api-typecheck`, `api-lint`, `admin-lint`, `shop-lint`, `api-test`, `db-test`, `scraper-test`). El array sigue siendo la única lista; el `cd "$raiz/$dir"`, el resumen y el corte no cambian. Las precondiciones se acotan al paso pedido (solo `db-test` y `scraper-test` necesitan Postgres). Los builds usan sus recetas actuales. |
| D-2 | Pasos visibles | Un step del workflow por id y por build, con un `name:` legible en español («Pruebas de la API», «Build de la tienda»…). GitHub corta en el primer step rojo y marca los siguientes como omitidos, igual que el corte local. |
| D-3 | Un job | Un solo job `check`: los builds van como steps después de las pruebas, sin reinstalar, con `dist/` ya construido. Los jobs de US-110 y US-112 dependen de `check`. |
| D-4 | Resumen | Tabla en `$GITHUB_STEP_SUMMARY` con paso, resultado y duración, y los totales de pruebas. La receta `check` añade su fila cuando la variable existe, así que también se escribe en rojo; un step final con `if: always()` lista los no ejecutados. Los conteos salen del reporter JSON de vitest (`numTotalTests`, `numPassedTests` y `numFailedTests`), activado en CI desde los `vitest.config.ts` de la API y de `packages/db`, con salida en `$RUNNER_TEMP` para no ensuciar el «Árbol limpio». Sin actions nuevas. |
| D-5 | Runner fijo | `runs-on: ubuntu-26.04`. La imagen está confirmada en el log; la etiqueta se verifica en la documentación de runners de GitHub al ejecutar. Si no existe, se usa la fija más reciente y se anota. |
| D-6 | Tipos en los builds | El job corre `just env` y pasa `APPLICATION_MODE: development` en el `env:` del step «Build de la tienda», para que `next build` compruebe tipos. Se verifica en la primera corrida que la variable del proceso gana a la del `.env`. El admin sigue sin comprobar tipos hasta arreglar TS2688, y la US lo dice. Se corrige el comentario de `justfile:345-346`. |
| D-7 | Lo que no cambia | Permisos, actions por SHA, `install-ci`, «Árbol limpio» y `just db-up`. El `concurrency` lo ajusta US-110 (sin cancelar en `main`). |
| D-8 | Un solo workflow | Todo el CI/CD vive en `ci.yml` (`check` → `images` → `deploy`, con `needs`). Esto revierte la parte de la D-1 de US-11 que mandaba las imágenes a un `images.yml` aparte. |
| D-9 | Sin protección de `main` | No se configuran reglas de rama: es decisión del dueño, pospuesta. |

## Scope

**Incluye:**
- `.github/workflows/ci.yml`;
- `justfile`: el filtro de `check`, el resumen, y los comentarios de
  `check` y de `justfile:345-346`;
- los dos `vitest.config.ts`, solo para el reporter JSON en CI;
- `README.md` raíz (la línea del CI).

**NO incluye:**
- imágenes Docker (US-110);
- despliegue (US-111 y US-112);
- protección de rama;
- arreglar el TS2688 del admin (otra US);
- cambios en el código de las apps;
- `CLAUDE.md`.

## Criterios de aceptación

- **CA-1 — Pasos visibles.** En una corrida verde, el job muestra un step
  por id de `check` y por build, con su duración. Pegar el listado de
  `gh run view <id> --json jobs`.
- **CA-2 — Resumen.** La página de la corrida muestra la tabla de D-4, con
  los conteos de pruebas (713 y 499, o los vigentes). Pegar el contenido.
- **CA-3 — Rojo localizado.** En una rama de prueba con PR que no se
  fusiona, un test roto a propósito pone en rojo **solo** su step, y el
  resumen dice cuál. El PR se cierra y la rama se borra.
- **CA-4 — Build roto.** En otra rama de prueba, un error de tipos en la
  tienda pone en rojo «Build de la tienda», que hoy pasaría en verde. Se
  pega también que el admin no lo detectaría (limitación de D-6). La rama se
  borra.
- **CA-5 — Local igual.** `just check` y `just check-full` en local dan el
  mismo resumen y el mismo resultado que antes. `just check api-test` corre
  solo ese paso.
- **CA-6 — Tiempo.** Pegar la duración total antes (3 min 9 s) y después.

## Definición de Done

- [x] CA-1 a CA-6 verificados, con la salida real pegada en «Resultado».
- [x] Ramas y PR de prueba cerrados y borrados.
- [x] Status en `Implementado` y fila del épico marcada.

## Riesgos

- **R-1 — La variable gana al `.env`.** Si Next toma `APPLICATION_MODE` del
  `.env` y no del proceso, D-6 no funciona: se anota y se pregunta.
- **R-2 — Build nativo sin `.env`.** No se ha medido el build nativo de la
  tienda con las `NEXT_PUBLIC_*` de `just env` en Linux.

## Notas para el agente ejecutor

- Leer antes US-10 y US-11 (sus «Resultado») y el `justfile` completo.
- Pushear ramas y abrir PR de prueba es una acción visible en GitHub:
  confirmar con el dueño justo antes.
- Las decisiones son del dueño. Si una choca con lo que encuentres,
  **detente y pregunta**.

## Resultado (2026-11-20)

Commits en `main`:
- `ab71d36`: el filtro de `check`, el resumen, el workflow y el README;
- `b31a540`: la tabla del resumen también en el log del step.

### Qué se hizo

- **`just check [ids...]`:** una sola lista `id|nombre|carpeta|comando|grupo`
  con los 10 pasos de siempre (grupo `check`) y los tres builds (grupo
  `build`, que llaman a `just build-api`, `build-admin` y `build-shop`).
  - Sin ids corre los 10, con el mismo formato y el mismo corte.
  - Con ids corre solo esos.
  - Un id desconocido sale con código 2 y lista los válidos.
  - Las precondiciones se acotan: Postgres solo para `db-test` y
    `scraper-test`; el venv, solo para `scraper-test`.
- **Resumen (D-4):** con `CHECK_REPORT`, cada paso agrega
  `id|OK/FALLA|segundos` al archivo, y vitest deja sus conteos en
  `$CHECK_REPORT.<id>.json`. Para eso, los dos `vitest.config.ts` activan el
  reporter `json` solo si existe `VITEST_JSON_OUT`. `just check resumen`
  arma la tabla en `$GITHUB_STEP_SUMMARY`, y con `tee` también en el log del
  step, porque GitHub no expone por API el resumen del job
  (`check-runs/<job>` devuelve `output.summary` vacío). Sin actions nuevas.
- **`ci.yml`:**
  - `runs-on: ubuntu-26.04`, verificada en el README de
    `actions/runner-images`, que lista `ubuntu-26.04` (x64). Ese README
    todavía dice que `ubuntu-latest` es 24.04, aunque la corrida #7 cayó en
    26.04: la etiqueta flotante cambiaba de imagen sin aviso.
  - Un step por id con `name:` en español.
  - `just env` antes de los builds y `APPLICATION_MODE: development` en el
    `env:` de «Build de la tienda».
  - «Resumen» con `if: always()`.
- **Comentarios del `justfile`:** el de `check` ya no dice que `next build`
  comprueba tipos, y describe el CI por pasos.
- **`README.md`:** la línea del CI.

### CA-1 — Pasos visibles

Corrida 44690155012 (push de `ab71d36`), `success`. Extracto de
`gh run view --json jobs` (inicio y fin de cada step):

```text
Run just install-ci: success 06:47:19 -> 06:48:32
Árbol limpio tras instalar: success 06:48:32 -> 06:48:33
Run just db-up: success 06:48:33 -> 06:48:52
Preparar el resumen: success 06:48:52 -> 06:48:52
Build de packages/db: success 06:48:52 -> 06:49:05
Lint de packages/db: success 06:49:05 -> 06:49:05
Typecheck de packages/db: success 06:49:05 -> 06:49:09
Typecheck de la API: success 06:49:09 -> 06:49:14
Lint de la API: success 06:49:14 -> 06:49:23
Lint del admin: success 06:49:23 -> 06:49:31
Lint de la tienda: success 06:49:31 -> 06:49:36
Pruebas de la API: success 06:49:36 -> 06:49:45
Pruebas de packages/db: success 06:49:45 -> 06:50:07
Prueba del pipeline del scraper: success 06:50:07 -> 06:50:09
Crear los .env desde las plantillas: success 06:50:09 -> 06:50:10
Build de la API: success 06:50:10 -> 06:50:16
Build del admin: success 06:50:16 -> 06:51:25
Build de la tienda: success 06:51:25 -> 06:52:18
Resumen: success 06:52:18 -> 06:52:19
```

### CA-2 — Resumen

Corrida 44691063406 (push de `b31a540`), copiado del log del step «Resumen»:

```text
### just check — resumen
| Paso | Resultado | Duración | Pruebas |
|---|---|---|---|
| packages/db build (`db-build`) | ✅ OK | 16 s | — |
| packages/db lint (`db-lint`) | ✅ OK | 0 s | — |
| packages/db typecheck (`db-typecheck`) | ✅ OK | 5 s | — |
| api/rest typecheck (`api-typecheck`) | ✅ OK | 6 s | — |
| api/rest lint (`api-lint`) | ✅ OK | 10 s | — |
| admin/rest lint (`admin-lint`) | ✅ OK | 9 s | — |
| shop lint (`shop-lint`) | ✅ OK | 7 s | — |
| api/rest test (`api-test`) | ✅ OK | 11 s | 713 / 713 |
| packages/db test (`db-test`) | ✅ OK | 27 s | 499 / 499 |
| scraper db-test (`scraper-test`) | ✅ OK | 1 s | — |
| api/rest build (`api-build`) | ✅ OK | 7 s | — |
| admin/rest build (`admin-build`) | ✅ OK | 86 s | — |
| shop build (`shop-build`) | ✅ OK | 65 s | — |
**check: VERDE** — pruebas: 1212 de 1212 pasaron.
```

### CA-3 — Rojo localizado

PR #2 (rama `ci/prueba-test-roto`): `status: 'ok'` cambia a
`'ROTO-A-PROPOSITO'` en `health.controller.spec.ts`. Corrida 44691108794,
`failure`:

```text
   Pruebas de la API: failure
   Pruebas de packages/db: skipped
   Prueba del pipeline del scraper: skipped
   Crear los .env desde las plantillas: skipped
   Build de la API: skipped
   Build del admin: skipped
   Build de la tienda: skipped
AssertionError: expected { status: 'ok', …(1) } to deeply equal { status: 'ROTO-A-PROPOSITO', …(1) }
FALLA [1/1] api/rest test  7s  (exit 1)
check: ROJO en 'api/rest test'
```

El resumen lo dice:

```text
| shop lint (`shop-lint`) | ✅ OK | 5 s | — |
| api/rest test (`api-test`) | ❌ FALLA | 7 s | 712 / 713 |
| packages/db test (`db-test`) | — no ejecutado | — | — |
...
**check: ROJO** — pruebas: 712 de 713 pasaron.
```

### CA-4 — Build roto

PR #3 (rama `ci/prueba-tipos-tienda`): `const PAGE_SIZE = 500;` cambia a
`const PAGE_SIZE: string = 500;` en `apps/shop/src/framework/rest/sitemap.ts`.
Es un error que eslint no marca: «Lint de la tienda» pasa, y el rojo cae en
el build. Corrida 44691127344, `failure` solo en «Build de la tienda»:

```text
  Running TypeScript ...
##[error]src/framework/rest/sitemap.ts(19,7): error TS2322: Type 'number' is not assignable to type 'string'.
##[error]src/framework/rest/sitemap.ts(123,29): error TS2322: Type 'string' is not assignable to type 'number'.
##[error]src/framework/rest/sitemap.ts(125,43): error TS2322: Type 'string' is not assignable to type 'number'.
Failed to type check.
| shop build (`shop-build`) | ❌ FALLA | 9 s | — |
**check: ROJO** — pruebas: 1212 de 1212 pasaron.
```

Antes de esta US habría pasado en verde: ni `check` ni el build con el `.env`
de la plantilla comprueban tipos.

**El admin no lo detectaría (limitación de D-6).** En la misma corrida, el
build del admin imprime `Skipping validation of types`. En local, con las
plantillas, los dos builds lo imprimen (ver CA-5). En cambio, en la corrida
verde la tienda sí comprueba (`Running TypeScript ...`,
`Finished TypeScript in 12.8s`).

R-1 queda descartado: `APPLICATION_MODE` del proceso gana a la del `.env`.

Los PR #2 y #3 se cerraron sin merge con `gh pr close --delete-branch`.
`git ls-remote --heads origin` solo lista `refs/heads/main`.

### CA-5 — Local igual

`just check-full` en local (Windows), con la receta nueva:

```text
OK    [1/10] packages/db build  84s
OK    [2/10] packages/db lint  3s
OK    [3/10] packages/db typecheck  14s
OK    [4/10] api/rest typecheck  68s
OK    [5/10] api/rest lint  102s
OK    [6/10] admin/rest lint  202s
OK    [7/10] shop lint  200s
OK    [8/10] api/rest test  108s
OK    [9/10] packages/db test  137s
OK    [10/10] scraper db-test  5s
check: VERDE (10 pasos, 930s)
  Skipping validation of types
  Skipping validation of types
check-full: VERDE (check + build-api + build-admin + build-shop)
real	26m53.223s
```

Es el mismo formato y el mismo resultado que antes. Los 930 s son más que los
493 s de ayer en la misma máquina (más carga; los tiempos locales varían
mucho detrás de Zscaler). Un solo paso y el error por id:

```text
$ CHECK_REPORT=... just check db-lint api-test
OK    [1/2] packages/db lint  11s
OK    [2/2] api/rest test  113s
check: VERDE (2 pasos, 125s)

$ just check nope
check: id desconocido 'nope'. Ids: db-build db-lint db-typecheck api-typecheck api-lint admin-lint shop-lint api-test db-test scraper-test api-build admin-build shop-build resumen
error: recipe `check` failed with exit code 2
```

### CA-6 — Tiempo

| Corrida | Job completo |
|---|---|
| Antes: #7 (44677171842, un step `just check`) | 3 min 9 s |
| Después: 44690155012 | 6 min 05 s (06:46:19 → 06:52:24) |
| Después: 44691063406 | 6 min 00 s (06:54:09 → 07:00:09) |

Los ~3 min de más son los tres builds: API 6-7 s, admin 69-86 s y tienda
53-65 s. Los pasos de `check` cuestan lo mismo separados que juntos.

### Para otra US (no se tocó)

- El TS2688 (`minimatch`) del admin. Mientras siga, el admin no comprueba
  tipos ni en el CI ni en su imagen.
- La protección de `main` (decisión del dueño, pospuesta).
