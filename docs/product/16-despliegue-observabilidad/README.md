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
| [US-18](./18-terraform-minimo.md) | Terraform mínimo para el stack contenedorizado | Sí | US-15, US-17 | ~300 |

**Orden sugerido:** US-17 (barata, desbloquea healthchecks honestos) →
US-105 → US-106 → US-107 → US-18 (requiere el stack dockerizado del Épico 13).

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
