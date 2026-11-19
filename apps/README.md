# apps/ — Arranque local (stack REST)

Guía verificada en Windows 11 + Node 22.14 + yarn 1.22.22 (2026-08-24).

## Arquitectura

| Servicio | Carpeta | Stack | Puerto |
|---|---|---|---|
| API (híbrida: Postgres + mock) | `api/rest` | NestJS 9 | `9001` |
| Tienda | `shop` | Next.js 16.4 (pages router, webpack) + React 19.3 | `3003` |
| Admin | `admin/rest` | Next.js 16.4 (pages router, webpack) + React 19.3 | `3002` |

`shop` y `admin/rest` consumen la API desde el navegador por el prefijo
relativo `/backend`, y el SSR del shop por `API_INTERNAL_URL` (US-102; ver
«Notas para el despliegue en nube»).
El único stack soportado es REST. La variante GraphQL está **congelada**: ver
la sección siguiente.

## Variante GraphQL: congelada como referencia (US-12)

**Decisión del dueño (2026-11-18):** «Congelar como referencia». Para las
dependencias: «Solo si comparte lockfile».

**Qué es la variante GraphQL:**

- `api/graphql`: el mock GraphQL original de Pickbazar (NestJS 9 y
  `@nestjs/graphql` 10, con datos en JSON). No se toca desde el commit inicial
  y nunca se migró a Postgres.
- `admin/graphql`: el admin que consume esa API. Arranca con `dev` en el
  puerto 3004.
- En el shop, los scripts `dev:gql` y `build:gql`. Los dos corren antes el
  codegen de `graphql-let`.

**Qué significa congelarla:**

- Se queda en el repo como referencia didáctica: sirve para comparar el mismo
  frontend sobre REST y sobre GraphQL. No se borra código.
- **No está soportada.** Ninguna receta del `justfile` la arranca, la
  construye, la prueba ni la verifica, y `just verify` no la mira. No hay
  garantía de que `dev:gql`, `build:gql` o `admin/graphql` funcionen. Si no
  funcionan, no es un bug que vaya a arreglarse.
- `api/graphql` sirve datos del mock, no la base de Postgres que usa el stack
  REST. Aunque arrancara, su catálogo no coincide con el de la tienda.
- `admin/graphql` sigue en el workspace de yarn (`admin/*`), así que
  `yarn install` la instala. Sacarla del workspace no entra en US-12.

**Dependencias:** mientras `admin/graphql` siga en el workspace, una
actualización solo la toca para que `yarn.lock` tenga una sola copia de un
paquete compartido (como `next`, o React con `resolutions`). No se le dedica
trabajo propio: ni lint, ni build, ni migraciones. `api/graphql` está fuera
del workspace y no se actualiza.

**Para revertir:** mantenerla operativa (recetas `*-gql` que funcionen) o
eliminarla requiere una US nueva. Si se elimina, esa US trae su plan de
remoción.

## Atajo: `just`

Hay un [`justfile`](../justfile) en la raíz que envuelve todo lo de esta guía.
Si tienes [just](https://just.systems) instalado (`winget install Casey.Just`,
`brew install just`), el camino corto es:

```bash
just              # lista todas las tareas
just doctor       # comprueba que no falte nada en tu equipo
just setup        # .env + las dos instalaciones de dependencias
just api-dev      # terminal 1
just shop-dev     # terminal 2
just admin-dev    # terminal 3
just verify       # comprueba que los tres responden con datos reales
```

El resto de este documento explica qué hace cada paso por dentro, y sigue siendo
válido si prefieres no instalar `just`.

## Requisitos

- **Node 20 o 22** (probado en 22.14).
- **yarn 1** — el repo usa `workspaces` + el campo `resolutions`, que son de yarn
  clásico. `npm install` falla por peer-deps estrictos en este árbol.
  ```bash
  npm i -g yarn      # deja yarn 1.22.x
  ```

