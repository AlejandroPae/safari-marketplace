# US-10 — Receta `just check` (gate local agregador)

> Un solo comando local que corre todo lo verificable del monorepo y corta al
> primer rojo: el gate de cierre que las US de este backlog citan en su DoD.

**Épico:** [Épico 9](./README.md)
**Fecha:** 2026-08-25
**Status:** Implementado (2026-11-18)
**Depende de:** ninguna
**LOC est.:** ~120

## Historia
**Como** agente que cierra una US, **quiero** un `just check` que agregue
lint, typecheck, tests y builds existentes, **para** verificar el repo entero
con un comando y evidencia única en vez de recordar N comandos por paquete.

## Contexto

- Piezas verificables que existen HOY: `packages/db` (`npm run lint` biome,
  `npm run typecheck`, `npm test` vitest — requiere Postgres), builds de
  `apps/api/rest` (`yarn build`), `apps/shop` (`yarn build:rest`) y
  `apps/admin/rest` (`yarn build`), y `apps/api/rest` `yarn lint` (eslint).
- Piezas que NO existen y no deben fingirse: tests de la API (jest sin
  specs), tests del scraper en verde (rotos hasta el Épico 5), tests de
  frontend.

## Scope
**Incluye:** receta(s) `check` en el justfile (grupo `verify`), composición
decidida y documentada en la propia receta (qué corre, en qué orden, qué
requiere `db-up`), corte al primer rojo, y actualización del comentario de
cabecera del justfile y de `CLAUDE.md` (sección Comandos) con el gate nuevo.
**NO incluye:** escribir tests nuevos, CI (US-11), arreglar rojos
preexistentes que el gate destape (se reportan; si son triviales, fix aparte),
hooks de git.

## Criterios de aceptación

### CA-1 — Verde de punta a punta
En un working tree limpio con la base arriba, `just check` sale 0 e imprime un
resumen por paso.

### CA-2 — Corta al primer rojo
Con un error inyectado (p. ej. un type error temporal en `packages/db/src`),
`just check` sale ≠0 en ese paso, sin ejecutar los siguientes, y el paso
culpable es identificable en la salida. El error inyectado se revierte.

### CA-3 — Composición honesta y documentada
La receta lista en comentarios qué corre y qué queda fuera y por qué (jest sin
specs, scraper hasta Épico 5). Nada aspiracional dentro del gate.

### CA-4 — Precondiciones explícitas
Si la base no está arriba y un paso la necesita, el gate lo dice claro
(mensaje accionable tipo "corre just db-up"), no un stacktrace de conexión.

