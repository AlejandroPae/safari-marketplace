# US-98 — Aprobar y rechazar solicitudes de venta flash

> El super admin aprueba una solicitud y sus productos entran en la venta;
> si la rechaza después, salen. Todo en una transacción con la tabla puente
> de la venta.

**Épico:** [Épico 95](./README.md)
**Fecha:** 2026-11-17
**Status:** Implementado (2026-11-17)
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

- [x] `just db-reset` y `migrate diff` con `EXIT=0`.
- [x] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [x] `curl` y `psql` de CA-1 a CA-3.
- [x] Recorrido del admin y del shop de CA-4.
- [x] `just build-api`, `just build-shop` y `just verify`.
- [x] Status de la US, fila del épico y status del épico.

## Resultado (2026-11-17, rama `feat/us-98-aprobar-solicitudes` sobre `main` @ `9cd1673`)

### Qué se hizo

- **DDL:** `flash_sale_request_products.added_to_sale boolean NOT NULL
  DEFAULT false` (DA-6).
- **`@safari/db`:** `approveFlashSaleRequest` y `rejectFlashSaleRequest` en
  `flash-sale-requests.repository.ts`. Cada una va en una transacción que
  bloquea la solicitud y la venta con `FOR UPDATE` (precedente
  `ownership-transfers.repository.ts`): dos aprobaciones a la vez sobre la
  misma venta no pueden dejar `sale_builder` desfasado. `sale_builder`
  conserva sus demás claves; solo se reescribe `product_ids`.
  `flash-sale.repository.ts` exporta `_saleBuilder`.
- **API:** `ApproveFlashSaleRequestedProductsController` y
  `DisapproveFlashSaleRequestedProductsController`, `ADMIN_ONLY` con
  `@Body('id')` (precedente `approve-coupon`). Las dos devuelven la
  solicitud con la proyección del detalle de US-97. Un `id` ausente o
  inválido da 404 sin tocar el driver.

### Ajuste al escenario de CA-1

El escenario pedía «una solicitud de 951 y 2 sobre la venta 3». Desde US-97
eso no es posible: 951 es de la tienda 9 y 2 de la tienda 6, y una solicitud
solo admite productos de una tienda. Se usó **951 y 950**, los dos de la
tienda 9: 951 ya está en la venta 3 y 950 no. Comprueba lo mismo (aprobar
añade solo lo que falta; rechazar retira solo eso).

### CA-1 a CA-3 — `curl` contra la API (`just api-dev`)

```
== preparación: el dueño pide 951 (ya en la venta 3) y 950 (no)
dueño: POST solicitud 951+950 sobre la venta 3            201 {"id":38,"request_status":false,"venta":[951,952]}
venta antes                                                200 {"id":3,"productos":[951,952],"sale_builder":{"data_type":"handpick_category","product_ids":[951,952]}}
  /products: 950 razero-wolverine in_flash_sale=0
== CA-3 — autorización
sin token: approve                                         401 Token de autenticación ausente o inválido.
sin token: disapprove                                      401 Token de autenticación ausente o inválido.
cliente: approve                                           403 No tienes permisos suficientes para esta operación.
cliente: disapprove                                        403 No tienes permisos suficientes para esta operación.
dueño: approve                                            403 No tienes permisos suficientes para esta operación.
dueño: disapprove                                         403 No tienes permisos suficientes para esta operación.
admin: approve id inexistente                              404 No existe un registro de `flash_sale_requests` con id 999999.
admin: disapprove id inexistente                           404 No existe un registro de `flash_sale_requests` con id 999999.
admin: approve sin id                                      404 No existe una solicitud de venta flash con id undefined.
== CA-1 — aprobar
admin: approve                                             201 {"id":38,"request_status":true,"venta":[950,951,952]}
venta después de aprobar                                  200 {"id":3,"productos":[950,951,952],"sale_builder":{"data_type":"handpick_category","product_ids":[950,951,952]}}
product-flash-sale-info?id=950                             200 [3]
  /products: 950 razero-wolverine in_flash_sale=1
admin: approve otra vez                                    409 La solicitud 38 está `approved`: no se puede aprobar.
dueño: GET detalle (request_status)                       200 {"id":38,"request_status":true,"venta":[950,951,952]}
== CA-2 — rechazar después de aprobar
admin: disapprove                                          201 {"id":38,"request_status":false,"venta":[951,952]}
venta después de rechazar                                 200 {"id":3,"productos":[951,952],"sale_builder":{"data_type":"handpick_category","product_ids":[951,952]}}
product-flash-sale-info?id=950                             200 []
  /products: 950 razero-wolverine in_flash_sale=0
  /products: 951 ninotendo-switch-joy-con-controllers in_flash_sale=1
admin: disapprove otra vez                                 409 La solicitud 38 está `rejected`: no se puede rechazar.
ID=38
```

