# US-109 — CI con pasos segregados, builds y resumen visible

> El CI de US-11 ejecuta las 1212 pruebas, pero todo va dentro de un solo
> step, «Run just check», y la página de la ejecución no muestra qué se
> compiló ni qué se probó. Además no corre los builds (`check-full`), así que
> un error de `next build` pasa en verde. Esta US deja cada paso visible en
> Actions y suma los builds. Es la base de US-110 (imágenes), US-111 y US-112
> (despliegue).

**Épico:** [Épico 9](./README.md)
**Fecha:** 2026-11-20
**Status:** Listo para ejecución. Promovida desde `_backlog/` el 2026-11-20,
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

- [ ] CA-1 a CA-6 verificados, con la salida real pegada en «Resultado».
- [ ] Ramas y PR de prueba cerrados y borrados.
- [ ] Status en `Implementado` y fila del épico marcada.

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