## Puesta en marcha

### 1. Variables de entorno

Los `.env` están en `.gitignore`; hay que crearlos desde las plantillas:

```bash
cd apps
cp shop/.env.template      shop/.env
cp admin/rest/.env.template admin/rest/.env
cp api/rest/.env.example    api/rest/.env
```

Luego ajusta el **puerto de la API** (ver *Puerto 9000 ocupado* abajo) y, en
`shop/.env`, estos dos valores que vienen como placeholder:

```env
NEXTAUTH_URL=http://localhost:3003
SECRET=<cualquier-cadena-para-desarrollo>
```

`just env` los rellena, y añade `API_INTERNAL_URL` a los `.env` del shop y del
admin si falta, también en un `.env` que ya existía (US-102).

`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` son **opcionales** (US-70). Si
falta alguna, el shop no registra el proveedor de Google, `/api/auth/*`
responde con normalidad y el formulario de login no muestra «Login with
Google»; si solo hay una, el servidor del shop lo avisa al arrancar. Con las
dos, el botón vuelve, pero el paso final es un stub de la API
(`POST /api/social-login-token`, decisión 11 del Épico 19): devuelve un token
fijo que la API no acepta, así que hoy el login con Google no deja al usuario
autenticado.

### 2. Instalar dependencias

Son **dos instalaciones separadas**: `api/rest` no forma parte del workspace de
`apps/`.

```bash
cd apps          && yarn install    # shop + admin/rest + admin/graphql, que está congelada (~11 min)
cd apps/api/rest && yarn install    # API NestJS (~4 min)
```

### 3. Levantar los tres servicios

Cada uno en su propia terminal:

```bash
cd apps/api/rest   && yarn start:dev   # API   -> http://localhost:9001/api
cd apps/shop       && yarn dev:rest    # Shop  -> http://localhost:3003
cd apps/admin/rest && yarn dev         # Admin -> http://localhost:3002
```

Arranca **siempre la API primero**: los frontends hacen SSR y consultan la API
en el primer request.

> La API tarda ~2 min en el primer arranque (compilación TS de ~40 módulos).
> Next.js compila cada ruta bajo demanda: el primer `GET /` del shop puede
> tardar 60-90 s. No es un cuelgue.

### 4. Credenciales

`login`, `register`, `/me` y `change-password` son reales (US-22): la contraseña
se verifica contra el hash bcrypt de Postgres y el token es un JWT firmado.
**La única contraseña válida es `demodemo`** (la del seed, `db/seed.sql:50-54`);
cualquier otra contraseña memorizada de antes deja de servir.

| Email | Rol |
|---|---|
| `admin@demo.com` | `super_admin` |
| `store_owner@demo.com` | `store_owner` |
| `customer@demo.com` | `customer` |

> `vendor@demo.com` **no existe** en la base sembrada — es un resto de la
> documentación del mock. Usa `store_owner@demo.com` para el rol `store_owner`.

**Variables nuevas en `apps/api/rest/.env`** (`JWT_SECRET`, `JWT_EXPIRES_IN`):
`just setup`/`just env` las generan solas en un `.env` nuevo (copiado de
`.env.example`). Si tu `.env` es **anterior a esta US**, la línea `JWT_SECRET=`
no existe y `just setup` no la crea sola (mismo criterio que con
`DATABASE_URL`: no se pisa un `.env` existente). Agrégala a mano una vez:

```bash
printf '\nJWT_SECRET=%s\nJWT_EXPIRES_IN=7d\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> apps/api/rest/.env
```

Sin `JWT_SECRET` (o vacío) la API falla al arrancar con un mensaje claro — no
levanta un servidor firmando tokens con un secreto por defecto. Rotar
`JWT_SECRET` invalida todas las cookies vivas (R-7): esperado, sin mitigación
en esta US.

## Autorización (US-23): guard global + permisos por ruta

