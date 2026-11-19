# US-103 — URL de la tienda configurable en ejecución en el admin

> Los enlaces "ver en la tienda" del admin leen `NEXT_PUBLIC_SHOP_URL`, que
> Next escribe en el JavaScript durante `next build`. Esta US la sustituye por
> `SHOP_URL`, que se lee al arrancar: así la misma imagen del admin sirve con
> cualquier dominio de tienda. Sale de partir la US-102 original
> (revisión del 2026-11-18).

**Épico:** [Épico 13](./README.md)
**Fecha:** 2026-11-18
**Status:** Implementado (2026-11-19). Decisión DA-2 fijada por el dueño el 2026-11-18.
**Depende de:** [US-102](./102-urls-configurables-en-ejecucion.md), que
comparte las plantillas `.env`, el `justfile` y `apps/README.md`, y fija el
prefijo `/backend` que deja libre `/api/*` para Next.
**LOC est.:** ~120

## Historia

**Como** responsable del despliegue, **quiero** configurar la URL de la tienda
que usa el admin con una variable de ejecución, **para** cambiar el dominio de
la tienda sin reconstruir la imagen del admin.

## Contexto (verificado en el código el 2026-11-18, `main` @ `2f88e7b`)

- **`NEXT_PUBLIC_SHOP_URL` en el admin** (enlaces "ver en la tienda"), 9 usos
  en 8 archivos bajo `apps/admin/rest/src/`:
  - `components/message/views/header-view.tsx:70`;
  - `components/product/product-form.tsx:589` y `:636`;
  - `components/question/question-list.tsx:114`;
  - `components/reviews/review-details.tsx:147` y `review-list.tsx:111`;
  - `components/ui/lang-action/action.tsx:41` y `language-switcher.tsx:77`;
  - `config/routes.ts:158`. Es una función síncrona fuera de React, así que
    no puede usar un hook.
- **El admin no tiene `pages/api/` hoy.** Tras US-102, `/api/*` del dominio
  del admin queda para Next: la API va por `/backend`.
- **Las páginas estáticas se generan en el build:** 78 de las 160 páginas del
  admin exportan `getStaticProps`. Un `window.__ENV` inyectado en `_document`
  quedaría fijo en la imagen: **esa vía no sirve**.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-3 | URL de la tienda en el admin | Variable de ejecución **`SHOP_URL`**. Una ruta nueva, `apps/admin/rest/src/pages/api/runtime-config.ts`, la devuelve. Los componentes la consumen con un hook (`useShopUrl()`); `routes.ts:158` y demás código fuera de React, con un helper con caché (`shopUrl()`). No se usa `_document`. |
| DA-2 | `SHOP_URL` ausente o aún sin cargar | `runtime-config` responde **500 nombrando la variable** si falta `SHOP_URL`. Mientras el valor no llega, el enlace no se pinta: nada de enlaces a `undefined/...`. |
| DA-1′ | `.env` ya existentes | Igual que DA-1 de US-102: `just env` añade `SHOP_URL` si falta. El ejecutor no edita `.env`. |

## Scope

**Incluye:**

- la ruta `runtime-config` y el hook o helper (D-3, DA-2);
- los 9 usos de `NEXT_PUBLIC_SHOP_URL`;
- `apps/admin/rest/.env.template` y la receta `env` del `justfile` (DA-1′);
- la fila de `SHOP_URL` en la tabla de variables de `apps/README.md` (la crea
  US-102).

**NO incluye:**

- el prefijo `/backend` ni `API_INTERNAL_URL` (US-102);
- caché del lado del servidor más allá de leer `process.env` por petición;
- `NEXT_PUBLIC_ADMIN_URL` del shop (US-102, D-4);
- Dockerfiles, compose o configuración de Dokploy.

## Criterios de aceptación

### CA-1 — Enlaces del admin a la tienda en ejecución
Se cambia `SHOP_URL`, se reinicia el admin (`next start`) sin reconstruir, y
los enlaces "ver en la tienda" (producto, reseña, pregunta, visitar tienda)
apuntan al nuevo valor. Evidencia:
- `curl /api/runtime-config` con cada valor;
- el `href` real de un enlace, sacado del DOM con DevTools MCP o del HTML
  renderizado.

### CA-2 — Variable ausente
Sin `SHOP_URL`, `curl -i /api/runtime-config` responde 500 con un mensaje que
nombra `SHOP_URL`, y la página de producto del admin no pinta un enlace roto.

### CA-3 — Sin restos
`grep -rn "NEXT_PUBLIC_SHOP_URL" apps/admin/rest/src apps/admin/rest/.env.template`
no devuelve nada.

### CA-4 — Calidad
- `npx tsc --noEmit` del admin: mismo número de errores que la línea base
  medida antes del primer cambio (pegar ambas).
- `yarn lint` en 0; `just check` y `just build-admin` en verde;
  `just verify` en verde.

