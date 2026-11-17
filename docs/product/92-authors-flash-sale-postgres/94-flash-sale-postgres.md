# US-94 — `flash-sale` y `products-by-flash-sale` desde Postgres

> Las 6 rutas de ventas flash dejan de servir JSON: una tabla `flash_sales`
> con las 2 ventas del mock y una tabla puente `flash_sale_products` hacia
> `products`. Las escrituras persisten, y los productos de una venta salen
> de la base.

**Épico:** [Épico 92](./README.md)
**Fecha:** 2026-11-17
**Status:** Implementada (2026-11-17, rama `us-94-flash-sale`)
**Depende de:** [US-93](./93-authors-postgres.md) (orden secuencial, R-1)
**LOC est.:** ~1100

## Historia

**Como** admin que programa ventas flash, **quiero** que las ventas y sus
productos vivan en Postgres, **para** que crearlas, editarlas y borrarlas
persista, y que el shop muestre en cada venta sus productos reales.

## Contexto — verificado en código (2026-11-17)

**Rutas** (`apps/api/rest/src/flash-sale/flash-sale.controller.ts`):

| Ruta | Guard | Hoy (`flash-sale.service.ts`) |
|---|---|---|
| `POST /flash-sale` | `ADMIN_OWNER_AND_STAFF` | devuelve `flashSale[0]` |
| `GET /flash-sale` | `@Public()` | paginador; `limit` por defecto 10; Fuse sobre `title` con el **último** token de `search`; `url` `/flash-sale?search=${search}&limit=${limit}` |
| `GET /flash-sale/:param` | `@Public()` | `find` por slug; 200 vacío si no existe |
| `PUT /flash-sale/:id` | `ADMIN_OWNER_AND_STAFF` | devuelve `flashSale[0]` |
| `DELETE /flash-sale/:id` | `ADMIN_OWNER_AND_STAFF` | string `This action removes a #id Flash Sale` |
| `GET /products-by-flash-sale` | `@Public()` (clase) | paginador sobre `products-by-flash-sale.json`; **ignora `slug`**: devuelve siempre los mismos 5 productos |

**Qué envían los frontends:**

- shop (`framework/rest/client/index.ts:542-566`): `GET /flash-sale` con
  paginación; `GET /flash-sale/:slug?with=products`; `GET
  /products-by-flash-sale?searchJoin=and&slug=…`. `/flash-sales/[slug]` se
  prerenderiza (`framework/rest/flash-sale.ssr.ts`).
- admin (`data/client/flash-sale.ts`): `all`/`paginated` con
  `search=title:…;shop_id:…` y `shop_id`; `get` con `with=products`. El
  formulario (`components/flash-sale/flash-sale-form.tsx`) envía `title`,
  `description`, `image`, `cover_image`, `start_date`/`end_date` (ISO),
  `type`, `rate`, `sale_status`, `language` y `sale_builder: {data_type,
  product_ids}`.
- El admin también llama a `product-flash-sale-info` y a las 4 rutas de
  solicitudes de vendedores, que no existen en la API (DA-5 del épico: fuera).

**Forma de `flash-sale.json`** (`node -e`):

- 2 filas en orden **id DESC**: 3, 1. Mismo orden de claves en las dos:
  `id, title, slug, description, start_date, end_date, sale_status, type,
  rate, sale_builder, image, cover_image, language, deleted_at, created_at,
  updated_at, translated_languages, products`.
- `start_date`/`end_date` son cadenas **`YYYY-MM-DD HH:MM:SS`** sin zona
  (`2023-10-31 06:49:59`), no ISO. `created_at`/`updated_at` son ISO de
  Laravel con 6 decimales.
- `sale_status` es número (`1`), `rate` es número (`50` y `10`), `type` es
  `percentage` o `fixed_rate`.
- `sale_builder` es `{data_type, product_ids}`; `data_type` vale
  `handpick_category` (venta 3) y `handpicked_products` (venta 1).
- `products` embebe 2 productos por venta: 951 y 952 (venta 3), 1013 y
  1023 (venta 1), los mismos ids de `sale_builder.product_ids`. Cada uno
  trae **43 claves** (el modelo completo de Laravel) más `pivot:
  {flash_sale_id, product_id}`. **Rareza del mock:** la `pivot` de los
  productos de la venta 1 dice `flash_sale_id: 3`.
- Las 2 ventas terminaron el **2024-11-29** (R-3 del épico).
- Sin `shop_id`: la venta es global.

**`products-by-flash-sale.json`:** 5 productos (951, 952, 953, 957, 959),
todos en `products`, con la misma forma de 43 claves sin `pivot`. 953, 957 y
959 **no están en ninguna venta** de `flash-sale.json` (DA-6 del épico).

