# Épico 95 — Solicitudes de vendedores para ventas flash

> El admin ya tiene las pantallas para que un dueño de tienda pida meter sus
> productos en una venta flash y para que el super admin lo apruebe. La API
> no tiene ninguna de esas rutas (404). Este épico las crea sobre las tablas
> del Épico 92, y hace que la ficha de un producto muestre sus ventas.

**Fecha:** 2026-11-17
**Status:** Listo para ejecución (DA-1..DA-7 decididas el 2026-11-17)

## Por qué este épico existe

El [Épico 92](../92-authors-flash-sale-postgres/README.md) migró las ventas
flash a Postgres y dejó fuera, por su DA-5, las rutas que el admin llama y
la API no tiene. A diferencia de los Épicos 46 y 92, **aquí no hay mock que
migrar**: ningún JSON de `src/db/pickbazar/` respalda estas rutas. Es
funcionalidad nueva, y su forma sale de los tipos y formularios del admin.
El 2026-11-17 el dueño pidió abordarlas.

## Inventario — verificado en código (2026-11-17, `main` @ `80914d0`)

Rutas que llama el admin (`apps/admin/rest/src/data/client/api-endpoints.ts:84-100`):

| Ruta | Cliente | Pantalla |
|---|---|---|
| `GET /vendor-requests-for-flash-sale` | `flash-sale-vendor-request.ts` `all`/`paginated`: `search=title:…;shop_id:…` y `shop_id` | `/flash-sale/vendor-request` (super admin) y `/[shop]/flash-sale/vendor-request` (dueño) |
| `GET /vendor-requests-for-flash-sale/:id` | `get`: `with=flash_sale;products`, `language`, `shop_id` | detalle (`single-view-vendor-request.tsx`) |
| `POST /vendor-requests-for-flash-sale` | `crudFactory.create` | `flash-sale-vendor-product-request-form.tsx` |
| `PUT /vendor-requests-for-flash-sale/:id` | `crudFactory.update` | mismo formulario |
| `DELETE /vendor-requests-for-flash-sale/:id` | `crudFactory.delete` | `flash-sale-vendor-request-delete-view.tsx` |
| `GET /requested-products-for-flash-sale` | `requestedProducts`: `vendor_request_id`, `search=name:…` | productos de una solicitud |
| `POST /approve-flash-sale-requested-products` | `approve({id})` | `approve-view.tsx`: «the products listed here will be join in the flash sale campaign» |
| `POST /disapprove-flash-sale-requested-products` | `disapprove({id})` | `disapprove-view.tsx` |
| `GET /product-flash-sale-info` | `getFlashSaleInfoByProductID`: `id`, `language`, `with=flash_sales` | `product-flash-sale-box.tsx`, en la ficha de edición del producto |

**Forma de una solicitud** (`types/index.ts:2056-2075`): `id, title,
flash_sale_id, requested_product_ids (Product[]), request_status (booleano),
note, deleted_at?, created_at, updated_at, flash_sale`. El formulario envía
`language, title` (el de la venta elegida), `flash_sale_id, note` y
`requested_product_ids` (ids). **El cuerpo no lleva `shop_id`**: los
productos ofrecidos son los de la tienda activa (`useProductsQuery({shop_id})`).

**`product-flash-sale-info` hoy nunca se llama.** `product-form.tsx:505`
solo pinta `ProductFlashSaleBox` si `initialValues.in_flash_sale`, y
`/products` emite `in_flash_sale: 0` siempre (`product-dto.mapper.ts:43`,
DA-3 del Épico 92). El cuadro recorre `Object.entries(data)` y pinta cada
valor como una venta (`title`, `start_date`, `end_date`, `type`, `rate`,
`slug`).

**`in_flash_sale` en el mock:** de los 1200 productos de `products.json`,
solo el id 2 trae `1`, y no está en ninguna venta. Las specs
`openspec/specs/product-listing-api/spec.md` y `product-write-api/spec.md`
fijan hoy `in_flash_sale` en `0`.

## Subdivisión

| US | Título | Releasable solo | Depende de | LOC est. |
|----|--------|-----------------|------------|----------|
| [US-96](./96-in-flash-sale-real.md) ✅ | `in_flash_sale` real y `product-flash-sale-info` | Sí | ninguna | ~350 |
| [US-97](./97-solicitudes-venta-flash.md) ✅ | Solicitudes de vendedores: tablas, CRUD y `requested-products` | Sí | US-96 (orden secuencial, R-1) | ~1100 |
| [US-98](./98-aprobar-solicitudes-venta-flash.md) | Aprobar y rechazar solicitudes | Sí | US-97 | ~450 |

Orden: **US-96 → US-97 → US-98**, nunca en paralelo. Las tres tocan
`records.ts`, el barrel de `packages/db` y `flash-sale.repository.ts`
(R-1); US-97 y US-98, además, `db/schema.sql` y el generador.

## Decisiones

