# US-93 — `authors` y `top-authors` desde Postgres

> Las 6 rutas de autores dejan de servir `authors.json`: una tabla
> `authors` sembrada con los 11 autores del mock, con escrituras que
> persisten y aprobación real desde el admin.

**Épico:** [Épico 92](./README.md)
**Fecha:** 2026-11-17
**Status:** Implementada (2026-11-17, rama `us-93-authors`)
**Depende de:** ninguna
**LOC est.:** ~700

## Historia

**Como** admin que da de alta y aprueba autores, **quiero** que vivan en
Postgres, **para** que crearlos, editarlos, aprobarlos y borrarlos persista,
y que el shop muestre lo mismo que el admin.

## Contexto — verificado en código (2026-11-17)

**Rutas** (`apps/api/rest/src/authors/authors.controller.ts`):

| Ruta | Guard | Hoy (`authors.service.ts`) |
|---|---|---|
| `POST /authors` | `ADMIN_OWNER_AND_STAFF` | devuelve `authors[0]` |
| `GET /authors` | `@Public()` | paginador; `limit` por defecto 30; Fuse sobre `name`/`slug` con el **último** token de `search`; `url` `/authors?search=${search}&limit=${limit}` |
| `GET /authors/:slug` | `@Public()` | `find` por slug; 200 vacío si no existe |
| `PUT /authors/:id` | `ADMIN_OWNER_AND_STAFF` | solo cambia `is_approved` (`?? true`) **en memoria** y devuelve el autor |
| `DELETE /authors/:id` | `ADMIN_OWNER_AND_STAFF` | string `This action removes a #id product` |
| `GET /top-authors` | `@Public()` (clase) | `slice(0, limit)`, `limit` por defecto 10, sin paginador |

**Qué envían los frontends:**

- shop (`framework/rest/client/index.ts:282-303`): `GET /authors` con
  `searchJoin=and&search=name:X`; `GET /top-authors` con
  `search=type:X` (la API lo ignora); `GET /authors/:slug` con `language`.
  `framework/rest/author.ssr.ts` prerenderiza `/authors/[author]` con
  `GET /authors?limit=100`.
- admin (`data/client/author.ts`): `paginated` con
  `search=type:…;name:…;is_approved:…`. El formulario
  (`components/author/author-form.tsx`) envía `name`, `bio`, `quote`,
  `born`, `death`, `languages`, `socials: [{icon, url}]`, `image`,
  `cover_image` (el mismo objeto que `image`), `language` y `shop_id`.
  La lista (`author-list.tsx`) aprueba con `PUT {id, is_approved}`.

**Forma de `authors.json`** (`node -e`):

- 11 filas en orden **id DESC**: 12, 11 … 2. Slugs únicos, en minúscula.
- Claves en este orden: `id, name, language, is_approved,
  translated_languages, slug, bio, quote, products_count, born, death,
  languages, socials, image, cover_image`. Mismo orden en las 11.
- `is_approved` es **número** (`1` en las 11). `products_count` es número
  (4 a 9). `born` es cadena ISO con 3 decimales (`1965-06-21T18:00:00.000Z`);
  `death` es `null` en las 11. `languages` es una **cadena** (`"English"` o
  `"English, Russian"`). `socials` es `[]` en las 11. `image` y
  `cover_image` son `{id, original, thumbnail}`.
- Sin `created_at`/`updated_at`, sin `shop_id`.

**Productos del autor:** `products.json` no trae `author_id` en ninguna de
sus 1200 filas, y `products` no tiene esa columna. La rejilla «libros del
autor» del shop filtra por `author.slug`, que `products.service.ts` ignora
(muestra todos los productos). Sigue igual (DA-3 del épico).

## Línea base (paso 2 del protocolo)

API mock recién arrancada:

```bash
B=http://localhost:9001/api
curl -s "$B/authors" > authors-all.json
curl -s "$B/authors?limit=100" > authors-100.json
curl -s "$B/authors?searchJoin=and&search=name:kaity" > authors-search.json
curl -s "$B/authors?page=2&limit=5" > authors-p2.json
curl -s "$B/authors/kaity-lerry" > author-slug.json
curl -s "$B/top-authors?limit=5" > top-authors-5.json
curl -s "$B/top-authors" > top-authors.json
```