## Escenarios Gherkin
```gherkin
Feature: Gate local agregador
  Scenario: CA-2 — corte al primer rojo
    Given un type error inyectado en packages/db
    When corro just check
    Then el gate sale distinto de 0 en el paso de typecheck
    And los pasos posteriores no se ejecutan
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `justfile` | receta `check` (+ variante `check-full` si el design separa los builds lentos) |
| `CLAUDE.md` | sección Comandos: el gate nuevo |

## Definición de Done
- [x] Salida real de `just check` verde pegada (completa, con el resumen por paso).
- [x] Salida real del CA-2 (rojo inyectado + corte) pegada, y el revert mostrado.
- [x] Salida real de `just --list` mostrando la receta en su grupo.
- [x] Status de esta US actualizado y fila del épico marcada.

## Notas para el agente ejecutor
- Medir y anotar en la receta la duración aproximada de cada paso: la decisión
  D-1 del épico (builds dentro o en `check-full`) se toma con números, no a ojo.
- `packages/db` necesita `prisma generate`/build antes del typecheck (R-2 del
  épico): respetar el orden.

## Actualización tras el escaneo de bingo-flow (2026-10-24)

> Sección añadida sin reescribir lo anterior. Recoge lo que cambió desde el
> 2026-08-25 y lo que dejó como exigencia la actualización de US-11. Fuente de
> la comparación: el proyecto hermano `C:\DevOps\MyGitHub\games\bingo-flow`.
> El re-refinamiento decide qué de esto sube a CA y qué queda como nota.
> Antes de esta actualización, el Status era «Listo para ejecución».

### 1. Contexto corregido: jest de la API y `just db-check` entran al gate

El Contexto de esta US dice (líneas 23-24) que entre las piezas que «NO
existen y no deben fingirse» están los «tests de la API (jest sin specs)», y
el CA-3 (líneas 48-49) pide documentar como excluido el «jest sin specs».
Ya no es cierto. Conteos medidos el 2026-10-24:

```
cd apps/api/rest && npx jest   →  Test Suites: 34 passed, 34 total / Tests: 565 passed, 565 total
just db-check                  →  Test Files  32 passed (32) / Tests  412 passed (412)
```

Por la decisión 2 del épico («Composición honesta»), lo que existe y pasa
entra. La composición del **CA-3** pasa a incluir:

- **jest de `apps/api/rest`** (`npx jest`). Mockea `@safari/db`, así que no
  necesita Postgres, pero sí el `dist/` de `packages/db` (`just db-build`
  antes).
- **`just db-check`**, que es `npm run typecheck` + `npm test` de
  `packages/db` (justfile, receta `db-check`) y requiere `just db-up`. Ya
  estaba listado como piezas sueltas en el Contexto (líneas 19-20); la receta
  puede invocar `db-check` en vez de repetirlas.

Lo que sigue fuera, con su motivo: los tests del scraper (rotos hasta el
Épico 5) y los tests de frontend (no existen). El CA-4 (precondiciones) aplica
a `db-check`.

### 2. El lint de la API, sin `--fix`

El Contexto (línea 22) lista «`apps/api/rest` `yarn lint` (eslint)» como
pieza del gate. Pero `apps/api/rest/package.json:16` es
`"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"` (verificado el
2026-10-24). Con `--fix`, eslint reescribe los archivos que puede corregir y
solo falla por lo que no puede: el gate quedaría en verde sobre un árbol
modificado. US-11 (sección «El `--fix` del lint de la API») deja esta
corrección a cargo de US-10.

- La receta invoca eslint **sin `--fix`**, por ejemplo
  `npx eslint "{src,apps,libs,test}/**/*.ts"` desde `apps/api/rest`.
- Alternativa, a decisión del ejecutor: un script nuevo de solo lectura
  (p. ej. `lint:check`) en `apps/api/rest/package.json`, que la receta llame.
  El script `lint` actual no se cambia.
- Un error de lint pone el gate en rojo.

### 3. Herramienta propuesta para el CA-2: `scripts/sdd/mutate.mjs` de bingo-flow

El **CA-2** (líneas 42-45) pide inyectar un error, ver que el gate corta y
revertir. bingo-flow tiene un script para eso,
`C:\DevOps\MyGitHub\games\bingo-flow\scripts\sdd\mutate.mjs`, escrito tras
cuatro incidentes con scripts ad hoc (líneas 3-5: dos gates en paralelo sobre
el mismo archivo, un `find` que casó un comentario, CRLF y una restauración
cortada a mitad). Lo esencial:

- **Uso** (líneas 8-9): `node scripts/sdd/mutate.mjs <archivo> "<literal>" "<reemplazo>"`
  y `node scripts/sdd/mutate.mjs <archivo> --restore`.
- **El literal tiene que aparecer exactamente una vez** en el original; si no,
  sale con 2 (líneas 54-58).
- **Respaldo fuera del árbol:** en el tmp del sistema, nunca en el repo, y sin
  `git checkout`, `restore` ni `stash` (líneas 11-13). Una mutación a la vez
  por archivo: con otra pendiente, se niega a mutar (líneas 49-52).
- **Restauración comparada por bytes:** copia el respaldo, compara con
  `Buffer.equals` y, si no son idénticos, sale con 3 y conserva el respaldo
  (líneas 35-41).
- **Nombre del tmp:** `join(tmpdir(), "bingo-flow-mutate")` (línea 27). En
  safari hay que cambiarlo (p. ej. `safari-marketplace-mutate`), para que una
  mutación pendiente de un repo no choque con la del otro.

Es una **herramienta propuesta, no un requisito**. Si el ejecutor la adopta,
la copia a safari (p. ej. `scripts/sdd/mutate.mjs`) y la anota en «Archivos a
crear / modificar». Si no, el CA-2 se cumple con cualquier inyección que deje
el revert mostrado en la evidencia, como exige la DoD.

### 4. Decisión abierta: cortar al primer rojo o resumir al final

El README del épico abre la **DA-1**: si `just check` corta al primer rojo
(decisión 3, la que refleja el CA-2) o corre todas las piezas y resume al
final, como `scripts/smells.mjs` de bingo-flow. La propuesta por defecto es
mantener el corte al primer rojo en `check` y, si se quiere un reporte
agregado, hacerlo en una receta aparte. El re-refinamiento de esta US espera
esa respuesta: si cambia, cambian el CA-2 y su escenario Gherkin.

## Resultado (2026-11-18, rama `feat/us-10-just-check` sobre `main` @ `0029d71`)

### Re-refinamiento: decisiones del dueño

Se tomaron antes de escribir la receta, con las mediciones de cada pieza a la
vista. Las respuestas, textuales:

- **D-1, builds:** «check sin builds; check-full = check + build-api +
  build-admin (Recomendado)».
- **Scraper:** «Sí, con precondición del venv (Recomendado)». El test del
  pipeline está en verde desde US-8, así que por la decisión 2 entra.
- **`tsc` de shop y admin:** «Fuera del gate; se reporta (Recomendado)».

Además rigen:

- **DA-1 del épico,** confirmada el 2026-10-24: `check` corta al primer rojo.
- **Tests de la API:** la sección 1 de la actualización decía «jest». Hoy son
  **vitest**: 44 archivos y 710 tests. El paso es `npx vitest run`.
- **Lint de la API:** va sin `--fix` (sección 2). La receta llama a
  `npx eslint` directamente; `package.json` no se tocó.
- **`mutate.mjs` de bingo-flow** (sección 3): no se adoptó. El CA-2 inyecta
  con `sed` sobre una línea y muestra el revert con `git diff --quiet`.
  Una sola mutación no justifica un script nuevo.

### Mediciones previas (secuencial, base arriba)

| Pieza | rc | Duración | Destino |
|---|---|---|---|
| packages/db build (prisma generate + tsup) | 0 | 107s | paso 1 |
| packages/db lint (biome) | **1** → 0 tras el fix | 8s | paso 2 |
| packages/db typecheck | 0 | 19s | paso 3 |
| packages/db test (vitest + Postgres) | 0 | 127s | paso 9 |
| api/rest `tsc --noEmit` | 0 | 79s | paso 4 |
| api/rest eslint sin `--fix` | 0 | 76s | paso 5 |
| api/rest vitest | 0 | 68s | paso 8 |
| api/rest `nest build` | 0 | 54s | `check-full` |
| shop `yarn lint` | 0 | 171s | paso 7 |
| admin/rest `yarn lint` | 0 | 32s | paso 6 |
| shop `tsc --noEmit` | 0 | 60s | fuera |
| admin/rest `tsc --noEmit` | **1** | 36s | fuera (ver Hallazgos) |
| scraper `just db-test` | 0 | 5s | paso 10 |

El rojo de biome ya estaba antes de esta US. Biome pide reordenar los exports
de `packages/db/index.ts` y lo ofrece como fix seguro. Es trivial y va en un
commit aparte, `0effb60`: solo cambia el orden de los exports (38+/38−).
Después del fix, `tsc` siguió en verde.

### Archivos

| Archivo | Cambio |
|---|---|
| `justfile` | recetas `check` y `check-full` en el grupo `verify`, con la composición, el orden, las duraciones y las exclusiones en comentarios; una línea en la cabecera |
| `CLAUDE.md` | sección Comandos: el gate nuevo y el conteo de tests de la API, ahora 44/710 |
| `packages/db/index.ts` | orden de exports (fix de biome, commit aparte) |

### CA-1 — Verde de punta a punta

Corrida con un árbol limpio y la base arriba (`just db-up`), sin API, tienda
ni admin levantados. Al terminar, `git status` solo mostraba las ediciones de
esta US: el gate no ensucia el árbol. El `WARN [HealthService] Postgres no
responde` del paso 8 lo emite a propósito el spec de health de US-17; no es
un fallo.

```
$ just check
━━━ [1/10] packages/db build (npm run build)

