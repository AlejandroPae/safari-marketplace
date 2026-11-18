# US-97 — Solicitudes de vendedores: tablas, CRUD y `requested-products`

> Un dueño de tienda (o su staff) pide que unos productos suyos entren en
> una venta flash, y el super admin ve todas las solicitudes. Crea las 2
> tablas y las 6 rutas de lectura y edición. Aprobar y rechazar van en
> US-98.

**Épico:** [Épico 95](./README.md)
**Fecha:** 2026-11-17
**Status:** Implementado (2026-11-17)
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

- [x] `just db-reset`, `psql` con conteos y `migrate diff` con `EXIT=0`.
- [x] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [x] `curl` y `psql` de CA-2 y CA-3.
- [x] Recorrido del admin de CA-4.
- [x] `just build-api`, `just build-shop` y `just verify`.
- [x] Status de la US y fila del épico.

## Resultado (2026-11-17, rama `feat/us-97-solicitudes-venta-flash` sobre `main` @ `b6a2024`)

### Qué se hizo

- **DDL:** `flash_sale_requests` y `flash_sale_request_products` en
  `db/schema.sql`, con el CHECK de `status`, las FKs de la tabla de arriba
  y 3 índices. El generador solo añade el `setval` (DA-4).
- **Prisma:** modelos `FlashSaleRequest` y `FlashSaleRequestProduct`, y sus
  relaciones inversas en `FlashSale`, `Shop`, `User` y `Product`.
- **`@safari/db`:** `FlashSaleRequestRecord`,
  `flash-sale-requests.repository.ts` (6 funciones y
  `resolveFlashSaleRequestShop`) y dos errores locales:
  `InvalidFlashSaleRequestError` (código del 400) y
  `FlashSaleRequestStateError` (código del 409, precedente
  `SameOwnerError`). `flash-sale.repository.ts` exporta `FLASH_SALE_INCLUDE`
  y `_toHydratedFlashSale` (antes `_toRecord`, privado) para hidratar la
  venta embebida.
- **API:** módulo `flash-sale-requests` con 2 controladores (las 6 rutas,
  todas `ADMIN_OWNER_AND_STAFF`) y su servicio. `flash-sale.service.ts`
  exporta `toFlashSaleDto` para la venta embebida.

### Decisiones tomadas al implementar

| # | Tema | Decisión |
|---|---|---|
| DA-8 | `products` en el detalle | **Decidido por el dueño (2026-11-17): el detalle añade `products`**, el mismo array que `requested_product_ids`. El formulario de edición precarga `initialValues.products` (`flash-sale-vendor-product-request-form.tsx:96`), y sin esa clave abría con los productos vacíos. El listado no la lleva |
| — | Tienda al editar | La tienda de una solicitud no cambia: un `PUT` con productos de otra tienda da 400. Así una solicitud no se mueve de tienda por una edición |
| — | Listado del dueño sin `shop_id` | Ve las solicitudes de todas sus tiendas. La pantalla `/[shop]/flash-sale/vendor-request` no envía `shop_id` (`index.tsx:47-55`) |

### CA-1 — Esquema

Conteo de filas de las 46 tablas antes (`main`, tras `just db-up`) y
después de `just db-reset` con el esquema nuevo:

```
$ diff us97-counts-before.txt us97-counts-after.txt
12a13,14
> flash_sale_request_products 0
> flash_sale_requests 0
```

Las 46 tablas previas conservan su conteo; las 2 nuevas nacen con 0 filas.

```
$ npx prisma validate
The schema at prisma\schema.prisma is valid 🚀
$ npx prisma migrate diff --from-config-datasource --to-schema ./prisma/schema.prisma --exit-code
No difference detected.
EXIT=0
```

`prisma format` realineó también `Category` y `Conversation`, que no se
tocan aquí; esos dos bloques se revirtieron para que el diff solo lleve
esta US.

### CA-2 y CA-3 — `curl` contra la API (`just api-dev`)

Para «la de otra tienda» hace falta una tienda que no sea del usuario 1, y
en el seed el usuario 1 es dueño de las 12. Se creó con `psql` una tienda
centinela `zz-us97-ajena` (id 37, dueño el super admin, usuario 3) con un
producto (1277), y se borró al terminar.

