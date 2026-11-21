# db/: el catálogo compartido

Una sola base de datos para dos consumidores: el **scraper escribe**
productos y la **tienda los consulta**, desde las mismas tablas. Encima
de ella, la API guarda el resto del dominio de Pickbazar: usuarios,
contenido, cupones, órdenes, mensajería y ventas flash.

| Archivo | Qué es |
|---|---|
| [`schema.sql`](schema.sql) | El DDL. Es la fuente de verdad del esquema, con las decisiones comentadas |
| [`seed.sql`](seed.sql) | **Generado.** Los datos de la aplicación. No se edita a mano |
| [`generate-seed.mjs`](generate-seed.mjs) | Produce `seed.sql` desde los JSON del mock |

**Contenido**

1. [Cómo se aplica y se regenera](#cómo-se-aplica-y-se-regenera)
2. [Qué datos trae el seed](#qué-datos-trae-el-seed)
3. [Mapa del modelo](#mapa-del-modelo)
4. [Reglas que sostienen el diseño](#reglas-que-sostienen-el-diseño)
5. [Catálogo: productos, tiendas y categorías](#catálogo-productos-tiendas-y-categorías)
6. [Identidad: usuarios, permisos y staff](#identidad-usuarios-permisos-y-staff)
7. [Contenido de la tienda](#contenido-de-la-tienda)
8. [Impuestos, envíos y atributos](#impuestos-envíos-y-atributos)
9. [Avisos de tienda](#avisos-de-tienda)
10. [Cupones y lista de deseos](#cupones-y-lista-de-deseos)
11. [Reseñas, preguntas y reportes](#reseñas-preguntas-y-reportes)
12. [Mensajería](#mensajería)
13. [Órdenes y descargas](#órdenes-y-descargas)
14. [Retiros y transferencias de tienda](#retiros-y-transferencias-de-tienda)
15. [Autores y ventas flash](#autores-y-ventas-flash)
16. [Cómo se adapta el scraper](#cómo-se-adapta-el-scraper)
17. [Lo que no está en el esquema](#lo-que-no-está-en-el-esquema)
18. [Decisión pendiente: la moneda](#decisión-pendiente-la-moneda)
19. [Detalles del generador y casos raros](#detalles-del-generador-y-casos-raros)

---

## Cómo se aplica y se regenera

```bash
just db-up              # levanta Postgres 16 en Docker y aplica esquema + seed
just db-migrate         # vuelve a aplicar esquema + seed sobre la base viva
just db-reset           # borra el volumen y recrea todo desde cero
just db-seed-generate   # regenera seed.sql desde los JSON del mock
just db-shell           # sesión psql
```

La base es `safari_scraper` en `localhost:5433` (usuario `safari`).

`just db-migrate` hace cuatro pasos:

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm`. La extensión se activa aquí y
   no en `schema.sql`, para que el DDL versionado no dependa de extensiones.
2. Aplica `schema.sql`.
3. Aplica `seed.sql`.
4. `VACUUM ANALYZE`. Los índices GIN trigram se crean antes que los datos, así
   que el seed entra en su *pending list*. Sin este paso el planificador no
   los usa hasta el primer autovacuum.

**Idempotente, pero no migra.** Todo el DDL va con `IF NOT EXISTS` y el seed
con `ON CONFLICT`, así que aplicarlo dos veces no rompe nada. Por eso mismo,
**un cambio en una tabla que ya existe no se aplica**. Para adoptar un cambio
del esquema: `just db-reset`. El repo no tiene migraciones incrementales.

**El seed no se escribe a mano.** `generate-seed.mjs` lee
`apps/api/rest/src/db/pickbazar/*.json` (el mock original de Pickbazar) y:

- **Valida antes de escribir.** Si el mock viola una restricción del esquema
  (una FK imposible, un `CHECK`, un email que no casa), imprime los problemas
  y termina **sin** tocar `seed.sql`.
- **Es determinista.** Dos corridas dan el mismo archivo. Por eso nada se
  calcula con azar ni con el reloj: el hash de la contraseña demo es un
  literal y los desplazamientos de fechas son constantes.
- **Preserva los ids del mock** para no romper las relaciones, y al final
  adelanta cada secuencia (`setval`) al máximo id sembrado.

---

## Qué datos trae el seed

| Área | Filas |
|---|---|
| Catálogo | 10 types · 12 shops · 198 categories · 14 manufacturers · 10 tags · 1200 products (1142 `simple`, 58 `variable`) |
| Identidad | 11 users · 4 permissions · 22 permission_user · 3 shop_staff · 1 become_seller |
| Contenido | 19 faqs · 5 terms_and_conditions · 5 refund_policies · 8 refund_reasons |
| Configuración | 1 taxes · 1 shippings · 8 attributes · 27 attribute_values |
| Avisos | 3 store_notices · 6 store_notice_user · 6 store_notice_read |
| Cupones y favoritos | 10 coupons · 10 wishlists |
| Reseñas y preguntas | 85 reviews · 3 abusive_reports · 68 questions |
| Mensajería | 2 conversations · 5 messages |
| Órdenes | 10 order_statuses · 40 orders (20 padres + 20 hijas) · 76 order_products · 10 order_files |
| Tiendas | 2 withdraws · 6 ownership_transfers |
| Autores y ventas flash | 11 authors · 2 flash_sales · 4 flash_sale_products |

Nacen **vacías**, a propósito: `category_product`, `product_tag`,
`password_reset_tokens`, `otp_codes`, `store_notice_shop`,
`conversation_reads`, `flash_sale_requests` y `flash_sale_request_products`.
`profiles` solo tiene las 3 filas de `users.json`: los usuarios sembrados
desde otros mocks no tienen perfil.

El generador imprime este resumen cada vez que corre, y la cabecera de
`seed.sql` lo repite.

---

## Mapa del modelo

`schema.sql` define **48 tablas**, agrupadas por agregado:

| Área | Tablas |
|---|---|
| Catálogo | `settings`, `types`, `shops`, `categories`, `manufacturers`, `tags`, `products`, `category_product`, `product_tag` |
| Identidad | `users`, `profiles`, `permissions`, `permission_user`, `password_reset_tokens`, `otp_codes`, `shop_staff`, `become_seller` |
| Contenido | `faqs`, `terms_and_conditions`, `refund_policies`, `refund_reasons` |
| Configuración | `taxes`, `shippings`, `attributes`, `attribute_values` |
| Avisos | `store_notices`, `store_notice_user`, `store_notice_shop`, `store_notice_read` |
| Cupones y favoritos | `coupons`, `wishlists` |
| Reseñas y preguntas | `reviews`, `abusive_reports`, `questions` |
| Mensajería | `conversations`, `messages`, `conversation_reads` |
| Órdenes | `order_statuses`, `orders`, `order_products`, `order_files` |
| Tiendas | `withdraws`, `ownership_transfers` |
| Autores y ventas flash | `authors`, `flash_sales`, `flash_sale_products`, `flash_sale_requests`, `flash_sale_request_products` |

Quién lee y escribe cada tabla: la API de Nest, a través de los repositorios
de [`packages/db`](../packages/db/README.md) (Prisma), y el scraper, que solo
escribe en `products`, `shops`, `manufacturers` y `category_product`.

---

## Reglas que sostienen el diseño

**`schema.sql` manda.** `packages/db/prisma/schema.prisma` se obtiene con
`prisma db pull` contra la base real, más renombres a mano. No genera
migraciones. Prisma no modela los `CHECK` ni los índices de expresión
(`users_email_lower_idx`, `reviews_autor_producto_orden_key`): esas reglas
viven solo en el DDL y los repositorios las validan antes de escribir.
El unique parcial `products_procedencia_key` sí se modela, gracias al
preview `partialIndexes`.

**Un solo reloj, sin triggers.** Ninguna tabla lleva trigger de
`updated_at`. Lo fija la capa de datos con el reloj de Node
(`packages/db/src/clock.ts`), el mismo del que sale `created_at`. Con
triggers, el reloj de Postgres y el de Node derivaban hasta ±676 ms, y una
fila podía salir con `updated_at` **anterior** a `created_at`. Toda tabla
nueva sigue esta política: cada `update`/`upsert` fija `updatedAt: now()`.

**`json` cuando el orden de las claves es contrato.** `jsonb` reordena las
claves. Donde la API debe devolver el objeto tal como venía en el mock
(snapshots de órdenes, imágenes de cupones, fotos de reseñas, los `*_info`
de transferencias, autores y ventas flash), la columna es `json`. En el
generador eso se emite con `jsonTal()` (`::json`), no con `json()`, que
castea a `jsonb`. El resto de documentos (`settings.options`, `image` de
productos, `address` de tiendas…) es `jsonb`.

**Dinero en `numeric`, nunca `float`.** En `products` es `numeric(12,2)`.
Donde el contrato emite el número tal cual (`2`, no `2.00`), es `numeric`
sin escala: `taxes.rate`, `shippings.amount`, `coupons.amount` y casi todo
el dinero de `orders` (el mock trae 3 decimales: `sales_tax 0.044`).

**Borrados explícitos.** Cada FK declara su `ON DELETE`, con tres criterios:

| Criterio | `ON DELETE` | Ejemplos |
|---|---|---|
| La fila no tiene sentido sin su padre | `CASCADE` | productos de una tienda, reseñas, mensajes, pivotes |
| La fila sobrevive, pero pierde la referencia | `SET NULL` | autor de una FAQ, cliente de una orden, `reviews.order_id` |
| Borrar el padre perdería historia | `RESTRICT` | `shops.owner_id`, autor de un aviso, usuarios de una transferencia |

`shops.owner_id` nunca es `CASCADE`: como `products.shop_id` sí lo es,
borrar al usuario 1 arrastraría en cadena las 12 tiendas y sus 1200
productos.

**Los contratos HTTP no cambian.** La API publica snake_case, la capa de
datos devuelve camelCase y la traducción vive en los servicios de Nest. Por
eso varias columnas existen solo para reproducir el JSON del mock (órdenes de
claves, enteros `1/0`, strings `"0.00"`). Divergencia conocida en
`created_at`/`updated_at`: ver
[Detalles del generador](#detalles-del-generador-y-casos-raros).

**Valores calculados, no columnas.** Lo que depende de otras filas o de
quién consulta se calcula en la API: `coupons.is_valid`,
`conversations.latest_message` y `unseen`, el `is_read` de un aviso,
`products.in_flash_sale`.

---

## Catálogo: productos, tiendas y categorías

| Tabla | Qué es |
|---|---|
| `settings` | Configuración global, una sola fila (`CHECK settings_fila_unica`). Es la primera llamada de la tienda (`/api/settings`). Aquí vive la moneda |
| `types` | Las verticales (grocery, gadget, books…). Controlan el layout del home y las rutas `/{locale}/{type.slug}` |
| `shops` | Los vendedores. 9 de `shops.json` + 3 reconstruidas desde los productos |
| `categories` | Taxonomía jerárquica por adyacencia (`parent_id`) |
| `manufacturers`, `tags` | Marcas y etiquetas |
| `products` | **La tabla compartida** entre la tienda y el scraper |
| `category_product`, `product_tag` | Pivotes del producto |

**`products` es una sola tabla para los dos consumidores.** No hay tabla de
staging para el scraper. Cada uno identifica el producto a su manera, con dos
claves independientes:

- la tienda, por `slug` (`UNIQUE` global, va en la URL `/products/{slug}`);
- el scraper, por `(source_store, source_product_id)`.

Las columnas de procedencia (`source_store`, `source_product_id`,
`source_url`, `scraped_at`) son `NULL` en los productos sembrados o creados
desde el admin. La clave del scraper es un **unique parcial**:

```sql
CREATE UNIQUE INDEX products_procedencia_key
    ON products (source_store, source_product_id)
    WHERE source_store IS NOT NULL;
```

Así los productos sembrados no compiten por ella, y el `ON CONFLICT` del
pipeline hace un upsert idempotente sin saber nada del slug.
`slugify()` (función SQL del esquema, sin depender de `unaccent`) da el
mismo slug al mismo producto, siempre.

**CHECKs de `products`:**

| Constraint | Regla |
|---|---|
| `products_rebaja_valida` | `sale_price < price` cuando hay los dos |
| `products_simple_con_precio` | un producto `simple` necesita `price`; uno `variable` lo deriva de sus variaciones |
| `products_procedencia_completa` | `source_store` y `source_product_id` van juntos o ninguno |
| `product_type`, `status` | `simple`/`variable` y `publish`/`draft` |

**Índices que responden a filtros reales** de la tienda:

- `products_visibles_idx`: parcial sobre `(type_id, id)`, solo filas con
  `status = 'publish'` y `visibility = 'visibility_public'`, que es lo que
  la tienda manda en todas las consultas.
- `products_precio_idx` (filtros de precio), `products_shop_idx`,
  `products_manufacturer_idx`, `products_scraped_idx`.
- `products_nombre_ilike_trgm_idx`: GIN trigram sobre `name`, para la
  búsqueda por nombre. Ver
  [Búsqueda por texto](#búsqueda-por-texto-índices-trigram).

**Categorías en tres niveles, no dos.** 83 raíces, 109 hijas y 6 nietas
(165-168 bajo 164 «Dairy» y 169-170 bajo 163 «Eggs», en la rama 124
«Dairy & Eggs»). Quien asuma dos niveles pierde esas 6 filas.
`parent_id` es `SET NULL` y el `CHECK categories_no_autoreferencia` impide
que una categoría sea su propia madre, pero **no** impide un ciclo A→B→A:
quien recorra el árbol necesita su propia guarda.

---

## Identidad: usuarios, permisos y staff

| Tabla | Qué es |
|---|---|
| `users` | Identidad para el login. `password_hash` en bcrypt |
| `profiles` | Datos de perfil, 1:1. La PK es `user_id`: el `profile.id` del mock colisiona entre usuarios |
| `permissions` | Catálogo de 4 roles, `guard_name = 'api'` |
| `permission_user` | Pivote usuario ↔ permiso |
| `password_reset_tokens` | Tokens de recuperación de contraseña, por `user_id` |
| `otp_codes` | Códigos de un solo uso por teléfono |
| `shop_staff` | Pivote usuario ↔ tienda: quién es staff de qué tienda |
| `become_seller` | La fila única de la página «vender con nosotros» |

**Credencial demo.** Los 11 usuarios comparten la contraseña `demodemo`,
guardada como hash bcrypt (costo 10). El hash es la constante `HASH_DEMO`
de `generate-seed.mjs`, con el comando para regenerarlo en un comentario.
Nunca se hashea al generar: el salt aleatorio de bcrypt rompería el
determinismo del seed.

**Matriz de permisos** de los usuarios de `users.json`:

| Usuario | id | Permisos |
|---|---|---|
| `store_owner@demo.com` | 1 | `customer`, `store_owner` |
| `customer@demo.com` | 2 | `customer`, `staff` (staff de las tiendas 1 y 2) |
| `admin@demo.com` | 3 | `super_admin`, `customer`, `store_owner`, `staff` (staff de la tienda 1) |

Los otros 8 usuarios los siembra el generador desde otros mocks (ver
[Usuarios referenciados por los mocks](#usuarios-referenciados-por-los-mocks)):
`customer2@demo.com` (4) y `customer3@demo.com` (5) con `customer`, y los
6 owners de las transferencias (42, 45, 48, 49, 51, 53) con `customer` y
`store_owner`. Total: 22 filas en `permission_user`.

**Email sin distinguir mayúsculas, sin `citext`.** El índice único es
`users_email_lower_idx ON users (lower(email))`; la columna es `text`
plano. Todo lookup por email debe escribirse
`WHERE lower(email) = lower($1)`. Un `WHERE email = $1` funciona, pero
no usa el índice.

**`otp_codes` no tiene FK a `users`.** Se identifica por `phone` porque
`POST /api/send-otp-code` recibe un teléfono, no un id, y no hay columna de
teléfono única en `users` ni en `profiles` (solo `profiles.contact`, texto
libre). Es la única tabla de identidad sin FK.

**`shop_staff`** es un pivote puro: PK `(user_id, shop_id)`, las dos FK en
`CASCADE` y solo `created_at` (un pivote se crea o se borra, no se edita).
**No tiene columna de rol**: ningún consumidor la pide (el admin crea staff
con `{email, password, name, shop_id}`). Sus 3 filas, `(2,1)`, `(2,2)` y
`(3,1)`, son un array literal del generador: no hay mock de staff. Excluye
al usuario 1 porque ya es dueño de las 12 tiendas. El permiso global `staff`
se asigna a quien tenga alguna fila aquí; sin él, el admin no deja entrar a
un staff.

**`become_seller`** sigue el patrón de `settings` (`id = 1` +
`CHECK become_seller_fila_unica`) con **dos** columnas `jsonb` hermanas:
`page_options` (el objeto interno del mock, 24 claves) y `commissions` (los
2 niveles de comisión). El envoltorio con forma de `settings` que trae el
mock no se guarda: sus `id`/`language`/`created_at`/`updated_at` son las
columnas de la tabla, y el servicio lo recompone.

---

## Contenido de la tienda

FAQ, términos y condiciones, políticas y motivos de reembolso (`faqs`,
`terms_and_conditions`, `refund_policies`, `refund_reasons`). Regla clave:
el contenido es global (`shop_id` NULL) o de una tienda, y el tipo y el
emisor los deriva el repositorio de `shop_id`.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### FAQ y términos y condiciones

`faqs` y `terms_and_conditions` tienen la misma forma: contenido **global**
(emitido por el super admin, `shop_id` NULL) o **de una tienda**.

- **`issued_by` es texto, no FK.** Es el nombre del emisor («Super Admin» o
  el de la tienda), que es lo que la tienda filtra por igualdad exacta.
- **El tipo y el emisor no los elige quien escribe.** Al crear, el
  repositorio los deriva de `shop_id` (`resolveContentIssuer`), para que una
  FAQ de tienda no quede invisible en su propia página.
- `faq_type` y `type` ∈ `{global, shop}` (CHECK).
- `terms_and_conditions.is_approved` es boolean; la API lo emite como
  entero `1/0`.
- FK: `shop_id` en `CASCADE` (el contenido de una tienda borrada no tiene a
  quién pertenecer) y `user_id` en `SET NULL` (el autor se puede borrar sin
  perder el contenido).

### Reembolsos: políticas y motivos

Son las dos listas de contenido que rodean al reembolso. El reembolso en sí
no está en la base: el módulo `refunds` de la API es un stub.

- **`refund_policies`**: `target ∈ {vendor, customer}`, que es lo que filtran
  `/customer-refund-policies` y `/vendor-refund-policies`, y
  `status ∈ {approved, pending}` (por defecto `pending`), la cola de
  moderación del admin. `shop_id` opcional, en `CASCADE`.
- **`refund_reasons`**: catálogo plano. Su contrato emite
  `created_at`/`updated_at`, así que el seed inserta las fechas del mock en
  vez de `now()`. Sin eso, cada `db-reset` cambiaría la respuesta de
  `GET /refund-reasons`.

</details>

---

## Impuestos, envíos y atributos

`taxes` y `shippings` (una fila «Global» cada una, id 1) y el agregado
`attributes` + `attribute_values`. Regla clave: `settings` apunta a
`taxes`/`shippings` con un id en texto dentro del `jsonb`, sin FK.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### `taxes` y `shippings`

Una fila cada una, la clase «Global», con **id 1** y las fechas del mock.

- **La relación con `settings` es blanda.** `settings.options.taxClass` y
  `shippingClass` guardan `"1"` como texto dentro del `jsonb`, sin FK. Por
  eso se preservan los ids, y por eso estas tablas no alteran la respuesta
  de `/api/settings`.
- `numeric` sin escala: `rate` y `amount` vuelven como `2` y `50`.
- CHECK: `rate >= 0`, `amount >= 0`, `type ∈ {fixed, percentage, free}`.
- **No se paginan**: el admin pide `limit=999` y espera un array para el
  selector de clase.
- El checkout las lee para calcular impuesto y envío (ver
  [Checkout y stock](#checkout-y-stock)).

### `attributes` y `attribute_values`

Agregado padre-hijo: el catálogo de atributos (Color, Size…) sobre el que
se construyen las variaciones. Las variaciones en sí no se persisten.

- **`attributes`**: `shop_id NOT NULL`, en `CASCADE` (un atributo es de su
  tienda, como un producto). `slug` UNIQUE global. Sin `type_id`: el mock
  trae `type` siempre `null`.
- **`attribute_values`**: `attribute_id` en `CASCADE`. El slug es único
  **dentro** del atributo, `UNIQUE (attribute_id, slug)`: «Color» existe en
  tres tiendas. No lleva `shop_id`: lo hereda del padre.
- **Dos órdenes que son contrato**: atributos en `id DESC`, valores en
  `id ASC` dentro de cada atributo.

</details>

---

## Avisos de tienda

`store_notices` y sus tres pivotes (`store_notice_user`,
`store_notice_shop`, `store_notice_read`). Regla clave: el `type` del aviso
decide los destinatarios, y `is_read` es el de quien consulta.

<details>
<summary>Tablas, reglas y datos del seed</summary>

Los avisos que el super admin (o un dueño, para su tienda) publica en la
barra superior del panel.

- **`store_notices`**: CHECK `priority ∈ {high, medium, low}`,
  `type ∈ {all_vendor, specific_vendor, all_shop, specific_shop}` y vigencia
  `effective_from <= expired_at`. `created_by` es `RESTRICT` (un aviso que
  otros ya leyeron no se queda sin autor); `updated_by`, `SET NULL`.
- **Destinatarios**: `store_notice_user` (usuarios, avisos `*_vendor`) y
  `store_notice_shop` (tiendas, avisos `*_shop`). Al crear, el `type`
  decide: `all_vendor` va a todos los usuarios con permiso `store_owner`;
  `all_shop`, a todas las tiendas; `specific_*`, a los ids enviados.
- **`store_notice_read`**: si cada destinatario lo leyó. El `is_read` que
  emite la API es el de **quien consulta**, no uno global. Lo marca
  `POST /store-notices/read`.

Los tres pivotes son puros: PK compuesta, FK en `CASCADE`, solo
`created_at`.

</details>

---

## Cupones y lista de deseos

`coupons` y el pivote `wishlists`. Regla clave: `is_valid` no es columna; la
API lo calcula con la vigencia `active_from <= now() < expire_at`.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### `coupons`

- **`is_valid` no es columna.** La API lo calcula en cada lectura: vigente
  ⇔ `active_from <= now() < expire_at`, con el reloj de `clock.ts`.
  `POST /coupons/verify` exige además `is_approve` y
  `sub_total >= minimum_cart_amount`.
- **El seed desplaza la vigencia 5 años** (ver
  [Detalles](#detalles-del-generador-y-casos-raros)): las fechas del mock ya
  vencieron. Quedan vigentes hasta el 2029-03-28 (`4OFF`, el primero en
  vencer).
- **`image` es `json`**: dos filas traen `{thumbnail, original, id}` en ese
  orden.
- CHECK: `type ∈ {fixed, percentage, free_shipping}`, `amount >= 0`,
  `minimum_cart_amount >= 0`, `expire_at > active_from`. `code` es UNIQUE.
- FK: `shop_id` en `CASCADE` (`NULL` = cupón global del super admin) y
  `user_id` en `SET NULL`. `orders.coupon_id` apunta aquí con `SET NULL`.

### `wishlists`

Pivote puro usuario ↔ producto: PK `(user_id, product_id)`, las dos FK en
`CASCADE` (un favorito no sobrevive a su usuario ni a su producto) y solo
`created_at`, que ordena la lista (más reciente primero).

El mock trae 10 productos **sin dueño**. El generador se los da a
`customer@demo.com` (id 2), el cliente demo; el admin y el dueño de tienda
empiezan con la lista vacía.

</details>

---

## Reseñas, preguntas y reportes

`reviews`, `questions` y la tabla polimórfica `abusive_reports`. Regla
clave: una reseña por compra (`reviews_autor_producto_orden_key`), y
`shop_id` debe ser la tienda del producto.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### `reviews`

85 filas. Por autor: usuario 2 → 20, 4 → 38, 5 → 27. La tienda 6 tiene 49.

- **`CASCADE` en `user_id`, `shop_id` y `product_id`**: la reseña es
  contenido de su autor sobre un producto de una tienda. `shop_id` debe ser
  la tienda del producto; el generador y la API lo validan.
- **Una reseña por compra.** El índice único de expresión
  `reviews_autor_producto_orden_key (user_id, product_id, COALESCE(order_id, 0))`
  admite una reseña sin orden por producto, y una por cada orden.
- `order_id` tiene FK a `orders` en `SET NULL`, añadida después de crear
  `orders` (ver [Detalles](#detalles-del-generador-y-casos-raros)).
  `variation_option_id` no tiene FK: no hay tabla de variaciones.
- `photos` es `json` con `CHECK (json_typeof(photos) = 'array')`. `rating`
  va de 1 a 5.
- Los contadores de feedback son columnas: no hay filas de votos que los
  respalden (el módulo `feedbacks` es un stub).

### `questions`

68 filas, todas con respuesta. Por autor: 2 → 54, 4 → 14. La tienda 6
tiene 39.

- `CASCADE` en las tres FK, por el mismo criterio que `reviews`, y
  `shop_id` debe ser la tienda del producto.
- **Sin UNIQUE (user, product)**: el mock trae 20 pares repetidos legítimos.
- **`answer` NULL = sin responder.** Una pregunta nueva nace así.
- Búsqueda por texto con `questions_question_ilike_trgm_idx` (ver
  [Búsqueda por texto](#búsqueda-por-texto-índices-trigram)).

### `abusive_reports`

3 reportes del cliente (2) sobre las reseñas 1, 21 y 78.

- **Polimórfica**: `model_type` + `model_id`, sin FK. El repositorio valida
  que el objeto exista. `model_type ∈ {Review, Question}` (CHECK).
- La tabla guarda el nombre corto (`'Review'`); el generador normaliza el
  FQCN de Laravel (`MarvelDatabaseModelsReview`) y la API lo vuelve a
  emitir así.
- `UNIQUE (user_id, model_type, model_id)`: un reporte por usuario y
  objeto. Borrar una reseña o una pregunta borra sus reportes en la misma
  transacción.

</details>

---

## Mensajería

`conversations`, `messages` y `conversation_reads`. Regla clave: una
conversación por par (usuario, tienda); `latest_message` y `unseen` los
calcula la API.

<details>
<summary>Tablas, reglas y datos del seed</summary>

La conversación de un usuario con una tienda y sus mensajes, como un solo
agregado.

- **`conversations`**: 2 filas, las dos del admin (3): la 1 con la tienda 7
  y la 6 con la tienda 2. `UNIQUE (user_id, shop_id)`: una conversación por
  par, y el `POST` la reutiliza.
- **`messages`**: 5 filas, todas de la conversación 1.
  `CHECK (length(btrim(body)) > 0)`. Escribir un mensaje sube
  `conversations.updated_at` en la misma transacción, para que la
  conversación suba al ordenar.
- **`conversation_reads`**: una fila por (conversación, usuario) con
  `last_seen_at`, que marca `POST /messages/seen/:id`. Va por participante
  porque el cliente y quien atiende la tienda tienen cada uno su «sin leer».
  Arranca vacía: el mock no trae lecturas.
- **`latest_message` y `unseen` no son columnas.** La API los calcula (el
  mock los traía incoherentes). Para quien consulta, `unseen` vale 0 si no
  hay mensajes, si el último es suyo o si su `last_seen_at` es igual o
  posterior al `created_at` de ese mensaje; 1 en otro caso.
- `CASCADE` en todas las FK.

</details>

---

## Órdenes y descargas

`order_statuses`, `orders` + `order_products` y `order_files`. Regla clave:
padre e hija comparten tabla (`orders_padre_o_hija`) y los snapshots van en
`json` para conservar el orden de claves.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### `order_statuses`

Catálogo de 10 estados con los ids, seriales y fechas del mock.

- **`serial`** es la posición en el flujo: `UNIQUE` y `CHECK (serial > 0)`.
  La lista se ordena por él, no por `id`: el 7 «Delivered» lleva el serial
  11 y va al final.
- `slug` UNIQUE, se regenera al renombrar. `color` con
  `CHECK (color ~ '^#[0-9a-fA-F]{6}$')`.
- **No es el vocabulario de `orders.order_status`.** Las órdenes usan el
  enum de la API (`order-pending`, `order-completed`…); este catálogo usa
  otros slugs (`order-received`, `delivered`…). No hay FK entre los dos.

### `orders` y `order_products`

El núcleo transaccional.

- **Padre e hija en la misma tabla**, como en Pickbazar. El padre agrupa la
  compra y no tiene tienda; cada hija es la parte de una tienda.
  `CHECK orders_padre_o_hija`: sin `parent_id` ⇔ sin `shop_id`.
  `parent_id` en `CASCADE`.
- **Snapshots en `json`**: `customer_snapshot` (el cliente embebido, tal
  cual) y `order_products.product_snapshot` (el producto en el momento de
  la compra). El contrato emite las 43 claves del producto y las 9 del
  cliente en el orden del mock. Las direcciones también son `json`; en 8
  órdenes son `[]` (pedidos digitales).
- **Dinero**: `numeric` sin escala, salvo `cancelled_*`, que es
  `numeric(12,2)` porque el contrato lo emite como string `"0.00"`.
- **Estados**: `order_status`, `payment_status` y `payment_gateway` llevan
  CHECK con los enums de la API (`orders/entities/order.entity.ts`).
- `tracking_number` UNIQUE, 14 dígitos.
- **`order_products`**: PK `(order_id, line_no)`, con `line_no` = posición
  en el `products[]` del mock. `variation_option_id` sin FK.
- **FK y borrados**: cliente `SET NULL` (la orden es histórica; `NULL` es
  también el invitado); tienda `RESTRICT`; cupón `SET NULL`; producto de
  una línea `SET NULL`, para poder borrar productos ya vendidos.
- **Borrar una orden puede dar 409.** Si el autor de una reseña de esa
  orden ya tiene otra reseña **sin orden** del mismo producto, el
  `SET NULL` de `reviews.order_id` choca con
  `reviews_autor_producto_orden_key`. `DELETE /orders/:id` responde 409 y
  no borra nada.

### Checkout y stock

`POST /orders` y `checkout/verify` escriben y leen estas mismas tablas.

| Paso | Regla |
|---|---|
| Precio | Lo fija la base. `simple`: `sale_price ?? price` de la fila viva. Con variación, el `unit_price` del cliente solo si cae en `[min_price, max_price]` |
| Disponibilidad | Una línea no está disponible si el producto no existe, no está en `publish`, tiene `in_stock = false` o le falta stock |
| Impuesto | La fila de `taxes` con `id = settings.taxClass`. `sales_tax = amount × rate / 100`, sin redondear y **sin** aplicarlo al envío aunque `on_shipping` sea `true` (así están las 20 órdenes del mock) |
| Envío | La fila de `shippings` con `id = settings.shippingClass`. 0 si no hay dirección (pedido digital), si aplica `freeShipping` por umbral o si el cupón es `free_shipping` |
| Cupón | Aprobado, vigente, sobre su `minimum_cart_amount` y, si es de una tienda, con alguna línea de ella. `fixed` descuenta hasta el `amount`; `percentage`, el porcentaje |
| Hijas | Una por tienda, con sus líneas. `amount` = suma de sus líneas; impuesto, envío y descuento en 0. Las líneas van en el padre **y** en su hija, como en el mock |
| Stock | En la misma transacción: `UPDATE products SET quantity = quantity − n, sold_quantity = sold_quantity + n WHERE quantity >= n`. Si otra compra se adelantó: rollback y 409. Borrar o cancelar una orden **no** repone stock |
| Seguimiento | `YYYYMMDD` (UTC) + 6 dígitos al azar, único; hasta 5 intentos |

El snapshot de la línea guarda el producto **antes** de descontar el stock.

### `order_files`

Una fila es el derecho de un cliente a descargar un archivo digital
comprado. El seed trae 10, todas de `customer@demo.com` (2) y sin orden.

- La API solo muestra a cada usuario las suyas, también al admin.
- **`digital_file_id` no es UNIQUE**: el mock repite el 42 (4 filas) y el 2
  (2 filas). La descarga toma la primera por `id`. No hay tabla
  `digital_files`: ningún mock la respalda.
- `file` en `json`: el snapshot del archivo con su `fileable` (producto o
  variación). Sus fechas anidadas conservan los 6 decimales del mock.
- FK: cliente `CASCADE` (la descarga es suya); orden `SET NULL`.
- Completar una orden **no** crea filas aquí.

</details>

---

## Retiros y transferencias de tienda

`withdraws` y `ownership_transfers`. Regla clave: no hay balances, y `POST
/transfer-shop-ownership` es la única escritura sobre `shops.owner_id`.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### `withdraws`

Lo que una tienda pide cobrar. El seed trae 2 de la tienda 3: la 1
`approved` (300) y la 2 `pending` (10).

- El super admin ve todos y les cambia el estado. El dueño solo ve y pide
  los de sus tiendas, y solo borra los `pending`.
- **`status` en minúscula**: `pending`, `approved`, `on_hold`, `rejected`,
  `processing` (CHECK). Es el vocabulario del dato y del admin, no el
  TitleCase del enum de Nest.
- `amount numeric(12,2)` con `CHECK (amount > 0)`.
- **Sin balance**: no hay tabla de balances, así que aprobar no descuenta
  nada.
- Sin `deleted_at`: se borra de verdad. La tienda es `CASCADE`.

### `ownership_transfers`

Registra que una tienda pasa (o pidió pasar) de `previous_owner` a
`current_owner`. El seed trae 6 solicitudes `pending`, sin tienda (el mock
no trae `shop_id`) y creadas por el admin (3).

- **`POST /transfer-shop-ownership` es la única escritura sobre
  `shops.owner_id`**: en una transacción cambia el dueño e inserta la fila
  `approved`. Aprobar una solicitud por `PUT` no mueve la tienda.
- **`balance_info` es una foto histórica**: no se proyecta de ninguna tabla
  ni se valida su `shop_id`. Va en `json`, igual que `order_info`,
  `refund_info` y `withdrawal_info`.
- `status ∈ {pending, processing, approved, rejected}` y
  `CHECK (previous_owner_id <> current_owner_id)`.
- FK: los tres usuarios son `RESTRICT` (el historial no se pierde); la
  tienda, `SET NULL`.
- La API no emite `created_at`/`updated_at` (el mock no los trae).

</details>

---

## Autores y ventas flash

`authors`, `flash_sales` + `flash_sale_products` y las solicitudes
`flash_sale_requests` + `flash_sale_request_products`. Regla clave: la tabla
puente es la fuente de verdad de los productos de una venta.

<details>
<summary>Tablas, reglas y datos del seed</summary>

### `authors`

11 autores globales (sin `shop_id`; el que envía el admin se ignora).

- **`products_count` es un dato sembrado, no un conteo**: `products` no
  tiene `author_id`, porque ninguno de los 1200 productos del mock lo trae.
  Las escrituras no lo tocan. `CHECK (products_count >= 0)`.
- `socials`, `image` y `cover_image` en `json`.
- `born`/`death` son `timestamptz`; `languages` es texto libre
  (`"English, Russian"`).
- La API no emite `created_at`/`updated_at` (el mock no los trae).

### `flash_sales` y `flash_sale_products`

2 ventas globales (ids 3 y 1) y 4 filas puente: 951 y 952 en la venta 3;
1013 y 1023 en la venta 1.

- **La tabla puente es la fuente de verdad** de los productos de una venta.
  `sale_builder` se guarda tal cual, pero su `product_ids` se reescribe con
  la tabla puente en cada escritura. PK `(flash_sale_id, product_id)`, las
  dos FK en `CASCADE`.
- `start_date`/`end_date` son `timestamp` **sin** zona, como el mock
  (`2023-10-31 06:49:59`), y la API los emite en ese formato.
- **No se filtra por vigencia**: las 2 ventas terminaron el 2024-11-29 y el
  listado quedaría vacío.
- CHECK: `type ∈ {percentage, fixed_rate}`, `rate >= 0`,
  `end_date >= start_date`, `sale_status ∈ {0, 1}`.
- Un producto emite `in_flash_sale: 1` si tiene alguna fila en
  `flash_sale_products`. La venta **no** aplica su descuento al precio.

### `flash_sale_requests` y `flash_sale_request_products`

Un dueño de tienda (o su staff) pide que unos productos suyos entren en una
venta. **Nacen vacías**: no hay mock; el generador solo adelanta la
secuencia.

- `shop_id` se deduce de los productos, que deben ser todos de la misma
  tienda.
- `status ∈ {pending, approved, rejected}`, por defecto `pending`. Es texto
  y no boolean porque un boolean no distingue «pendiente» de «rechazada».
  La API emite el `request_status` boolean del admin como
  `status = 'approved'`.
- **Aprobar y rechazar escriben en `flash_sale_products`** y reescriben
  `sale_builder.product_ids`. `added_to_sale` marca los productos que metió
  la aprobación: rechazar retira solo esos, nunca uno que ya estaba en la
  venta.
- FK: venta y tienda en `CASCADE`; `created_by` en `SET NULL`. La tabla
  puente tiene PK `(request_id, product_id)` y FK en `CASCADE`.

</details>

---

## Cómo se adapta el scraper

**El seed contiene solo datos de la aplicación.** El scraper no aporta filas
aquí: es él quien debe encajar en esta taxonomía.

Sus productos van al type `gadget` (lo busca por slug, no por id). Ese type
ya trae diez categorías que cubren lo que los spiders recolectan. El método
`categorizar()` de cada spider debe devolver **estos slugs**, no inventar
los suyos:

| Lo que produce el spider | Categoría que ya existe |
|---|---|
| portátiles | `laptop` |
| celulares | `mobiles` |
| monitores | `monitor` |
| gaming / consolas | `console` |
| audio / parlantes | `headphone`, `sound-box` |
| cámaras | `camera` |
| redes | `router` |
| relojes | `smart-watch` |
| periféricos y demás | `accessories-gfa` |

Lo que el scraper **sí** crea en tiempo de ejecución, porque es suyo y no
existe en la app:

- **Los retailers como `shops`** (Alkosto, Éxito, Falabella, CompuLago,
  CompuWorking, Tauret). Los inserta sin `owner_id`, así que toman el
  `DEFAULT 1` (`store_owner@demo.com`).
- **Las marcas como `manufacturers`**. Las 14 del mock son casi todas
  editoriales de libros; no hay ninguna marca de tecnología real.
- **Las filas de `category_product`**, que el seed deja vacía.

---

## Lo que no está en el esquema

- **Carritos, direcciones y wallets/balances.** Ningún mock JSON los
  respalda. Por eso aprobar un retiro no descuenta saldo y `balance_info`
  es una foto.
- **Variaciones de producto** y **archivos digitales**: los
  `variation_option_id` y `digital_file_id` son enteros sin FK.
- **Métodos e intentos de pago**: los módulos `payment-method` y
  `payment-intent` de la API siguen leyendo JSON del mock.

---

## Decisión pendiente: la moneda

`settings.options.currency` es **`USD` con 2 decimales**, tal como lo trae la
app. Los precios que scrapea el worker son **pesos colombianos sin
decimales**.

Pickbazar asume una única moneda para todo el marketplace, así que hay tres
salidas y ninguna es gratis:

1. **Cambiar el setting a `COP` / `es-CO` / 0 decimales.** Lo más simple,
   pero los 1200 productos del mock (con precios de 2 a 421 USD) se
   mostrarían como si fueran pesos.
2. **Convertir los precios scrapeados a USD** al guardarlos. Coherente con
   el mock, pero introduce una tasa de cambio que hay que mantener.
3. **Moneda por producto.** Lo correcto de verdad, pero se desvía del modelo
   de Pickbazar y obliga a tocar el formateo en el frontend.

Es una decisión de producto, no técnica.

---

## Detalles del generador y casos raros

### Usuarios referenciados por los mocks

Muchos mocks embeben un usuario con el id del Laravel original, que el seed
no tiene: el `6` del mock es `admin@demo.com`, que aquí es el **3**. Por eso
el generador nunca copia esos ids. Usa un helper,
`resolverUsuarioPorEmail`, que recibe cualquier objeto con `email` y
devuelve el id **del seed**.

- **Si el email ya existe**, devuelve su id.
- **Si no existe, lo siembra**: con el id, `name`, `is_active` y fechas del
  snapshot, la contraseña demo y el permiso `customer`, sin perfil. Así
  entran `customer2@demo.com` (4) y `customer3@demo.com` (5), autores de 65
  de las 85 reseñas.
- **Permisos extra**: los 6 owners de `ownership-transfer.json` (42
  `shop@gmail.com`, 45 `demobook@gmail.com`, 48 `mack@gmail.com`, 49
  `jack@gmail.com`, 51 `joel@joelmale.com`, 53 `lamp@gmail.com`) entran
  también con `store_owner`, porque en el mock son dueños de tienda.
- **Falla** si el snapshot no trae email, si su id no es válido o si su id
  ya es de **otro** email. Para los owners, un email que ya existe solo se
  acepta si su id del mock está en la tabla de remapeo (`6 → 3`). Ejemplos
  de salida:

```text
  - reviews 85.user: 'customer2@demo.com' trae el id 3, que ya es de 'admin@demo.com'
  - ownership_transfers 10.previous_owner: 'CUSTOMER@DEMO.COM' (id 48) choca con el usuario 2 del seed
```

La misma trampa aparece en `users.json`: el `pivot.model_id` de los permisos
del admin vale 6. `permission_user` toma el id del usuario iterado, nunca
ese campo.

<details>
<summary>Datos del mock que el generador corrige o reconstruye</summary>

- **Tres shops se reconstruyen.** 190 productos referencian `shop_id` 12, 14
  y 15, que no existen en `shops.json`. Con FK reales esas filas serían
  imposibles. Cada producto embebe su objeto `shop`, así que las tiendas se
  recuperan de ahí, en vez de descartar 190 productos o inventar tiendas.
- **`category_product` queda vacía a propósito.** Ninguno de los 1200
  productos del mock trae categorías, aunque la entidad las declara y el
  buscador filtra por `categories.slug`. En la app original, buscar por
  categoría devuelve cero resultados. No se inventan enlaces.
- **FAQ: `shop_id` se deriva de `issued_by`.** El mock no trae la clave. Las
  14 FAQ de tienda casan por nombre con las tiendas 1-7 (dos cada una). Un
  nombre que no case detiene la generación. Varios slugs terminan en `?` y
  se siembran tal cual (la FAQ se edita por id).
- **Términos: 5 filas de 10.** El mock trae los ids `8,9,10,11,12,1,2,3,4,5`
  y los 1-5 son copias exactas de 8-12. Con `slug` UNIQUE se conserva la
  **primera aparición en el orden del archivo** (8-12), que es la que
  `GET /:slug` devolvía. Una repetición con contenido distinto detiene la
  generación.
- **Atributos con mayúsculas.** Tres slugs del mock (`color-OMG`,
  `size-zLh`, `color-A6u`) se siembran tal cual; los que se crean desde el
  admin salen normalizados. El generador toma el `attribute_id` del padre
  que recorre y se detiene si el campo del hijo no coincide.
- **`abusive_reports.model_type`**: el FQCN de Laravel se guarda en su forma
  corta (`'Review'`).
- **Retiros**: el generador falla si un `status` llega en TitleCase
  (`'Pending'`).
- **Ventas flash**: los productos de cada venta salen de su `products[].id`,
  no del `pivot.flash_sale_id` (en la venta 1 del mock vale 3). El generador
  falla si un producto no existe o no coincide con
  `sale_builder.product_ids`. `products-by-flash-sale.json` no se siembra.

</details>

<details>
<summary>Fechas: qué se siembra y qué toma <code>now()</code></summary>

- **Divergencia conocida en `created_at`/`updated_at`.** En las tablas del
  catálogo (`settings`, `types`, `shops`, `categories`, `manufacturers`,
  `tags`, `products`) y en varias de contenido (`faqs`,
  `terms_and_conditions`, `refund_policies`, `attributes`, `coupons`,
  `authors`…), el seed no inserta esas columnas: toman `now()` del último
  `db-up`, no las fechas del mock. Además, `Date.toJSON()` emite 3 decimales
  donde el JSON de Laravel trae 6. Los timestamps ISO miden lo mismo en
  bytes, así que una comparación por tamaño de respuesta no lo detecta.
- **Sí se siembran las fechas del mock** donde el contrato las emite o
  ordenan la lista: los usuarios sembrados desde otros mocks (los 3 de
  `users.json` toman `now()`), `refund_reasons`, `taxes`, `shippings`,
  `store_notices`, `reviews`, `questions`, `conversations`, `messages`,
  `order_statuses`, `orders`, `order_products`, `order_files`, `withdraws`,
  `flash_sales` y `abusive_reports`.
- **Cupones +5 años.** Los `expire_at` del mock son anteriores a 2025-06;
  sembrados tal cual, las 10 filas salían con `is_valid: false` y `/offers`
  quedaba vacía. El generador suma `DESPLAZAMIENTO_CUPONES_ANIOS` (5) a
  `active_from` y `expire_at`, y conserva duración, ids y orden. La
  constante es fija para que `seed.sql` sea determinista: si el generador
  avisa de que algún cupón ya no está vigente, hay que subirla.
- **Lista de deseos ordenada.** La fila *i* del archivo recibe
  `2024-01-01 + (10 − i)` minutos, así `ORDER BY created_at DESC` reproduce
  el orden del mock: 945, 941, 755, 569, 400, 313, 155, 111, 110, 104.
- **Transferencias**: el mock no trae fechas. El seed las toma del
  `transaction_identifier` (`YYYY-MM-DD-NNNN` → ese día a las 00:00 UTC).
- **Fechas sin zona en UTC.** La conversación 6 trae
  `"2023-03-21 15:00:08"`; el generador la fija en UTC (le añade la `Z`).
  El mock la interpretaba con la zona del proceso Node: en un equipo en
  UTC−5 salía `20:00:08Z`. Lo mismo para `effective_from`/`expired_at` de
  los avisos, que Postgres toma en UTC (la zona de la imagen).

</details>

### Búsqueda por texto: índices trigram

`products_nombre_ilike_trgm_idx` (sobre `products.name`) y
`questions_question_ilike_trgm_idx` (sobre `questions.question`) son GIN con
`gin_trgm_ops`.

- **Van sobre la columna, no sobre `lower(...)`.** Prisma traduce
  `contains` + `mode: 'insensitive'` a `col ILIKE '%x%'`, y un índice de
  expresión solo sirve a consultas con la misma expresión. El trigrama ya
  es insensible a mayúsculas.
- Con menos de 3 caracteres no hay trigramas y el planificador elige
  `Seq Scan`, que es lo correcto.
- Necesitan `pg_trgm` y el `VACUUM ANALYZE` del final de `just db-migrate`
  (ver [Cómo se aplica y se regenera](#cómo-se-aplica-y-se-regenera)).

### La FK diferida de `reviews.order_id`

`reviews` se crea antes que `orders`, así que su FK no cabe en el
`CREATE TABLE`. Se añade después con un bloque idempotente:

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_order_id_fkey') THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;
```

Un `ALTER TABLE` desnudo fallaría la segunda vez que `db-migrate` aplica el
archivo sobre un volumen vivo.

<details>
<summary>Otros datos del seed útiles para probar</summary>

- **Reseñas por rating** (1 a 5): 12 / 4 / 12 / 10 / 47.
- **Preguntas**: el producto 1 tiene 6.
- **Mensajería con el seed**: el admin ve `unseen = 0` en sus dos
  conversaciones; el dueño de la tienda 7 ve 1 en la conversación 1.
- **Avisos**: las 3 filas las creó el admin; los 6 destinatarios sembrados
  son el `users[]` del mock tras resolverlo por email; 3 de las 6 lecturas
  están marcadas como leídas.
- **Cupones**: tienda 1 → 6, tienda 2 → 2, tienda 3 → 2; los 10 aprobados
  y uno (`4OFF`) con `target`.
- **Transferencias**: `previous_owner_id` es el 3 en 4 filas y el 48 y el 53
  en una cada uno; `current_owner_id` es el 51 en 3 filas y el 49, el 45 y
  el 42 en una cada uno.
- **Ventas flash**: `products-by-flash-sale.json` existe en el mock pero no
  se siembra.

</details>