> @safari/db@0.1.0 build
> prisma generate && tsup

Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma.

✔ Generated Prisma Client (7.10.1) to .\generated\prisma\client in 1.05s

CLI Building entry: index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: C:\DevOps\MyGitHub\safari-marketplace\packages\db\tsup.config.ts
CLI Target: node18
CLI Cleaning output folder
CJS Build start
CJS dist\index.js     572.98 KB
CJS dist\index.js.map 1.12 MB
CJS ⚡️ Build success in 558ms
DTS Build start
DTS ⚡️ Build success in 30820ms
DTS dist\index.d.ts 4.96 MB

━━━ [2/10] packages/db lint (npm run lint)

> @safari/db@0.1.0 lint
> biome check .

Checked 88 files in 536ms. No fixes applied.

━━━ [3/10] packages/db typecheck (npm run typecheck)

> @safari/db@0.1.0 typecheck
> tsc --noEmit


━━━ [4/10] api/rest typecheck (npx tsc --noEmit -p tsconfig.json)

━━━ [5/10] api/rest lint (npx eslint "{src,apps,libs,test}/**/*.ts")

━━━ [6/10] admin/rest lint (yarn lint)
yarn run v1.22.22
$ eslint src
Done in 132.92s.

━━━ [7/10] shop lint (yarn lint)
yarn run v1.22.22
$ eslint src
Done in 25.43s.