## Tabla nueva

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigserial` PK | ids del mock preservados |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL UNIQUE` | |
| `bio`, `quote` | `text` | |
| `born`, `death` | `timestamptz` | `Date.toJSON()` da los mismos 3 decimales que el mock |
| `languages` | `text` | cadena libre, como el mock |
| `socials` | `json NOT NULL DEFAULT '[]'` | `json` y no `jsonb`: `jsonb` reordena las claves y el orden es contrato (precedente `ownership_transfers`) |
| `image`, `cover_image` | `json` | ídem |
| `products_count` | `integer NOT NULL DEFAULT 0 CHECK (>= 0)` | DA-4 (a): dato sembrado |
| `is_approved` | `boolean NOT NULL DEFAULT true` | se emite como `1`/`0` |
| `language` | `text NOT NULL DEFAULT 'es'` | el default del resto de tablas; el seed y el admin envían `en` |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | no se emiten (el mock no los trae) |

Sin `shop_id`: el mock no lo tiene y el autor es global del catálogo. El
`shop_id` que envía el admin se ignora. Sin triggers (D-7).

## Reglas del seed

1. 11 filas, ids preservados, `is_approved` de `1`/`0` a booleano.
2. `born`/`death` tal cual; `socials`, `image` y `cover_image` como `json`.
3. El generador falla si un slug se repite o si falta `name`.
4. `setval` de la secuencia. Conteo esperado: `authors` 11. Los previos no
   cambian.

## Rutas — hoy → después

| Ruta | Después |
|---|---|
| `GET /authors` | paginador con el mismo `url` y las mismas rarezas (D-1). Orden `id DESC`. `search`: `name:X` aplica ILIKE sobre `name` (y `slug`), `is_approved:1/0` filtra; `type:` se ignora. `limit` por defecto 30 |
| `GET /authors/:slug` | por slug; **404** si no existe |
| `GET /top-authors` | los `limit` primeros (defecto 10) en orden `products_count DESC, id DESC`, sin paginador |
| `POST /authors` | crea y devuelve la fila; `slug` con `generateSlug(name)` (o el enviado); 201 |
| `PUT /authors/:id` | actualiza los campos enviados, incluido `is_approved`; `updatedAt: now()`; 404 si no existe |
| `DELETE /authors/:id` | borra y devuelve la fila borrada; 404 si no existe |

**Proyección:** orden de claves del mock; `translated_languages: ['en']`
constante (D-6); `is_approved` como `1`/`0`; `products_count` como número;
`born`/`death` como ISO o `null`.

## Divergencias declaradas

| # | Dónde | Hoy | Después | Por qué |
|---|---|---|---|---|
| V-1 | `GET /authors?search=name:X` | Fuse difuso con el último token | ILIKE real, combinando los tokens con AND | D-1 |
| V-2 | slug o id inexistente | 200 vacío o 500 | 404 | precedente `tags` |
| V-3 | escrituras | fila 0, cambio en memoria o string | persisten y devuelven la fila real | D-1 |
| V-4 | `GET /top-authors` | primeros del array (id DESC) | por `products_count DESC` | «top» con el único dato disponible; el orden cambia, el conjunto de claves no |

## Scope

**Incluye:** DDL, bloque del generador, seed regenerado, re-introspección,
`AuthorRecord`, `authors.repository.ts` con su integration test, el barrel,
el servicio Nest sin import de JSON con su spec, y la documentación
(`db/README.md`, `packages/db/README.md`).

**NO incluye:**

- `products.author_id` ni la rejilla «libros del autor» (DA-3);
- calcular `products_count` (DA-4);
- `shop_id` en el autor;
- frontend.

## Criterios de aceptación

### CA-1 — Esquema y seed

La tabla está en `db/schema.sql` en el estilo del archivo; `psql` da 11
filas y los conteos previos intactos.

### CA-2 — Equivalencia

`GET /authors`, `?limit=100`, `?page=2&limit=5` y `/authors/kaity-lerry`
son **byte a byte** iguales a la línea base (mismo orden de filas y de
claves, mismos tipos).

### CA-3 — Divergencias

