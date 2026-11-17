# Épico 92 — `authors` y `flash-sale` desde Postgres

> Los dos módulos de catálogo que el Épico 46 dejó como mocks permanentes
> pasan a Postgres, sembrados con sus propios JSON. Al cerrar, la API solo
> importa mocks JSON para la pasarela de pago.

**Fecha:** 2026-11-17
**Status:** Implementado (US-93 y US-94, 2026-11-17)

## Por qué este épico existe

El [Épico 46](../46-api-sin-mocks-json/README.md) migró los 19 controladores
que servían JSON, salvo los que su decisión 2 declaró permanentes:
`payment-intent`, `payment-method`, `authors`, `flash-sale` y `payment/`.

**El 2026-11-17 el dueño reabrió esa decisión solo para `authors` y
`flash-sale`** (DA-1). Los dos son datos de catálogo: no imitan un servicio
externo. Los pagos siguen siendo mock declarado hasta
[US-87](../75-actualizacion-dependencias/87-stripe-sdks.md) (SDKs de
Stripe), porque quitarlos exige integrar una pasarela, no migrar datos.

## Inventario — verificado en código (2026-11-17, `main` @ `37d5120`)

| Módulo | Rutas | JSON | Filas | Quién lo usa |
|---|---|---|---|---|
| `authors` | 6: `POST`, `GET`, `GET /:slug`, `PUT /:id`, `DELETE /:id` en `/authors`, y `GET /top-authors` | `authors.json` | 11 autores (ids 12..2, en orden DESC) | shop: listado, top, detalle y prerender de `/authors/[author]`; admin: CRUD y aprobación |
| `flash-sale` | 6: `POST`, `GET`, `GET /:param`, `PUT /:id`, `DELETE /:id` en `/flash-sale`, y `GET /products-by-flash-sale` | `flash-sale.json`, `products-by-flash-sale.json` | 2 ventas (ids 3 y 1); 5 productos | shop: `/flash-sales` y su detalle; admin: CRUD |

Ningún otro módulo de la API lee estos datos. `products`, `orders` y
`analytics` emiten `author_id: null` e `in_flash_sale: 0` como constantes, y
`db/schema.sql` no tiene ninguna tabla de autores ni de ventas flash.

**Rutas que el frontend llama y no existen** (404 hoy, sin JSON que las
respalde): `product-flash-sale-info`, `vendor-requests-for-flash-sale`,
`requested-products-for-flash-sale` y
`approve-`/`disapprove-flash-sale-requested-products` (admin). Ver DA-5.

## Subdivisión

| US | Título | Releasable solo | Depende de | LOC est. |
|----|--------|-----------------|------------|----------|
| [US-93](./93-authors-postgres.md) ✅ | `authors` y `top-authors` desde Postgres. Implementada el 2026-11-17; byte a byte en el listado y el detalle; `top-authors` ordena por `products_count` | Sí | ninguna | ~700 |
| [US-94](./94-flash-sale-postgres.md) ✅ | `flash-sale` y `products-by-flash-sale` desde Postgres. Implementada el 2026-11-17; las ventas son iguales byte a byte y cada una trae sus productos reales, con la forma de `/products` | Sí | US-93 (orden secuencial, R-1) | ~1100 |

Orden: **US-93 → US-94**, nunca en paralelo. Las dos tocan `db/schema.sql`,
`db/generate-seed.mjs`, `schema.prisma`, `records.ts` y el barrel de
`packages/db` (R-1).

## Decisiones

