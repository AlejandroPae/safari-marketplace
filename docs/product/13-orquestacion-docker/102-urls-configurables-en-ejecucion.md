# US-102 — URL de la API configurable en ejecución (prefijo `/backend`)

> Hoy la tienda y el admin leen la URL de la API de `NEXT_PUBLIC_REST_API_ENDPOINT`,
> que Next escribe dentro del JavaScript en `next build`. Cambiar de dominio o
> de entorno obliga a reconstruir la imagen. Esta US hace que **una misma
> imagen** sirva en cualquier entorno (local, Dokploy, Azure). El navegador
> habla con la API por un prefijo relativo que enruta el reverse proxy, y el
> SSR usa una variable de ejecución. Los enlaces del admin a la tienda
> (`NEXT_PUBLIC_SHOP_URL`) son la [US-103](./103-shop-url-en-ejecucion-admin.md).

**Épico:** [Épico 13](./README.md). Nace de la preparación del despliegue en
Dokploy como base del laboratorio de Sistemas Distribuidos.
**Fecha:** 2026-11-18
**Status:** Implementado (2026-11-19). Promovida desde `_backlog/` el
2026-11-18, tras revisión del sub-agente fable 5; decisiones DA-1, DA-3 y DA-4
fijadas por el dueño.
**Depende de:** ninguna. **Bloquea a:** US-103 y US-104 (comparten plantillas,
`justfile` y `apps/README.md`) y US-15 (resuelve su R-1).
**LOC est.:** ~220

## Historia

**Como** responsable del despliegue, **quiero** configurar la URL de la API
con variables de entorno de ejecución, **para** desplegar la misma imagen
Docker en cualquier entorno y cambiar dominios sin recompilar.

## Contexto (verificado en el código el 2026-11-18, `main` @ `2f88e7b`)

- **Cliente HTTP del shop:** `apps/shop/src/framework/rest/client/http-client.ts:165`,
  `baseURL: process.env.NEXT_PUBLIC_REST_API_ENDPOINT`. Se usa igual en el
  navegador y en el servidor: `getStaticProps`/`getStaticPaths` de
  `apps/shop/src/framework/rest/*.ssr.ts` y también `getServerSideProps`
  (`order.ssr.ts`, `search.ssr.ts`).
- **Cliente HTTP del admin:** `apps/admin/rest/src/data/client/http-client.ts:6-11`,
  un `invariant` que exige `NEXT_PUBLIC_REST_API_ENDPOINT` más el mismo `baseURL`.
- **El admin no llama a la API en el servidor.** Sus `getStaticProps` solo
  cargan traducciones y sus `getServerSideProps` solo leen cookies. Todas sus
  peticiones a la API salen del navegador.
- **Otros usos de `NEXT_PUBLIC_REST_API_ENDPOINT` en el admin:**
  - enlaces de exportación en `components/attribute/attribute-import-export.tsx:22`
    y `components/product/import-export-modal.tsx:24` y `:37`;
  - la URL de webhook que se muestra para copiar, en
    `components/settings/payment/webhook-url.tsx:44-46`.
- **`NEXT_PUBLIC_ADMIN_URL` en el shop:** solo está declarada en
  `apps/shop/src/config/get-env.ts:12` y en `apps/shop/.env.template:5`; no
  la usa nadie. `just env` la rellena (`justfile:68`).
- **Pusher en el admin:** `utils/pusher-config.ts:25` usa
  `NEXT_PUBLIC_BROADCAST_AUTH_URL`, que la plantilla deriva de la URL de la
  API. Lo importan `message-bar.tsx`, `recent-order-bar.tsx` y
  `store-notice-bar.tsx`. `config/index.ts:16` toma como default el driver
  `'log'`, pero `apps/admin/rest/.env.template` fija `pusher`.
- **Choques con el prefijo `/api`:**
  - la tienda sirve next-auth en `apps/shop/src/pages/api/auth/[...nextauth].ts`,
    o sea en `/api/auth/*`;
  - el admin no tiene `pages/api/` hoy, pero US-103 le agrega
    `/api/runtime-config`.

  Un proxy que mande todo `/api` del dominio de la tienda a la API rompería
  el login con Google (opcional desde US-70). El login con credenciales no
  pasa por next-auth: va a la API (`/token`, `api-endpoints.ts:27`).