━━━ [8/10] api/rest test (npx vitest run)

 RUN  v4.1.11 C:/DevOps/MyGitHub/safari-marketplace/apps/api/rest

[Nest] 14680  - 11/18/2026, 6:15:28 PM    WARN [HealthService] Postgres no responde: connect ECONNREFUSED 127.0.0.1:5433

 Test Files  44 passed (44)
      Tests  710 passed (710)
   Start at  18:14:53
   Duration  56.25s (transform 42.79s, setup 0ms, import 356.13s, tests 3.46s, environment 10ms)


━━━ [9/10] packages/db test (npm test)

> @safari/db@0.1.0 test
> vitest run

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 C:/DevOps/MyGitHub/safari-marketplace/packages/db

(node:33852) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:16904) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:5072) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:9188) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:8276) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:31208) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:19444) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

 Test Files  38 passed (38)
      Tests  499 passed (499)
   Start at  18:15:54
   Duration  82.87s (transform 2.87s, setup 0ms, import 14.29s, tests 45.93s, environment 5ms)


━━━ [10/10] scraper db-test (just db-test)
cd "C:\DevOps\MyGitHub\safari-marketplace/services/scraper-worker" && DATABASE_URL="postgresql://safari:safari@localhost:5433/safari_scraper" "C:\DevOps\MyGitHub\safari-marketplace/services/scraper-worker/.venv/Scripts/python" test_pipeline.py

Conversion de precios (lo que Mongo nunca obligo a hacer):
  OK    "1.299.900 COP" -> 1299900
  OK    "$ 89.900,50"   -> 89900.50
  OK    "44%"           -> 44
  OK    None            -> None
  OK    "sin precio"    -> None

Comportamiento del pipeline sobre `products`:
  OK    1. producto nuevo se inserta
  OK    1. precio quedo numerico y operable
  OK    1. queda en el type 'gadget'
  OK    1. queda en la categoria laptop
  OK    2. volver a verlo no duplica la fila
  OK    2. el precio se actualizo
  OK    2. el nombre se actualizo
  OK    3. cambiar de categoria no duplica
  OK    3. queda en una sola categoria, la nueva
  OK    4. dos tiendas pueden compartir source_product_id
  OK    4. la otra tienda no piso la primera
  OK    5. la tienda se creo una sola vez
  OK    5. la marca se creo una sola vez, para las dos tiendas
  OK    5. los productos de una tienda reutilizan su shop y su marca
  OK    6. promocion >= precio: se guarda el producto sin la promocion
  OK    6. sin precio, precio cero y desbordado no llegan a la base
  OK    6. la corrida sigue: el item sano de despues se inserta
  OK    6. stats cuentan cada caso
  OK    6. cada descarte quedo en el log
  OK    estadisticas del pipeline: insertados + actualizados + fallidos == procesados

Consultas que con precios en texto eran imposibles:
  WHERE price < 1200000 ORDER BY price
         100,000 COP  ZZ Prueba Alkosto  Promo incoherente
         250,000 COP  ZZ Prueba Alkosto  Item sano tras los malos
         899,900 COP  ZZ Prueba Alkosto  Portatil economico
  AVG(price) -> 769,940 COP
  mayor ahorro -> Portatil economico: 100,000 COP
  OK    WHERE price < 1200000 devuelve resultados
  OK    AVG(price) se puede calcular
  OK    resta price - sale_price funciona