Desde US-23 la API exige JWT del lado del servidor: dos guards globales
(`APP_GUARD` en `api/rest/src/app.module.ts`) corren antes de cada
controller. **Deny-by-default**: una ruta sin `@Public()` exige un bearer
token válido; una ruta con `@Permissions(...)` exige además que el token
traiga alguno de esos permisos (semántica *any-of*, igual que `hasAccess()`
del admin).

| Situación | Respuesta |
|---|---|
| Ruta pública (catálogo, contenido, `web-hook`) | `200`, sin token |
| Ruta protegida sin `Authorization` | `401` |
| Token válido, permiso insuficiente | `403` |
| Token válido, permiso suficiente (o ruta sin `@Permissions()`) | `200` |

### Probar con token

```bash
# 1. Login → token JWT (mismo endpoint y credenciales de US-22, "Credenciales" arriba)
TOKEN=$(curl -s -X POST http://localhost:9001/api/token \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"demodemo"}' \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# 2. Ruta protegida con permiso (admin@demo.com trae super_admin)
curl -i http://localhost:9001/api/users -H "Authorization: Bearer $TOKEN"

# 3. Sin token → 401
curl -i http://localhost:9001/api/users

# 4. Con token de customer@demo.com (permiso insuficiente) → 403
```

### Auditor de rutas

`node apps/api/rest/scripts/route-audit.mjs` lista las 250 rutas y su
clasificación efectiva (`public` / `perm(...)` / `auth`); `--check` valida
que el set de rutas públicas coincida con el inventario esperado (exit 1 si
no) — es la forma reproducible de confirmar que ninguna ruta pública quedó
sin anotar antes de tocar los guards.

### Caveats declarados (no son defectos a arreglar aquí)

- **Checkout de invitado vivo (R-2)**: `POST /api/orders` y
  `POST /api/orders/checkout/verify` quedan `@Public()` a propósito
  (`guestCheckout: true`). `OrdersService.create` muta un objeto compartido
  en memoria (`this.orders[0]`); no hay rate limiting (fuera de alcance de
  esta US).
- **Webhooks sin validación de firma (R-6)**: las 3 GET de
  `web-hook.controller.ts` (Stripe/Razorpay/PayPal) son `@Public()` porque
  las llamadas de terceros no traen JWT; no verifican firma — son stubs.
- **`/docs` (Swagger) sigue abierto**: `SwaggerModule` registra sus handlers
  directo en el adaptador HTTP, fuera del pipeline de controllers, así que
  los guards globales no corren ahí. Cerrarlo es otra US.
- **`GET /orders` y `GET /refunds` no aíslan datos de punta a punta todavía**:
  `GET /orders` fuerza `customer_id` al `sub` del token en el borde
  (`orders.controller.ts`), pero `OrdersService.getOrders` hoy ignora ese
  campo y solo filtra por `shop_id`. `GET /refunds` queda autenticado sin
  filtro cableable (`RefundsService.findAll()` no acepta argumentos). Ambos
  siguen pendientes. La nota original los emplazaba a US-25, pero US-25
  ("Endpoints de usuarios y staff desde Postgres") ya se implementó y migró
  `users`, no `orders`/`refunds`. Ninguno de los dos tiene tabla en
  `db/schema.sql`, pero **no están en el mismo estado**: `orders` sí lee JSON
  estático (`@db/orders.json`), mientras que `refunds` no lee nada — todos sus
  handlers devuelven literales (`'This action adds a new refund'`,
  `{ data: [] }`), así que ahí no hay ni datos de muestra. El corte que los
  cubriría está sin decidir — ver
  `docs/product/_backlog/api-mock-restante-dominio-transaccional.md`.

## Recuperación de contraseña y OTP (US-24)