## Escenarios Gherkin

```gherkin
Feature: URL de la tienda en ejecución en el admin

  Scenario: CA-1 — cambio del dominio de la tienda
    Given el admin arrancado con SHOP_URL="https://tienda-a.example"
    When reinicio el admin con SHOP_URL="https://tienda-b.example" sin reconstruir
    Then el enlace "ver en la tienda" de un producto apunta a "https://tienda-b.example/products/<slug>"

  Scenario: CA-2 — variable ausente
    Given el admin arrancado sin SHOP_URL
    When pido /api/runtime-config
    Then responde 500 y el mensaje nombra SHOP_URL
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/admin/rest/src/pages/api/runtime-config.ts` | **Nuevo:** devuelve `{ shopUrl }` desde `process.env.SHOP_URL`, o un 500 (DA-2) |
| `apps/admin/rest/src/…` (hook y helper nuevos) | `useShopUrl()` / `shopUrl()`; el agente decide la ubicación |
| Los 8 archivos con `NEXT_PUBLIC_SHOP_URL` | Usar el hook o el helper |
| `apps/admin/rest/.env.template` | `SHOP_URL` en lugar de `NEXT_PUBLIC_SHOP_URL` |
| `justfile` (`env`) | Añadir `SHOP_URL` si falta |
| `apps/README.md` | Fila de `SHOP_URL` en la tabla de variables |

## Definición de Done

- [x] CA-1 a CA-4 verificados, con la salida real pegada en "Resultado".
- [x] Status en `Implementado` y fila del Épico 13 marcada.

## Riesgos

- **R-1 — `routes.ts` es síncrono.** El helper necesita el valor ya cargado.
  Si se llama antes de que llegue, devuelve `undefined` y quien lo llama no
  pinta el enlace (DA-2).
- **R-2 — i18n.** `/api/runtime-config` no lleva locale; comprobar que el
  `fetch` desde páginas con prefijo de idioma (`/es/...`) llega a la ruta.

## Notas para el agente ejecutor

- Ejecutar después de US-102: sin el prefijo `/backend`, `/api/*` del admin
  puede chocar con el `rewrites()` de desarrollo.
- Las decisiones están fijadas; si una choca con el código, **detente y
  pregunta**.

## Resultado (2026-11-19, rama `feat/us-103-shop-url` sobre `main` @ `532cb5f`)

### Qué cambió

| Archivo | Cambio |
|---|---|
| `apps/admin/rest/src/pages/api/runtime-config.ts` | **Nuevo.** Devuelve `{ shopUrl }` desde `process.env.SHOP_URL` con `Cache-Control: no-store`; sin la variable, 500 con un mensaje que la nombra (DA-2) |
| `apps/admin/rest/src/utils/shop-url.ts` | **Nuevo.** `useShopUrl()` (React Query, una petición por pestaña, `staleTime: Infinity`, sin reintentos) y `shopUrl(path)` para `routes.ts`, que lee el valor ya cargado |
| `header-view.tsx`, `product-form.tsx` (2), `question-list.tsx`, `review-details.tsx`, `review-list.tsx`, `lang-action/action.tsx`, `lang-action/language-switcher.tsx` | `useShopUrl()`. Sin URL, no se pinta el enlace: en las listas queda el nombre del producto como texto, y en las vistas previas `previewUrl` llega `undefined` (`ActionButtons` ya lo trataba como opcional) |
| `config/routes.ts` | `visitStore` usa `shopUrl()`; devuelve `undefined` hasta tener la URL (R-1) |
| `topbar/visit-store.tsx`, `pages/[shop]/index.tsx` | llaman a `useShopUrl()` y no pintan el enlace sin URL |
| `apps/admin/rest/.env.template` | `SHOP_URL` en lugar de `NEXT_PUBLIC_SHOP_URL` |
| `justfile` (`env`) | añade `SHOP_URL` si falta (DA-1′) |
| `apps/README.md` | fila de `SHOP_URL` en la tabla de variables |
| `15-compose-stack-completo.md` | nota: el admin recibe `SHOP_URL` por `environment` |

La US hablaba de 8 archivos con `NEXT_PUBLIC_SHOP_URL`; además se tocaron sus
dos llamadores de `Routes.visitStore` (`visit-store.tsx` y
`pages/[shop]/index.tsx`). Si no cargan la URL ellos mismos, nadie dispararía
`useShopUrl()` en esas páginas, y `visitStore` devolvería `undefined` siempre
(R-1).

### Línea base de `tsc` (CA-4)

```
antes   (2026-11-18, main):  admin tsc --noEmit -> 1 error: TS2688 Cannot find type definition file for 'minimatch'
después:                     admin tsc --noEmit -> error TS2688: Cannot find type definition file for 'minimatch'.
```

### CA-1 — Enlaces del admin a la tienda en ejecución

Un solo `just build-admin`:

```
✓ Compiled successfully in 94s
├ ƒ /api/runtime-config
Done in 432.14s.
ADMIN_EXIT=0
$ grep -rlE 'tienda-(a|b)\.example|localhost:3003' apps/admin/rest/.next/static | wc -l
0
```

Para cada valor se arranca ese build con `SHOP_URL=… yarn start` (:3002).
Delante va el proxy local de US-102 (:8081, `/backend` → API), para iniciar
sesión. Los `href` se leen del DOM con DevTools MCP, con sesión de
`admin@demo.com`.

```
=== A: SHOP_URL='https://tienda-a.example'
HTTP/1.1 200 OK
cache-control: no-store
{"shopUrl":"https://tienda-a.example"}

/en/furniture-shop                      Visit Store -> https://tienda-a.example/shops/furniture-shop
                                        (icono)     -> https://tienda-a.example/shops/furniture-shop
/en/reviews                             Milan The Story of Love -> https://tienda-a.example/products/milan-the-story-of-love
/en/questions                           Visit Site -> https://tienda-a.example/
                                        Sun Tropics Organic Mango Nectar,250ml -> https://tienda-a.example/products/sun-tropics-organic-mango-nectar-250ml
                                        Wonderful Pomegranate Juice, 300 ml -> https://tienda-a.example/products/wonderful-pomegranate-juice-300-ml
/en/furniture-shop/products/apples/edit Preview -> https://tienda-a.example/products/preview/apples

=== B: SHOP_URL='https://tienda-b.example'   (mismo build, solo reinicio)
HTTP/1.1 200 OK
cache-control: no-store
{"shopUrl":"https://tienda-b.example"}

/en/furniture-shop                      ["https://tienda-b.example/shops/furniture-shop","https://tienda-b.example/shops/furniture-shop"]
/en/furniture-shop/products/apples/edit ["https://tienda-b.example/","https://tienda-b.example/products/preview/apples"]
/en/reviews                             ["https://tienda-b.example/","https://tienda-b.example/products/milan-the-story-of-love",
                                         "https://tienda-b.example/products/space-force-first-chapter", ...]
```

La primera lectura con B, en la página de edición, salió vacía. Era la primera
carga tras el reinicio: con 6 s más de espera aparecieron los enlaces de
arriba.

### CA-2 — Variable ausente

```
=== sin-variable: SHOP_URL=''
HTTP/1.1 500 Internal Server Error
cache-control: no-store
{"message":"SHOP_URL is not defined: set it to the public URL of the shop (e.g. http://localhost:3003)"}

/en/furniture-shop/products/apples/edit
{"formLoaded":true,"linksToShop":[],"previewButtons":0,"visitSite":0}
```

El formulario carga entero y no pinta ningún enlace roto, ni el botón
Preview, ni Visit Site.

### CA-3 — Sin restos

```
$ grep -rn "NEXT_PUBLIC_SHOP_URL" apps/admin/rest/src apps/admin/rest/.env.template
grep rc=1
```

### CA-4 — Calidad

`yarn lint` del admin:

```
$ eslint src
Done in 66.92s.
```

`just env` sobre el `.env` existente, dos veces:

```
  + SHOP_URL añadido a apps/admin/rest/.env
  * API fijada al puerto 9001 en los tres .env
--- segunda corrida:
(no añade nada)
```

En dev (`just api-dev`, `shop-dev`, `admin-dev`):

```
$ just verify
OK   API    :9001/api/settings  200  5503B  701ms
OK   Shop   :3003/en  200  191897B  108663ms  cards:30
OK   Admin  :3002/en/login  200  72554B  30477ms  cards:1
$ curl http://localhost:3002/api/runtime-config
{"shopUrl":"http://localhost:3003"}  200
```

R-2 (i18n): todas las páginas probadas llevan el prefijo `/en/` y la
petición a `/api/runtime-config`, que no lleva idioma, les llega bien.

`just check`, con todos los servidores apagados:

```
OK    [1/10] packages/db build  110s
OK    [2/10] packages/db lint  6s
OK    [3/10] packages/db typecheck  18s
OK    [4/10] api/rest typecheck  72s
OK    [5/10] api/rest lint  84s
OK    [6/10] admin/rest lint  144s
OK    [7/10] shop lint  31s
OK    [8/10] api/rest test  89s
OK    [9/10] packages/db test  115s
OK    [10/10] scraper db-test  4s
check: VERDE (10 pasos, 677s)
```

### Hallazgos que no se accionaron (NO incluye)

- **Una pestaña abierta conserva la URL vieja hasta recargar.** Cambiar
  `SHOP_URL` y reiniciar el admin no la actualiza: `staleTime: Infinity` la
  pide una sola vez. Es lo esperado para un valor de despliegue.
- **El enlace de la tienda en `header-view.tsx`** (mensajes) usa
  `/${locale}/shops/...` y los demás no llevan idioma. Viene de Pickbazar; no
  se cambió.