**Proyección de productos de la API ya migrada:** `toProductDto`
(`products/product-dto.mapper.ts`) emite **20 claves**, las del listado de
`products.json`. De las 43 del mock, 26 no tienen columna (`gallery`,
`ratings`, `my_review`, `blocked_dates`…), y `toProductDto` añade `type`,
`shop` y `visibility`. `in_flash_sale` es la constante `0`.

## Decisión de la US

| # | Tema | Opciones | Decisión |
|---|---|---|---|
| DA-7 | Forma de los productos de una venta (embebidos y `products-by-flash-sale`) | **(a)** La misma proyección que `/products` (`toProductDto`, 20 claves), más `pivot` en los embebidos e `in_flash_sale: 1`. **(b)** Reconstruir las 43 claves con nulos donde no hay columna | **(a), decidido por el dueño (2026-11-17)**: es la forma que el shop ya pinta en todas sus tarjetas de producto, y (b) inventaría valores |

## Línea base (paso 2 del protocolo)

API mock recién arrancada:

```bash
B=http://localhost:9001/api
curl -s "$B/flash-sale" > fs-all.json
curl -s "$B/flash-sale?page=1&limit=1" > fs-p1.json
curl -s "$B/flash-sale?searchJoin=and&search=title:limited" > fs-search.json
curl -s "$B/flash-sale/limited-time-offer-act-fast?with=products" > fs-3.json
curl -s "$B/flash-sale/limited-time-discounts?with=products" > fs-1.json
curl -s "$B/products-by-flash-sale?searchJoin=and&slug=limited-time-offer-act-fast" > pbfs-3.json
curl -s "$B/products-by-flash-sale?searchJoin=and&slug=limited-time-discounts" > pbfs-1.json
```

## Tablas nuevas

| Tabla | Columnas propias | Restricciones |
|---|---|---|
| `flash_sales` | `title text NOT NULL`, `slug text NOT NULL UNIQUE`, `description text`, `start_date timestamp NOT NULL`, `end_date timestamp NOT NULL`, `sale_status smallint NOT NULL DEFAULT 1`, `type text NOT NULL`, `rate numeric(12,2) NOT NULL`, `sale_builder jsonb NOT NULL`, `image jsonb`, `cover_image jsonb`, `language`, timestamps | CHECK `type IN ('percentage','fixed_rate')`, `rate >= 0`, `end_date >= start_date`, `sale_status IN (0,1)` |
| `flash_sale_products` | `flash_sale_id bigint NOT NULL`, `product_id bigint NOT NULL` | PK `(flash_sale_id, product_id)`; FK a `flash_sales` y a `products`, las dos `ON DELETE CASCADE`, con índice en `product_id` |

`start_date`/`end_date` son `timestamp` **sin** zona, porque el mock no
trae zona; el servicio los emite como `YYYY-MM-DD HH:MM:SS`. Sin `shop_id`.
`sale_builder` se guarda tal cual; la tabla puente es la fuente de verdad de
los productos, y `sale_builder.product_ids` se reescribe con ella al
escribir. Sin triggers (D-7).

## Reglas del seed

1. `flash_sales`: 2 filas, ids preservados, `created_at`/`updated_at` del
   mock (D-3).
2. `flash_sale_products`: los `products[].id` de cada venta **iterada**,
   no el `pivot.flash_sale_id` (que está mal en la venta 1). El generador
   falla si un `product_id` no existe en el conjunto de productos sembrados,
   o si no coincide con `sale_builder.product_ids`.
3. `products-by-flash-sale.json` no se siembra (DA-6 a).
4. `setval` de la secuencia. Conteos esperados: `flash_sales` 2,
   `flash_sale_products` 4, 0 huérfanas. Los previos no cambian.

## Rutas — hoy → después

| Ruta | Después |
|---|---|
| `GET /flash-sale` | paginador con el mismo `url` y rarezas (D-1). Orden `id DESC`. `search=title:X` aplica ILIKE; `shop_id` se ignora (la venta es global). **Sin filtro por fecha** (R-3) |
| `GET /flash-sale/:param` | por slug; con `products` embebidos (DA-7); **404** si no existe |
| `POST /flash-sale` | crea la venta y sus filas puente en **una transacción**; `slug` con `generateSlug(title)`; 400 si un `product_id` no existe |
| `PUT /flash-sale/:id` | actualiza los campos y **reemplaza** el conjunto de productos si llega `sale_builder.product_ids`, en una transacción; `updatedAt: now()`; 404 si no existe |
| `DELETE /flash-sale/:id` | borra (cascada a la tabla puente) y devuelve la fila borrada; 404 |
| `GET /products-by-flash-sale` | paginador de los productos de la venta del `slug`, en orden `product_id`. Sin `slug`: los de todas las ventas, sin repetir. Slug inexistente: **404** |

