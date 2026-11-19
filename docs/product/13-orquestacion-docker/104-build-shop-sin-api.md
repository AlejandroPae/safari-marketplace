# US-104 — `next build` de la tienda sin la API viva

> Hoy `just build-shop` muere con `ECONNREFUSED` si la API no está arriba: la
> tienda prerenderiza páginas pidiéndole datos a la API durante `next build`.
> Eso impide construir la imagen Docker en un pipeline o en Dokploy, donde no
> hay API a la que llamar, y deja los datos del entorno de build congelados en
> la imagen. Esta US hace que el build no dependa de la API y que los datos se
> generen en ejecución. De paso corrige un fallo de resiliencia: hoy un error
> pasajero de la API puede dejar un producto o una tienda en 404.

**Épico:** [Épico 13](./README.md). Es la «otra US» que menciona el R-2 de
[US-102](./102-urls-configurables-en-ejecucion.md), y la Fase 1 de la
estabilización previa al laboratorio de Sistemas Distribuidos.
**Fecha:** 2026-11-18
**Status:** Implementado (2026-11-19). Promovida desde `_backlog/` el
2026-11-18, tras la revisión del sub-agente fable 5; el dueño fijó D-7, D-8 y
R-5, y DA-9 (abajo) al ejecutarla.
**Depende de:** [US-102](./102-urls-configurables-en-ejecucion.md). Las dos
tocan `apps/README.md` (§ «Notas para el despliegue en nube») y el `justfile`,
y esta US comprueba que el build pasa también sin `API_INTERNAL_URL`. No va
en paralelo con US-103, por los mismos archivos.
**Bloquea a:** US-15 (compose) y a cualquier Dockerfile de la tienda.
**LOC est.:** ~250

## Historia

**Como** responsable del despliegue, **quiero** que `next build` de la tienda
termine sin la API levantada, **para** construir la imagen en un pipeline o en
Dokploy y que los datos se lean del entorno donde corre, no del entorno donde
se compiló.

## Contexto (verificado en el código el 2026-11-18, `main` @ `6ff0700`)

**Qué llama a la API en el build.** En `apps/shop/src/framework/rest/`:

| Archivo | `getStaticPaths` | `revalidate` | Qué pide a la API en el build |
|---|---|---|---|
| `home-pages.ssr.ts` | sí: `client.types.all({ limit: 100 })` (`:30`) + raíz | 120 | settings, types (`fetchQuery`, `:53`), y por tipo sus datos |
| `product.ssr.ts` | sí: `client.products.all({ limit: 100 })` (`:18`) | 60 | settings + producto |
| `shop.ssr.ts` | sí: `client.shops.all({ limit: 100, is_active: 1 })` (`:19`) | 60 | settings + tienda + productos |
| `author.ssr.ts`, `manufacturer.ssr.ts` | sí | 60 | el recurso del path |
| `flash-sale.ssr.ts` | sí | 60 | **nada**: su `getStaticProps` (`:40-59`) solo carga traducciones |
| `notify-logs.ssr.ts`, `become-seller.ts` | no | 60 | settings y lo suyo |
| `refund-policies.ssr.ts`, `getVendorStaticProps` | no | 10 (`:59`) | settings y políticas |
| `refund-policies.ssr.ts`, `getCustomerStaticProps` (`:9-35`) | no | **ninguno** | settings y políticas |
| `general.ssr.ts`, `authors-page.ssr.ts`, `coupon.ssr.ts`, `manufacturers-page.ssr.ts`, `shops-page.ssr.ts`, `faq-ssr.ts`, `terms-and-conditions-ssr.ts` | no | **ninguno** | settings y types como mínimo |
| `order.ssr.ts`, `search.ssr.ts` | — | — | `getServerSideProps`: solo corren en ejecución; fuera de alcance |

Las 8 filas sin `revalidate` (refund-policies customer y las 7 de la
penúltima fila) quedan congeladas para siempre con los datos del build.

