# US-97 — Solicitudes de vendedores: tablas, CRUD y `requested-products`

> Un dueño de tienda (o su staff) pide que unos productos suyos entren en
> una venta flash, y el super admin ve todas las solicitudes. Crea las 2
> tablas y las 6 rutas de lectura y edición. Aprobar y rechazar van en
> US-98.

**Épico:** [Épico 95](./README.md)
**Fecha:** 2026-11-17
**Status:** Listo para ejecución
**Depende de:** [US-96](./96-in-flash-sale-real.md) (orden secuencial, R-1)
**LOC est.:** ~1100

## Historia

**Como** dueño de tienda, **quiero** pedir que mis productos entren en una
venta flash del marketplace, **para** sumarme a la campaña sin depender de
que el super admin los elija a mano.

## Contexto — verificado en código (2026-11-17)

- Cliente: `apps/admin/rest/src/data/client/flash-sale-vendor-request.ts`;
  hooks: `data/flash-sale-vendor-request.ts`; pantallas:
  `pages/flash-sale/vendor-request/*` (super admin) y
  `pages/[shop]/flash-sale/vendor-request/*` (dueño); componentes:
  `components/flash-sale/vendor-request/*`.
- Formulario (`flash-sale-vendor-product-request-form.tsx:110-118`) envía
  `{language, title, flash_sale_id, note, requested_product_ids: [ids]}`; al
  editar, también `id`. `note` es obligatoria en el cliente
  (`flash-sale-vendor-request-validation-schema.ts:4`). Sin `shop_id`: los
  productos ofrecidos son los de la tienda activa.
- Listado (`flash-sale-vendor-request-list.tsx`): columnas `id`, `title`,
  `note`, `request_status` (lo pinta como booleano) y acciones.
- Detalle (`single-view-vendor-request.tsx`): `title`, `note`,
  `flash_sale` embebida; los productos los pide aparte a
  `requested-products-for-flash-sale?vendor_request_id=…`.
- No hay JSON de mock para nada de esto.
- Autorización con precedente: `products.service.ts:115-140` (dueño de la
  tienda o fila en `shop_staff`; el super admin no se consulta).

## Decisiones de la US

| # | Tema | Decisión |
|---|---|---|
| DA-4 | Seed | **(a), decidido por el dueño (2026-11-17): tablas vacías.** No hay mock del que sembrar |
| DA-5 | Estado | **(b), decidido por el dueño (2026-11-17): `status text` ∈ `pending/approved/rejected`, default `pending`**; la API emite `request_status: status === 'approved'` (el booleano que pinta el admin) |

## Tablas nuevas

| Tabla | Columnas | Restricciones |
|---|---|---|
| `flash_sale_requests` | `id bigserial`, `title text NOT NULL`, `flash_sale_id bigint NOT NULL`, `shop_id bigint NOT NULL`, `created_by bigint`, `note text NOT NULL`, `status text NOT NULL DEFAULT 'pending'`, `language text NOT NULL DEFAULT 'es'`, timestamps | FK a `flash_sales` y a `shops` `ON DELETE CASCADE`; `created_by` a `users` `ON DELETE SET NULL`; CHECK de `status`; índices en `flash_sale_id` y `shop_id` |
| `flash_sale_request_products` | `request_id bigint NOT NULL`, `product_id bigint NOT NULL` (US-98 le añade `added_to_sale`) | PK `(request_id, product_id)`; FK a las dos `ON DELETE CASCADE`; índice en `product_id` |

## Rutas