- **Las páginas estáticas se generan en el build:** 78 de las 160 páginas del
  admin exportan `getStaticProps` (otras 80 usan `getServerSideProps`). Lo que
  se escriba en el HTML durante el build (por ejemplo, un `window.__ENV`
  inyectado en `_document`) queda fijo en la imagen. **Esa vía no sirve** para
  valores de ejecución.
- **`APPLICATION_MODE=production`** en ambas plantillas activa
  `ignoreBuildErrors`: `next build` no comprueba tipos, y ni shop ni admin
  tienen un script de `tsc`.
- **`just env` no reescribe un `.env` existente** (función `crear`, `justfile:51-60`): un clon
  ya montado no recibe solo las variables nuevas. El precedente para añadirlas
  es el bloque de `DATABASE_URL` (`justfile:75-78`).
- **El proxy de Dokploy** (Traefik) enruta cada dominio por Host + Path y
  ofrece los middlewares *Strip Path* e *Internal Path*
  (https://docs.dokploy.com/docs/core/domains).
- **La receta `just set-api-port`** (`justfile:96-102`) reescribe
  `localhost:NNNN/api` en los `.env` del shop y del admin.
- **Logs de la API:** cada petición deja una línea `[HTTP]`
  (`requestLogger`, `apps/api/rest/src/common/logging.ts:49`, US-17). Sirve
  para probar a qué instancia llegó cada petición.

## Decisiones

D-1 a D-7 son la propuesta original; D-3 pasó a US-103. DA-1, DA-3 y DA-4
salen de la revisión del 2026-11-18 y las fijó el dueño.

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Prefijo público de la API para el navegador | **`/backend`**, fijo y **igual en todos los entornos**; puede quedar escrito en el build. El proxy quita `/backend` y agrega `/api` (en Dokploy: Path `/backend` + Strip Path + Internal Path `/api`). Así `/api/*` sigue siendo de Next: next-auth en el shop y `runtime-config` en el admin (US-103). |
| D-2 | URL de la API en el SSR | Variable de ejecución **`API_INTERNAL_URL`** (sin `NEXT_PUBLIC_`), p. ej. `http://safari-api:9001/api`. Solo se lee en el servidor (`typeof window === 'undefined'`). Si falta, el error nombra la variable. |
| D-3 | URL de la tienda en el admin | **Movida a [US-103](./103-shop-url-en-ejecucion-admin.md).** |
| D-4 | `NEXT_PUBLIC_ADMIN_URL` del shop | Se elimina de `get-env.ts`, de la plantilla y de `just env`. |
| D-5 | Pusher | Fuera de alcance funcional: el driver por defecto de la plantilla pasa a `log`. No se implementa broadcasting. Ver DA-4. |
| D-6 | Desarrollo local | `just api-dev`, `shop-dev` y `admin-dev` siguen funcionando sin proxy externo: en `next dev`, un `rewrites()` de `next.config.js` manda `/backend/:path*` a la API local. `just verify` sigue en verde. |
| D-7 | URL de webhook mostrada en el admin | Absoluta, armada en el navegador con `window.location.origin + '/backend'` **dentro de un efecto**: `window` no existe al prerenderizar. Así se puede copiar y pegar en la pasarela. |
| DA-1 | `.env` ya existentes | `just env` añade `API_INTERNAL_URL` si falta, como hace con `DATABASE_URL` (`justfile:75-78`). Las variables retiradas que queden en un `.env` viejo no estorban: nadie las lee. El ejecutor **no edita `.env`** (hook de US-72); lo prueba sobre un `.env` existente con `just env`. |
| DA-3 | `API_INTERNAL_URL` en el admin | Solo como destino del `rewrites()` de desarrollo (D-6). El `http-client` del admin usa siempre `/backend`, porque el admin no llama a la API en el servidor (ver Contexto). |
| DA-4 | URL de broadcasting de Pusher | Literal en la plantilla del admin: `NEXT_PUBLIC_BROADCAST_AUTH_URL="/backend/broadcasting/auth"`. No se toca `pusher-config.ts`. |

## Scope

**Incluye:**

- los dos `http-client.ts` (D-1, D-2, DA-3);
- los enlaces de exportación y webhook del admin (D-1, D-7);
- `get-env.ts` del shop (D-4) y la plantilla del admin para Pusher (D-5, DA-4);
- los `rewrites()` de desarrollo en ambos `next.config.js` (D-6);
- `.env.template` del shop y del admin, más las recetas `env` (DA-1) y
  `set-api-port` del `justfile`;
- `apps/README.md`:
  - § "Notas para el despliegue en nube": la tabla de variables de build y de
    ejecución, y la configuración de dominios en Dokploy;
  - las menciones de las variables retiradas en `:13`, `:100`, `:365-376` y `:423`;
- en el Épico 13 (`README.md`), marcar R-1 como resuelto por esta US y anotar
  en US-15 que los args de build para `NEXT_PUBLIC_REST_API_ENDPOINT` ya no
  hacen falta.

**NO incluye:**

- `NEXT_PUBLIC_SHOP_URL` y la ruta `runtime-config` del admin: son US-103;
- hacer que `next build` no dependa de la API viva (`getStaticPaths` y
  `getStaticProps`): es otra US (R-2);
- Dockerfiles, compose ni configuración real de Dokploy o Traefik;
- la variante GraphQL (congelada, US-12);
- cambiar `images.remotePatterns`;
- implementar Pusher o cualquier broadcasting;
- tocar la API (el prefijo `/api` de Nest no cambia);
- actualizar `74-fronteras-arquitectura-lint.md:37` y `:107`, que citan la
  variable retirada: se menciona en el reporte.

## Criterios de aceptación

### CA-1 — Una sola build, dos configuraciones
Con **un** `next build` del shop, arrancar dos veces (`next start`) con
valores distintos de `API_INTERNAL_URL` funciona en ambos casos sin
recompilar. La prueba usa dos instancias de la API en puertos distintos y una
página que no sirva HTML del build:
- una `getServerSideProps` (`/search`), o
- un slug no prerenderizado.

Las ISR sirven el HTML del build durante 60 s. La evidencia es el log
`[HTTP]` de cada instancia. Se verifica detrás de un proxy local que imita a
Dokploy (Traefik o Caddy en Docker, o un script de Node): `/backend` → API,
con el prefijo reescrito a `/api`.

### CA-2 — El navegador no conoce la dirección de la API
En el bundle del cliente (`.next/static`) del shop y del admin no aparecen
`localhost:9001` ni ninguna URL absoluta de la API (`grep` pegado).
`curl <proxy>/backend/settings` devuelve el JSON de la API.

### CA-3 — El SSR usa la red interna
Una página con SSR (`/search` o un detalle de producto no prerenderizado) se
genera pidiendo a `API_INTERNAL_URL`, según el log `[HTTP]` de la API. Si
falta `API_INTERNAL_URL` en ejecución, el error dice qué variable falta.

### CA-4 — (movido a US-103)

### CA-5 — next-auth intacto detrás del proxy
- `curl <proxy>/api/auth/providers` y `curl <proxy>/api/auth/session`
  responden el JSON de next-auth, no un 404 de Nest.
- `POST <proxy>/backend/token` con un usuario del seed devuelve token.

### CA-6 — Exportación y webhook
Los enlaces de exportación del admin descargan a través de `/backend`, y la
URL de webhook que se muestra es absoluta y correcta para el origen actual.

### CA-7 — Desarrollo local sin cambios de hábito
`just env` sobre un `.env` existente añade `API_INTERNAL_URL` (salida
pegada). Las tres terminales `*-dev` y `just verify` quedan en verde, sin
proxy externo.

### CA-8 — Sin restos
`grep -rn "NEXT_PUBLIC_REST_API_ENDPOINT\|NEXT_PUBLIC_ADMIN_URL" apps/shop/src apps/admin/rest/src`
no devuelve nada, y las plantillas `.env` ya no las declaran.

### CA-9 — Calidad
- `npx tsc --noEmit` en shop y admin: mismo número de errores que en la línea
  base medida **antes del primer cambio** (pegar ambas). La línea base del
  admin hoy tiene 1 error ajeno: el stub `@types/minimatch`, ver US-10.
- `yarn lint` en 0 en ambos; `just check` en verde.
- `just build-shop` y `just build-admin` en verde. `just build-shop` sigue
  exigiendo `just api-dev` arriba, igual que hoy (R-2). Queda obsoleto al
  cerrar [US-104](./104-build-shop-sin-api.md), que lo quita.

## Escenarios Gherkin

```gherkin
Feature: URL de la API configurable en ejecución

  Scenario: CA-1 — misma imagen, otro entorno
    Given el shop construido una sola vez
    When arranco con API_INTERNAL_URL apuntando a la API A y luego a la API B
    Then en ambos casos /search se renderiza y el log [HTTP] de la API correspondiente muestra la petición

  Scenario: CA-5 — next-auth detrás del proxy
    Given el proxy enruta "/backend" a la API y "/" a la tienda
    When pido /api/auth/providers a través del proxy
    Then responde next-auth de la tienda y no la API
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/shop/src/framework/rest/client/http-client.ts` | `baseURL` según entorno (D-1/D-2) |
| `apps/admin/rest/src/data/client/http-client.ts` | `/backend` fijo y sin el `invariant` de `NEXT_PUBLIC_REST_API_ENDPOINT` (DA-3) |
| `attribute-import-export.tsx`, `import-export-modal.tsx`, `webhook-url.tsx` | Prefijo `/backend` (D-1, D-7) |
| `apps/shop/src/config/get-env.ts` | Quitar `NEXT_PUBLIC_ADMIN_URL` y agregar `API_INTERNAL_URL` |
| `apps/shop/next.config.js`, `apps/admin/rest/next.config.js` | `rewrites()` solo en desarrollo (D-6) |
| `apps/shop/.env.template`, `apps/admin/rest/.env.template` | Variables nuevas, sin las retiradas; driver `log` y URL de broadcasting (D-5, DA-4) |
| `justfile` (`env`, `set-api-port`) | Añadir `API_INTERNAL_URL` si falta (DA-1); quitar los `sed` de las variables retiradas |
| `apps/README.md` | Tabla de variables (build y ejecución), dominios en Dokploy y menciones retiradas |
| `docs/product/13-orquestacion-docker/README.md` | R-1 resuelto; nota en US-15 |

## Definición de Done

- [x] CA-1 a CA-3 y CA-5 a CA-9 verificados, con la salida real pegada en la
  sección "Resultado" (comandos, `curl`, logs `[HTTP]` de la API).
- [x] La configuración del proxy local usada en CA-1, CA-5 y CA-6, pegada en
  la evidencia, para reutilizarla en el laboratorio.
- [x] `apps/README.md` actualizado.
- [x] Status de esta US en `Implementado` y fila del Épico 13 marcada.

## Riesgos

- **R-1 — Next solo reemplaza `process.env.X` estático.** Las variables sin
  `NEXT_PUBLIC_` del lado servidor se leen en ejecución, **siempre que el
  código no corra también en el navegador**. Cualquier lectura de
  `API_INTERNAL_URL` en código de cliente queda `undefined`.
- **R-2 — El build todavía llama a la API.** `getStaticPaths` de productos y
  los `getStaticProps` sin `revalidate` corren en `next build`. En local,
  `next dev`, `next build` y `next start` leen el mismo `.env`, así que
  `API_INTERNAL_URL` existe en el build y esta US **no empeora** el build de
  hoy. Para una imagen Docker hace falta la US que independice el build (aún
  sin escribir). El CA-1 se cumple igual: lo que se comprueba es la ejecución.
  Esa US es [US-104](./104-build-shop-sin-api.md); este riesgo queda obsoleto
  cuando cierre. Ojo: el error de D-2 por falta de `API_INTERNAL_URL` se lanza
  al pedir, no al importar el módulo, o el build sin API de US-104 muere.
- **R-3 — Rutas con prefijo y `rewrites`.**
  - El `rewrites()` de desarrollo no debe chocar con `/api/auth` (shop) ni con
    el futuro `/api/runtime-config` (admin), ni quedar activo en producción.
  - Ambas apps usan i18n, y Next antepone el locale a los `rewrites`: puede
    hacer falta `locale: false` en la regla de `/backend`.

## Notas para el agente ejecutor

- Leer antes el `CLAUDE.md` raíz y `apps/README.md`.
- Las decisiones están fijadas. Si una choca con algo que encuentres en el
  código, **detente y pregunta**; no la cambies por tu cuenta.
- Medir la línea base de `tsc` (CA-9) antes de tocar nada.
- Esta US prepara el despliegue que harán los estudiantes de Sistemas
  Distribuidos (Azure DevOps → Docker Hub → Dokploy). La sección de
  `apps/README.md` debe servirles de guía: qué variable va en qué lugar y por
  qué una `NEXT_PUBLIC_*` no se puede cambiar en ejecución.

## Resultado (2026-11-19, rama `feat/us-102-backend-prefix` sobre `main` @ `a9d63a1`)

### Qué cambió

| Archivo | Cambio |
|---|---|
| `apps/shop/src/framework/rest/client/http-client.ts` | `baseURL` por petición: `/backend` en el navegador y `API_INTERNAL_URL` en el servidor (D-1, D-2). Sin la variable, la petición falla con un error que la nombra, y se escribe una vez en el log. Los errores que no son de Axios se propagan tal cual |
| `apps/admin/rest/src/data/client/http-client.ts` | `baseURL` fijo `/backend` (`API_PREFIX`, exportado); fuera el `invariant` (DA-3) |
| `attribute-import-export.tsx`, `import-export-modal.tsx` | enlaces de exportación con `API_PREFIX` |
| `webhook-url.tsx` | `window.location.origin + /backend`, leído en un efecto (D-7) |
| `apps/shop/src/config/get-env.ts` | fuera `NEXT_PUBLIC_REST_API_ENDPOINT` y `NEXT_PUBLIC_ADMIN_URL`; entra `API_INTERNAL_URL` (D-4) |
| `apps/shop/next.config.js`, `apps/admin/rest/next.config.js` | `rewrites()` de `/backend/:path*` a `API_INTERNAL_URL`, solo con `NODE_ENV=development` (D-6) |
| `apps/shop/.env.template`, `apps/admin/rest/.env.template` | `API_INTERNAL_URL` en lugar de las retiradas; driver `log` y `NEXT_PUBLIC_BROADCAST_AUTH_URL="/backend/broadcasting/auth"` (D-5, DA-4) |
| `justfile` (`env`) | añade `API_INTERNAL_URL` si falta (DA-1), fija la URL de broadcasting (ver «Desvíos») y deja de rellenar `NEXT_PUBLIC_ADMIN_URL`. `set-api-port` no cambia: su `sed` de `localhost:NNNN/api` ya alcanza a `API_INTERNAL_URL` |
| `apps/README.md` | menciones retiradas, tabla de variables de build y de ejecución, y dominios en Dokploy |
| Épico 13 `README.md`, `15-compose-stack-completo.md` | R-1 resuelto; nota en US-15 |

### Desvíos respecto de lo escrito (y por qué)

1. **R-3, al revés de lo previsto: el rewrite va SIN `locale: false`.** Con
   `locale: false`, `/backend/settings` en `next dev` daba **404 de Next**
   (26004 B de HTML) en el shop y en el admin. Con i18n, Next compara contra la
   ruta ya prefijada con el idioma. Sin esa opción, `/backend/settings` llega a
   la API (200, 5504 B). Efecto secundario inocuo: `/en/backend/...` también
   casa. El comentario de `next.config.js` lo explica.
2. **`just env` también fija `NEXT_PUBLIC_BROADCAST_AUTH_URL`.** Tras el
   primer build, el CA-2 encontró en el bundle del admin
   `authEndpoint:"http://localhost:9001/api/broadcasting/auth"`. Venía del
   `.env` existente, que conservaba la URL derivada del endpoint viejo. La
   plantilla ya tenía el literal de DA-4, pero un `.env` previo no lo recibe
   solo. Con el mismo criterio de DA-1 (`just env` migra los `.env`
   existentes), la receta lo fija con un `sed`, como ya hacía con
   `NEXTAUTH_URL`. Tras `just env` y otro `build-admin`, el bundle tiene
   `authEndpoint:"/backend/broadcasting/auth"`.
3. **El error de D-2 se escribe además en el log.** Sin `API_INTERNAL_URL`,
   `/search` respondía 200 con la página vacía (27158 B frente a 129515 B) y
   sin ninguna línea en el log: los `prefetchQuery` de TanStack descartan el
   error, como ya documenta US-104. Para que el CA-3 («el error dice qué
   variable falta») sea visible, el cliente lo escribe una vez con
   `console.error` además de lanzarlo. Se recompiló el shop y CA-1/CA-3 se
   repitieron sobre ese build final (la evidencia de abajo es de ese build).

### Línea base de `tsc` y lint (CA-9)

La línea base se midió el 2026-11-18 sobre `main` (durante US-10). Shop y
admin no cambiaron entre esa medición y el inicio de esta US.

```
antes:   shop  tsc --noEmit  rc=0
         admin tsc --noEmit  rc=2, 1 error: TS2688 Cannot find type definition file for 'minimatch'
después: shop  tsc rc=0
         admin tsc rc=2, 1 error: error TS2688: Cannot find type definition file for 'minimatch'.
         shop  yarn lint  -> $ eslint src  Done in 195.46s.
         admin yarn lint  -> $ eslint src  Done in 45.93s.
```

### Proxy local usado (CA-1, CA-2, CA-5, CA-6)

Script de Node, sin dependencias. Imita la regla de Dokploy: Path `/backend`
+ Strip Path + Internal Path `/api` hacia la API, y el resto hacia la app.
Para el laboratorio:

- shop: `node dokploy-proxy.mjs 8080 http://localhost:9001 http://localhost:3003`;
- admin: `node dokploy-proxy.mjs 8081 http://localhost:9001 http://localhost:3002`.

```js
// Proxy local que imita el enrutado de Dokploy (Traefik) para US-102:
//   Path /backend + Strip Path + Internal Path /api  ->  la API
//   todo lo demás                                     ->  la app (shop o admin)
//
// Uso: node dokploy-proxy.mjs <puerto> <url-api> <url-app>
//   p. ej. node dokploy-proxy.mjs 8080 http://localhost:9001 http://localhost:3003
import http from 'node:http';

const [port, apiBase, appBase] = process.argv.slice(2);
if (!port || !apiBase || !appBase) {
  console.error('uso: node dokploy-proxy.mjs <puerto> <url-api> <url-app>');
  process.exit(64);
}

function target(reqUrl) {
  if (reqUrl === '/backend' || reqUrl.startsWith('/backend/') || reqUrl.startsWith('/backend?')) {
    // Strip Path (/backend) + Internal Path (/api)
    return new URL('/api' + reqUrl.slice('/backend'.length), apiBase);
  }
  return new URL(reqUrl, appBase);
}

http
  .createServer((req, res) => {
    const to = target(req.url);
    const upstream = http.request(
      to,
      { method: req.method, headers: { ...req.headers, host: to.host, 'x-forwarded-host': req.headers.host } },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy: ${to.origin} ${e.code}`);
    });
    req.pipe(upstream);
    console.log(`${req.method} ${req.url} -> ${to.href}`);
  })
  .listen(Number(port), () => console.log(`proxy :${port}  /backend -> ${apiBase}/api  |  / -> ${appBase}`));