`forget-password`, `verify-forget-password-token`, `reset-password`,
`send-otp-code`, `verify-otp-code` y `otp-login` son reales: persisten un
token/código hasheado con vencimiento en `password_reset_tokens`/`otp_codes`
y lo consumen una sola vez. **No hay proveedor de correo ni de SMS** (fuera
de alcance de esta US): el secreto en claro se emite únicamente al log del
proceso de la API, con una advertencia explícita.

### Leer el secreto del log

`forget-password` y `send-otp-code` escriben una línea `WARN` con el secreto
en claro y la advertencia en la misma emisión:

```
[Nest] ... WARN [AuthService] [forget-password] Implementación de desarrollo, SIN envío real de correo. Token en claro para admin@demo.com: 3f9c...b21 (expira 2026-09-03T15:47:00.000Z)
[Nest] ... WARN [AuthService] [send-otp-code] Implementación de desarrollo, SIN envío real de SMS. Código en claro para 12365141641631: 048213 (expira 2026-09-03T14:37:00.000Z)
```

Copia el token/código de esa línea para llamar a `verify-forget-password-token`
/ `reset-password` / `verify-otp-code` / `otp-login` a mano.

### Variables de TTL

`PASSWORD_RESET_TTL_MINUTES` (default `60`) y `OTP_CODE_TTL_MINUTES` (default
`10`), en `apps/api/rest/.env`. Se leen de forma diferida y memoizada
(`recovery-options.ts`): a diferencia de `JWT_SECRET`, un valor ausente o
inválido **no impide el arranque** — se registra un `warn` y se usa el
default.

### Purga manual

`purgeExpiredAuthTokens()` (`@safari/db`) borra las filas vencidas o ya
consumidas de las dos tablas. No hay scheduler (fuera de alcance): es
mantenimiento manual, pensado para invocarse desde un script o una consola
de Node cuando haga falta liberar espacio.

### Caveats declarados (no son defectos a arreglar aquí)

- **Sin rate limiting (R-2 del épico)**: estos seis endpoints son públicos
  por naturaleza y no tienen límite de intentos. Enumerar teléfonos/emails o
  fuerza bruta contra un token/código de 6 dígitos es un hueco conocido,
  deliberadamente no atendido en esta US.
- **Oráculo temporal en `forget-password` (V-3)**: la rama con email
  existente tarda ~60-100 ms más que la de email inexistente (el `bcrypt.hash`
  del token nuevo) — la respuesta es byte-idéntica, pero la latencia no se
  nivela a propósito, para no convertir un endpoint sin rate limiting en un
  amplificador de CPU de coste fijo.

## Salud y logs de la API (US-17)

Dos endpoints públicos, sin token, para healthchecks:

| Endpoint | Qué mira | Responde |
|---|---|---|
| `GET /api/health` | liveness: solo que el proceso responde, sin tocar la base | `200 {"status":"ok"}` |
| `GET /api/health/ready` | readiness: un `SELECT 1` real a Postgres, con timeout de 2 s | `200` con `checks.database.status: "up"`; `503` con `"down"` si la base no responde |

```
$ curl -s localhost:9001/api/health/ready      # con `just db-down`
{"status":"error","checks":{"database":{"status":"down","latency_ms":45}}}
```

Un healthcheck que reinicia el proceso tiene que usar `/api/health`. Si usara
`/api/health/ready`, una base caída reiniciaría una API sana. Tampoco sirve
`/api/settings`, que con la base abajo da 500. El 503 nombra la dependencia
caída pero no trae el error del driver, que puede llevar host y puerto. Ese
detalle va al log como `WARN [HealthService]`.

Logs:

- Cada entrada lleva pid, timestamp ISO 8601 en UTC y nivel:
  `[Nest] 23828  - 2026-11-18T16:57:14.296Z     LOG [HTTP] GET /api/health/ready 503 48.3ms`.
- Hay una línea `[HTTP]` por request: método, ruta sin query string, status y
  duración.
- Los errores de Prisma salen como `ERROR [Prisma]` en una sola línea. Antes
  eran un bloque `prisma:error` suelto (`setPrismaLogSink` de `@safari/db`).