- **Por qué muere hoy el build.**
  - `prefetchQuery` y `prefetchInfiniteQuery` de TanStack **nunca lanzan**, y
    `dehydrate` omite las queries fallidas. Las páginas sin `getStaticPaths`
    ya toleran la API caída, pero en silencio.
  - Lo que rompe el build son solo **los 6 `getStaticPaths`** y el
    **`fetchQuery` de types en `home-pages.ssr.ts:53`**, que sí lanzan.
- **`src/pages/404.tsx` y `src/pages/privacy.tsx`** tienen su propio
  `getStaticProps`, pero no llaman a `client.*` (solo traducciones).
  `products/preview/[slug].tsx` reutiliza `product.ssr`.
- **`fallback: 'blocking'` ya está** en los 6 `getStaticPaths`. Con
  `paths: []`, cada página dinámica se genera en su primera visita.
- **El cliente ya busca lo que falta.** `useSettings()`
  (`framework/rest/settings.ts:15`) y los demás hooks son `useQuery`: si el
  `dehydratedState` llega vacío, el navegador pide los datos al montar. El
  prefetch del servidor es una optimización, no un requisito.
- **El fallo de resiliencia.** `product.ssr.ts:54-57`, `shop.ssr.ts:70-73`,
  `author.ssr.ts:58-62` y `manufacturer.ssr.ts:62-66` capturan **cualquier**
  error (API caída, timeout, 500) y devuelven `notFound: true` **sin
  `revalidate`**. Un error pasajero se confunde con «no existe», y ese 404
  queda en caché para siempre (R-3).
- **El inicio, `home-pages.ssr.ts`:** si la API falla, lanza (`fetchQuery`,
  `:53`). El `notFound` de `:71-76` solo ocurre con respuesta 200 y un tipo
  que no está. En ejecución ya se comporta bien: 500 en la primera visita, y
  la página anterior durante una regeneración fallida. **Solo le aplica
  D-1.**
- **`become-seller.ts:11-45`** usa `fetchQuery` dentro de un `try`. Con la
  API caída en el build, hoy hornea **un 404 sin `revalidate`** y el build
  pasa en verde. No hay hook de cliente que lo rescate: la página necesita
  `data` del servidor.
- **`client/http-client.ts`** reintenta 3 veces (400 y 800 ms, `:12-15`) y
  lanza `HttpError` con `status` y `code` (`:45-81`). La API responde 404
  real en los cuatro recursos:
  - `products.service.ts:271`;
  - `shops.service.ts:309`;
  - `authors.service.ts:170`;
  - `manufacturers.service.ts:152`.

  Con `HttpError.status === 404` se distingue «no existe» de «la API falló»,
  importándolo **sin editar** `http-client.ts` (es de US-102).
- **`notify-logs.ssr.ts:20-32`** tiene un `try/catch` muerto: el prefetch
  nunca lanza.
- **Postbuild:** `"postbuild:rest": "next-sitemap"` (`package.json:15`) lee
  la salida del build. Con `paths: []`, el sitemap ya no lista productos,
  tiendas ni el inicio.
- **El `justfile`:** `build-shop` solo dice «# Solo la tienda»
  (`justfile:150-154`). La advertencia de que la tienda necesita la API está
  en la receta `check`, en `:302-303`, y en `check-full`, en `:366-369`, que
  hoy deja fuera el build de la tienda. `CLAUDE.md` § Comandos lo repite
  («EXIGE LA API ARRIBA» en `just build` y «la tienda no» en
  `just check-full`).
- **Admin:** su `next build` ya pasa con la API caída (medido el 2026-11-18 en
  US-10: 195 s dentro de `just check-full`). Esta US lo vuelve a comprobar
  (CA-2), no lo cambia.

## Decisiones

D-1 a D-6 son la propuesta original, ajustada tras la revisión. D-7, D-8 y R-5
los fijó el dueño el 2026-11-18.

