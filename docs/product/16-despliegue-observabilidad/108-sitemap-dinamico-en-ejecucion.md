# US-108 — Sitemap y robots.txt generados en ejecución, con el dominio real

> El sitemap de la tienda lo genera `next-sitemap` al terminar el build. Por
> eso queda con la URL del momento del build (`http://localhost:3000`), sin un
> solo producto y con páginas privadas. Cada grupo de Sistemas Distribuidos
> despliega la misma imagen en su propio VPS y con su propio dominio: el
> sitemap tiene que salir del dominio con que corre el contenedor, como ya
> pasa con el resto de la configuración desde US-102/103.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-19
**Status:** Listo para ejecución. Promovida desde `_backlog/` el 2026-11-19,
tras la revisión del sub-agente fable 5. El dueño fijó la variable del
dominio (D-2), el contenido (D-3), la paginación (D-6), los `Disallow`
(D-4), no ignorar los archivos viejos (D-7), sin `lastmod` (D-9) y los CA
adicionales.
**Depende de:** US-104 (build sin API) y US-107 (la tienda habla con la API
por `api-lb`). Las dos están cerradas.
**LOC est.:** ~150

## Historia

**Como** responsable del despliegue de la tienda, **quiero** que
`/sitemap.xml` y `/robots.txt` se generen en ejecución con el dominio público
del contenedor y con el catálogo real, **para** que la misma imagen de Docker
Hub sirva un sitemap correcto en el dominio de cada grupo, sin reconstruirla.

## Contexto (verificado el 2026-11-19 sobre `main` @ `bf84a28`)

### Cómo se genera hoy

- `apps/shop/package.json:15`: `"postbuild:rest": "next-sitemap"`, versión
  `4.2.3` (línea 111). Config en `apps/shop/next-sitemap.config.js`. Next es
  `16.4.5`.
- `siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`. El
  Dockerfile de la tienda no define `NEXT_PUBLIC_SITE_URL` (las `ARG` de las
  líneas 46-54 no la incluyen), así que la imagen queda con el respaldo.
- El postbuild corre también al construir la imagen: `Dockerfile:78` ejecuta
  `yarn build:rest` (yarn v1 dispara `postbuild:rest`) y `Dockerfile:97`
  copia `public/` entero al runtime. El comentario de `Dockerfile:67`
  («next build (standalone) + next-sitemap (postbuild)») queda falso tras
  esta US.
- El resultado está **versionado en git**: `apps/shop/public/sitemap.xml`,
  `sitemap-0.xml` y `robots.txt`. El último cambio es `7e80d8e`
  («Regenera el sitemap de la tienda sin las rutas dinámicas (US-104)»). Cada
  build los reescribe y ensucia el árbol.
- El admin no usa `next-sitemap` ni tiene sitemap o robots. Ningún test,
  workflow ni receta del `justfile` depende de esos archivos (`just verify`
  solo pide `/api/settings`, `/en` y `/en/login`).

### Qué sirve la imagen (comprobado dentro de `safari-shop`)

```text
$ docker run --rm --entrypoint sh safari-shop -c 'grep -i sitemap public/robots.txt'
Sitemap: http://localhost:3000/sitemap.xml
```

`robots.txt` declara además `Host: http://localhost:3000`, una directiva no
estándar, y solo 4 `Disallow` (`*/logout`, `*/checkout*`, `*/404`,
`*/profile`).

### Los cuatro problemas

1. **Dominio fijo del build:** `localhost:3000`, que ni siquiera es el puerto
   del stack (`:3003`). En el VPS de cada grupo, todas las URLs apuntan fuera.
2. **Sin contenido dinámico:** `sitemap-0.xml` lista 18 páginas estáticas.
   Faltan los 1199 productos publicados, las tiendas y las páginas por tipo.
   Desde US-104 el build no consulta la API (`getStaticPaths` devuelve
   `paths: []`), así que `next-sitemap` no las ve. Tampoco aparecen `/` ni
   `/become-seller`.
3. **Páginas privadas o de usuario listadas:** `/cards`, `/wishlists`,
   `/notification`, `/verify-email`, `/reports` y `/questions`. La lista
   `exclude` heredada de Pickbazar no las cubre.
4. **Archivos generados en git** (ver arriba).

### Hechos útiles para la solución

- **Locales y forma canónica.** `next-i18next.config.js:22-25` deja
  `locales: ['en']` y `defaultLocale: 'en'` (la imagen se construye con
  `NEXT_PUBLIC_ENABLE_MULTI_LANG=false`, `Dockerfile:47`). La documentación
  de Next incluida en el paquete
  (`apps/node_modules/next/dist/docs/02-pages/02-guides/internationalization.md:89`)
  dice: «The default locale does not have a prefix». `Routes.product` y
  `Routes.shop` (`src/config/routes.ts`) generan `/products/x` y
  `/shops/x`, sin prefijo. **Ojo:** `/en/...` también responde 200 sin
  redirigir (lo usan `just verify` y la tabla de US-105), así que un 200 no
  distingue la forma elegida.