- Lo único que sigue sin prefijo son las líneas de continuación de una entrada
  multilínea, como el stack de un `ERROR [ExceptionsHandler]`.
- No hay `console.*` en `src/` (US-99): `no-console` del lint de la API lo
  impide, salvo en los `*.spec.ts`. Los stubs registran un `WARN` sin el
  cuerpo del request, y los errores de pago, mensaje y stack.

## Verificación

```bash
curl http://localhost:9001/api/health/ready  # 200 si la base responde
curl http://localhost:9001/api/settings      # 200, ~5.5 KB JSON
curl http://localhost:9001/api/products      # 200, catálogo
open  http://localhost:9001/docs             # Swagger (sigue abierto, ver arriba)
```

- `http://localhost:3003/en` → home con 30 product cards.
- `http://localhost:3002/en/login` → login (form precargado) → dashboard con
  métricas (`/api/analytics`).

Build de producción:

```bash
cd apps/shop       && yarn build:rest && yarn start   # next start -> :3000
cd apps/admin/rest && yarn build      && yarn start   # next start -> :3002
```

> Detén los `next dev` antes de compilar: comparten el directorio `.next`.

## Problemas conocidos

### Puerto 9000 ocupado

Las plantillas apuntan a `9000`. En equipos corporativos con **Zscaler**, el
proceso `ZSATunnel` ya escucha en ese puerto: Nest falla con
`EADDRINUSE :::9000` y los frontends reciben respuestas vacías que cuelgan.

Comprobación:

```bash
netstat -ano | findstr ":9000"
```

Con `just` esto se diagnostica y se corrige en dos comandos:

```bash
just check-ports              # dice qué proceso ocupa cada puerto
just API_PORT=9001 set-api-port   # sincroniza los tres .env de una vez
```

A mano, hay que cambiarlo en **tres** sitios, y deben coincidir:

```env
apps/api/rest/.env      PORT=9001
apps/shop/.env          API_INTERNAL_URL="http://localhost:9001/api"
apps/admin/rest/.env    API_INTERNAL_URL="http://localhost:9001/api"
```

(El navegador no ve ese puerto: habla con `/backend`, que el rewrite de
`next dev` manda a `API_INTERNAL_URL`.)

### `TS2688: Cannot find type definition file for 'minimatch'`

`api/rest` vive dentro del árbol de `apps/`, así que TypeScript sube directorios
y auto-incluye los `@types` hoisteados del workspace del frontend — entre ellos
stubs de deprecación sin `index.d.ts`. El error rompe el emit y Nest arranca sin
llegar a `listen`.

Resuelto acotando los tipos automáticos en `api/rest/tsconfig.json`:

```json
"types": ["node", "express", "multer"]
```

`express` y `multer` son necesarios: `uploads.controller.ts` usa el namespace
global `Express.Multer.File`.

### Warnings esperados en consola

Ruido cosmético, no fallos: `apple-mobile-web-app-capable` deprecado (solo en
el admin; el shop ya trae también `mobile-web-app-capable`). React está en
19.3.1 desde US-83, fijado con `resolutions` en `apps/package.json` (junto con
`@types/react` y `@types/react-dom`) para que admin/graphql, que sigue
declarando React 18, no deje una segunda copia en el workspace.

