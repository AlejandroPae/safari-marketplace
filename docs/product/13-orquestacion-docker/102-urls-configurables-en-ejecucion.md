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
**Status:** Listo para ejecución (promovida desde `_backlog/` el 2026-11-18,
tras revisión del sub-agente fable 5; decisiones DA-1, DA-3 y DA-4 fijadas por
el dueño)
**Depende de:** ninguna. **Bloquea a:** US-103 (comparte plantillas, `justfile`
y `apps/README.md`) y US-15 (resuelve su R-1).
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
  exigiendo `just api-dev` arriba, igual que hoy (R-2).

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

- [ ] CA-1 a CA-3 y CA-5 a CA-9 verificados, con la salida real pegada en la
  sección "Resultado" (comandos, `curl`, logs `[HTTP]` de la API).
- [ ] La configuración del proxy local usada en CA-1, CA-5 y CA-6, pegada en
  la evidencia, para reutilizarla en el laboratorio.
- [ ] `apps/README.md` actualizado.
- [ ] Status de esta US en `Implementado` y fila del Épico 13 marcada.

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
