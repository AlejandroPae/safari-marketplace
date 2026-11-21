# US-113 — El CI publica las imágenes en un fork configurado

> Un fork con Docker Hub configurado publica sus propias imágenes; uno sin
> configurar construye, no publica y queda en verde con un aviso.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-21
**Status:** Listo para ejecución (promovida desde `_backlog/`, refinada con fable)
**Depende de:** US-110
**LOC est.:** ~40 en `ci.yml` + ~30 de documentación

## Historia
**Como** estudiante que hizo fork del repositorio, **quiero** que el CI de mi
fork publique las imágenes en mi cuenta de Docker Hub, **para** desplegar en
Dokploy las imágenes de mi fork, como pide la guía `docs/dokploy/`.

## Contexto
- El job `images` pone `SUBIR=false` en cualquier fork
  (`.github/workflows/ci.yml:150-151` y `:163-166`). Lo decidió la US-110
  (D-6) para que un fork no fallara sin las credenciales del dueño.
- Las guías ya piden lo contrario:
  - `docs/dokploy/01-antes-de-empezar.md:11-17` exige una corrida del fork que
    haya publicado las cinco imágenes;
  - `docs/github/secretos-github-actions.md:258` dice que en un fork basta con
    crear los secretos.
- Con el CI actual, el `IMAGE_TAG` del estudiante no existe en su Docker Hub y
  Dokploy falla con `pull access denied` (el repositorio no existe) o
  `manifest unknown`.

**Decisión del dueño (2026-11-20):** en un fork, publicar solo si existe la
variable `DOCKERHUB_USERNAME`; si no existe, construir sin publicar y avisar.

## Refinamiento — Decisiones tomadas
| # | Decisión |
|---|---|
| D-1 | En un fork: `SUBIR=true` si la corrida publicaría (push o `workflow_dispatch` sobre `main`) **y** `DOCKERHUB_USERNAME` está definida. Si falta, `SUBIR=false` con un aviso. |
| D-2 | El repositorio original no cambia: sin la variable o el secreto, sigue fallando con su mensaje (`ci.yml:182`). |
| D-3 | El nombre del job dice lo que hace en cada caso: «solo build» en PR y en un fork sin configurar, «build y publicación» cuando publica. Se calcula con `github.event.repository.fork` y `vars.DOCKERHUB_USERNAME`. |
| D-4 | La primera publicación de un estudiante que configura Docker Hub después del primer push se lanza con `workflow_dispatch` sobre `main` (documentado). |
| D-5 | El fork de prueba lo aporta el dueño con una **segunda cuenta de GitHub** (GitHub no permite hacer fork de un repositorio propio en la misma cuenta). |

## Scope
**Incluye:**
- La lógica de `SUBIR` del paso «Etiqueta y destino» (D-1, D-2).
- El nombre del job (D-3).
- Un solo texto de resumen por caso. Hoy un fork escribe a la vez el aviso
  y «Construidas sin publicar (evento push, rama main)» (`ci.yml:295`).
- Los comentarios que quedan falsos: `ci.yml:150` y `:155-156`.
- Documentación:
  - `docs/github/secretos-github-actions.md`: la fila «En un fork el CI no
    publica» y el relanzamiento con `workflow_dispatch` (D-4);
  - `apps/README.md`, sección de imágenes en Docker Hub: el comportamiento
    en forks y **cinco** imágenes (hoy lista tres, `apps/README.md:609-617`);
  - `docs/dokploy/01-antes-de-empezar.md:11-17`, si cambia el nombre del
    job que cita.

**NO incluye:**
- El job de despliegue continuo (US-112). Se deja anotado que, en un fork sin
  configurar, `images` queda verde sin publicar: US-112 debe tenerlo en
  cuenta.
- La etiqueta `sha-<7>`, el cache y los pasos de build. El cache solo se
  escribe al publicar, así que un fork sin configurar construye sin cache:
  se documenta y se mide en CA-3, no se cambia.