| Ruta | Guard | Comportamiento |
|---|---|---|
| `GET /vendor-requests-for-flash-sale` | `ADMIN_OWNER_AND_STAFF` | paginador (`limit` 10) en `id DESC`. `search=title:X` ILIKE. Super admin: todas, o las de `shop_id` si llega. Dueño/staff: solo las de sus tiendas; un `shop_id` ajeno da 403 |
| `GET /vendor-requests-for-flash-sale/:id` | `ADMIN_OWNER_AND_STAFF` | la solicitud con `flash_sale` (proyección de `/flash-sale/:slug`) y `requested_product_ids` (productos, proyección de `/products`); 404 si no existe o no es de una tienda del usuario |
| `POST /vendor-requests-for-flash-sale` | `ADMIN_OWNER_AND_STAFF` | crea en una transacción. La tienda se deduce de los productos: todos de la misma tienda (400 si no), y el usuario es su dueño o staff (403 si no). Venta inexistente o producto inexistente: 400. Al menos 1 producto y `note` no vacía: 400 si no |
| `PUT /vendor-requests-for-flash-sale/:id` | `ADMIN_OWNER_AND_STAFF` | solo si está `pending` (409 si no); reemplaza los productos si llegan; mismas validaciones; `updatedAt: now()` |
| `DELETE /vendor-requests-for-flash-sale/:id` | `ADMIN_OWNER_AND_STAFF` | solo si no está `approved` (409: hay que rechazarla antes, US-98); devuelve la fila borrada |
| `GET /requested-products-for-flash-sale` | `ADMIN_OWNER_AND_STAFF` | paginador de los productos de `vendor_request_id` en `id ASC`, `search=name:X` ILIKE; 404 si la solicitud no existe o no es visible para el usuario |

**Proyección de la solicitud** (orden del tipo del admin): `id, title,
flash_sale_id, shop_id, requested_product_ids, request_status, note,
language, deleted_at (null), created_at, updated_at, flash_sale`. `shop_id`
no está en el tipo del admin, pero sus pantallas filtran por él.

## Scope

**Incluye:** DDL de las 2 tablas, `db-reset`, re-introspección,
`FlashSaleRequestRecord`, `flash-sale-requests.repository.ts` con su
integration test, un módulo Nest nuevo con controladores y servicio, su
spec, y la documentación.

**NO incluye:** aprobar y rechazar (US-98); notificaciones; filtrar ventas
vencidas al elegir venta en el formulario; frontend.

## Criterios de aceptación

### CA-1 — Esquema

Las 2 tablas en `db/schema.sql`; `just db-reset` en verde, 0 filas en las
dos, conteos previos intactos; `prisma validate` y `migrate diff` con
`EXIT=0`.

### CA-2 — Autorización

Con los 3 usuarios del seed (super admin, dueño de las tiendas, cliente):

- cliente: 403 en las 6 rutas; sin token: 401;
- dueño: crea una solicitud de productos de su tienda (201) y la ve; no ve
  ni edita la de otra tienda (404);
- productos de 2 tiendas distintas en un `POST`: 400;
- super admin: ve todas.

### CA-3 — Escrituras

- `POST` con un producto inexistente: 400 **sin** dejar filas (`psql`).
- `PUT` que reemplaza los productos, verificado por `psql`.
- `DELETE` en cascada a `flash_sale_request_products`.

### CA-4 — En el admin

Con `just admin-dev`: el dueño crea una solicitud desde
`/[shop]/flash-sale/vendor-request/create`, la ve en el listado y en el
detalle con sus productos; el super admin la ve en `/flash-sale/vendor-request`.

### CA-5 — Sin regresión

`just db-check`, `npx vitest run` (desde `C:\`), `npx tsc --noEmit`,
eslint, `just build-api`, `just build-shop` y `just verify` en verde.

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `db/schema.sql`, `db/README.md` | 2 tablas |
| `db/generate-seed.mjs` | `setval` de la secuencia nueva (sin filas, DA-4) |
| `packages/db/prisma/schema.prisma` | 2 modelos + relaciones inversas |
| `packages/db/src/records.ts` | `FlashSaleRequestRecord` |
| `packages/db/src/repositories/flash-sale-requests.repository.ts` (+ test) | listar, obtener, productos, crear, actualizar, borrar |
| `packages/db/index.ts`, `packages/db/README.md` | exports y documentación |
| `apps/api/rest/src/flash-sale-requests/*` (+ `app.module.ts`) | módulo nuevo, con spec |

## Definición de Done

- [ ] `just db-reset`, `psql` con conteos y `migrate diff` con `EXIT=0`.
- [ ] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [ ] `curl` y `psql` de CA-2 y CA-3.
- [ ] Recorrido del admin de CA-4.
- [ ] `just build-api`, `just build-shop` y `just verify`.
- [ ] Status de la US y fila del épico.