V-1, V-2 y V-4 con el antes y el después pegados.

### CA-4 — Escrituras

Con Bearer de `admin@demo.com` y status exacto: crear (201), aprobar y
desaprobar con `PUT {is_approved}` (verificado por `psql`), editar y borrar
(200 y luego 404). Sin token: 401.

### CA-5 — Sin import huérfano ni regresión

`grep` sin `authors.json` en `apps/api/rest/src` (fuera de
`db/pickbazar/`). `just db-check`, `npx vitest run`, `npx tsc --noEmit`,
`just build-api`, `just build-shop` (prerender de `/authors/[author]`) y
`just verify` en verde.

## Escenarios Gherkin

```gherkin
Feature: Autores desde Postgres
  Scenario: CA-2 — el listado no cambia
    Given la linea base de GET /authors del mock recien arrancado
    When se consulta contra Postgres
    Then el cuerpo es byte a byte identico

  Scenario: CA-4 — aprobar persiste
    Given el autor 12 aprobado
    When PUT /authors/12 con is_approved false y token de admin
    Then authors.is_approved es false en la base
    And GET /authors/kaity-lerry devuelve is_approved 0
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `db/schema.sql` | tabla `authors` |
| `db/generate-seed.mjs`, `db/seed.sql` | bloque; regenerado |
| `db/README.md` | modelo |
| `packages/db/prisma/schema.prisma` | modelo `Author` + renombres de todos |
| `packages/db/src/records.ts` | `AuthorRecord` |
| `packages/db/src/repositories/authors.repository.ts` (+ `.integration.test.ts`) | `listAuthors`, `listTopAuthors`, `findAuthorBySlug`, `createAuthor`, `updateAuthor`, `deleteAuthor` |
| `packages/db/index.ts`, `packages/db/README.md` | exports y documentación |
| `apps/api/rest/src/authors/authors.service.ts` (+ `.spec.ts`) | Postgres |

## Definición de Done

Seguir el protocolo del épico y pegar:

- [x] Línea base (7 `curl`) con sus bytes.
- [x] Generador y `just db-reset`; `psql` con los conteos.
- [x] `prisma validate` y `migrate diff` con `EXIT=0`; `just db-build`.
- [x] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [x] `just build-api`, `just build-shop` y `just verify`.
- [x] Byte a byte de CA-2; antes y después de cada divergencia.
- [x] `curl` y `psql` de CA-4.
- [x] `grep` sin import de `authors.json`.
- [x] Status de la US y fila del épico.

## Resultado — ejecutado el 2026-11-17

Rama `us-93-authors`, desde `main` @ `37d5120`. Las 6 rutas de autores leen
y escriben Postgres; `authors.json` ya no se importa en ningún servicio.

### Cambios respecto al refinamiento

- `socials`, `image` y `cover_image` van en **`json`**, no en `jsonb`: el
  esquema ya fija que `jsonb` reordena las claves y que el orden es contrato
  (precedente `ownership_transfers`). Con `jsonb`, unas `socials`
  `{icon, url}` del admin se guardarían como `{url, icon}`.
- `language` toma el default del resto de tablas (`'es'`); el seed y el
  admin envían `en`.
- `CreateAuthorDto` declaraba lo contrario de lo que envía el admin (omitía
  `name`, `bio`, `slug`…). Ahora omite solo lo que fija la API, y
  `Author.socials` pasa a ser un array, que es lo que traen los datos.

### Línea base (API mock recién arrancada)

```
authors-all.json      14983 B  11 autores, ids 12..2, total 11, per_page 30
authors-100.json      14988 B
authors-p2.json        7111 B  ids 7,6,5,4,3, per_page "5"
authors-search.json    1646 B  id 12
author-slug.json       1328 B
author-404 (no-existe)    0 B  200 vacío
top-authors-5.json     6660 B  ids 12,11,10,9,8
top-authors.json      13329 B
```

### Seed y esquema

```
just db-seed-generate → ... · 6 ownership_transfers · 11 authors
just db-reset          → esquema y datos de referencia aplicados

 authors | aprobados | products_count
      11 |        11 |             67
 products 1200 · shops 12 · ownership_transfers 6 · orders 40 · attributes 8