Limpieza:
  OK    no quedan filas de la prueba
  OK    las filas del seed siguen intactas

Todas las comprobaciones pasaron

━━━ Resumen de just check
OK    [1/10] packages/db build  85s
OK    [2/10] packages/db lint  4s
OK    [3/10] packages/db typecheck  11s
OK    [4/10] api/rest typecheck  62s
OK    [5/10] api/rest lint  86s
OK    [6/10] admin/rest lint  135s
OK    [7/10] shop lint  27s
OK    [8/10] api/rest test  65s
OK    [9/10] packages/db test  88s
OK    [10/10] scraper db-test  4s
check: VERDE (10 pasos, 568s)
EXIT=0
```

En una segunda corrida, dentro de `check-full`, el mismo gate tardó **340s**
con las cachés calientes; esta, en frío, 568s.

### CA-2 — Corta al primer rojo

Rojo inyectado en `packages/db/src`: un type error en un test. Biome no lo
ve, así que el paso que cae es el typecheck.

```
$ sed -i 's/^const ADMIN = 3;$/const ADMIN: string = 3; \/\/ CA-2 US-10: rojo inyectado/' packages/db/src/repositories/store-notices.integration.test.ts
$ git diff packages/db/src | grep '^[-+]const'
-const ADMIN = 3;
+const ADMIN: string = 3; // CA-2 US-10: rojo inyectado

$ just check
━━━ [1/10] packages/db build (npm run build)

> @safari/db@0.1.0 build
> prisma generate && tsup

Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma.

✔ Generated Prisma Client (7.10.1) to .\generated\prisma\client in 690ms

CLI Building entry: index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: C:\DevOps\MyGitHub\safari-marketplace\packages\db\tsup.config.ts
CLI Target: node18
CLI Cleaning output folder
CJS Build start
CJS dist\index.js     572.98 KB
CJS dist\index.js.map 1.12 MB
CJS ⚡️ Build success in 252ms
DTS Build start
DTS ⚡️ Build success in 23185ms
DTS dist\index.d.ts 4.96 MB

━━━ [2/10] packages/db lint (npm run lint)

> @safari/db@0.1.0 lint
> biome check .

Checked 88 files in 167ms. No fixes applied.

━━━ [3/10] packages/db typecheck (npm run typecheck)

> @safari/db@0.1.0 typecheck
> tsc --noEmit

