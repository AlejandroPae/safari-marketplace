# US-115 — Archivar las historias implementadas de `docs/product`

> Las épicas e historias cerradas pasan a `docs/product/_archivo/` con su
> número y nombre; en la raíz quedan el README, el backlog y los épicos
> abiertos.

**Fecha:** 2026-11-21
**Status:** Listo para ejecución (promovida desde `_backlog/`, refinada con fable)
**Depende de:** cierre de US-111
**LOC est.:** ~80 (movimientos con `git mv` + enlaces + README)

## Historia
**Como** estudiante que abre `docs/product/` en su fork, **quiero** ver solo
lo vigente y tener el historial a un lado, **para** usar las historias
cerradas como ejemplo del flujo spec-driven sin confundirlas con trabajo
pendiente.

## Contexto
- `docs/product/` tiene 28 entradas en su raíz: 13 carpetas de épico y 15
  archivos planos, sin contar `README.md` ni `_backlog/`. Casi todas están
  implementadas.
- El código ya no las cita (commit `e9f69a2`).

**Decisión del dueño (2026-11-20):** archivar y seguir con el flujo SDD: las
historias nuevas siguen en `docs/product/` y la numeración cuenta también las
archivadas.

## Refinamiento — Decisiones tomadas
| # | Decisión |
|---|---|
| D-1 | **Quedan en la raíz los épicos abiertos enteros**, con sus sub-US ya hechas: el Épico 9 (US-73, US-74), el 16 (US-111, US-112, US-113, US-114, US-116, US-18) y el 75 (US-87). Se respeta «carpeta = épico». |
| D-2 | Lo reemplazado (Épico 33; US-34, US-43 y US-79 dentro de sus épicos) y la US-45 también van a `_archivo/`. |
| D-3 | El Status no se cambia a «Archivada»: la ubicación lo dice, y así el movimiento no mezcla cambios de contenido. |
| D-4 | Dentro de lo archivado se corrigen **solo los enlaces Markdown**; las rutas en texto plano quedan como históricas. |
| D-5 | La prosa histórica de `docs/product/README.md` (`:236-325`) pasa a `docs/product/_archivo/README.md`. |
| D-6 | La regla de numeración cuenta la raíz, `_backlog/`, `_archivo/*` y `_archivo/*/*`. |
| D-7 | Se ejecuta después de cerrar la US-111 (evita conflictos en `docs/dokploy` y en el Mapa del backlog). |

## Scope
**Incluye:**
- Mover con `git mv` a `_archivo/` todo lo que no está en D-1. La lista exacta
  se confirma con el dueño antes de mover: el vocabulario del Status no es
  uniforme y no sale de un `grep`.
- `docs/product/README.md`: Estructura (`:30-38`), Numeración (`:48`, D-6),
  Cross-references (`:178-185`), el Mapa del backlog con las rutas nuevas, y
  la prosa histórica a `_archivo/README.md` (D-5).
- Enlaces que se rompen:
  - `db/README.md:118` (Épico 46);
  - en la prosa del README de producto: `:242`, `:260`, `:261`, `:274`,
    `:279`;
  - de archivados a `_backlog/` (un nivel más): `26-…/README.md:131`,
    `40-…/README.md:11`, `46-…/README.md:14`, `5-…/README.md:29`;
  - de archivados a épicos abiertos: `99-console-log-al-logger.md:11`
    (Épico 16) y `:104` (Épico 75), y `92-…/README.md:19` (Épico 75).
- Si la US-116 ya existe: la frase de `docs/README.md` sobre `docs/product/`.

**NO incluye:**
- Borrar historias.
- `openspec/changes/archive/` y `docs/pickbazar/web/assets/manifest.json`
  (rutas históricas).
- Las menciones en texto de `justfile:84` y `:92`, de los hooks de `.claude/`
  y de `openspec/config.yaml`: siguen siendo válidas o son históricas.
- `CLAUDE.md`: se **propone** al dueño el texto nuevo de `:12` (Épico 16) y
  `:178-180` («leer la US objetivo»); lo edita el dueño o lo autoriza.

## Criterios de aceptación
### CA-1 — Raíz limpia
`ls docs/product` muestra solo `README.md`, `_backlog/`, `_archivo/` y los
Épicos 9, 16 y 75.

### CA-2 — Historia intacta
`git log --follow` de una historia archivada muestra su historial completo.
El commit del movimiento solo tiene renombres al 100 %.

### CA-3 — Enlaces sanos
El chequeo de enlaces Markdown relativos en `docs/`, `apps/README.md`,
`db/README.md` y `packages/db/README.md` no encuentra rotos.

### CA-4 — Numeración
La regla del README da como próximo número el máximo según D-6, más uno.

### CA-5 — Referencias del agente intactas
`.claude/agents/sdd-apply.md:9`, `sdd-verify.md:9`, `format-edited-file.cjs:8`
y `openspec/config.yaml:23` y `:92` siguen apuntando a un
`docs/product/README.md` que existe, y la numeración de sus pasos («paso 5 del
protocolo») no cambia.

## Escenarios Gherkin
```gherkin
Feature: Archivo de historias implementadas
  Scenario: CA-1 — raíz limpia
    When se listan las entradas de docs/product
    Then solo aparecen README.md, _backlog, _archivo y los épicos 9, 16 y 75

  Scenario: CA-2 — historia intacta
    Given una historia archivada
    When se consulta git log --follow
    Then se ve su historial completo
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `docs/product/*` | `git mv` a `_archivo/` |
| `docs/product/_archivo/README.md` | Nuevo: la prosa histórica |
| `docs/product/README.md` | Estructura, numeración, cross-references, mapa |
| `db/README.md` | Enlace al Épico 46 |
| Enlaces listados en Scope | Rutas nuevas |

## Definición de Done
- [ ] Salida de `ls docs/product` y del chequeo de enlaces pegada.
- [ ] Commit del movimiento separado del commit de enlaces y README.
- [ ] Texto propuesto para `CLAUDE.md` entregado al dueño.
- [ ] Lint: no aplica (solo Markdown).

## Notas para el agente ejecutor
- Dos commits: primero solo `git mv` (renombres al 100 %), después enlaces y
  README.
- Confirmar con el dueño la lista de lo que se mueve antes de mover.
- No ejecutar en paralelo con ninguna US que edite el Mapa del backlog.