| # | Tema | Opciones | Estado |
|---|---|---|---|
| DA-1 | Alcance | `authors` + `flash-sale`; pagos fuera | **Decidido por el dueño (2026-11-17)** |
| DA-2 | `just db-reset` | **(a)** Autorizado para las 2 US, como la decisión 5 del Épico 46 (que no se heredaba). **(b)** Pedir permiso en cada US | **(a), decidido por el dueño (2026-11-17)** |
| DA-3 | Relación producto ↔ autor y producto ↔ venta flash en `products` | **(a)** Fuera: `products` sigue emitiendo `author_id: null` e `in_flash_sale: 0`. **(b)** Añadir `products.author_id` y calcular `in_flash_sale` | **(a), decidido por el dueño (2026-11-17)**. `products.json` no trae `author_id` en ninguna de sus 1200 filas, así que (b) no tendría datos con los que sembrar; además toca el contrato de `products`, `orders` y `analytics` |
| DA-4 | `products_count` del autor | **(a)** Columna sembrada con el valor del mock. **(b)** Calcularlo (daría 0 para todos, por DA-3) | **(a), decidido por el dueño (2026-11-17)**, declarada como dato estático mientras no exista `products.author_id` |
| DA-5 | Rutas de solicitudes de vendedores y `product-flash-sale-info` | **(a)** Fuera: siguen en 404. **(b)** Crearlas en US-94 | **(a), decidido por el dueño (2026-11-17)**. No hay mock que migrar: es funcionalidad nueva y merece su propio épico |
| DA-6 | Fuente de `products-by-flash-sale` | **(a)** Tabla puente sembrada desde `flash-sale.json` (`products` / `sale_builder.product_ids`), y la ruta devuelve los productos de la venta del `slug`. **(b)** Sembrar también los 5 de `products-by-flash-sale.json` | **(a), decidido por el dueño (2026-11-17)**. Ver la US-94 |

## Visión técnica

Se heredan del [Épico 46](../46-api-sin-mocks-json/README.md#decisiones-de-diseño-d-n)
sin cambios **D-1** (la forma se preserva, el comportamiento se corrige y se
declara), **D-2** (línea base capturada del mock recién arrancado), **D-3**
(timestamps del mock cuando existen), **D-6** (`translated_languages` y
`deleted_at` como constantes), **D-7** (reloj de US-32, sin triggers),
**D-9** (patrón de `tags`) y su
[protocolo de ejecución](../46-api-sin-mocks-json/README.md#protocolo-de-ejecución-de-una-us-de-este-épico),
con dos cambios:

- los tests de la API ya no son jest: en el paso 9 se corre
  `cd apps/api/rest && npx vitest run` y `npx tsc --noEmit -p
  tsconfig.json` (US-88);
- **D-8 se cierra**: al terminar US-94, `grep` sobre los imports de JSON en
  `apps/api/rest/src` solo devuelve `payment-intent/`, `payment-method/`,
  `payment/` y los dos imports de pasarela de `orders/orders.service.ts`.

Los JSON se quedan en disco (decisión 6 del Épico 46): son la fuente del seed.

## Riesgos

- **R-1 — Archivos compartidos.** Las dos US editan los mismos 5 archivos de
  esquema y capa de datos. Van en secuencia.
- **R-2 — Prerender del shop.** `getStaticPaths` de `/authors/[author]` y de
  `/flash-sales/[slug]` llama a la API durante `just build`. Un 404 nuevo
  (V-2 de cada US) solo afecta a slugs que no existen; las páginas
  sembradas deben seguir generándose. Cada US corre `just build-shop`.
- **R-3 — Fechas de las ventas.** Las 2 ventas del mock terminaron el
  2024-11-29. Si la API filtrara por vigencia, el shop no mostraría ninguna.
  La US-94 no filtra por fecha (hoy no se filtra) y lo deja declarado.

## Fuera de alcance

- Pagos (`payment-intent`, `payment-method`, `payment/`, la pasarela de
  `POST /orders/payment`): US-87.
- Los 9 stubs sin datos (`addresses`, `ai`, `feedbacks`, `imports`,
  `newsletters`, `notify-logs`, `refunds`, `uploads`, `web-hook`).
- Relacionar productos con autores o ventas (DA-3) y las rutas de
  solicitudes de vendedores (DA-5).