| # | Tema | Decisión |
|---|------|----------|
| D-1 | `getStaticPaths` | Los 6 devuelven **`paths: []`**, **sin la raíz** del inicio, con `fallback: 'blocking'`. `[[...pages]]` genera `/en` en la primera visita; con la raíz, el build moriría en `home-pages.ssr.ts:53`. Nada dinámico se prerenderiza en el build. |
| D-2 | `getStaticProps` estáticos | Tras los prefetch, un **helper** lee del `queryClient` las queries en estado `error` y escribe **un `console.warn` por query fallida** con la página y la query. Si el error es un `HttpError` (red, timeout, 5xx, 4xx), la página se genera sin esos datos: el cliente los pide al montar. Si **no** es `HttpError` (un bug de código), se relanza. Nada de detectar la «fase de build»: la misma tolerancia sirve en ejecución. |
| D-3 | Páginas sin `revalidate` | Las **8** de la tabla pasan a **`revalidate: 60`**, como el resto, para que se regeneren con datos reales. |
| D-4 | Distinguir «no existe» de «la API falló» | En `product`, `shop`, `author` y `manufacturer`: `notFound: true` **solo** si `error instanceof HttpError && error.status === 404`, o si la API responde bien y el recurso no está. Ante red caída, timeout o 5xx, **se lanza el error**: Next no cachea esa respuesta y sigue sirviendo la última página buena (R-3). `HttpError` se importa de `client/http-client.ts` sin editarlo. No aplica a flash-sale (no llama a la API) ni al inicio (ya lanza). |
| D-5 | Sitemap | Se acepta que el sitemap pierda las URLs dinámicas y el inicio: no hay SEO en juego en un repo didáctico. Se documenta en `apps/README.md`. |
| D-6 | Helper común | **Obligatorio** (lo usa D-2 en ~10 archivos). Va en `framework/rest/`, por ejemplo `warnFailedQueries(queryClient, pagina)`. |
| D-7 | `become-seller` | Ante un fallo que no sea 404: **`notFound: true` con `revalidate: 10`**. Es la excepción a D-4: lanzar mataría el build, y D-2 prohíbe detectar la fase. Coste aceptado: si la API cae en ejecución durante una regeneración, la página buena se sustituye por un 404 hasta ~10 s después de que vuelva la API. |
| D-8 | Guardián de la regresión | `check-full: check build-api build-admin build-shop`. Se actualizan los comentarios de `justfile:302-303` y `:366-369`, su `[doc]` y la línea de `just check-full` en `CLAUDE.md`. |

## Scope

**Incluye:**

- los `*.ssr.ts` y `become-seller.ts` de `apps/shop/src/framework/rest/`
  (D-1 a D-4, D-6 y D-7), y el helper de D-6;
- en el `justfile`: `check-full` y sus comentarios (D-8);
- `CLAUDE.md` § Comandos: la nota «EXIGE LA API ARRIBA» de `just build` y la
  línea de `just check-full`;
- `apps/README.md`, § «Notas para el despliegue en nube»: qué se genera en el
  build y qué en ejecución (D-5);
- anotaciones en otras US y en el épico:
  - en US-102, que su CA-9 (`just build-shop` requiere la API) y su R-2
    quedan obsoletos;
  - en US-15, añadir US-104 a «Depende de»;
  - en el Épico 13, marcar la fila de US-104.

**NO incluye:**

- `client/http-client.ts` y las URLs de la API (US-102);
- `order.ssr.ts` y `search.ssr.ts` (ya son `getServerSideProps`);
- Dockerfiles ni compose (US-14, US-15);
- el admin, salvo verificarlo (CA-2);
- la variante GraphQL (US-12);
- cambiar `next-sitemap` para que consulte la API;
- quitar el `try/catch` muerto de `notify-logs.ssr.ts` más allá de lo que
  pida el helper.

## Criterios de aceptación

### CA-1 — El build de la tienda pasa con la API caída
Sin ningún proceso escuchando en el puerto de la API (comprobado con
`just check-ports` o con `curl` → conexión rechazada) y **sin
`API_INTERNAL_URL` definida**, `just build-shop` termina en verde. El log
muestra los warnings de D-2.

