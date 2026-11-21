# US-116 — El punto de entrada del estudiante en `docs/`

> Una página que ordena las guías de punta a punta y una guía para el fork y
> el entorno local.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-21
**Status:** Listo para ejecución (sale de partir el borrador de la US-114, refinado con fable)
**Depende de:** US-113 (el CI publica en forks), US-114 (correcciones)
**LOC est.:** ~200 de documentación

## Historia
**Como** estudiante que hace fork del repositorio, **quiero** una página que
me diga en qué orden seguir las guías, **para** llegar del fork a la tienda
desplegada en mi dominio sin depender del docente.

## Contexto
No hay punto de entrada. El orden real entre guías (GitHub → Cloudflare
01-02 → Dokploy 01-02 → Cloudflare 03-04 → Dokploy 03-11 → Cloudflare 05)
solo se deduce de la nota de `docs/cloudflare/README.md:32-34`. El fork,
activar Actions, clonar y el entorno local no tienen guía para el estudiante:
el entorno local está en `apps/README.md:57-135`, mezclado con detalles
internos.

## Refinamiento — Decisiones tomadas
| # | Decisión |
|---|---|
| D-1 | El punto de entrada es `docs/README.md`, enlazado desde el README raíz («Empieza aquí»). |
| D-2 | Las carpetas `docs/github`, `docs/cloudflare` y `docs/dokploy` no se renombran: el orden lo da `docs/README.md`. |
| D-3 | La guía del fork es `docs/fork-y-entorno-local.md`, sin número (es el único archivo suelto en la raíz de `docs/`). |
| D-4 | `docs/pickbazar/` (zips de imágenes, ~120 MB) se queda donde está; `docs/README.md` aclara que no es una guía. |
| D-5 | El fork debe ser **público** (Dokploy lo clona sin credenciales); se dice como requisito. |

## Scope
**Incluye:**
1. `docs/README.md` (nuevo):
   - qué se va a construir;
   - la tabla del recorrido en orden, con un enlace por tramo y lo que
     necesita cada uno (cuenta, dominio, VPS);
   - qué es `docs/product/`;
   - que `docs/pickbazar/` no es una guía.
2. `docs/fork-y-entorno-local.md` (nuevo), en este orden:
   1. fork público;
   2. **habilitar Actions** en el fork;
   3. crear el secreto y la variable (enlace a `docs/github/`);
   4. primera corrida con `workflow_dispatch`;
   5. clonar;
   6. requisitos: Node (`.nvmrc`), yarn, Docker, `just`, y Python para el
      scraper; Git Bash o WSL en Windows;
   7. `just doctor`, `just setup`, levantar y `just verify`.

   El detalle se enlaza a `apps/README.md`, no se copia. Menciona que «Sync
   fork» publica imágenes nuevas.
3. `docs/github/README.md` (nuevo, corto): índice, igual que las otras dos
   carpetas.
4. README raíz: el enlace «Empieza aquí» a `docs/README.md`.
5. Que `docs/cloudflare/README.md:32-34` y `docs/dokploy/02-vps-y-dns.md:85-103`
   no contradigan el orden de `docs/README.md` (enlazan a él).

**NO incluye:**
- Renombrar carpetas ni mover `docs/pickbazar/`.
- Una guía de operación.
- Partir `apps/README.md`.
- Archivar `docs/product/` (US-115).

## Criterios de aceptación
### CA-1 — Punto de entrada
`docs/README.md` lista los tramos en orden, cada uno con su enlace, aclara
`docs/product/` y `docs/pickbazar/`, y el README raíz enlaza a él.

### CA-2 — Fork y entorno local
`docs/fork-y-entorno-local.md` cubre los pasos del punto 2 de Scope en ese
orden y enlaza a `apps/README.md`.

### CA-3 — Índice de GitHub
`docs/github/README.md` existe y enlaza a la guía de secretos.

### CA-4 — Orden coherente
Las notas de orden de Cloudflare y de Dokploy remiten a `docs/README.md` y no
lo contradicen.

### CA-5 — Enlaces sanos
El chequeo de enlaces de la US-114 (D-4), ampliado a los archivos nuevos, no
encuentra rotos.

## Escenarios Gherkin
```gherkin
Feature: Recorrido del estudiante
  Scenario: CA-1 — punto de entrada
    Given el README raíz
    When el estudiante pulsa «Empieza aquí»
    Then ve los tramos en orden, cada uno con su guía

  Scenario: CA-2 — primera corrida que publica
    Given un fork con Actions habilitado y Docker Hub configurado
    When sigue la guía del fork hasta la primera corrida
    Then la corrida publica sus imágenes (US-113)
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `docs/README.md` | Nuevo |
| `docs/fork-y-entorno-local.md` | Nuevo |
| `docs/github/README.md` | Nuevo |
| `README.md` | Enlace «Empieza aquí» |
| `docs/cloudflare/README.md`, `docs/dokploy/02-vps-y-dns.md` | Remiten al orden de `docs/README.md` |

## Definición de Done
- [ ] Salida del chequeo de enlaces pegada.
- [ ] Lint: no aplica (solo Markdown).

## Notas para el agente ejecutor
- Prosa en español neutral; la guía del fork usa el formato de las otras, con
  líneas de captura `> ![Captura — …](img/NN-nombre.png)` que el dueño llena.
- Si la US-115 se ejecuta después, repite el chequeo de enlaces allí.