Los scripts de `dev` y `build` llevan `--webpack` (US-82). US-83 volvió a
probar Turbopack, el default de Next 16, con React 19: en `dev` las dos apps
piden chunks que no existen (404) y no hidratan, y en `next build` + `next
start` el shop da errores de hidratación (#418). Ver la US-83.

## Notas para el despliegue en nube

- **La API YA NO es stateless: hay que aprovisionar Postgres** (corregido
  2026-09-14; esta nota decía lo contrario y habría roto un despliegue). Nueve
  módulos —`auth`, `categories`, `manufacturers`, `products`, `settings`,
  `shops`, `tags`, `types` y `users`— leen y escriben la base vía `@safari/db`,
  y sin ella la API arranca pero esos endpoints fallan. Se necesita la
  `DATABASE_URL` del entorno y el esquema aplicado (`db/schema.sql` + `db/seed.sql`).
  De los 33 módulos restantes, 24 sirven JSON estático desde
  `api/rest/src/db/pickbazar/` y los otros 9 (`addresses`, `ai`, `feedbacks`,
  `imports`, `newsletters`, `notify-logs`, `refunds`, `uploads`, `web-hook`)
  no sirven nada: devuelven literales. Esa parte no necesita estado.
- `shop` y `admin` sí son stateless: solo consumen la API por HTTP.
- `api/rest` lee `PORT` del entorno (fallback `5000`), lo que encaja con
  App Service / Cloud Run / Heroku sin cambios.
- Las `NEXT_PUBLIC_*` se inlinean **en build time**: Next escribe su valor
  dentro del JavaScript en `next build`, y cambiarlas obliga a reconstruir.
  Por eso la dirección de la API **ya no es una `NEXT_PUBLIC_*`** (US-102):

  | Variable | App | Cuándo se lee | Para qué |
  |---|---|---|---|
  | `/backend` (constante, no variable) | shop y admin | build (queda en el JS) | prefijo relativo con el que el **navegador** habla con la API, en el mismo origen que la página; igual en todos los entornos |
  | `API_INTERNAL_URL` | shop | **ejecución** | URL de la API para el **SSR/ISR**, por la red interna (p. ej. `http://safari-api:9001/api`). Si falta, la página falla con un error que la nombra |
  | `API_INTERNAL_URL` | admin | solo `next dev` | destino del rewrite de `/backend` en desarrollo; el admin no llama a la API desde el servidor |
  | `SHOP_URL` | admin | **ejecución** | URL pública de la tienda para los enlaces «ver en la tienda» (US-103). El navegador la pide a `/api/runtime-config` del propio admin; si falta, esa ruta responde 500 nombrándola y los enlaces no se pintan |

  En `next dev`, un `rewrites()` de `next.config.js` manda `/backend/*` a
  `API_INTERNAL_URL`; no hace falta proxy. En `next build`/`next start` ese
  rewrite no existe: `/backend` lo enruta el reverse proxy de delante.
- **Dominios en Dokploy** (Traefik, https://docs.dokploy.com/docs/core/domains).
  Por cada app (shop y admin), dos dominios sobre el **mismo host**:

  | Servicio | Host | Path | Strip Path | Internal Path |
  |---|---|---|---|---|
  | shop (o admin) | `tienda.example.com` | `/` | no | — |
  | API | `tienda.example.com` | `/backend` | **sí** | `/api` |

  Así `GET tienda.example.com/backend/settings` llega a la API como
  `/api/settings`, y `/api/*` del dominio sigue siendo de Next (next-auth en el
  shop). No mandes `/api` del dominio de la tienda a la API: rompería el login
  con Google (`/api/auth/*`). El contenedor del shop recibe además
  `API_INTERNAL_URL` con la dirección interna de la API.
- `next.config.js` tiene una allowlist de `images.remotePatterns`. Cualquier
  host nuevo de imágenes debe añadirse ahí o `next/image` fallará en
  producción. `localhost` y `127.0.0.1` solo se optimizan fuera de producción
  (`dangerouslyAllowLocalIP`, US-82).
- Con `APPLICATION_MODE=production` el build ignora errores de TypeScript
  (ver `next.config.js`; desde Next 16, `next build` ya no lintea). Útil para desplegar, pero conviene que los
  estudiantes sepan que ese interruptor existe.
- `apps/deployment/` trae los scripts `zx` originales de Pickbazar para VM con
  Nginx; son una referencia, no el camino recomendado si se despliega con
  contenedores.