### CA-2 — El build del admin pasa con la API caída
En la misma condición, `just build-admin` termina en verde. Si no pasa, se
**detiene y se reporta** con la causa: no se arregla dentro de esta US.

### CA-3 — En ejecución, los datos son los del entorno
Con la build de CA-1, `next start` y la API arriba:

| Página | Esperado |
|---|---|
| `/en` (inicio) | Muestra productos: `just verify` cuenta product-cards > 0 |
| `/en/products/apples` | 200 en la primera visita, con datos |
| `/en/shops/furniture-shop` | 200 en la primera visita, con datos |
| `/en/help` (faq) | Muestra sus datos, sea por el cliente o tras la regeneración |
| `/en/terms` | Ídem |
| `/en/become-seller` | 200 con datos a los ≤10 s de levantar la API (D-7) |

### CA-4 — Un error pasajero no deja un 404
1. Con la API caída, se pide un producto que **nunca** se había generado: la
   respuesta **no** es 404 (el agente documenta cuál es: 500 u otra).
2. Se levanta la API y se pide de nuevo: 200 con datos.
3. Lo mismo con una tienda.

### CA-5 — Lo que no existe sigue siendo 404
`/en/products/no-existe` y `/en/shops/no-existe` responden 404 con la API
arriba.

### CA-6 — La página buena sobrevive a una caída
1. Con la API arriba, se visita un producto (queda generado).
2. Se apaga la API y se espera a que venza el `revalidate`.
3. Se pide **dos veces**. Las dos respuestas sirven la versión anterior, con
   datos: ni un 404 ni un error. La primera petición tras vencer siempre
   sirve la versión anterior; la segunda demuestra que la regeneración
   fallida no la sustituyó.
4. Se pega el error de regeneración del log de `next start`.

### CA-7 — Sin regresión con la API arriba
- `just build-shop` con la API arriba sigue en verde;
- `just verify` en verde;
- `just check` en verde;
- `yarn lint` en 0;
- `npx tsc --noEmit` del shop con el mismo número de errores que la línea
  base medida antes del primer cambio (pegar ambas).

### CA-8 — El gate vigila la regresión
`just check-full` en verde con la API caída: incluye `build-shop` (D-8).

## Escenarios Gherkin

```gherkin
Feature: Build de la tienda independiente de la API

  Scenario: CA-1 — build sin API
    Given ningún proceso escucha en el puerto de la API
    And API_INTERNAL_URL no está definida
    When ejecuto "just build-shop"
    Then el build termina con éxito
    And el log advierte qué páginas se generaron sin datos de servidor

  Scenario: CA-4 — error pasajero en la primera visita
    Given la tienda corre con la build de CA-1 y la API está caída
    When pido "/en/products/apples" por primera vez
    Then la respuesta no es 404
    When levanto la API y pido "/en/products/apples" de nuevo
    Then la respuesta es 200 y muestra el producto

  Scenario: CA-6 — caída después de generar
    Given "/en/products/apples" ya se generó con la API arriba
    And apago la API y vence el revalidate
    When pido "/en/products/apples" dos veces
    Then las dos veces recibo la versión generada antes, con datos
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/shop/src/framework/rest/home-pages.ssr.ts` | D-1 |
| `product.ssr.ts`, `shop.ssr.ts`, `author.ssr.ts`, `manufacturer.ssr.ts` | D-1, D-4 |
| `flash-sale.ssr.ts` | D-1 |
| `general.ssr.ts`, `authors-page.ssr.ts`, `coupon.ssr.ts`, `manufacturers-page.ssr.ts`, `shops-page.ssr.ts`, `faq-ssr.ts`, `terms-and-conditions-ssr.ts`, `refund-policies.ssr.ts` (customer) | D-2, D-3 |
| `notify-logs.ssr.ts`, `refund-policies.ssr.ts` (vendor) | D-2 |
| `become-seller.ts` | D-7 |
| `apps/shop/src/framework/rest/` (helper nuevo) | D-6 |
| `justfile` | `check-full` y sus comentarios (D-8) |
| `CLAUDE.md`, `apps/README.md` | Notas del build actualizadas |
| `102-urls-configurables-en-ejecucion.md`, `15-compose-stack-completo.md`, `README.md` del Épico 13 | Anotaciones de Scope |

