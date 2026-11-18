# US-12 — Decidir y acotar la variante GraphQL

> `apps/api/graphql` y `apps/admin/graphql` (y el modo `dev:gql` del shop)
> existen completos pero nadie los opera ni documenta: decidir su destino y
> dejarlo escrito y aplicado, para que estudiantes y agentes no gasten tiempo
> en una rama muerta.

**Épico:** [Épico 9](./README.md)
**Fecha:** 2026-08-25
**Status:** Implementado (2026-11-18)
**Depende de:** ninguna
**LOC est.:** ~100 (mayormente docs/justfile; 0 LOC de aplicación si la decisión es "congelar")

## Historia
**Como** estudiante que clona el monorepo, **quiero** saber sin ambigüedad qué
variante (REST/GraphQL) es la operativa y qué estado tiene la otra, **para**
no perder una tarde intentando levantar un stack que el repo no soporta.

## Contexto verificado

- El stack documentado y operado es REST (`apps/README.md`: "no es necesaria
  para el stack REST"). Ninguna receta del justfile arranca ni construye la
  variante GraphQL.
- Sin embargo: `apps/admin/graphql` se instala siempre (workspace `admin/*`),
  el shop conserva `dev:gql`/`build:gql` (requieren codegen con
  `graphql-let`), y `apps/api/graphql` tiene su propio package.json fuera de
  toda receta.
- Costo actual: tiempo de instalación del workspace, superficie de confusión,
  y divergencia creciente (la migración a Postgres del Épico 1 solo toca
  `api/rest`).

## Scope
**Incluye:** (1) registrar la decisión del dueño — congelar como referencia /
mantener operativa / eliminar — con sus razones, en `apps/README.md`; (2)
aplicar lo decidido en la capa de orquestación: notas en README + justfile
coherente (si se congela: dejar explícito que ningún target la cubre; si se
mantiene: agregar recetas `*-gql` funcionando; si se elimina: US separada de
borrado, NO borrar en esta).
**NO incluye:** borrar código (si la decisión es eliminar, se abre una US
propia con su plan de remoción), migrar la variante GraphQL a Postgres,
tocar el workspace de yarn salvo que la decisión lo exija y quepa en la sesión.

## Criterios de aceptación

### CA-1 — Decisión registrada por el dueño
La decisión (congelar/mantener/eliminar) está escrita en `apps/README.md` con
fecha y razones. **Esta US no arranca sin esa decisión: si el agente no la
tiene, pregunta y espera.**

### CA-2 — Orquestación coherente con la decisión
El justfile y los README no contradicen la decisión (p. ej. si se congela, no
queda ninguna instrucción que sugiera que `dev:gql` es un camino soportado sin
avisar su estado).

### CA-3 — El stack REST no se ve afectado
`just verify` pasa igual que antes de la US.

## Escenarios Gherkin
```gherkin
Feature: Variante GraphQL acotada
  Scenario: CA-1 — decisión primero
    Given que el dueño no ha registrado la decisión
    When un agente toma esta US
    Then el agente pregunta la decisión y no modifica nada hasta tenerla
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `apps/README.md` | sección de decisión + estado de la variante GraphQL |
| `justfile` | solo si la decisión exige recetas nuevas o comentarios de estado |

## Definición de Done
- [x] Decisión del dueño citada textual en el reporte.
- [x] Diff de docs/justfile pegado.
- [x] Salida real de `just verify` en verde.
- [x] Status de esta US actualizado y fila del épico marcada.

## Resultado (2026-11-18, rama `docs/us-12-congelar-graphql` sobre `main` @ `89fb994`)

### CA-1 — Decisión del dueño

Respuestas textuales del dueño, tomadas antes de tocar ningún archivo:

- Destino de la variante: «Congelar como referencia (Recomendado)».
- Dependencias de `admin/graphql` mientras se congele: «Solo si comparte
  lockfile (Recomendado)».

Quedan registradas, con fecha y razones, en la sección «Variante GraphQL:
congelada como referencia (US-12)» de `apps/README.md`.

### CA-2 — Orquestación coherente

```diff
--- a/apps/README.md
+++ b/apps/README.md
 `shop` y `admin/rest` consumen la API vía `NEXT_PUBLIC_REST_API_ENDPOINT`.
-Existe además una variante GraphQL (`api/graphql` + `dev:gql`) que depende de
-codegen con `graphql-let`; no es necesaria para el stack REST.
+El único stack soportado es REST. La variante GraphQL está **congelada**: ver
+la sección siguiente.
+
+## Variante GraphQL: congelada como referencia (US-12)
+(sección nueva: decisión, qué es la variante, qué significa congelarla,
+política de dependencias y cómo revertir)
@@
-cd apps          && yarn install    # shop + admin/rest + admin/graphql (~11 min)
+cd apps          && yarn install    # shop + admin/rest + admin/graphql, que está congelada (~11 min)

--- a/justfile
+++ b/justfile
-# Workspace del frontend: shop + admin/rest + admin/graphql (~11 min)
+# Workspace del frontend: shop + admin/rest + admin/graphql (~11 min).
+# La variante GraphQL está congelada (US-12): se instala pero ninguna receta
+# la arranca, construye ni verifica. Ver apps/README.md.
```

Revisión de las demás menciones (`git grep` de `dev:gql`, `build:gql`,
`admin/graphql`, `api/graphql` y `graphql-let` en los `.md` y el `justfile`,
fuera de `docs/product/` y de los cambios archivados de `openspec/`):

- `justfile`: `clean` y `clean-all` borran el `.next` de `admin/graphql` y el
  `node_modules` de `api/graphql`. Son limpieza de artefactos y no sugieren
  que la variante esté soportada. Se quedan.
- `CLAUDE.md` ya la describe como «no usada en el stack REST». Es del dueño y
  no se tocó.

No hay recetas nuevas: congelar no las pide. El workspace de yarn no se tocó.

### CA-3 — El stack REST no se ve afectado

```
just verify
OK   API    :9001/api/settings  200  5503B  559ms
OK   Shop   :3003/en  200  191897B  7433ms  cards:30
OK   Admin  :3002/en/login  200  72554B  217ms  cards:1
```

El primer `just verify` falló (`FALLA API :9001 ECONNREFUSED`, y la tienda dio
500). `nest start --watch` detectó cambios de archivo varias veces mientras
arrancaban la tienda y el admin, y relanzó la API. Una de las relanzadas murió
con `EADDRINUSE :::9001` porque la instancia anterior seguía con el puerto, y
`verify` corrió en ese hueco. La instancia superviviente respondía 200 y el
segundo `verify` pasó. La US solo toca docs y un comentario del `justfile`,
así que no puede causar esto.

> **Corrección (2026-11-18, US-17):** se escribió que «las dos instancias eran
> del mismo `api-dev`». No es así. La que tenía el puerto era hija de un
> `nest start --watch` huérfano, lanzado a las 9:12 en la verificación del
> upgrade de Next a 16.4.5. Al apagarlo se mató solo el proceso del puerto, y
> el watcher siguió vivo relanzando la API. Era un proceso del agente, no del
> dueño. Ver el Resultado de US-17.

### Fuera de alcance, mencionado

- Sacar `admin/graphql` del workspace de yarn, que ahorraría instalación y
  CI, o borrar la variante: cada cosa necesita su propia US.
- La tabla de arquitectura de `apps/README.md` dice «NestJS 9» para
  `api/rest`, que está en Nest 12 desde US-88..US-91. Es una línea ajena a
  esta US.
- `CLAUDE.md` no menciona que la variante está congelada.

## Notas para el agente ejecutor
- Esta es una US de gobernanza: el valor está en eliminar ambigüedad, no en
  escribir código. Resistir la tentación de "aprovechar y borrar".