**Proyección de la venta:** orden de claves del mock, `deleted_at: null` y
`translated_languages: ['en']` constantes (D-6), `sale_status` y `rate` como
números, fechas de venta como `YYYY-MM-DD HH:MM:SS`.

## Divergencias declaradas

| # | Dónde | Hoy | Después | Por qué |
|---|---|---|---|---|
| V-1 | productos de una venta | 43 claves del modelo de Laravel | las 20 de `/products` (+ `pivot`, `in_flash_sale: 1`) | DA-7 |
| V-2 | `pivot.flash_sale_id` de la venta 1 | `3` | `1` | se corrige la rareza del mock |
| V-3 | `GET /products-by-flash-sale?slug=…` | los mismos 5 productos para cualquier `slug` | los de esa venta (2 por venta) | D-1; DA-6 |
| V-4 | `search=title:X` | Fuse difuso con el último token | ILIKE real | D-1 |
| V-5 | slug o id inexistente | 200 vacío | 404 | precedente `tags` |
| V-6 | escrituras | fila 0 o string | persisten y devuelven la fila real | D-1 |
| V-7 | `created_at`/`updated_at` | 6 decimales | 3 decimales (`Date.toJSON`) | divergencia ya embarcada (`CLAUDE.md`) |

## Scope

**Incluye:** DDL de las 2 tablas, bloque del generador, seed regenerado,
re-introspección (relaciones `FlashSale.products` e inversa en `Product`),
`FlashSaleRecord`, `flash-sale.repository.ts` con transacciones y su
integration test, el barrel, el servicio Nest sin imports de JSON con su
spec, y la documentación.

**NO incluye:**

- `in_flash_sale` en `/products`, `orders` o `analytics` (DA-3);
- aplicar el descuento (`type`/`rate`) al precio de los productos;
- filtrar por vigencia (R-3);
- `product-flash-sale-info` y las rutas de solicitudes de vendedores (DA-5);
- `shop_id` en la venta;
- frontend.

## Criterios de aceptación

### CA-1 — Esquema y seed

Las 2 tablas en `db/schema.sql`; `psql` da 2 + 4 filas, 0 huérfanas en las
dos FK de la tabla puente y los conteos previos intactos. Una corrida del
generador con un `product_id` inexistente falla (se restaura después).

### CA-2 — Equivalencia de la venta

`GET /flash-sale` y `?page=1&limit=1` son iguales a la línea base excluyendo
solo las claves de V-1, V-2 y V-7 (comparación `node -e`).

### CA-3 — Divergencias

V-1, V-3 y V-5 con el antes y el después pegados.

### CA-4 — Escrituras transaccionales

Con Bearer de `admin@demo.com` y status exacto:

- crear una venta con 2 productos (201);
- `PUT` que cambia `title` y reemplaza los productos, verificado por `psql`;
- `POST` con un `product_id` inexistente da 400 **sin** dejar filas;
- `DELETE` borra en cascada.

Sin token: 401.

### CA-5 — Cierre de D-8 y sin regresión

`grep` sobre los imports de JSON en `apps/api/rest/src` solo devuelve
`payment-intent/`, `payment-method/`, `payment/` y los dos imports de
pasarela de `orders/orders.service.ts`. `just db-check`, `npx vitest run`,
`npx tsc --noEmit`, `just build-api`, `just build-shop` (prerender de
`/flash-sales/[slug]`) y `just verify` en verde.

## Escenarios Gherkin

