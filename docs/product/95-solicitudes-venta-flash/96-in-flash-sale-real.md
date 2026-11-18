# US-96 — `in_flash_sale` real y `product-flash-sale-info`

> `in_flash_sale` deja de ser la constante `0`: vale `1` si el producto está
> en alguna venta flash. Y la ficha de edición del producto muestra en qué
> ventas está, con la ruta `product-flash-sale-info`.

**Épico:** [Épico 95](./README.md)
**Fecha:** 2026-11-17
**Status:** Implementado (2026-11-17)
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

- [x] Línea base de `/products` y del detalle de 951, 1013 y 2, con bytes.
- [x] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [x] Comparación de CA-1 y medición de CA-3.
- [x] `curl` de CA-2 y captura del navegador.
- [x] `just build-api`, `just build-shop` y `just verify`.
- [x] Status de la US y fila del épico.

## Resultado (2026-11-17, rama `feat/us-96-in-flash-sale` sobre `main` @ `f9738c5`)

### Qué se hizo

- `PRODUCT_INCLUDE` cuenta las filas de `flash_sale_products`
  (`_count: { select: { flashSales: true } }`), y `ProductRecord` gana
  `inFlashSale: boolean`. Como todos los repositorios que devuelven
  productos usan ese include, el dato llega a todos los embebedores (R-2).
- `toProductDto` emite `in_flash_sale: record.inFlashSale ? 1 : 0`.
  `orders` y `analytics` tienen su propia proyección y siguen en `0` (DA-2).
- `listProductFlashSales(productId)` en `flash-sale.repository.ts`, y la
  ruta `GET /product-flash-sale-info?id=N` (`@Public()`) en
  `ProductFlashSaleInfoController`. Ignora `language`, `with` y
  `searchJoin`. Un `id` que no es un entero positivo seguro da 404 sin
  tocar el driver.
- Specs de OpenSpec `product-listing-api` y `product-write-api`
  actualizadas.

### CA-1 — `in_flash_sale` real

Línea base (`main` @ `f9738c5`) y después, con el mismo `db-up`. Los
bytes no cambian, porque `0` y `1` miden lo mismo:

```
               antes    después
products-all   1247200  1247200   (limit=1200: 1199 filas)
products-def     28938    28938
detail-951       21448    21448
detail-1013      21474    21474
detail-2         19751    19751
in_flash_sale=1: []  ->  [ 951, 952, 1013, 1023 ]
```

Diff recursivo con `node` (todas las rutas JSON que difieren):

```
detail-1013.json: 4 diferencias
detail-2.json: 0 diferencias
detail-951.json: 4 diferencias
products-all.json: 4 diferencias
products-default.json: 0 diferencias
todas son in_flash_sale 0 -> 1: true
  detail-1013.json.in_flash_sale: 0 -> 1
  detail-1013.json.related_products.1.in_flash_sale: 0 -> 1
  detail-1013.json.related_products.2.in_flash_sale: 0 -> 1
  detail-1013.json.related_products.12.in_flash_sale: 0 -> 1
  detail-951.json.in_flash_sale: 0 -> 1
  detail-951.json.related_products.1.in_flash_sale: 0 -> 1
  detail-951.json.related_products.2.in_flash_sale: 0 -> 1
  detail-951.json.related_products.12.in_flash_sale: 0 -> 1
  products-all.json.data.938.in_flash_sale: 0 -> 1   (id 951)
  products-all.json.data.939.in_flash_sale: 0 -> 1   (id 952)
  products-all.json.data.959.in_flash_sale: 0 -> 1   (id 1013)
  products-all.json.data.969.in_flash_sale: 0 -> 1   (id 1023)
```

Los `related_products` 1, 2 y 12 de los dos detalles son 951, 952 y 1013
(los 4 son del type `gadget`).

### CA-2 — `product-flash-sale-info`

```
id=951                                              HTTP 200 [{"id":3,"title":"Limited-Time Offer: Act Fast! 🔥","products":[951,952]}]
id=1013                                             HTTP 200 [{"id":1,"title":"Limited time discounts.","products":[1013,1023]}]
id=2                                                HTTP 200 []
id=999999                                           HTTP 404 No existe un producto con id 999999.
id=abc                                              HTTP 404 No existe un producto con id abc.
searchJoin=and&id=1013&language=en&with=flash_sales HTTP 200 [{"id":1,"title":"Limited time discounts.","products":[1013,1023]}]
```

(Resumen de cada venta: `id`, `title` e ids de `products`. Cada elemento
trae las 18 claves de `/flash-sale/:slug`.)

Navegador (`just admin-dev`, super admin):

- `/gadget/products/loogitech-powered-wireless-charging-stand/edit` (1013):
  cuadro «Promotional» con «Product selected for this campaign.»,
  «Limited time discounts.», Active Date 16 Oct 2023, Expire Date
  29 Nov 2024, «Fixed Rate», Deals rate 10 y el enlace «See details» a
  `/flash-sale/limited-time-discounts`.
- `/grocery-shop/products/baby-spinach/edit` (2): no hay cuadro de venta;
  el formulario muestra «Product is not selected in any campaign.» y la
  página no llama a `product-flash-sale-info`.

### CA-3 — Rendimiento

`/products` (página por defecto), 5 corridas tras un calentamiento,
ordenadas:

```
antes:   0.054052 0.068525 0.068538 0.107776 0.216309   mediana 0.0685 s
después: 0.032164 0.036241 0.043080 0.047307 0.064522   mediana 0.0431 s
```

No empeora. La diferencia a favor está dentro del ruido de una máquina de
desarrollo, así que no se atribuye al cambio.

### CA-4 — Sin regresión

```
just db-check                 Test Files 34 passed (34) · Tests 452 passed (452)   (antes 446: +6)
npx vitest run (desde C:\)    Test Files 36 passed (36) · Tests 604 passed (604)   (antes 594: +10)
npx tsc --noEmit              TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"   sin salida
just build-api                Done in 141.50s. EXIT=0
just build-shop               279/279 páginas, las 2 de flash-sales prerenderizadas, EXIT=0
just verify                   OK API 5503B · OK Shop cards:30 · OK Admin cards:1
```

`build-shop` y `shop-dev` se cortaron la primera vez con el
`SecurityFatalError` de Next 16.4.1 y pasaron al reintentar; no se corrió
`next upgrade`. `apps/shop/public/sitemap-0.xml` se restauró tras el build.

### Fuera de alcance, mencionado

- `flash-sale.service.ts` sigue sobrescribiendo `in_flash_sale: 1` en los
  productos de una venta. Ahora es redundante con el record, pero no es
  incorrecto; no se tocó.