- **`NEXTAUTH_URL`.** La consume next-auth por dentro y vale la URL pública
  de la tienda (`docker-compose.yml:140`: `http://localhost:3003`, fija).
  **Ningún código de la tienda la lee ni la valida:** `src/config/get-env.ts:12`
  solo la declara en el tipo, y el único `getEnv(...)` activo es
  `getEnv('SECRET')` (`src/pages/api/auth/[...nextauth].ts:42`). `getEnv`
  lanza `Cannot find environmental variable: <name>` si falta
  (`get-env.ts:22-25`).
- **Cliente de la API en el servidor.** `src/framework/rest/client/http-client.ts`
  usa `API_INTERNAL_URL` (US-102); si falta, lanza un `HttpError` con código
  `API_INTERNAL_URL_MISSING` (líneas 179-196). Reintenta 3 veces con espera
  de 400 y 800 ms y 15 s de timeout por intento (líneas 12-15). Desde US-107
  apunta a `http://api-lb:9001/api`: con la API caída, el fallo llega como
  502/503 del balanceador, no como `ECONNREFUSED`.
- **Paginación de la API.** El `limit` por defecto efectivo es 30, no 15:
  `main.ts` usa `new ValidationPipe()` sin `transform`, así que el default de
  `pagination-args.dto.ts:4` no se aplica y lo ponen los servicios
  (`products.service.ts:228,236`, `shops.service.ts:191`). No hay tope:
  `products.repository.ts` y `shops.repository.ts` pasan `limit` directo a
  `take`. `/api/types` no pagina.
- **Filtros de «publicado».** El listado de productos filtra por defecto
  `status = publish` y `visibility_public` (`products.repository.ts:205-211`),
  y el cliente ya manda `status: 'publish'` (`client/index.ts:139`); las
  tiendas, `is_active: '1'` (`client/index.ts:248`). En cambio
  `findProductBySlug` **no** filtra por estado (`products.repository.ts:307-309`):
  el producto `draft` del seed responde 200 en su página. Por eso el sitemap
  se arma desde los listados, no desde «responde 200».
- **Seed.** 1200 productos (1199 `publish`, 1 `draft`), 12 tiendas activas y
  10 types. Autores, fabricantes y ventas flash **ya están en Postgres**
  (`authors.service.ts`, `manufacturers.service.ts` y `flash-sale.service.ts`
  importan de `@safari/db`).
- **Peso.** No hay endpoint ligero: `/products` devuelve el DTO completo,
  unos 4 kB por producto según la nota de `home-pages.ssr.ts:149-157`, es
  decir ~5 MB de JSON por petición al sitemap.
- **Inicio y tipos.** El catch-all es `src/pages/[[...pages]].tsx`. Acepta un
  primer segmento que coincida con el slug de un type (los pide con
  `client.types.all`, `home-pages.ssr.ts:43-61`); `/` muestra el type de
  inicio, el mismo contenido que `/<slug de ese type>` (líneas 54-56). Una
  ruta con nombre fijo (`pages/sitemap.xml.tsx`) tiene prioridad sobre el
  catch-all opcional.
- **Regla `public/` contra `pages/`.** Un archivo de `public/` no puede
  llamarse igual que una ruta de `pages/`: el build falla con
  `conflicting-public-file-page` (comprobado en
  `apps/node_modules/next/dist/build/index.js`).
- **Rewrites.** `rewrites()` devuelve `[]` fuera de `next dev`
  (`next.config.js:10-19,41-43`), así que la vía «`pages/api` + rewrite» no
  sirve en la imagen.