## Definición de Done

- [x] CA-1 a CA-8 verificados, con la salida real pegada en «Resultado»: logs
  de build, `curl -o /dev/null -w "%{http_code}"`, `just verify`,
  `just check-full`.
- [x] En la evidencia de CA-4 y CA-6, cómo se apagó y levantó la API y cuánto
  se esperó.
- [x] `apps/README.md`, `CLAUDE.md` y el `justfile` actualizados.
- [x] Status de esta US en `Implementado` y fila del Épico 13 marcada.

## Riesgos

- **R-1 — Primera visita más lenta.** Sin prerender, la primera petición de
  cada producto o tienda tras un despliegue se genera en caliente
  (`blocking`). Es aceptable, y la evidencia de CA-3 anota los tiempos.
- **R-2 — HTML inicial vacío en páginas estáticas.** Las páginas de D-2
  construidas sin API salen sin datos hasta la primera regeneración. El
  cliente las completa al montar. Hay que verificar que ninguna **truene**
  con `settings` o `types` en `undefined` en el render del servidor (un
  crash, no solo una página vacía).
- **R-3 — Comportamiento de ISR en Next 16: confirmado.** Según la
  documentación de Next 16.4.5 (Context7), revisada el 2026-11-18:
  - `notFound` sigue el `revalidate`: sin él, queda fijo para siempre;
  - un error lanzado durante una regeneración conserva la última página
    buena y se reintenta en la siguiente petición.

  D-4 se apoya en esto. Si el ejecutor observa otra cosa en CA-4 o CA-6,
  **se detiene y pregunta**.
- **R-4 — Warnings que tapan errores.** El helper de D-2 solo tolera
  `HttpError`; cualquier otro error (un bug de código) se relanza.
- **R-5 — Cascarón vacío tras una regeneración con la API caída (aceptado).**
  Con `revalidate: 60` (D-3), si la API está caída cuando una página de D-2
  se regenera, la página buena se sustituye por una sin datos de servidor.
  Los hooks de cliente piden los datos al hidratar, así que se rellena sola
  cuando la API vuelve.

## Notas para el agente ejecutor

- Leer antes el `CLAUDE.md` raíz, `apps/README.md` y la US-102, para no pisar
  `http-client.ts`.
- Medir la línea base de `tsc` del shop (CA-7) antes de tocar nada.
- Para «API caída» basta con no correr `just api-dev`; no hace falta tocar
  Postgres. Matar la API por la raíz del árbol de procesos: `nest start
  --watch` relanza una API huérfana.
- Las decisiones están fijadas. Si una choca con lo que encuentres en el
  código o en el comportamiento de Next 16, **detente y pregunta**.
- Esta US es la base para que los estudiantes de Sistemas Distribuidos
  construyan la imagen de la tienda en Azure Pipelines y la desplieguen en
  Dokploy. CA-4 y CA-6 son además material de clase sobre resiliencia: dejar
  la evidencia legible.

## Resultado (2026-11-19, rama `feat/us-104-build-sin-api` sobre `main` @ `df89eb1`)

### Decisión tomada al ejecutar (DA-9)

**El problema:** CA-1 pide que el build pase **sin `API_INTERNAL_URL`**, pero
el cliente de US-102 lanzaba un `Error` plano cuando faltaba la variable, y
R-4 manda relanzar todo lo que no sea `HttpError`. Las ~10 páginas sin
`getStaticPaths` habrían matado el build. Arreglarlo exigía tocar
`http-client.ts`, que el «NO incluye» reservaba a US-102 (ya cerrada).