```

`git diff db/seed.sql`: 22 líneas añadidas y solo cambia la línea de conteos
de la cabecera. `npx prisma validate` → válido; `npx prisma migrate diff
--from-config-datasource --to-schema ./prisma/schema.prisma --exit-code` →
`No difference detected.`, `EXIT=0`. `just db-build` en verde.

### Tests

```
just db-check (typecheck + vitest)      Test Files 33 passed · Tests 427 passed
  authors.integration.test.ts            15 passed
npx vitest run (API)                     Test Files 35 passed · Tests 579 passed
  authors.service.spec.ts                14 passed
npx tsc --noEmit -p tsconfig.json        exit 0
npx eslint src/authors                   0 problemas
```

La API pasa de 34 archivos y 565 tests a 35 y 579.

### CA-2 — Equivalencia ✅

```
IGUAL  authors-all (14983 B)
IGUAL  authors-100 (14988 B)
IGUAL  authors-p2 (7111 B)
IGUAL  author-slug (1328 B)
IGUAL  authors-search (1646 B)
```

Comparación con `cmp`: byte a byte, mismo orden de filas y de claves.

### CA-3 — Divergencias ✅

- **V-1**, búsqueda. El «antes» se reproduce con la misma configuración de
  Fuse del mock (`keys: ['name','slug'], threshold: 0.3`):

  ```
  search=name:kely     antes: 9:kelly-white 6:kelton-benjamin   después: (vacío), total 0
  search=name:Wickham  antes: 8:jenifer-wickham                 después: 8:jenifer-wickham, total 1
  ```

  La búsqueda difusa se pierde: `kely` ya no encuentra `kelly-white`.
- **V-2**: `GET /authors/no-existe` pasa de 200 vacío a
  `404 {"message":"No existe un autor con slug `no-existe`.",...}`.
- **V-4**: `top-authors?limit=5` pasa de `12(5) 11(6) 10(9) 9(7) 8(7)` a
  `10(9) 4(8) 9(7) 8(7) 11(6)` (id y `products_count`), con las mismas claves.

### CA-4 — Escrituras ✅

Bearer de `admin@demo.com`:

```
POST /authors sin token                         401
POST /authors (formulario completo, shop_id 1)  201  slug zz-us93-autora-nueva, born 1990-05-01T00:00:00.000Z
  psql: is_approved t · socials [{"icon":"FacebookIcon","url":"https://example.com"}]
PUT {id, is_approved:false} (lista del admin)    200  psql f · GET is_approved 0
PUT {name, quote}                                200  psql: nombre y cita nuevos, slug igual, updated_at > created_at
PUT {born:"no-es-fecha"}                         400  `born` no es una fecha válida.
PUT /authors/999999 · DELETE /authors/999999     404 · 404
DELETE /authors/23                               200  (devuelve el autor) → GET 404 · count 11
```

### CA-5 — Sin import huérfano ni regresión ✅

Imports de JSON que quedan en `apps/api/rest/src` (fuera de los specs):

```
./flash-sale/flash-sale.service.ts
./orders/orders.service.ts
./payment-intent/payment-intent.service.ts
./payment-method/payment-method.service.ts
./payment/stripe-payment.service.ts
```

`authors.json` solo aparece ya en un comentario de `authors.service.ts`.

- `just build-api` → `Done`.
- `just build-shop` → exit 0, 279/279 páginas; se generan las 11
  `/en/authors/*`. El primer intento terminó la generación, pero Next
  16.4.1 cortó el proceso con exit 1 por un aviso de seguridad sobre la
  versión instalada; el segundo pasó. No se actualizó nada.
- El shop sirve `/en/authors` (90 775 B, con los nombres) y los detalles
  `kaity-lerry` y `jenifer-wickham` (200).

```
just verify
OK   API    :9001/api/settings  200  5503B
OK   Shop   :3003/en  200  192797B  cards:30
OK   Admin  :3002/en/login  200  73158B  cards:1
```

### Para el dueño

- **Next 16.4.1 avisa de una vulnerabilidad conocida** al terminar
  `next build`. Merece una US propia en el Épico 75.
- La rejilla «libros del autor» del shop sigue mostrando todos los
  productos: `products` no tiene `author_id` (DA-3).