- `src/components/seo/seo.tsx:12` arma `og:url` con
  `process.env.NEXT_PUBLIC_SITE_URL`, que tampoco está definida en la imagen.
  Es el mismo problema de fondo, pero esta US no lo toca (ver «NO incluye»).

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Generar en ejecución | `pages/sitemap.xml.tsx` y `pages/robots.txt.tsx`, cada una con `getServerSideProps` que escribe la respuesta (`res.setHeader`, `res.write`, `res.end`) y devuelve `{ props: {} }` con un componente vacío. Se descarta `pages/api` + rewrite (ver «Rewrites»). El ejecutor confirma el patrón en la documentación de Next 16.4.5. Efecto aceptado: con i18n también responden `/en/sitemap.xml` y `/en/robots.txt`. |
| D-2 | Dominio | La URL base sale de `NEXTAUTH_URL` en ejecución, con la `/` final quitada. No se agrega otra variable. La validación es **código nuevo**: si falta, las dos rutas responden 500 con un cuerpo de texto escrito a mano que nombra la variable (lanzar desde `getServerSideProps` daría la página 500 genérica, sin el mensaje), y lo anotan en el log. |
| D-3 | Contenido | Las páginas públicas estáticas (incluye `/`, `/become-seller`, `/offers`, `/help`, `/contact`, `/terms`, `/privacy`, las políticas de reembolso), los productos publicados, `/shops` y `/shops/<slug>` de cada tienda activa, `/<slug>` de cada type **salvo el del inicio** (ya es `/`), y los listados `/authors`, `/manufacturers` y `/flash-sales`. Fuera: las subpáginas de tienda (`contact`, `faqs`, `offers`, `terms`), `/shops/search`, `/<type>/search` y los detalles de autor, fabricante y venta flash. La lista sale de los listados de la API con sus filtros por defecto, no de «la página responde 200». |
| D-4 | Lo que se excluye y `robots.txt` | Del sitemap sale todo lo de la `exclude` actual, más `/cards`, `/wishlists`, `/notification`, `/verify-email`, `/reports`, `/questions` y `/products/preview`. `robots.txt` mantiene los 4 `Disallow` de hoy **y agrega** `/orders`, `/cards`, `/wishlists`, `/notification`, `/reports`, `/questions`, `/downloads`, `/refunds`, `/change-password`, `/verify-email` y `/products/preview`; sin `Host:`, y con `Sitemap: <NEXTAUTH_URL>/sitemap.xml`. |
| D-5 | API caída | Si la API no responde (cualquier `HttpError`, incluido el 502/503 de `api-lb`), `/sitemap.xml` devuelve **503**: ni un 200 vacío ni un 200 parcial. Un buscador reintenta un 503; un sitemap vacío con 200 lo toma como «el sitio ya no tiene páginas». `/robots.txt` no depende de la API y sigue respondiendo. |
| D-6 | Pedir el catálogo y caché | Se pagina con `limit=500` hasta agotar el `total`, con los filtros por defecto de cada listado: sigue funcionando si la API agrega un tope. `Cache-Control: public, max-age=3600` en las dos respuestas. Sin caché en memoria ni en disco (no se agrega estado a las réplicas). CA-2 mide tiempo y tamaño; si el sitemap tarda más de 2 s, se anota y se propone otra US (caché o endpoint ligero), sin aplicarla. |
| D-7 | Fuera `next-sitemap` | Se quitan el `postbuild:rest`, la dependencia (y sus huérfanas del `yarn.lock`), `next-sitemap.config.js` y los tres archivos de `public/`. **No** se ignoran en `.gitignore`: sin `next-sitemap` nadie los regenera, y un residuo ignorado entraría a la imagen y rompería `next build` (R-1) sin verse en `git status`. |
| D-8 | Una sola URL por página | Forma canónica **sin prefijo** (`/products/x`), como documenta Next para la locale por defecto y como generan los enlaces de la tienda. |
| D-9 | Sin `lastmod` | Se omite. Es opcional, y el seed pone `now()` del último `db-up` en `updated_at`: un `lastmod` que no refleja cambios reales perjudica. |

## Scope

**Incluye:**
- `apps/shop/src/pages/sitemap.xml.tsx` y `robots.txt.tsx` y, si hace falta,
  un helper en `src/framework/rest/` para pedir los listados paginados;
- `apps/shop/package.json` y `apps/yarn.lock` (quitar `next-sitemap`, sus
  dependencias huérfanas y el `postbuild:rest`);
- borrar `apps/shop/next-sitemap.config.js` y los tres archivos de `public/`
  (D-7);
- el comentario de `apps/shop/Dockerfile:67`;
- `apps/README.md`: de dónde salen el sitemap y el robots, qué variable
  define el dominio, y corregir la nota de las líneas 653-655 («El sitemap ya
  no lista productos…»).

**NO incluye:**
- `og:url` y `NEXT_PUBLIC_SITE_URL` en `seo.tsx`: es el mismo problema, pero
  va en otra US para no mezclar;
- `rel=canonical` por página (`default-seo.tsx:42` usa un único
  `settings.seo.canonicalUrl`);
- un endpoint ligero de slugs en la API o una caché del sitemap (D-6);
- el admin (no se indexa);
- varios idiomas: hoy la imagen tiene una sola locale;
- sitemaps partidos en índices: el catálogo está lejos del límite de 50 000
  URLs por archivo;
- enviar el sitemap a buscadores.

## Criterios de aceptación

- **CA-0 — Línea base.** Pegar `/sitemap.xml`, `/sitemap-0.xml` y
  `/robots.txt` tal como los sirve hoy el stack (`localhost:3003`).