**La decisión del dueño, textual:** «La variable ausente pasa a ser HttpError
(Recomendado)».

**El cambio en `http-client.ts`:**

- el error es `new HttpError(..., { code: 'API_INTERNAL_URL_MISSING' })`;
- el interceptor de respuesta deja pasar un `HttpError` tal cual, antes del
  `axios.isAxiosError`, porque `HttpError` lleva `isAxiosError = true` y
  se confundiría con uno de Axios.

### Qué cambió

| Archivo | Cambio |
|---|---|
| `framework/rest/ssr-resilience.ts` | **Nuevo** (D-6): `warnFailedQueries(queryClient, página)` recorre la caché de queries, avisa con `console.warn` por cada `HttpError` y relanza cualquier otro error (D-2, R-4). `isNotFound(error)` es `error instanceof HttpError && error.status === 404` (D-4) |
| `home-pages.ssr.ts`, `product.ssr.ts`, `shop.ssr.ts`, `author.ssr.ts`, `manufacturer.ssr.ts`, `flash-sale.ssr.ts` | `getStaticPaths` → `{ paths: [], fallback: 'blocking' }`, sin la raíz (D-1). Fuera los imports que quedaron sin uso (`invariant`; `client` y `SHOPS_LIMIT` en flash-sale) |
| `product`, `shop`, `author`, `manufacturer` | `notFound` solo si `isNotFound(error)`; lo demás se lanza (D-4). `warnFailedQueries` antes del `return` |
| `general`, `authors-page`, `coupon`, `manufacturers-page`, `shops-page`, `faq-ssr`, `terms-and-conditions-ssr`, `refund-policies` (customer) | `warnFailedQueries` + `revalidate: 60` (D-2, D-3) |
| `notify-logs`, `refund-policies` (vendor) | `warnFailedQueries` (D-2) |
| `become-seller.ts` | 404 real → `notFound`; otro `HttpError` → aviso y `{ notFound: true, revalidate: 10 }` (D-7); otro error → se relanza |
| `client/http-client.ts` | DA-9 |
| `justfile` | `check-full: check build-api build-admin build-shop`, su `[doc]` y los comentarios de `check` (D-8) |
| `CLAUDE.md` | la línea de `just check-full` y la nota «EXIGE LA API ARRIBA» de `just build` |
| `apps/README.md` | qué se genera en el build y qué en ejecución; sitemap (D-5) |
| `apps/shop/public/sitemap-0.xml` | regenerado por el build: 266 → 18 URLs (D-5). Commit aparte |
| `102-urls-configurables-en-ejecucion.md` | CA-9 y R-2 marcados como obsoletos |

### Línea base (CA-7)

```
antes   (2026-11-18, main):  shop tsc --noEmit -> rc=0
después:                     shop tsc --noEmit -> rc=0
                             shop yarn lint    -> $ eslint src / Done in 99.43s.
```

### CA-1 — El build de la tienda pasa con la API caída

```
$ just check-ports
libre    9001
libre    3003
libre    3002
$ curl http://localhost:9001/api/settings
curl :9001 -> 000 (exit 7)
$ API_INTERNAL_URL= just build-shop
✓ Compiled successfully in 20.0s
✓ Generating static pages using 11 workers (29/29) in 4.4s
Done in 122.34s.
SHOP_EXIT=0
```

Antes generaba 279 páginas; ahora 29, porque las rutas dinámicas ya no se
prerenderizan. Avisos de D-2, 59 en total:

```
    28 [ssr] general
     9 [ssr] shops
     1 [ssr] become-seller
     3 [ssr] authors
     2 [ssr] customer-refund-policies
     2 [ssr] notification
     3 [ssr] manufacturers
     3 [ssr] offers
     3 [ssr] help
     3 [ssr] terms
     2 [ssr] vendor-refund-policies

[ssr] general: sin datos de servidor para ["/settings",{"language":"en"}]: API_INTERNAL_URL is not defined: set it to the API address the server can reach (e.g. http://localhost:9001/api)
[ssr] general: sin datos de servidor para ["/types",{"limit":15,"language":"en"}]: API_INTERNAL_URL is not defined: set it to the API address the server can reach (e.g. http://localhost:9001/api)
[ssr] become-seller: sin datos de servidor, 404 temporal: API_INTERNAL_URL is not defined: set it to the API address the server can reach (e.g. http://localhost:9001/api)
```

### CA-2 — El build del admin pasa con la API caída

Dentro de `just check-full`, con la API caída (CA-8):
`$ next build --webpack … ✓ Generating static pages using 11 workers (77/77) … Done in 188.37s.`

### CA-3 — En ejecución, los datos son los del entorno

El build de CA-1 (sin API) se arranca con `API_INTERNAL_URL=http://localhost:9001/api yarn start -p 3003`
y la API arriba. `probe.sh` pide la ruta y dice si el HTML contiene un texto
sacado de la API:

```
GET /en -> 200 192834B 0.263824s  cards:30
GET /en/products/apples -> 200 112582B 0.309188s  contiene 'Apples'  cards:19          (primera visita)
GET /en/shops/furniture-shop -> 200 179348B 0.188547s  contiene 'Furniture Shop'  cards:30 (primera visita)
GET /en/help  -> 200 26973B  NO contiene 'What is your return policy?'   <- cascarón del build
GET /en/terms -> 200 29682B  NO contiene 'Disclaimers and Limitation'
(12 s después; la primera petición disparó la regeneración)
GET /en/help  -> 200 65449B  contiene 'What is your return policy?'
GET /en/terms -> 200 69378B  contiene 'Disclaimers and Limitation'
```

**`/en/become-seller`** (D-7) se midió dos veces, desde el 404 del build:

- **Primera corrida:** en pasadas cada 12 s, el 404 siguió dos pasadas más y la
  tercera dio 200, entre 24 y 36 s después de la primera petición, con la API
  ya arriba. No se averiguó por qué hizo falta un ciclo más.
- **Corrida controlada:** build nuevo sin API, la tienda arrancada con la API
  ya arriba, sondeo cada 2 s:

  ```
  tienda arriba (API ya arriba) a las 02:26:38
    +1s … +13s  /en/become-seller -> 404
    +15s        /en/become-seller -> 200
  ```

  El 404 del build se sirve hasta que cumple 10 s. La primera petición
  posterior regenera y la siguiente ya ve 200.

Tras una caída **en ejecución** (al final del CA-6), la API vuelve a las
02:24:44:

```
  +0s  /en/become-seller -> 404
  +2s  /en/become-seller -> 200
```

### CA-4 — Un error pasajero no deja un 404

```
--- paso 1: API caída (curl :9001 -> 000), páginas nunca generadas
GET /en/products/apples -> 500 2302B 3.229511s
GET /en/shops/furniture-shop -> 500 2302B 2.482061s
--- paso 2: just api-dev, y las mismas rutas
GET /en/products/apples -> 200 112582B 0.309188s  contiene 'Apples'  cards:19
GET /en/shops/furniture-shop -> 200 179348B 0.188547s  contiene 'Furniture Shop'  cards:30
```

La respuesta con la API caída es **500**. Los ~3 s son los 3 intentos con
backoff del cliente. La API se apagó matando el árbol de `just api-dev` por
su raíz y se levantó con `just api-dev`.

### CA-5 — Lo que no existe sigue siendo 404

```
GET /en/products/no-existe -> 404 26058B 0.060972s
GET /en/shops/no-existe -> 404 26058B 0.048796s
```

### CA-6 — La página buena sobrevive a una caída

`apples` y `furniture-shop` se generaron con la API arriba (CA-4, paso 2).
La API se apagó a las 02:22:38 y se esperaron 65 s, porque `revalidate` es 60:

```
02:23:52
GET /en/products/apples -> 200 112582B 0.036147s  contiene 'Apples'  cards:19
GET /en/shops/furniture-shop -> 200 179348B 0.019313s  contiene 'Furniture Shop'  cards:30
GET /en/products/apples -> 200 112582B 0.025631s  contiene 'Apples'  cards:19
GET /en/shops/furniture-shop -> 200 179348B 0.018391s  contiene 'Furniture Shop'  cards:30
--- errores de regeneración en el log de next start:
 ⨯ Error [HttpError]: GET http://localhost:9001/api/products/apples failed after 3 attempts: ECONNREFUSED — nothing is listening on that address. Is the API running?
 ⨯ Error [HttpError]: GET http://localhost:9001/api/shops/furniture-shop failed after 3 attempts: ECONNREFUSED — nothing is listening on that address. Is the API running?
```

Las dos peticiones sirven la versión anterior con datos. La regeneración
falló, Next conservó la página buena (R-3 confirmado) y lo reintentará.

Mismo apagón, `become-seller`. Es el coste aceptado de D-7: la página buena
se cambia por el 404 temporal.

```
GET /en/become-seller -> 200 110745B  contiene 'Launch your online store'   (la de antes; dispara la regeneración)
GET /en/become-seller -> 404 26058B                                          (12 s después)
[ssr] become-seller: sin datos de servidor, 404 temporal: GET http://localhost:9001/api/settings failed after 3 attempts: ECONNREFUSED …
```

### CA-7 — Sin regresión con la API arriba

```
$ just build-shop        (API arriba)
✓ Generating static pages using 11 workers (29/29) in 6.9s
Done in 79.94s.
SHOP_EXIT=0
[ssr] avisos: 0
$ just verify            (just api-dev, shop-dev, admin-dev)
OK   API    :9001/api/settings  200  5503B  527ms
OK   Shop   :3003/en  200  191897B  34129ms  cards:30
OK   Admin  :3002/en/login  200  72554B  20127ms  cards:1
```

`just check` va dentro de `check-full` (CA-8). Para `tsc` y lint, ver
«Línea base».

### CA-8 — El gate vigila la regresión

`just check-full` con la API caída (`curl :9001 -> 000 (exit 7)`):

```
Done in 89.70s.
Done in 17.18s.
OK    [1/10] packages/db build  62s
OK    [2/10] packages/db lint  2s
OK    [3/10] packages/db typecheck  9s
OK    [4/10] api/rest typecheck  30s
OK    [5/10] api/rest lint  56s
OK    [6/10] admin/rest lint  90s
OK    [7/10] shop lint  18s
OK    [8/10] api/rest test  38s
OK    [9/10] packages/db test  92s
OK    [10/10] scraper db-test  2s
check: VERDE (10 pasos, 402s)
$ nest build
Done in 102.65s.
$ next build --webpack
✓ Generating static pages using 11 workers (77/77) in 10.3s
Done in 188.37s.
$ next build --webpack
✓ Generating static pages using 11 workers (29/29) in 11.1s
Done in 89.45s.
check-full: VERDE (check + build-api + build-admin + build-shop)
EXIT=0
```

Con `API_INTERNAL_URL` definida y la API caída, el build de la tienda toma el
camino de `ECONNREFUSED` (3 intentos por query). Pasa igual y deja los mismos
59 avisos.

### Hallazgos que no se accionaron (NO incluye)

- **`notify-logs.ssr.ts`** conserva su `try/catch` muerto: el «NO incluye»
  lo deja.
- **`flash-sale.ssr.ts`** conserva imports de tipos que ya no usaba antes de
  esta US (`FlashSale`, `API_ENDPOINTS`…).
- **La primera visita a cada producto o tienda tras un despliegue** tarda lo
  que tarde la API: R-1, aceptado. En la evidencia, entre 0,19 y 0,31 s en
  local.
- **CLAUDE.md** sigue diciendo que `just db-test` está «HOY ROTO»
  (`CLAUDE.md:51-54`, anotado ya en US-10).