| # | Tema | Opciones | Estado |
|---|---|---|---|
| DA-1 | Alcance | **(a)** Las 8 rutas de solicitudes + `product-flash-sale-info`. (b) Solo solicitudes. (c) Solo `product-flash-sale-info` | **(a), decidido por el dueño (2026-11-17)** |
| DA-2 | `in_flash_sale` | **(a)** Calcularlo desde `flash_sale_products` en la proyección de `/products`. (b) También en `orders` y `analytics`. (c) Seguir en `0` | **(a), decidido por el dueño (2026-11-17)**. Reabre la DA-3 del Épico 92 solo para este campo: ahora sí hay datos con los que calcularlo |
| DA-3 | Qué hacen aprobar y rechazar con la venta | **(a)** Aprobar añade los productos a `flash_sale_products`; rechazar una solicitud aprobada los retira. (b) Rechazar solo marca. (c) Ninguna toca la venta | **(a), decidido por el dueño (2026-11-17)** |
| DA-4 | Seed de solicitudes | **(a)** Tablas vacías: no hay mock del que sembrar, y sembrar inventaría datos. (b) Sembrar 1-2 solicitudes de demo | **(a), decidido por el dueño (2026-11-17)** |
| DA-5 | Estado de la solicitud | **(a)** `request_status boolean` como el tipo del admin: `false` = pendiente o rechazada, `true` = aprobada. (b) Columna de texto `pending/approved/rejected` y la API emite el booleano | **(b), decidido por el dueño (2026-11-17)**: con un booleano, «rechazada» y «pendiente» no se distinguen y rechazar dos veces no sabría si debe retirar productos |
| DA-6 | Qué retira el rechazo (DA-3 a) | **(a)** Solo los productos que añadió esa aprobación (una columna en la tabla puente de la solicitud). (b) Todos los productos de la solicitud, aunque otra vía los hubiera metido | **(a), decidido por el dueño (2026-11-17)**: (b) podría sacar de la venta un producto que el admin metió a mano |
| DA-7 | `just db-reset` | **(a)** Autorizado para US-97 y US-98. (b) Pedir permiso en cada US | **(a), decidido por el dueño (2026-11-17)**. La DA-2 del Épico 92 no se hereda |

## Visión técnica

- **Sin contrato byte a byte que preservar** para las rutas nuevas: la forma
  sale de los tipos del admin y se fija en cada US. `/products` sí tiene
  contrato: el único cambio es `in_flash_sale` (US-96), declarado como
  divergencia.
- **La tienda de una solicitud se deduce de sus productos**: todos deben
  ser de la misma tienda, y el usuario debe ser su dueño o su staff
  (precedente `products.service.ts:115-140`, US-66). El super admin ve y
  aprueba todas; el dueño y el staff solo las de sus tiendas.
- **Las escrituras sobre la venta van en transacción** con la tabla puente
  `flash_sale_products` del Épico 92, que sigue siendo la fuente de verdad
  de los productos de una venta (y reescribe `sale_builder.product_ids`).
- Se heredan del Épico 46 **D-7** (reloj de US-32, sin triggers) y **D-9**
  (patrón de `tags`), y del Épico 92 la regla de `json` frente a `jsonb`
  cuando el orden de claves es contrato. El protocolo es el del Épico 92
  (vitest, `tsc --noEmit`), sin el paso de línea base de un mock.
- `db-reset`: US-97 y US-98 tocan DDL; autorizado para las dos (DA-7).

## Riesgos

- **R-1 — Archivos compartidos.** Las 3 US editan `records.ts`, el barrel y
  `flash-sale.repository.ts`. Van en secuencia.
- **R-2 — `in_flash_sale` se propaga.** `toProductDto` es la proyección de
  `/products` y también la de los productos que embeben `categories`,
  `manufacturers`, `shops`, `tags`, `types`, `wishlists`, `questions`,
  `reviews` y `flash-sale`. Calcularlo ahí cambia todas esas respuestas en
  los 4 productos de las ventas. US-96 lo declara y lo verifica.
- **R-3 — Rendimiento de `in_flash_sale`.** Calcularlo con un `_count` o un
  `EXISTS` por producto en cada listado. Hay índice en
  `flash_sale_products(product_id)`; US-96 mide el listado de `/products`
  antes y después.
- **R-4 — Ventas vencidas.** Las 2 ventas del seed terminaron el
  2024-11-29. `in_flash_sale` no mira la vigencia (R-3 del Épico 92): un
  producto de una venta vencida sigue en `1`.

## Fuera de alcance

- Aplicar el descuento de la venta al precio de los productos.
- Filtrar ventas por vigencia.
- `in_flash_sale` en `orders` y `analytics` (DA-2).
- «Mis productos en ventas flash» (`/[shop]/flash-sale/my-products`): llama
  a `/products?flash_sale_builder=true`, y la API ignora ese parámetro.
- Notificaciones al vendedor cuando se aprueba o rechaza.
- Frontend: las pantallas ya existen.
