# US-93 — `authors` y `top-authors` desde Postgres

> Las 6 rutas de autores dejan de servir `authors.json`: una tabla
> `authors` sembrada con los 11 autores del mock, con escrituras que
> persisten y aprobación real desde el admin.

**Épico:** [Épico 92](./README.md)
**Fecha:** 2026-11-17
**Status:** Listo para ejecución
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
| `socials` | `jsonb NOT NULL DEFAULT '[]'` | |
| `image`, `cover_image` | `jsonb` | precedente `manufacturers.image` |
| `products_count` | `integer NOT NULL DEFAULT 0 CHECK (>= 0)` | DA-4 (a): dato sembrado |
| `is_approved` | `boolean NOT NULL DEFAULT true` | se emite como `1`/`0` |
| `language` | `text NOT NULL DEFAULT 'en'` | |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | no se emiten (el mock no los trae) |

Sin `shop_id`: el mock no lo tiene y el autor es global del catálogo. El
`shop_id` que envía el admin se ignora. Sin triggers (D-7).

## Reglas del seed

1. 11 filas, ids preservados, `is_approved` de `1`/`0` a booleano.
2. `born`/`death` tal cual; `socials`, `image` y `cover_image` como `jsonb`.
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

- [ ] Línea base (7 `curl`) con sus bytes.
- [ ] Generador y `just db-reset`; `psql` con los conteos.
- [ ] `prisma validate` y `migrate diff` con `EXIT=0`; `just db-build`.
- [ ] `just db-check`, `npx vitest run` y `npx tsc --noEmit` con sus recuentos.
- [ ] `just build-api`, `just build-shop` y `just verify`.
- [ ] Byte a byte de CA-2; antes y después de cada divergencia.
- [ ] `curl` y `psql` de CA-4.
- [ ] `grep` sin import de `authors.json`.
- [ ] Status de la US y fila del épico.
