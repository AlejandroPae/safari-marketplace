# US-96 — `in_flash_sale` real y `product-flash-sale-info`

> `in_flash_sale` deja de ser la constante `0`: vale `1` si el producto está
> en alguna venta flash. Y la ficha de edición del producto muestra en qué
> ventas está, con la ruta `product-flash-sale-info`.

**Épico:** [Épico 95](./README.md)
**Fecha:** 2026-11-17
**Status:** Listo para ejecución
**Depende de:** ninguna (orden secuencial del épico, R-1)
**LOC est.:** ~350

## Historia

**Como** dueño de tienda que edita un producto, **quiero** ver en su ficha
las ventas flash en las que participa, **para** saber con qué campaña y qué
descuento se está vendiendo.

## Contexto — verificado en código (2026-11-17)

- `apps/api/rest/src/products/product-dto.mapper.ts:43` emite
  `in_flash_sale: 0` fijo. La misma función proyecta los productos de
  `/products` y los que embeben `categories`, `manufacturers`, `shops`,
  `tags`, `types`, `wishlists`, `questions`, `reviews` y `flash-sale`
  (R-2 del épico). `flash-sale.service.ts` ya lo sobrescribe a `1`.
- `PRODUCT_INCLUDE` (`packages/db/src/repositories/products.repository.ts:53`)
  no cuenta filas de `flash_sale_products`; `ProductRecord` no tiene el dato.
- Admin: `product-form.tsx:505` pinta `ProductFlashSaleBox` solo si
  `initialValues.in_flash_sale`; el cuadro llama a
  `GET /product-flash-sale-info?searchJoin=and&id=<id>&language=<l>&with=flash_sales`
  y recorre `Object.entries(data)`, pintando cada valor como una venta
  (`title`, `slug`, `start_date`, `end_date`, `type`, `rate`).
- `products.json`: solo el id 2 trae `in_flash_sale: 1`, y no está en
  ninguna venta. En el seed, los productos en venta son 951, 952 (venta 3),
  1013 y 1023 (venta 1).
- `openspec/specs/product-listing-api/spec.md:23` y
  `product-write-api/spec.md:159-160` fijan `in_flash_sale` en `0`.

## Rutas — hoy → después

| Ruta | Hoy | Después |
|---|---|---|
| toda proyección de `toProductDto` | `in_flash_sale: 0` | `1` si el producto tiene alguna fila en `flash_sale_products`; `0` si no |
| `GET /product-flash-sale-info?id=N` | 404 (no existe) | `@Public()`, como `/flash-sale`. Array de las ventas del producto (proyección de `/flash-sale/:slug`), en `id DESC`; `[]` si no está en ninguna; 404 si el producto no existe o el `id` no es un entero válido |

## Divergencias declaradas

| # | Dónde | Hoy | Después | Por qué |
|---|---|---|---|---|
| V-1 | `in_flash_sale` de 951, 952, 1013 y 1023, en todas las respuestas que embeben productos | `0` | `1` | DA-2 del épico |
| V-2 | `in_flash_sale` del producto 2 | `0` (el mock decía `1`) | sigue `0` | no está en ninguna venta; la divergencia con el mock ya estaba embarcada |

## Scope

**Incluye:** el dato en `ProductRecord` (un `_count` de `flashSales` en
`PRODUCT_INCLUDE`, o equivalente), `toProductDto`, `listProductFlashSales`
en `flash-sale.repository.ts` con su test de integración, la ruta nueva y
su spec, la actualización de las dos specs de OpenSpec y la documentación.

**NO incluye:** `in_flash_sale` en `orders` y `analytics` (DA-2); mirar la
vigencia de la venta (R-4); escribir `in_flash_sale` desde el formulario del
producto (sigue descartándose); frontend.

## Criterios de aceptación

### CA-1 — `in_flash_sale` real

`/products?limit=1200` (o paginado) da `in_flash_sale: 1` exactamente en
951, 952, 1013 y 1023, y `0` en el resto. Comparado con la línea base,
`node -e` no encuentra otra diferencia en `/products` ni en el detalle de
esos 4 productos.

### CA-2 — `product-flash-sale-info`

- `?id=951` devuelve la venta 3; `?id=1013`, la venta 1; `?id=2`, `[]`.
- Producto inexistente o `id=abc`: 404.
- En el navegador, la ficha de edición de 1013 muestra el cuadro
  «Promotional» con «Limited time discounts.»; la de 2 no lo muestra.

### CA-3 — Rendimiento

`/products` (página por defecto) medido 5 veces antes y después; se pega
la mediana. Si empeora más de un 20 %, se para y se consulta.

### CA-4 — Sin regresión

`just db-check`, `npx vitest run` (desde `C:\`), `npx tsc --noEmit`,
eslint, `just build-api`, `just build-shop` y `just verify` en verde.

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `packages/db/src/repositories/products.repository.ts` | `PRODUCT_INCLUDE` y `_toProductRecord` con el dato |
| `packages/db/src/repositories/flash-sale.repository.ts` (+ test) | `listProductFlashSales(productId)` |
| `packages/db/index.ts`, `packages/db/README.md` | export y documentación |
| `apps/api/rest/src/products/product-dto.mapper.ts` (+ specs que lo asertan) | `in_flash_sale` desde el record |
| `apps/api/rest/src/flash-sale/*` | controlador y servicio de `product-flash-sale-info`, con spec |
| `openspec/specs/product-listing-api/spec.md`, `product-write-api/spec.md` | `in_flash_sale` calculado |

## Definición de Done

- [ ] Línea base de `/products` y del detalle de 951, 1013 y 2, con bytes.
- [ ] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [ ] Comparación de CA-1 y medición de CA-3.
- [ ] `curl` de CA-2 y captura del navegador.
- [ ] `just build-api`, `just build-shop` y `just verify`.
- [ ] Status de la US y fila del épico.