```

### CA-1 — Una sola build, dos configuraciones

Un solo `just build-shop` (el final). La API A es la de `just api-dev` en
:9001, y la B es `PORT=9002 node dist/main.js`; las dos usan la misma base.
El shop se arranca con `yarn start -p 3003` y se pide
`/en/grocery/search` (`getServerSideProps`: no sirve HTML del build) a
través del proxy :8080. Las líneas son el log `[HTTP]` de cada API, filtrado
a las peticiones nuevas:

```
=== A: API_INTERNAL_URL='http://localhost:9001/api'
GET http://localhost:8080/en/grocery/search?text=apple -> 200 129515B 4.232878s
API A :9001, peticiones nuevas:
  GET /api/settings 200 44.8ms
  GET /api/types 200 14.3ms
  GET /api/categories 200 26.5ms
API B :9002, peticiones nuevas:
=== B: API_INTERNAL_URL='http://localhost:9002/api'
GET http://localhost:8080/en/grocery/search?text=apple -> 200 129515B 2.886840s
API A :9001, peticiones nuevas:
API B :9002, peticiones nuevas:
  GET /api/settings 200 81.0ms
  GET /api/types 200 16.5ms
  GET /api/categories 200 52.7ms
```

### CA-2 — El navegador no conoce la dirección de la API

```
$ grep -rlE 'localhost:900[01]|127\.0\.0\.1:900[01]' apps/shop/.next/static | wc -l        -> 0
$ grep -rlE 'localhost:900[01]|127\.0\.0\.1:900[01]' apps/admin/rest/.next/static | wc -l  -> 0
$ grep -roh 'authEndpoint:"[^"]*"' apps/admin/rest/.next/static | sort -u
authEndpoint:"/backend/broadcasting/auth"
$ curl http://localhost:8080/backend/settings
GET  /backend/settings      -> 200 5504B  {"id":1,"options":{"seo":{"ogImage":null,"ogTitle":null,"metaTags":nul
```

En el navegador (DevTools MCP, admin `next start` detrás del proxy :8081),
las peticiones a la API salen al mismo origen:

```
GET  http://localhost:8081/backend/settings?language=en [200]
POST http://localhost:8081/backend/token [201]
GET  http://localhost:8081/backend/me [200]
GET  http://localhost:8081/backend/analytics, /backend/orders?..., /backend/popular-products?... (dashboard)
```

### CA-3 — El SSR usa la red interna

El SSR usa `API_INTERNAL_URL`: lo muestra el CA-1. Sin la variable, sobre el
mismo build:

```
=== sin-variable: API_INTERNAL_URL=''
GET http://localhost:8080/en/grocery/search?text=apple -> 200 27158B 7.784403s
API A :9001, peticiones nuevas:
API B :9002, peticiones nuevas:
log de next start (errores):
  API_INTERNAL_URL is not defined: set it to the API address the server can reach (e.g. http://localhost:9001/api)
```

La página sale sin datos de servidor y el cliente no puede rellenarla: no hay
proxy con `/backend` delante de una configuración rota. Lo que este CA pide es
que el error nombre la variable, y la nombra.

### CA-5 — next-auth intacto detrás del proxy

```
GET  /api/auth/providers    -> {} 200
GET  /api/auth/session      -> {} 200
POST /backend/token         -> 201  token: eyJhbGciOiJIUzI1… (223 chars) | permissions: ["customer","staff"]
--- la misma ruta en Nest, para comparar:
$ curl http://localhost:9001/api/auth/providers
{"message":"Cannot GET /api/auth/providers","error":"Not Found","statusCode":404} 404
```

`{}` es la lista de proveedores de next-auth sin Google (opcional, US-70). La
API respondería con su 404 en JSON.

### CA-6 — Exportación y webhook

Admin `next start` detrás del proxy :8081, con sesión de `admin@demo.com`
(DevTools MCP):

```
/en/furniture-shop/products -> modal de importar/exportar, href de los enlaces:
["/backend/export-products/1","/backend/export-variation-options/1"]

/en/settings/payment -> URL de webhook mostrada:
{"origin":"http://localhost:8081","webhooks":["http://localhost:8081/backend/webhooks/stripe"]}
```

La URL de webhook es absoluta y sale del origen actual. Con el seed, la
lista de pasarelas no carga: `paymentGateway` vacío deja el loader «payment
method is preparing» y el selector deshabilitado, un comportamiento propio de
Pickbazar. Para que apareciera la fila, se marcó Stripe desde JS **sin
guardar**.

Los enlaces de exportación pasan por `/backend` y llegan a la API, que
responde 404:

```
GET proxy-admin /backend/export-products/1 -> 404 application/json; charset=utf-8 84B  {"message":"Cannot GET /api/export-products/1","error":"Not Found","statusCode":
GET proxy-admin /backend/export-variation-options/1 -> 404 ...  {"message":"Cannot GET /api/export-variation-options/1", ...
GET proxy-admin /backend/export-attributes/1 -> 404 ...  {"message":"Cannot GET /api/export-attributes/1", ...
$ grep -rn "export-products\|export-attributes\|export-variation" apps/api/rest/src   -> (nada)
```

**La descarga no ocurre porque la API nunca tuvo esas rutas**, ni antes ni
después de esta US. El 404 es de Nest con la ruta ya traducida a `/api/...`,
lo que prueba que el enrutado de `/backend` funciona. Implementarlas es tocar
la API (NO incluye); queda como hallazgo.

### CA-7 — Desarrollo local sin cambios de hábito

`just env` sobre los `.env` existentes, dos veces (la segunda no añade
nada):

```
$ just env
  = apps/shop/.env ya existe, no se toca
  = apps/admin/rest/.env ya existe, no se toca
  = apps/api/rest/.env ya existe, no se toca
  + API_INTERNAL_URL añadido a apps/shop/.env
  + API_INTERNAL_URL añadido a apps/admin/rest/.env
  * API fijada al puerto 9001 en los tres .env
--- segunda corrida (idempotente):
(no añade nada)
```

Tres terminales `*-dev` (`just api-dev`, `shop-dev`, `admin-dev`) sobre el
código final, sin proxy:

```
$ just verify
OK   API    :9001/api/settings  200  5503B  591ms
OK   Shop   :3003/en  200  191897B  63717ms  cards:30
OK   Admin  :3002/en/login  200  72554B  31134ms  cards:1
http://localhost:3003/backend/settings -> 200 5504B
http://localhost:3002/backend/settings -> 200 5504B
http://localhost:3003/api/auth/providers -> 200 2B
```

### CA-8 — Sin restos

```
$ grep -rn "NEXT_PUBLIC_REST_API_ENDPOINT\|NEXT_PUBLIC_ADMIN_URL" apps/shop/src apps/admin/rest/src apps/shop/.env.template apps/admin/rest/.env.template
grep rc=1
```

### CA-9 — Calidad

`tsc` y lint: ver «Línea base». Builds (API arriba para el shop, R-2):

```
just build-shop   ✓ Generating static pages using 11 workers (279/279) in 35.2s / Done in 304.80s.  SHOP_EXIT=0
just build-admin  ✓ Compiled successfully in 54s / Done in 370.45s.                                    ADMIN_EXIT=0
```

`just check`, con todos los servidores apagados:

```
OK    [1/10] packages/db build  134s
OK    [2/10] packages/db lint  6s
OK    [3/10] packages/db typecheck  21s
OK    [4/10] api/rest typecheck  71s
OK    [5/10] api/rest lint  100s
OK    [6/10] admin/rest lint  169s
OK    [7/10] shop lint  184s
OK    [8/10] api/rest test  104s
OK    [9/10] packages/db test  119s
OK    [10/10] scraper db-test  6s
check: VERDE (10 pasos, 914s)
EXIT=0
```

El `postbuild` del shop (`next-sitemap`) reescribió
`apps/shop/public/sitemap-0.xml`, con cambios solo en `lastmod`. Se restauró:
es ruido del build y no entra en el commit.

### Hallazgos que no se accionaron (NO incluye)

- **Rutas de exportación de la API** (`/export-products/:shop`,
  `/export-variation-options/:shop`, `/export-attributes/:shop`): el admin
  las enlaza, pero la API no las tiene.
- **La lista de pasarelas de Settings → Payment no carga con el seed.**
  `paymentGateway` vacío deja el loader y el selector deshabilitado; es un
  ciclo propio de Pickbazar.
- **`74-fronteras-arquitectura-lint.md:37` y `:107`** todavía citan
  `NEXT_PUBLIC_REST_API_ENDPOINT`.
- **Un `.env` previo del admin conserva `NEXT_PUBLIC_API_BROADCAST_DRIVER=pusher`.**
  La plantilla ya trae `log` (D-5); `just env` no cambia el driver, porque
  eso es configuración del dueño, no una URL.
- **`CLAUDE.md`** no describe `/backend` ni `API_INTERNAL_URL`. Es del dueño y
  esta US no lo incluía.