`psql` de la misma solicitud (38) en otro ciclo aprobar → rechazar:

```
-- tras el rechazo de la corrida
solicitud | 38 | rejected
marca | 950 | f
marca | 951 | f
venta 3 | {951,952}
sale_builder | {"data_type":"handpick_category","product_ids":[951,952]}
approve: 201
-- tras aprobar
solicitud | 38 | approved
marca | 950 | t
marca | 951 | f
venta 3 | {950,951,952}
sale_builder | {"data_type":"handpick_category","product_ids":[950,951,952]}
disapprove: 201
-- tras rechazar
solicitud | 38 | rejected
marca | 950 | f
marca | 951 | f
venta 3 | {951,952}
sale_builder | {"data_type":"handpick_category","product_ids":[951,952]}
```

La aprobación marca solo 950; el rechazo retira solo 950, y 951, que ya
estaba, se queda (CA-2). En el seed no hay ningún usuario con el permiso
`staff`; el guard `ADMIN_ONLY` es el mismo para dueño y staff, y el dueño
da 403.

### CA-4 — En el admin y en el shop

- Super admin, en `/flash-sale/vendor-request`: la 38 sale como «Pending»
  (estaba `rejected`; el admin solo recibe el booleano, así que no
  distingue pendiente de rechazada, DA-5). «Approve request ?» abre «Do you
  want to approve this ? If you approve this request, then the products
  listed here will be join in the flash sale campaign.»; «Approve.» lanza
  `POST /approve-flash-sale-requested-products` → 201, y la base queda en
  `approved`.
- El listado no se refresca solo: `approve-view.tsx` invalida la caché de
  `flash-sale`, no la del listado de solicitudes. Tras recargar muestra
  «Accepted» con «Disapprove request ?». Es comportamiento del frontend y
  queda fuera de alcance.
- Shop, `/flash-sales/limited-time-offer-act-fast` (`just shop-dev`):
  enlaza `razero-wolverine` (950), `ninotendo-switch-joy-con-controllers`
  (951) y `razero-playstation-vr` (952).
- «Disapprove request ?» → «Are you sure?» → «Submit»: la base queda en
  `rejected`, la venta 3 vuelve a `{951,952}` con su `sale_builder`, y el
  shop vuelve a enlazar solo 951 y 952.

Al terminar se borró la solicitud 38 y se restauró el `updated_at` de la
venta 3 (`2023-10-16 06:53:42+00`), que aprobar y rechazar habían movido a
`now()`. La base queda como el seed: 0 solicitudes y 4 filas en
`flash_sale_products`.

### CA-5 — Sin regresión

```
just db-reset                 48 tablas, conteos idénticos antes y después (DIFF=0)
added_to_sale                 boolean | NOT NULL | default false
npx prisma migrate diff ... --exit-code   EXIT=0
just db-check                 Test Files 36 passed (36) · Tests 481 passed (481)   (antes 475: +6)
npx vitest run (desde C:\)    Test Files 37 passed (37) · Tests 646 passed (646)   (antes 637: +9)
npx tsc --noEmit              TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"   sin salida
just build-api                Done in 135.17s. EXIT=0
just build-shop               279/279 páginas, las 2 de flash-sales prerenderizadas, EXIT=0
just verify                   OK API 5503B · OK Shop cards:30 · OK Admin cards:1
```

El integration test de aprobar y rechazar escribe en la venta 3 del seed.
Guarda su estado en `beforeAll` y lo restaura en `afterAll`, y
`fileParallelism: false` (US-29) impide que otro archivo la lea a mitad.
Tras `db-check`, la venta 3 queda igual que en el seed, `updated_at`
incluido.

`build-shop` se cortó la primera vez con el `SecurityFatalError` de Next
16.4.1 y pasó al reintentar. El modal «Security Insight» del dev server
pide correr `next upgrade --agent=security`; no se corrió.
`apps/shop/public/sitemap-0.xml` se restauró tras el build.

### Fuera de alcance, mencionado

- Una aprobación solo marca lo que ella misma añadió. Si dos solicitudes
  piden el mismo producto, la que se aprueba primero lo marca y la segunda
  no: rechazar la primera lo retira aunque la segunda siga aprobada. Lo
  admite la DA-6 tal como se decidió.
- El listado del admin no se refresca tras aprobar o rechazar (ver CA-4).
