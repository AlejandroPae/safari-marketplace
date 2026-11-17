# US-98 — Aprobar y rechazar solicitudes de venta flash

> El super admin aprueba una solicitud y sus productos entran en la venta;
> si la rechaza después, salen. Todo en una transacción con la tabla puente
> de la venta.

**Épico:** [Épico 95](./README.md)
**Fecha:** 2026-11-17
**Status:** Listo para ejecución
**Depende de:** [US-97](./97-solicitudes-venta-flash.md)
**LOC est.:** ~450

## Historia

**Como** super admin, **quiero** aprobar o rechazar las solicitudes de los
vendedores, **para** que sus productos entren en la campaña sin tener que
editar la venta a mano.

## Contexto — verificado en código (2026-11-17)

- `approve-view.tsx` y `disapprove-view.tsx` llaman a
  `POST /approve-flash-sale-requested-products` y
  `POST /disapprove-flash-sale-requested-products` con `{ id }` y luego
  invalidan la caché de `flash-sale`.
- El texto de `approve-view.tsx:33-34`: «If you approve this request, then
  the products listed here will be join in the flash sale campaign».
- `flash_sale_products` (US-94) es la fuente de verdad de los productos de
  una venta; `sale_builder.product_ids` se reescribe con ella.

## Decisión de la US

| # | Tema | Decisión |
|---|---|---|
| DA-6 | Qué retira el rechazo | **(a), decidido por el dueño (2026-11-17):** solo los productos que añadió esa aprobación. Se guarda en `flash_sale_request_products.added_to_sale boolean`; un producto que ya estaba en la venta al aprobar no se marca y no se retira |

## Rutas

| Ruta | Guard | Comportamiento |
|---|---|---|
| `POST /approve-flash-sale-requested-products` | `super_admin` | `pending` o `rejected` → `approved`. En una transacción: inserta los productos en `flash_sale_products` sin duplicar, marca los que añadió (DA-6), reescribe `sale_builder.product_ids` y fija `updatedAt`. Ya aprobada: 409. Inexistente: 404 |
| `POST /disapprove-flash-sale-requested-products` | `super_admin` | `pending` o `approved` → `rejected`. Si estaba aprobada, en la misma transacción retira de la venta los productos marcados y reescribe `sale_builder`. Ya rechazada: 409. Inexistente: 404 |

Las dos devuelven la solicitud con la proyección de US-97.

## Scope

**Incluye:** las 2 funciones del repositorio con su integration test, la
columna de DA-6 (DDL + `db-reset`), las 2 rutas, su spec y la
documentación.

**NO incluye:** notificar al vendedor; aprobar una parte de los productos;
frontend.

## Criterios de aceptación

### CA-1 — Aprobar

Una solicitud de 951 y 2 sobre la venta 3 (que ya tiene 951 y 952):
aprobar deja la venta con 2, 951 y 952; `sale_builder.product_ids` y
`/flash-sale/limited-time-offer-act-fast` lo reflejan; 2 pasa a
`in_flash_sale: 1` (US-96). Verificado con `curl` y `psql`.

### CA-2 — Rechazar después de aprobar

Rechazar esa solicitud retira 2, pero **no** 951, que ya estaba antes.

### CA-3 — Autorización y estados

Dueño y staff: 403 en las 2 rutas; sin token: 401. Aprobar dos veces o
rechazar dos veces: 409. Id inexistente: 404.

### CA-4 — En el admin

El super admin aprueba desde el detalle de la solicitud, y el listado
muestra el estado nuevo. El detalle de la venta en el shop muestra el
producto añadido.

### CA-5 — Sin regresión

`just db-check`, `npx vitest run` (desde `C:\`), `npx tsc --noEmit`,
eslint, `just build-api`, `just build-shop` y `just verify` en verde.

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `db/schema.sql`, `db/README.md` | columna `added_to_sale` |
| `packages/db/prisma/schema.prisma` | el campo |
| `packages/db/src/repositories/flash-sale-requests.repository.ts` (+ test) | `approveFlashSaleRequest`, `rejectFlashSaleRequest` |
| `packages/db/index.ts`, `packages/db/README.md` | exports y documentación |
| `apps/api/rest/src/flash-sale-requests/*` | 2 rutas, con spec |

## Definición de Done

- [ ] `just db-reset` y `migrate diff` con `EXIT=0`.
- [ ] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [ ] `curl` y `psql` de CA-1 a CA-3.
- [ ] Recorrido del admin y del shop de CA-4.
- [ ] `just build-api`, `just build-shop` y `just verify`.
- [ ] Status de la US, fila del épico y status del épico.