```gherkin
Feature: Ventas flash desde Postgres
  Scenario: CA-3 — cada venta trae sus productos
    Given las ventas 3 y 1 sembradas
    When GET /products-by-flash-sale con slug limited-time-discounts
    Then la respuesta trae los productos 1013 y 1023
    And no trae 953, 957 ni 959

  Scenario: CA-4 — producto inexistente no deja basura
    When POST /flash-sale con product_ids 999999 y token de admin
    Then el status es 400
    And no hay filas nuevas en flash_sales ni en flash_sale_products
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `db/schema.sql` | 2 tablas |
| `db/generate-seed.mjs`, `db/seed.sql` | bloque padre-puente; regenerado |
| `db/README.md` | modelo |
| `packages/db/prisma/schema.prisma` | 2 modelos + renombres de todos |
| `packages/db/src/records.ts` | `FlashSaleRecord` |
| `packages/db/src/repositories/flash-sale.repository.ts` (+ `.integration.test.ts`) | `listFlashSales`, `findFlashSaleBySlug`, `listFlashSaleProducts`, `createFlashSale`, `updateFlashSale`, `deleteFlashSale` |
| `packages/db/index.ts`, `packages/db/README.md` | exports y documentación |
| `apps/api/rest/src/flash-sale/flash-sale.service.ts` (+ `.spec.ts`) | Postgres; reutiliza `toProductDto` |
| `docs/product/46-api-sin-mocks-json/README.md` | nota en D-8: la lista de imports permitidos se reduce |

## Definición de Done

Seguir el protocolo del épico y pegar:

- [x] Línea base (7 `curl`) con sus bytes.
- [x] Generador (corrida buena y corrida que falla), y `just db-reset`.
- [x] `psql` con los conteos, 0 huérfanas y los conteos previos.
- [x] `prisma validate` y `migrate diff` con `EXIT=0`; `just db-build`.
- [x] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [x] `just build-api`, `just build-shop` y `just verify`.
- [x] Comparación de CA-2; antes y después de cada divergencia.
- [x] `curl` y `psql` de CA-4.
- [x] `grep` de cierre de D-8.
- [x] Status de la US y fila del épico.

## Resultado — ejecutado el 2026-11-17

Rama `us-94-flash-sale`, desde `main` @ `784cf0b`. Las 6 rutas de ventas
flash leen y escriben Postgres; `flash-sale.json` y
`products-by-flash-sale.json` ya no se importan en ningún servicio.

### Cambios respecto al refinamiento

- `sale_builder`, `image` y `cover_image` van en **`json`**, no en
  `jsonb`: `image` trae las claves `thumbnail, original, id, file_name`, y
  `jsonb` las reordenaría (mismo cambio que en la US-93).
- **V-7 no ocurre.** El mock ya emite `created_at`/`updated_at` con 3
  decimales (`2023-10-16T06:53:42.000Z`), así que con los timestamps del
  mock sembrados (D-3) las ventas son idénticas byte a byte.
- `CreateFlashSaleDto` toma lo que envía el formulario del admin (`rate`,
  `sale_status`, `image`, `cover_image`, `language`) y deja de declarar
  `products`: los productos llegan en `sale_builder.product_ids`.
  `GetFlashSaleDto` declara `slug`, que el shop envía suelto.
- Un `sale_status` booleano del admin se guarda como `1`/`0`, la forma del
  mock.

### Línea base (API mock recién arrancada)

```
fs-all.json      14572 B  ventas 3, 1; 2 productos por venta, 44 claves (43 + pivot)
fs-p1.json        7744 B  venta 3, per_page "1"
fs-search.json   14580 B  title:limited -> ventas 1, 3 (orden de Fuse)
fs-3.json         7291 B
fs-1.json         6958 B  pivot.flash_sale_id 3 en los dos productos
pbfs-3.json      16204 B  951, 952, 953, 957, 959
pbfs-1.json      16204 B  951, 952, 953, 957, 959 (ignora el slug)
/flash-sale/no-existe  200, 0 B
```

### Seed y esquema

`node db/generate-seed.mjs` → `… · 11 authors · 2 flash_sales · 4
flash_sale_products`. `db/seed.sql`: +20 líneas; de las existentes solo
cambia la de conteos.

Corrida que falla (producto 1013 → 999999 en `flash-sale.json`, restaurado
con `git checkout` después):

```
El mock viola 2 restriccion(es) del esquema:
  - flash_sales 1: producto 999999 inexistente
  - flash_sales 1: sale_builder.product_ids no coincide con products
EXIT=1
```

`just db-reset` y `psql`:

```
 fs | fsp | huerf_fs | huerf_p | products | authors | orders | users
  2 |   4 |        0 |       0 |     1200 |      11 |     40 |    11
