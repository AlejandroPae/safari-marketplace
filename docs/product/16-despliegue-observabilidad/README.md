# Épico 16 — Despliegue y observabilidad

> El README raíz promete "despliegue automatizado con Terraform, Docker y
> Orm" — verificado 2026-08-25: **no existe un solo archivo `.tf` en el
> repo**, ni carpeta de infra, ni CD. Este épico convierte esa promesa en
> hechos mínimos: primero que los servicios sean observables (salud/logs),
> después la infra como código.

**Fecha:** 2026-08-25
**Status:** Refinado

## Contexto verificado (2026-08-25)

- `find . -name "*.tf"` → vacío. La única pieza de "despliegue" es
  `apps/deployment/` (scripts zx de Pickbazar para VM+Nginx, declarados como
  referencia en `apps/README.md`, no como camino).
- La API no expone ningún endpoint de salud propio (los healthchecks que US-15
  agregue en compose necesitan uno honesto; hoy lo más cercano es pegarle a
  `/api/settings`, que ya depende de Postgres).
- Logs actuales: consola de Nest/Next sin estructura ni timestamps
  configurados explícitamente.
- `apps/README.md` § "Notas para el despliegue en nube" ya documenta las
  restricciones reales: servicios stateless, `PORT` por entorno,
  `NEXT_PUBLIC_*` en build time, allowlist de `images.domains`,
  `APPLICATION_MODE=production` ignora errores de TS/ESLint.

## Subdivisión en sub-historias

| US | Título | Releasable solo | Depende de | LOC est. |
|----|--------|-----------------|------------|----------|
| [US-17](./17-salud-logging-api.md) ✅ | Endpoint de salud y logging con timestamps en la API | Sí | ninguna | ~150 |
| [US-105](./105-imagenes-frontend-livianas.md) ✅ | Imágenes livianas de la tienda y el admin, y versiones fijas | Sí | ninguna | ~150 |
| [US-106](./106-imagen-api-liviana.md) ✅ | Imagen liviana de la API: una sola copia de Prisma, sin el CLI | Sí | US-105 | ~60 |
| [US-107](./107-api-escalable-detras-del-proxy.md) ✅ | API escalable detrás de un balanceador, con balanceo real | Sí | US-105, US-106 | ~150 |
| [US-108](./108-sitemap-dinamico-en-ejecucion.md) ✅ | Sitemap y robots.txt generados en ejecución, con el dominio real | Sí | US-104, US-107 | ~150 |
| [US-110](./110-imagenes-en-docker-hub.md) ✅ | Construir y publicar las imágenes en Docker Hub desde el CI | Sí | US-109 | ~120 |
| [US-111](./111-despliegue-en-dokploy.md) | Desplegar Safari en un VPS con Dokploy, con subdominios | Sí | US-110 | ~150 + guía |
| [US-112](./112-despliegue-continuo-desde-ci.md) | Despliegue continuo a Dokploy desde el CI, con vuelta atrás | Sí | US-110, US-111 | ~100 |
| [US-113](./113-ci-publica-en-forks.md) ✅ | El CI publica las imágenes en un fork configurado | Sí | US-110 | ~70 |
| [US-114](./114-correcciones-guias-despliegue.md) | Correcciones de las guías de despliegue y un solo juego de ejemplos | Sí | US-111 | ~150 |
| [US-116](./116-punto-de-entrada-del-estudiante.md) | El punto de entrada del estudiante en `docs/` y la guía del fork | Sí | US-113, US-114 | ~200 |
| [US-18](./18-terraform-minimo.md) | Terraform mínimo para el stack contenedorizado (en pausa, ver Actualización 2026-11-20) | Sí | US-15, US-17 | ~300 |

**Orden sugerido:** US-17 (barata, desbloquea healthchecks honestos) →
US-105 → US-106 → US-107 → US-108 → US-109 (Épico 9) → US-110 → US-111 →
US-113 → US-114 → US-116 → US-112. US-18, en pausa. US-113 puede ir antes
del cierre de US-111 (no comparte archivos con su guía salvo
`docs/dokploy/01`).

## Refinamiento — Decisiones tomadas

| # | Tema | Decisión |
|---|------|----------|
| 1 | Observabilidad antes que infra | No se aprovisiona nada que no se pueda saber si está vivo. US-17 precede a US-18. |
| 2 | Alcance didáctico | La infra es para enseñar: mínima, legible y destruible (`terraform destroy` sin residuos), no un setup productivo blindado. |
| 3 | Proveedor | **Decisión abierta del dueño** (Azure/AWS/GCP y qué servicio de contenedores). US-18 no arranca sin ella — está marcado como bloqueante en la US. |

## Visión técnica compartida

### Decisiones de Diseño (D-N)
- **D-1:** El health de la API distingue "proceso vivo" (liveness) de "base
  alcanzable" (readiness): un healthcheck que miente es peor que ninguno.
- **D-2:** Terraform aprovisiona; las imágenes las construye el flujo del
  Épico 13/CI. No mezclar build de imágenes dentro de Terraform.

### Riesgos (R-N)
- **R-1:** Costos de nube en un repo didáctico: todo recurso lleva el tamaño
  mínimo y la US exige el `destroy` verificado como parte del DoD.
- **R-2:** Secretos (DATABASE_URL de nube): jamás versionados; el patrón de
  inyección se documenta en la US.

## Notas globales para los agentes