src/repositories/store-notices.integration.test.ts(30,7): error TS2322: Type 'number' is not assignable to type 'string'.
src/repositories/store-notices.integration.test.ts(75,16): error TS2367: This comparison appears to be unintentional because the types 'number' and 'string' have no overlap.
src/repositories/store-notices.integration.test.ts(135,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(150,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(165,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(183,9): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(196,25): error TS2345: Argument of type '{ priority: string; type: string; notice: string; expiredAt: Date; createdBy: string; }' is not assignable to parameter of type 'CreateStoreNoticeInput'.
  Types of property 'createdBy' are incompatible.
    Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(199,25): error TS2345: Argument of type '{ priority: string; type: string; notice: string; expiredAt: Date; createdBy: string; }' is not assignable to parameter of type 'CreateStoreNoticeInput'.
  Types of property 'createdBy' are incompatible.
    Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(202,25): error TS2345: Argument of type '{ priority: string; type: string; effectiveFrom: Date; notice: string; expiredAt: Date; createdBy: string; }' is not assignable to parameter of type 'CreateStoreNoticeInput'.
  Types of property 'createdBy' are incompatible.
    Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(221,9): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(229,29): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(230,9): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(247,49): error TS2322: Type 'string' is not assignable to type 'number'.
src/repositories/store-notices.integration.test.ts(270,7): error TS2322: Type 'string' is not assignable to type 'number'.

━━━ Resumen de just check
OK    [1/10] packages/db build  75s
OK    [2/10] packages/db lint  4s
FALLA [3/10] packages/db typecheck  10s  (exit 2)
  --   [4/10] api/rest typecheck  no ejecutado
  --   [5/10] api/rest lint  no ejecutado
  --   [6/10] admin/rest lint  no ejecutado
  --   [7/10] shop lint  no ejecutado
  --   [8/10] api/rest test  no ejecutado
  --   [9/10] packages/db test  no ejecutado
  --   [10/10] scraper db-test  no ejecutado
check: ROJO en 'packages/db typecheck'
error: recipe `check` failed with exit code 1
EXIT=1
```

El paso 3 sale con exit 2 y los pasos 4 a 10 no se ejecutan. La salida
nombra el paso culpable y el gate sale con 1.

Revert:

```
$ sed -i 's/^const ADMIN: string = 3; \/\/ CA-2 US-10: rojo inyectado$/const ADMIN = 3;/' packages/db/src/repositories/store-notices.integration.test.ts
$ git diff --quiet packages/db/src && echo "packages/db/src sin cambios respecto de HEAD"
packages/db/src sin cambios respecto de HEAD
$ (cd packages/db && npm run typecheck >/dev/null && echo "typecheck OK")
typecheck OK
```

### CA-3 — Composición honesta y documentada

El comentario de la receta lista los 10 pasos con su duración y lo que queda
fuera, cada cosa con su motivo:

- **Builds de Next y de la API:** van en `check-full`.
- **Build de la tienda:** prerenderiza contra la API en :9001, y el gate no
  depende de servicios levantados a mano.
- **`tsc` de shop y admin:** no son scripts del repo, y `next build` ya
  comprueba los tipos.
- **Tests de frontend:** no existen.
- **Variante GraphQL:** congelada desde US-12.

Ningún paso es aspiracional: los 10 pasan hoy.

### CA-4 — Precondiciones explícitas

Antes de correr nada, el gate comprueba tres cosas:

- los tres `node_modules`;
- que Postgres responda (`pg_isready` dentro del contenedor);
- el venv del scraper.

Con la base parada:

```
$ docker compose stop postgres
 Container safari-postgres  Stopped
$ just check; echo "EXIT=$?"
PRECONDICIÓN  Postgres no responde en :5433 -> corre 'just db-up'
check: NO se ejecutó ningún paso
error: recipe `check` failed with exit code 2
EXIT=2
```

### `check-full`

Corrido con la API **apagada** (`just check-ports`: 9001, 3003 y 3002
libres). El build del admin no necesita la API:

```
$ just check-full
(… resumen de check …)
OK    [1/10] packages/db build  27s
OK    [2/10] packages/db lint  3s
OK    [3/10] packages/db typecheck  7s
OK    [4/10] api/rest typecheck  46s
OK    [5/10] api/rest lint  62s
OK    [6/10] admin/rest lint  56s
OK    [7/10] shop lint  12s
OK    [8/10] api/rest test  42s
OK    [9/10] packages/db test  80s
OK    [10/10] scraper db-test  4s
check: VERDE (10 pasos, 340s)
$ nest build
Done in 45.27s.
$ next build --webpack
✓ Compiled successfully in 27.2s
Done in 195.23s.
check-full: VERDE (check + build-api + build-admin)
EXIT=0
```

### `just --list`

```
    [verify]
    check            # Gate local (US-10): lint, typecheck y tests del monorepo; corta al primer rojo (~6-10 min)
    check-full       # check + build de la API y del admin (sin la tienda: necesita la API levantada)
    check-ports      # Revisa si los puertos estan libres y quien los ocupa (ver Zscaler en el README)
    doctor           # Revisa que el entorno tenga todo lo necesario
    verify           # Comprueba que API, shop y admin responden con contenido real
```

### Hallazgos que no se accionaron (NO incluye)

- **`tsc --noEmit` del admin en rojo:** «Cannot find type definition file
  for 'minimatch'». `apps/node_modules/@types/minimatch` es el stub 6.0.0
  («minimatch provides its own types»), y sin `types` en el tsconfig, tsc lo
  carga como librería implícita. `next build` no lo sufre. Queda para otra US.
- **`CLAUDE.md` líneas 51-54:** todavía dicen que `just db-test` está «HOY
  ROTO» (US-8). Ya está en verde y es el paso 10 de este gate. No se tocó
  porque no es de esta US.
- **US-11** ya puede invocar `just check`. Necesita Postgres, `just
  install` y el venv del scraper, que en CI incluye Playwright. Si los ~10
  minutos resultan caros en CI, el recorte se decide aquí (composición), no
  en el workflow.
