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
**Status:** Listo para ejecución. Promovida desde `_backlog/` el 2026-11-18,
tras la revisión del sub-agente fable 5; el dueño fijó D-7, D-8 y R-5.
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

- [ ] CA-1 a CA-8 verificados, con la salida real pegada en «Resultado»: logs
  de build, `curl -o /dev/null -w "%{http_code}"`, `just verify`,
  `just check-full`.
- [ ] En la evidencia de CA-4 y CA-6, cómo se apagó y levantó la API y cuánto
  se esperó.
- [ ] `apps/README.md`, `CLAUDE.md` y el `justfile` actualizados.
- [ ] Status de esta US en `Implementado` y fila del Épico 13 marcada.

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