- La vigencia del token (US-114) y la guía del fork (US-116).
- Publicar en pull requests.

## Criterios de aceptación
### CA-1 — Repositorio original sin cambios
Un push a `main` del original publica las cinco imágenes con `sha-<7>`.

### CA-2 — Fork configurado publica
En un fork con `DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN`, un push a `main`
publica las cinco imágenes en `<DOCKERHUB_USERNAME>/safari-*:sha-<7>`, y el
job se llama «build y publicación».

### CA-3 — Fork sin configurar no falla
En un fork sin `DOCKERHUB_USERNAME`, la corrida construye, no publica, queda
en verde, el job se llama «solo build» y el resumen nombra la variable y la
guía en un solo texto. Se anota la duración del job (sin cache).

### CA-4 — Fork con variable y sin secreto falla con mensaje
En un fork con `DOCKERHUB_USERNAME` y sin `DOCKERHUB_TOKEN`, el paso
«Credenciales de Docker Hub» falla nombrando el secreto.

### CA-5 — Relanzar tras configurar
Un fork que corrió sin configurar, configura variable y secreto y lanza
`workflow_dispatch` sobre `main`: publica las cinco imágenes.

### CA-6 — Pull requests nunca publican
Un PR (desde el mismo repositorio o desde un fork) construye sin publicar.

## Escenarios Gherkin
```gherkin
Feature: Publicación de imágenes en forks
  Scenario: CA-1 — repositorio original
    Given el repositorio original con su variable y su secreto
    When se hace push a main
    Then se publican las cinco imágenes con sha-<7>

  Scenario: CA-2 — fork configurado
    Given un fork con DOCKERHUB_USERNAME y DOCKERHUB_TOKEN
    When se hace push a main
    Then las cinco imágenes se publican en la cuenta del fork

  Scenario: CA-3 — fork sin configurar
    Given un fork sin DOCKERHUB_USERNAME
    When se hace push a main
    Then las imágenes se construyen, no se publican y la corrida queda en verde
    And el resumen nombra la variable que falta y la guía

  Scenario: CA-4 — fork con variable y sin secreto
    Given un fork con DOCKERHUB_USERNAME y sin DOCKERHUB_TOKEN
    When se hace push a main
    Then el paso de credenciales falla nombrando DOCKERHUB_TOKEN

  Scenario: CA-5 — relanzar tras configurar
    Given un fork que ya corrió sin configurar
    When configura la variable y el secreto y lanza workflow_dispatch sobre main
    Then se publican las cinco imágenes

  Scenario: CA-6 — pull request
    When se abre un pull request
    Then las imágenes se construyen y no se publican
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `.github/workflows/ci.yml` | `SUBIR`, nombre del job, resumen, comentarios |
| `docs/github/secretos-github-actions.md` | Fila del fork y relanzamiento |
| `apps/README.md` | Forks y cinco imágenes |
| `docs/dokploy/01-antes-de-empezar.md` | Solo si cambia el nombre del job citado |

## Definición de Done
- [ ] CA-1 con una corrida real de `main` del original (enlace y digests).
- [ ] CA-2 a CA-5 con corridas reales en el fork de la segunda cuenta
      (enlaces y resúmenes pegados). El dueño crea el fork, la variable y el
      secreto; el agente no crea ni lee secretos.
- [ ] CA-6 con un PR de prueba.
- [ ] Variable y secreto llegan por `env:`, nunca con `${{ }}` dentro de `run:`.
- [ ] Lint: no aplica (solo YAML y Markdown); YAML validado.

## Notas para el agente ejecutor
- Los secretos no se pueden usar en `if:`: se comprueban en shell vía `env:`,
  como ya hace «Credenciales de Docker Hub».
- `vars` sí se puede usar en expresiones (nombre del job y `env:`).
- «Sync fork» genera un push a `main`: cada sincronización publica cinco
  imágenes en la cuenta del estudiante. Es esperado; se menciona en la guía.
- Pedir confirmación antes de cualquier push: dispara publicaciones reales.