```
== CA-2 — sin token y cliente
sin token: GET listado                                     401 Token de autenticación ausente o inválido.
cliente: GET listado                                       403 No tienes permisos suficientes para esta operación.
cliente: GET detalle                                       403 No tienes permisos suficientes para esta operación.
cliente: POST                                              403 No tienes permisos suficientes para esta operación.
cliente: PUT                                               403 No tienes permisos suficientes para esta operación.
cliente: DELETE                                            403 No tienes permisos suficientes para esta operación.
cliente: GET requested-products                            403 No tienes permisos suficientes para esta operación.
== CA-2 — dueño
dueño: POST productos 2 y 1 (tienda 6)                    201 {"id":30,"shop_id":6,"request_status":false,"products":[1,2]}
dueño: GET su detalle                                     200 {"id":30,"shop_id":6,"request_status":false,"products":[1,2]}
dueño: GET listado                                        200 total=1 [{"id":30,"shop_id":6,"request_status":false,"products":[1,2]}]
dueño: requested-products search=name:spin                200 total=1 [2]
dueño: POST productos de 2 tiendas (1 y 950)              400 Los productos de una solicitud deben ser de una sola tienda; llegaron de 2 (6, 9).
dueño: POST producto de tienda ajena (1277)               403 No tienes permisos sobre la tienda 37.
== CA-2 — super admin
admin: POST producto de su tienda (1277)                   201 {"id":31,"shop_id":37,"request_status":false,"products":[1277]}
dueño: GET detalle de la ajena                            404 No existe una solicitud de venta flash con id 31.
dueño: PUT la ajena                                       404 No existe una solicitud de venta flash con id 31.
dueño: DELETE la ajena                                    404 No existe una solicitud de venta flash con id 31.
dueño: requested-products de la ajena                     404 No existe una solicitud de venta flash con id 31.
dueño: GET listado con shop_id=37 (ajena)                 403 No tienes permisos sobre la tienda 37.
admin: GET listado (ve todas)                              200 total=2 [{"id":31,"shop_id":37,"request_status":false,"products":[1277]},{"id":30,"shop_id":6,"request_status":false,"products":[1,2]}]
== CA-3 — escrituras
dueño: POST con producto inexistente                      400 `flash_sale_requests.requested_product_ids` referencia un registro inexistente (`999999`).
dueño: POST con venta inexistente                         400 `flash_sale_requests.flash_sale_id` referencia un registro inexistente (`999999`).
dueño: POST sin productos                                 400 Una solicitud de venta flash necesita al menos 1 producto.
dueño: POST con nota vacía                               400 La nota de la solicitud no puede estar vacía.
dueño: PUT reemplaza productos por 3                      200 {"id":30,"shop_id":6,"request_status":false,"products":[3]}
dueño: PUT con producto de otra tienda (950)              400 Los productos deben ser de la tienda de la solicitud (6); llegaron de la 9.
OWN_ID=30 FOREIGN_ID=31
```

`psql` tras los `POST` fallidos y el `PUT`. Solo quedan las 2 solicitudes
creadas, y la 30 tiene ya el producto 3:

```
30 | 6 | pending | Nota nueva | 1
31 | 37 | pending | n | 3
30 | 3
31 | 1277
-- DELETE /vendor-requests-for-flash-sale/30 (dueño): 200
0      <- filas de flash_sale_requests con id 30
0      <- filas de flash_sale_request_products de la 30 (cascada)
```

Estados (409), con la 31 marcada `approved` por `psql`, como super admin:

```
GET     HTTP 200 request_status=true
PUT     HTTP 409 La solicitud 31 está `approved`: no se puede editar (solo las pendientes).
DELETE  HTTP 409 La solicitud 31 está `approved`: no se puede borrar (recházala antes).
```

### CA-4 — En el admin (`just admin-dev`)

- Dueño (`store_owner@demo.com`), en
  `/grocery-shop/flash-sale/vendor-request/create`: elige «Limited time
  discounts.», Baby Spinach y Apples, y escribe la nota. «Create Request»
  responde «Successfully created!» y lleva al listado, que muestra
  `#ID: 32 · Limited time discounts. · Solicitud desde el admin (CA-4) ·
  Pending`. La 31, de la tienda ajena, no aparece.
- Detalle `/grocery-shop/flash-sale/vendor-request/32`: la venta (Active
  Date 16 Oct 2023, Expire Date 29 Nov 2024, Fixed Rate, 10), la nota y
  «Requested products.» con Apples y Baby Spinach.
- Edición `/grocery-shop/flash-sale/vendor-request/32/edit`: precarga la
  venta, los 2 productos y la nota (DA-8).
- Super admin, en `/flash-sale/vendor-request`: ve la 32 (`Pending`, con
  «Approve request ?») y la 31 (`Accepted`, con «Disapprove request ?»).
  Esos botones llaman a las rutas de US-98 y no se pulsaron.

Al terminar se borraron las solicitudes y la tienda centinela. Las 2
tablas quedan vacías (DA-4), con 12 tiendas y 1200 productos.

### CA-5 — Sin regresión

```
just db-check                 Test Files 35 passed (35) · Tests 475 passed (475)   (antes 452: +23)
npx vitest run (desde C:\)    Test Files 37 passed (37) · Tests 637 passed (637)   (antes 604: +33)
npx tsc --noEmit              TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"   sin salida
just build-api                Done in 137.59s. EXIT=0
just build-shop               279/279 páginas, las 2 de flash-sales prerenderizadas, EXIT=0
just verify                   OK API 5503B · OK Shop cards:30 · OK Admin cards:1
```

`build-shop` y `shop-dev` se cortaron la primera vez con el
`SecurityFatalError` de Next 16.4.1 y pasaron al reintentar; no se corrió
`next upgrade`. `apps/shop/public/sitemap-0.xml` se restauró tras el build.

### Fuera de alcance, mencionado

- **El admin cierra la sesión del dueño en su dashboard.** Al entrar con
  `store_owner@demo.com`, `/` llama a `/analytics`,
  `/category-wise-product` y `/top-rate-product`, que son `ADMIN_ONLY` y
  dan 403. El cliente HTTP del admin desloguea ante un 403
  (`http-client.ts:39`). Para CA-4 se puso la cookie `AUTH_CRED` a mano y
  se entró directo a las rutas de la tienda. No es de esta US.
- Los docs de US-96 dejaron dos cosas mal, que se corrigen en el commit de
  docs de esta US: `db/README.md` seguía diciendo que `products` emite
  `in_flash_sale: 0`, y el párrafo de `inFlashSale` de
  `packages/db/README.md` había quedado en medio de la lista de funciones.