- El README raíz (2 líneas) menciona Terraform: cuando US-18 cierre, alinear
  esa mención con lo que de verdad existe; mientras tanto NO agregar promesas
  nuevas a ningún doc.

## Actualización 2026-11-19: US-105 y US-106

> Sección añadida sin reescribir lo anterior.

- **US-105 y US-106** salen de `_backlog/105-imagenes-docker-livianas.md`,
  que el dueño partió en dos tras una revisión del sub-agente fable 5. Las
  dos quedan en «Listo para ejecución» y van en serie: comparten
  `apps/api/rest/Dockerfile` y `apps/README.md`.
- **Por qué aquí:** las imágenes del Épico 13 (cerrado el 2026-11-19)
  funcionan, pero pesan entre 1.5 y 2 GB. Los estudiantes las suben a Docker
  Hub y las despliegan en Dokploy, y ese peso es el primer obstáculo del
  despliegue. Encaja con la D-2 de este épico: las imágenes vienen del
  Épico 13, y aquí se preparan para desplegarse.
- **No dependen de la decisión abierta del proveedor (decisión 3).** US-18
  sigue bloqueada por ella; US-105 y US-106 no.

## Actualización 2026-11-19: US-107

> Sección añadida sin reescribir lo anterior.

- **US-107** (API escalable detrás de un balanceador) sale de
  `_backlog/107-api-escalable-detras-del-proxy.md` tras una revisión del
  sub-agente fable 5. Queda en «Listo para ejecución».
- **Por qué aquí:** es el siguiente paso del stack contenedorizado hacia el
  despliegue: varias réplicas de la API detrás de un balanceador (`api-lb`),
  para el laboratorio de Sistemas Distribuidos. Como US-105 y US-106, no
  depende de la decisión abierta del proveedor (decisión 3).

## Actualización 2026-11-19: US-108

> Sección añadida sin reescribir lo anterior.

- **US-108** (sitemap y `robots.txt` generados en ejecución) sale de
  `_backlog/108-sitemap-dinamico-en-ejecucion.md` tras una revisión del
  sub-agente fable 5, que corrigió varias afirmaciones (autores, fabricantes
  y ventas flash ya no son mocks; nadie valida `NEXTAUTH_URL`; el `limit`
  efectivo es 30). Queda en «Listo para ejecución».
- **Por qué aquí:** la imagen de la tienda sirve hoy un sitemap con
  `localhost:3000`, sin productos y con páginas privadas. Para que cada grupo
  despliegue la misma imagen con su dominio, el sitemap sale de
  `NEXTAUTH_URL` en ejecución. Como US-105 a US-107, no depende de la
  decisión abierta del proveedor (decisión 3).

## Actualización 2026-11-20: US-110, US-111 y US-112

> Sección añadida sin reescribir lo anterior.

- **De dónde salen:** `_backlog/110-imagenes-en-docker-hub.md` y
  `_backlog/111-despliegue-en-dokploy.md`, tras una revisión del sub-agente
  fable 5. El dueño partió el segundo en US-111 (compose de despliegue, guía
  y primer despliegue manual) y US-112 (job `deploy` del CI y vuelta atrás).
  Las tres quedan en «Listo para ejecución», en serie, después de US-109
  (Épico 9).
- **La decisión 3 (proveedor) queda respondida de hecho:** un VPS con
  Dokploy, con las imágenes en Docker Hub. **US-18 (Terraform) queda en
  pausa**, sin bloquear nada; si se retoma, se reorienta a lo que haga falta
  aprovisionar.
- **Topología de producción:** la misma que en local (`proxy` + `api-lb`,
  US-107) detrás de Traefik. US-111 reescribe «Dominios en Dokploy» de
  `apps/README.md`, que describía otra.
- **Riesgos que la revisión sacó a la luz y quedan en las US:**
  - el seed reaplicado en cada despliegue (US-111 D-4: solo sobre la base
    vacía);
  - las contraseñas demo con el admin público (US-111 D-8);
  - la falta de migraciones de esquema;
  - un despliegue que parece verde sin haber cambiado de versión (US-112 D-3:
    `revision` en `/api/health`).

## Actualización 2026-11-21: US-113, US-114 y US-116

> Sección añadida sin reescribir lo anterior.

- **De dónde salen:** una revisión de `docs/` pensada en el recorrido del
  estudiante (sub-agente fable 5, 2026-11-20). Los borradores
  `_backlog/113-ci-publica-en-forks.md` y
  `_backlog/114-recorrido-del-estudiante-docs.md` se refinaron con fable;
  el dueño partió el segundo en US-114 (correcciones de las guías) y US-116
  (punto de entrada y guía del fork).
- **US-113 modifica una decisión de US-110 (D-6):** en un fork, el CI
  publica si existe la variable `DOCKERHUB_USERNAME`; si no, construye sin
  publicar y avisa. El repositorio original no cambia. Se prueba con un fork
  en una segunda cuenta de GitHub del dueño.
- **US-112 debe tener en cuenta** que en un fork sin configurar el job
  `images` queda verde sin haber publicado.
- **Orden:** US-113 → (cierre de US-111) → US-114 → US-116 → US-112. US-114
  y US-116 comparten `docs/dokploy/` con US-111: ninguna en paralelo con
  ella.
- **Archivo de `docs/product/`:** va en US-115 (standalone), después de
  cerrar US-111. Este épico queda en la raíz mientras tenga US abiertas.