```

`npx prisma validate` → válido. `npx prisma migrate diff
--from-config-datasource --to-schema ./prisma/schema.prisma --exit-code` →
`No difference detected.`, `EXIT=0`. `just db-build` en verde.

### Tests

- `just db-check`: **34 archivos / 446 tests** en verde (antes 33 / 427;
  19 nuevos en `flash-sale.integration.test.ts`).
- `cd apps/api/rest && npx vitest run`: **36 archivos / 594 tests** en
  verde (antes 35 / 579; 15 nuevos en `flash-sale.service.spec.ts`).
  Corrido desde `C:\`: con el cwd en `c:\` (minúscula) fallan 88 tests de
  25 archivos con «expected NotFoundException to be an instance of
  NotFoundException», porque se cargan dos copias de `@nestjs/common`. No es
  una regresión.
- `npx tsc --noEmit -p tsconfig.json` → 0 errores (API y `packages/db`).
  `npx eslint "{src,apps,libs,test}/**/*.ts"` → 0.

### CA-2 — Equivalencia ✅

Comparación `node -e` de cada venta sin la clave `products`:

```
fs-all.json  IGUAL (sin products) 3034 3034
fs-p1.json   IGUAL (sin products) 2061 2061
fs-3.json    IGUAL (sin products) 1608 1608
fs-1.json    IGUAL (sin products) 1103 1103
```

El paginador (`total`, `per_page`, las URLs) también es igual.
`fs-search.json` trae las mismas 2 ventas y el mismo paginador; solo cambia
el orden: `[1, 3]` → `[3, 1]` (V-4).

### CA-3 — Divergencias ✅

- **V-1:** cada producto embebido pasa de 44 claves a 21: las 20 de
  `/products` (con `in_flash_sale: 1`) más `pivot`, al final.
- **V-2:** `pivot` de la venta 1: `{"flash_sale_id":3,…}` →
  `{"flash_sale_id":1,…}`.
- **V-3:** `products-by-flash-sale?slug=limited-time-offer-act-fast`:
  `951, 952, 953, 957, 959` (total 5) → `951, 952` (total 2); con
  `slug=limited-time-discounts` → `1013, 1023`. Sin `pivot`,
  `in_flash_sale: 1`.
- **V-4:** `search=title:limited` aplica ILIKE y ordena `id DESC`.
- **V-5:** `/flash-sale/no-existe`: `200, 0 B` → `404`
  (``No existe una venta flash con slug `no-existe`.``); también
  `products-by-flash-sale?slug=no-existe` → `404`.

### CA-4 — Escrituras transaccionales ✅

Bearer de `admin@demo.com`:

```
--- sin token                           401
--- crear (951, 1013)                   201  slug ca4-venta, 2026-12-01 00:00:00, rate 15, sale_status 1
    psql flash_sale_products            10|951  10|1013
--- PUT título + productos 952,1023,959 200
    psql                                CA4 renombrada|ca4-venta|{"data_type":"handpicked_products","product_ids":[952,1023,959]}|t
                                        10|952  10|959  10|1023
--- POST con producto 999999            400  `flash_sales.product_ids` referencia un registro inexistente (`999999`).
    filas antes=3/7 despues=3/7
--- fecha ilegible                      400
--- PUT inexistente                     404
--- DELETE                              200  -> 0 venta, 0 puente; totales 2/4
--- DELETE de nuevo                     404
```

### CA-5 — Cierre de D-8 y sin regresión ✅

`grep` de imports de JSON en `apps/api/rest/src` (sin specs):

```
src/orders/orders.service.ts:1:               #db/payment-gateway.json
src/orders/orders.service.ts:2:               #db/payment-intent.json
src/payment/stripe-payment.service.ts:2,6:    #db/settings.json, payment-gateway.json
src/payment-intent/payment-intent.service.ts  #db/taxes.json, #db/orders.json
src/payment-method/payment-method.service.ts  #db/payment-gateway.json, #db/payment-methods.json
```

- `just build-api` → `Done`, `EXIT=0`.
- `just build-shop` → 279 páginas, con
  `/en/flash-sales/limited-time-offer-act-fast` y
  `/en/flash-sales/limited-time-discounts` prerenderizadas desde Postgres.
  La primera corrida terminó en `SecurityFatalError` (el aviso de Next
  16.4.1 de la US-93); la segunda, `EXIT=0`. No se ejecutó ningún upgrade.
- `just verify`:

```
OK   API    :9001/api/settings  200  5503B  387ms
OK   Shop   :3003/en  200  191897B  893ms  cards:30
OK   Admin  :3002/en/login  200  72554B  4594ms  cards:1
```

- En el navegador, `/en/flash-sales/limited-time-discounts` muestra sus 2
  productos (Loogitech Powered Wireless Charging Stand y Amaazfit Bip U), y
  ya no los 5 de `products-by-flash-sale.json`.

### Para el dueño

- **Next 16.4.1 vuelve a cortar `next build` y `next dev`** con un
  `SecurityFatalError` la primera vez; la segunda pasa. Sigue pendiente la
  US de seguridad en el Épico 75.
- Las 2 ventas sembradas terminaron el 2024-11-29 y el shop las muestra
  «On going»: la API no filtra por vigencia (R-3), y el estado lo pinta el
  frontend.
- La venta no aplica su descuento al precio de los productos, y `/products`
  sigue emitiendo `in_flash_sale: 0` (DA-3).