- **CA-1 — Dominio en ejecución.** Con el stack arriba,
  `curl localhost:3003/sitemap.xml` y `/robots.txt` usan
  `http://localhost:3003`. Se cambia `NEXTAUTH_URL` a
  `https://tienda-b.example/` (con barra final) **sin reconstruir**, con un
  archivo override de compose en el scratchpad
  (`docker compose -f docker-compose.yml -f <override> up -d shop`), y las
  dos respuestas pasan a `https://tienda-b.example`, sin `//`. Después se
  restaura.
- **CA-2 — Contenido.** El número de URLs de producto es igual al `total` de
  `/api/products` con los filtros por defecto (1199 con el seed). Están las
  12 tiendas, los types salvo el de inicio y los listados de D-3. No aparece
  ninguna URL excluida en D-4 ni con prefijo `/en`: `grep` en 0. Se pegan el
  tiempo de respuesta y el tamaño.
- **CA-3 — XML válido.** Un parser de Node comprueba la raíz `urlset`, el
  namespace `http://www.sitemaps.org/schemas/sitemap/0.9`, que cada `loc` sea
  absoluta y empiece por el dominio esperado, y **0 duplicados**.
- **CA-4 — URLs reales.** 30 URLs al azar del sitemap, más todas las
  estáticas: todas responden 200 en `localhost:3003`, sin seguir
  redirecciones.
- **CA-5 — API caída.** Con todas las réplicas de la API detenidas:
  `/sitemap.xml` da 503 y `/robots.txt` da 200. Se pega cuánto tarda el 503.
  Al volver la API, el sitemap vuelve a dar 200.
- **CA-6 — Sin artefactos.** `just build-shop` deja `git status` sin
  archivos de sitemap ni robots. La imagen no contiene
  `public/sitemap*.xml` ni `public/robots.txt`.
- **CA-7 — Cabeceras y rutas viejas (en la imagen).** `/sitemap.xml` responde
  `Content-Type: application/xml` y `/robots.txt`, `text/plain`; las dos con
  `Cache-Control: public, max-age=3600`. `/sitemap-0.xml` da 404.
- **CA-8 — Variable ausente.** Con `NEXTAUTH_URL` vacía (override), las dos
  rutas dan 500 y el cuerpo nombra la variable. Después se restaura.
- **CA-9 — Sin regresión.** La tabla de regresión de US-105 (CA-3, CA-4 y
  CA-6) da lo mismo que antes. `just check-full` en verde.

## Definición de Done

- [ ] CA-0 a CA-9 verificados, con la salida real pegada en «Resultado».
- [ ] `apps/README.md` actualizado.
- [ ] Status en `Implementado` y fila del épico marcada.

## Riesgos

- **R-1 — Conflicto `public/` contra `pages/`.** Si queda un archivo de
  `public/` con el mismo nombre que una ruta, el build falla. Se borran en el
  mismo cambio (D-7) y no se ignoran.
- **R-2 — Catch-all `[[...pages]]`.** Una ruta fija tiene prioridad sobre el
  catch-all opcional; CA-1 y CA-7 lo comprueban (un `/sitemap.xml` que cae
  en el catch-all daría 404 o HTML).
- **R-3 — Costo por petición.** ~5 MB de JSON y 3 llamadas a `/products` por
  cada `/sitemap.xml`, sin caché en servidor y multiplicado por réplicas. Se
  mide en CA-2 (D-6).
- **R-4 — Locale canónica.** `/en/...` también da 200, así que CA-4 no
  detecta una mala elección: lo vigila el `grep` de `/en` en CA-2.
- **R-5 — API colgada.** Con los reintentos y el timeout del cliente, un 503
  puede tardar decenas de segundos si la API no responde en vez de fallar
  rápido. CA-5 lo mide; si es inaceptable, se anota sin cambiar el cliente
  compartido.
- **R-6 — `yarn.lock` y caché de BuildKit.** Quitar `next-sitemap` cambia el
  lock, y la etapa `deps` vuelve a instalar en frío (~3.5 min medidos en
  US-105) en la tienda **y en el admin**, que comparten esa etapa.

## Notas para el agente ejecutor

- Leer antes US-102/103 (configuración en ejecución), US-104 (build sin API),
  US-105 (imagen standalone y su tabla de regresión) y US-107 (`api-lb`).
- Verificar en la documentación de Next 16.4.5 el patrón de D-1 antes de
  implementar.
- Las decisiones son del dueño. Si una choca con el código o con la
  documentación, **detente y pregunta**.
- Detrás de Zscaler, construir con el secreto `extra_ca`, como
  `just stack-up`.
- `Cache-Control` solo se puede comprobar en la imagen: en `next dev`, Next
  sobrescribe la cabecera.
