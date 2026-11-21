# apps/: la tienda, el admin y la API

Esta guía es para **correr y programar** Safari en tu equipo. Si lo que
quieres es publicarlo en internet, sigue [`docs/README.md`](../docs/README.md).

**Contenido**

1. [Las tres aplicaciones](#las-tres-aplicaciones)
2. [Arranque rápido con `just`](#arranque-rápido-con-just)
3. [Arranque paso a paso, sin `just`](#arranque-paso-a-paso-sin-just)
4. [Usuarios demo](#usuarios-demo)
5. [Verificar que funciona](#verificar-que-funciona)
6. [Otras formas de correrlo: contenedores](#otras-formas-de-correrlo-contenedores)
7. [Cómo funciona la API](#cómo-funciona-la-api)
8. [Imágenes en Docker Hub](#imágenes-en-docker-hub)
9. [Configuración para desplegar](#configuración-para-desplegar)
10. [Problemas conocidos](#problemas-conocidos)
11. [Referencia: la variante GraphQL](#referencia-la-variante-graphql)

---

## Las tres aplicaciones

| App | Carpeta | Stack | Puerto local |
|---|---|---|---|
| API | `api/rest` | NestJS 12 (ESM), TypeScript 6 | `9001` |
| Tienda | `shop` | Next.js 16 (pages router, webpack), React 19 | `3003` |
| Admin | `admin/rest` | Next.js 16 (pages router, webpack), React 19 | `3002` |

Debajo están PostgreSQL 16 (puerto `5433`, en Docker) y la capa de datos
[`packages/db`](../packages/db/README.md), que la API usa para leer y escribir.

**Cómo se hablan:**

- **El navegador** le habla a la API por el prefijo relativo **`/backend`**,
  en el mismo origen que la página. En desarrollo, `next dev` lo redirige a la
  API; en contenedores y en producción lo hace el proxy (Caddy).
- **El servidor de la tienda** (el render en el servidor, SSR) llama a la API
  directo, por la URL de `API_INTERNAL_URL`.

```text
navegador ──/backend/*──▶ (next dev o proxy) ──▶ API :9001/api ──▶ PostgreSQL
servidor de la tienda ──API_INTERNAL_URL────────▶ API
```

---

## Arranque rápido con `just`

**Requisitos:**

- **Node 22.22.3**, la versión de [`.nvmrc`](../.nvmrc). La API arranca con
  Node 20.19+ o 22.12+, pero el CLI de NestJS pide 22.22.3+.
- **yarn 1** (`npm i -g yarn`). El repositorio usa `workspaces` y
  `resolutions`, que son de yarn clásico: `npm install` falla en este árbol.
- **Docker**, para PostgreSQL.
- **[just](https://just.systems)** (`winget install Casey.Just` o
  `brew install just`).
- **Python 3.11+**, solo si vas a correr el scraper.

**Comandos**, desde la raíz del repositorio:

```bash
just doctor       # comprueba Node, yarn, Python, los .env y las dependencias
just setup        # crea los .env desde las plantillas e instala todo (~15 min)
just db-up        # PostgreSQL en Docker, con el esquema y los datos demo
just db-build     # construye la capa de datos (packages/db)

just api-dev      # terminal 1: API    → http://localhost:9001/api
just shop-dev     # terminal 2: tienda → http://localhost:3003
just admin-dev    # terminal 3: admin  → http://localhost:3002
just verify       # comprueba que los tres responden con datos reales
```

**Arranca siempre la API primero:** la tienda y el admin la consultan al
renderizar en el servidor.

> La primera vez tarda: la API compila en ~2 min y Next compila cada página
> la primera vez que la pides (el primer `GET /` de la tienda puede tardar
> 60-90 s). No es un cuelgue.

`just` a secas lista todas las tareas. El resto de esta guía explica qué hace
cada paso por dentro.

---

## Arranque paso a paso, sin `just`

### 1. Variables de entorno

Los `.env` no se versionan: se crean desde las plantillas.

```bash
cd apps
cp shop/.env.template       shop/.env
cp admin/rest/.env.template admin/rest/.env
cp api/rest/.env.example    api/rest/.env
```

Después:

- **El puerto de la API:** las plantillas traen `9000`. En equipos con Zscaler
  ese puerto está ocupado; usa `9001` (ver
  [Puerto 9000 ocupado](#puerto-9000-ocupado)).
- **En `shop/.env`**, completa los dos valores de ejemplo:

  ```text
  NEXTAUTH_URL=http://localhost:3003
  SECRET=<cualquier-cadena-para-desarrollo>
  ```

- **En `api/rest/.env`**, `JWT_SECRET` tiene que tener un valor: sin él, la
  API no arranca. `just env` lo genera solo en un `.env` nuevo.

`just env` hace todo esto: completa los valores y agrega `API_INTERNAL_URL` a
la tienda y al admin si falta, sin pisar lo que ya tengas.

<details>
<summary>Si tu <code>api/rest/.env</code> es anterior a que existiera <code>JWT_SECRET</code></summary>

`just env` no modifica un `.env` existente. Agrega la línea a mano una vez:

```bash
printf '\nJWT_SECRET=%s\nJWT_EXPIRES_IN=7d\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> apps/api/rest/.env
```

Cambiar `JWT_SECRET` cierra la sesión de todos los usuarios.
</details>

**Login con Google (opcional):** `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`,
en `shop/.env`. Sin las dos, la tienda no muestra el botón «Login with Google»
y todo lo demás funciona igual. Con las dos, el botón aparece, pero el último
paso es un stub de la API (`POST /api/social-login-token`): hoy el login con
Google no deja al usuario autenticado.

### 2. Instalar las dependencias

Son **dos instalaciones**: `api/rest` no es parte del workspace de `apps/`.

```bash
cd apps          && yarn install    # tienda y admin (~11 min)
cd apps/api/rest && yarn install    # API (~4 min)
```

### 3. Levantar la base y los tres servicios

```bash
just db-up                                   # o: docker compose up -d postgres + db/schema.sql y db/seed.sql
cd packages/db     && npm install && npm run build

cd apps/api/rest   && yarn start:dev   # API    → http://localhost:9001/api
cd apps/shop       && yarn dev:rest    # tienda → http://localhost:3003
cd apps/admin/rest && yarn dev         # admin  → http://localhost:3002
```

Cada servicio en su propia terminal, y la API primero.

---

## Usuarios demo

El login es real: la contraseña se compara con el hash de PostgreSQL y la API
firma un JWT. Todos los usuarios demo usan la contraseña **`demodemo`**:

| Email | Rol |
|---|---|
| `admin@demo.com` | `super_admin` |
| `store_owner@demo.com` | `store_owner` |
| `customer@demo.com` | `customer` |

> `vendor@demo.com` **no existe**: es un resto de la documentación original
> de Pickbazar. Para el rol de dueño de tienda usa `store_owner@demo.com`.

En un despliegue público, estas contraseñas se cambian antes que nada:
[`docs/dokploy/09-contrasenas-demo.md`](../docs/dokploy/09-contrasenas-demo.md).

---

## Verificar que funciona

```bash
curl http://localhost:9001/api/health/ready   # 200 si la base responde
curl http://localhost:9001/api/settings       # 200, ~5.5 KB de JSON
curl http://localhost:9001/api/products       # 200, el catálogo
```

- Swagger: `http://localhost:9001/docs`.
- `http://localhost:3003/en`: el inicio de la tienda, con 30 productos.
- `http://localhost:3002/en/login`: el login del admin, con el formulario
  precargado; al entrar, el dashboard con métricas.

`just verify` hace estas comprobaciones de una vez.

**Build de producción:**

```bash
cd apps/shop       && yarn build:rest && yarn start   # next start → :3000
cd apps/admin/rest && yarn build      && yarn start   # next start → :3002
```

> Detén los `next dev` antes de compilar: comparten la carpeta `.next`.

**El gate de calidad**, el mismo del CI: `just check` (lint, tipos y pruebas),
`just check <id>` para un solo paso y `just check-full` con los builds.

---

## Otras formas de correrlo: contenedores

### La API en contenedor

```bash
just api-docker        # PostgreSQL sembrado + API + su balanceador → http://localhost:9001/api
just api-docker-down   # apaga la API y el balanceador; PostgreSQL sigue arriba
```

Reemplaza a `just api-dev` (las dos usan el puerto 9001). La tienda y el
admin no cambian. No hay recarga automática: un cambio en la API pide volver
a correr `just api-docker`.

### El stack completo en contenedores

```bash
just stack-up     # PostgreSQL + datos demo + API + tienda + admin + proxy
just verify       # la misma comprobación que en desarrollo
just stack-down   # apaga todo; los datos de PostgreSQL se conservan
```

Usa los mismos puertos que el desarrollo (tienda 3003, admin 3002, API 9001),
así que no convive con los `*-dev`. Es el stack reproducible para una clase o
una demo, no el camino para programar. Es la misma topología que en
producción.

| Servicio | Imagen | Qué hace | Healthcheck |
|---|---|---|---|
| `postgres` | `postgres:16.14-alpine3.23` | la base, en 5433 | `pg_isready` |
| `db-init` | `postgres:16.14-alpine3.23` | aplica `db/schema.sql` y `db/seed.sql` y termina | — (la API espera a que termine bien) |
| `api` | `apps/api/rest/Dockerfile` | la API, escalable, solo en la red interna | `/api/health/ready` |
| `api-lb` | `caddy:2.11.9-alpine` | balanceador de la API: publica 9001 y reparte entre réplicas | — |
| `shop` | `apps/shop/Dockerfile` | la tienda (`node server.js`), solo en la red interna | `/en` |
| `admin` | `apps/admin/rest/Dockerfile` | el admin (`node server.js`), solo en la red interna | `/en/login` |
| `proxy` | `caddy:2.11.9-alpine` | publica 3003 y 3002; manda `/backend/*` a `api-lb` como `/api/*` | — |

**Orden de arranque:** postgres sano → db-init termina → api sana → tienda y
admin sanos → proxy. Con las imágenes ya construidas, `just stack-up` tarda
unos 40-60 s.

<details>
<summary>Detalles de las imágenes</summary>

- **Pesos:** tienda **377 MB**, admin **409 MB**, API **504 MB**. El primer
  build sin caché de las tres tarda unos 15 min.
- **Versiones fijas:** las imágenes base llevan versión exacta
  (`node:22.22.3-alpine3.23` y los tags de la tabla). Un tag de solo versión
  mayor (`22-alpine`) cambia sin aviso; así, dos builds del mismo commit dan
  lo mismo.
- **Contexto de build:** la raíz del repositorio, porque la API construye
  también `packages/db`. El `.dockerignore` es una lista blanca: no entran los
  `node_modules` locales ni ningún `.env`.
- **Tienda y admin, en modo `standalone`:** la imagen lleva `server.js` y solo
  los `node_modules` que usa el servidor (~87 MB). Tres detalles necesarios:
  `HOSTNAME=0.0.0.0` (si no, el servidor escucha solo en la IP del
  contenedor), las copias de `.next/static`, `public` y
  `next-i18next.config.js`, y que `.next` sea del usuario `node`, porque Next
  escribe ahí las páginas que genera.
- **La etapa `deps` de tienda y admin es idéntica byte a byte**, para que
  BuildKit la haga una sola vez. Si cambias una, cambia la otra igual.
- **Una sola copia de Prisma en la API:** el runtime instala la API antes de
  copiar `packages/db`, para que yarn solo cree el enlace, y `npm ci` lleva
  `--omit=optional` para no traer el CLI de Prisma.
- **Configuración:** las `NEXT_PUBLIC_*` van como `ARG` en los Dockerfiles y
  quedan fijas en el build. Lo de ejecución va en el `environment` del
  compose: `API_INTERNAL_URL` (`http://api-lb:9001/api`) y `SECRET` en la
  tienda, `SHOP_URL` en el admin, `DATABASE_URL` y `JWT_SECRET` en la API
  (con valores de desarrollo).
- **Tipos:** la imagen de la tienda comprueba los tipos en `next build`; la
  del admin no, porque su `tsc` falla con `TS2688 minimatch`
  ([ver abajo](#ts2688-cannot-find-type-definition-file-for-minimatch)).
- **Si la base se cae,** la API pasa a `unhealthy` en 20-30 s; la tienda y el
  admin siguen sirviendo las páginas que ya generaron.
</details>

### Escalar la API: varias réplicas

Con el stack arriba:

```bash
docker compose up -d --scale api=3          # tres réplicas
docker compose ps api                       # api-1, api-2 y api-3, (healthy)

# 30 peticiones por el mismo camino que el navegador: ~10 por réplica
for i in $(seq 1 30); do
  curl -s -D - -o /dev/null http://localhost:3003/backend/settings | grep -i x-served-by
done | sort | uniq -c
```

Cada respuesta trae la cabecera `X-Served-By` con el id de la réplica que la
atendió, y `/api/health` lo repite en `instance`.

**Tolerancia a fallos:** detén una réplica y sigue pidiendo; las respuestas
siguen dando 200.

```bash
docker stop safari-marketplace-api-1        # las peticiones siguen dando 200
docker start safari-marketplace-api-1       # en ~7 s vuelve a recibir tráfico
docker compose up -d --scale api=1          # volver a una réplica
```

<details>
<summary>Cómo funciona el balanceo y sus límites</summary>

- `api` no tiene `container_name` ni puerto publicado: dos réplicas no pueden
  llamarse igual ni publicar el mismo puerto. Todo pasa por `api-lb`
  (`docker/api-lb.Caddyfile`).
- **Por qué no basta `reverse_proxy api:9001`:** Caddy resolvería el nombre
  una vez y reutilizaría la conexión, así que se quedaría con una sola
  réplica. Con `dynamic a api 9001`, vuelve a resolver cada 5 s y reparte
  **por petición** (`round_robin`).
- **Health checks pasivos:** una réplica que falla queda fuera 5 s
  (`fail_duration`) y la petición se reintenta en otra (`lb_try_duration`).
- **`api-lb` no espera a la API** (`depends_on`): si esperara, el arranque se
  bloquearía en un ciclo con la tienda.
- **Sin ninguna réplica,** `/backend` tarda 8-15 s en dar 502/503 y una
  página nueva de la tienda ~1 min en dar 500.
- **Un `POST` en vuelo** cuando su réplica cae da 502: Caddy solo reintenta
  métodos idempotentes.
- **La API no guarda estado en memoria**, salvo el mock de `payment-method`,
  que guarda tarjetas en un arreglo: con varias réplicas, una tarjeta guardada
  en una no existe en las otras. Es el ejemplo de por qué un servicio
  replicado debe ser sin estado.
- **La tienda y el admin no se escalan:** cada réplica guardaría en su disco
  sus propias páginas generadas y divergirían.
</details>

---

## Cómo funciona la API

### Qué está en la base y qué no

Casi todos los módulos leen y escriben PostgreSQL por `@safari/db`. Siguen
siendo simulados:

- **Pagos:** `payment-method` y `payment-intent` sirven datos fijos, y la
  llamada a la pasarela de `POST /orders/payment` es un stub.
- **Stubs que devuelven un texto fijo:** `addresses`, `ai`, `feedbacks`,
  `imports`, `newsletters`, `notify-logs`, `refunds`, `uploads` y `web-hook`,
  y algunos métodos sueltos de otros módulos (sobre todo borrados).

### Autenticación y permisos

La API rechaza por defecto: una ruta sin `@Public()` exige un token válido, y
una ruta con `@Permissions(...)` exige además alguno de esos permisos.

| Situación | Respuesta |
|---|---|
| Ruta pública (catálogo, contenido, webhooks) | `200`, sin token |
| Ruta protegida sin `Authorization` | `401` |
| Token válido, permiso insuficiente | `403` |
| Token válido y permiso suficiente | `200` |

**Probarlo:**

```bash
# 1. Login → token
TOKEN=$(curl -s -X POST http://localhost:9001/api/token \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"demodemo"}' \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# 2. Ruta protegida, con permiso (admin@demo.com es super_admin) → 200
curl -i http://localhost:9001/api/users -H "Authorization: Bearer $TOKEN"

# 3. Sin token → 401
curl -i http://localhost:9001/api/users

# 4. Con el token de customer@demo.com → 403
```

**Auditor de rutas:** `node apps/api/rest/scripts/route-audit.mjs` lista cada
ruta y si es pública, autenticada o con permiso. Con `--check` compara las
públicas con un inventario esperado (ver
[Problemas conocidos](#el-auditor-de-rutas-falla-con---check)).

**Limitaciones conocidas:**

- **Checkout de invitado:** `POST /api/orders` y
  `POST /api/orders/checkout/verify` son públicos a propósito, y no hay límite
  de peticiones.
- **Webhooks de pago sin verificar firma:** los de Stripe, Razorpay y PayPal
  son públicos (los terceros no traen token) y son stubs.
- **Swagger (`/docs`) queda abierto:** se registra fuera de los controladores
  y los permisos no corren ahí.

### Recuperación de contraseña y códigos OTP

`forget-password`, `verify-forget-password-token`, `reset-password`,
`send-otp-code`, `verify-otp-code` y `otp-login` son reales: guardan el token
o el código con hash y vencimiento, y se usan una sola vez. **No hay envío de
correo ni de SMS:** el secreto se escribe en el log de la API.

```text
[Nest] ... WARN [AuthService] [forget-password] Implementación de desarrollo, SIN envío real de correo. Token en claro para admin@demo.com: 3f9c...b21 (expira 2026-09-03T15:47:00.000Z)
[Nest] ... WARN [AuthService] [send-otp-code] Implementación de desarrollo, SIN envío real de SMS. Código en claro para 12365141641631: 048213 (expira 2026-09-03T14:37:00.000Z)
```

- **Vencimiento:** `PASSWORD_RESET_TTL_MINUTES` (por defecto 60) y
  `OTP_CODE_TTL_MINUTES` (por defecto 10), en `api/rest/.env`. Un valor
  inválido no impide arrancar: se usa el de por defecto y queda un aviso.
- **Limpieza:** `purgeExpiredAuthTokens()` de `@safari/db` borra los vencidos
  o usados. No hay tarea programada: se corre a mano.
- **Limitaciones:** no hay límite de intentos, así que un código de 6 dígitos
  se puede atacar por fuerza bruta. Además, `forget-password` tarda unos
  60-100 ms más cuando el email existe; la respuesta es idéntica, pero el
  tiempo no se iguala a propósito.

### Salud y logs

| Endpoint | Qué comprueba | Responde |
|---|---|---|
| `GET /api/health` | que el proceso responde, sin tocar la base | `200 {"status":"ok","instance":"c413bd18b795","revision":"unknown"}` |
| `GET /api/health/ready` | que la base responde (`SELECT 1`, con 2 s de límite) | `200` con `database: "up"`, o `503` con `"down"` |

- `instance` es la réplica que respondió. `revision` es el commit del que
  salió la imagen, y vale `unknown` en desarrollo o en una imagen local.
- Para reiniciar un proceso caído usa `/api/health`: con `/api/health/ready`,
  una base caída reiniciaría una API sana.
- **Logs:**
  - cada línea lleva pid, hora en UTC y nivel;
  - cada petición deja una línea `[HTTP]` con el método, la ruta, el estado y
    la duración;
  - los errores de Prisma salen en una línea `ERROR [Prisma]`;
  - el lint impide `console.*` en el código de la API.

---

## Imágenes en Docker Hub

El CI (`.github/workflows/ci.yml`, job `images`) construye cinco imágenes en
cada PR y en cada push a `main`: la API, la tienda, el admin, `db-init` (el
esquema y los datos demo) y `proxy` (los Caddyfiles). Solo las **publica**
desde `main`, con la etiqueta `sha-<7 primeros del commit>`:

```text
<usuario>/safari-api:sha-4fcb7f1
<usuario>/safari-shop:sha-4fcb7f1
<usuario>/safari-admin:sha-4fcb7f1
<usuario>/safari-db-init:sha-4fcb7f1
<usuario>/safari-proxy:sha-4fcb7f1
```

- **Sin `latest`:** siempre se despliega un commit concreto, y volver atrás es
  cambiar la etiqueta.
- **Una imagen sirve para cualquier dominio:** las URLs se leen al ejecutar
  ([Configuración para desplegar](#configuración-para-desplegar)).
- **Trazabilidad:** cada imagen lleva la label
  `org.opencontainers.image.revision` con el commit, y la API lo devuelve en
  `/api/health`.
- **Solo `linux/amd64`:** no sirven en un servidor ARM.

**Para que el CI publique**, el repositorio necesita, en *Settings → Secrets
and variables → Actions*, el secreto `DOCKERHUB_TOKEN` y la variable
`DOCKERHUB_USERNAME`. El paso a paso está en
[`docs/github/02-secretos-github-actions.md`](../docs/github/02-secretos-github-actions.md).

| Caso | Qué pasa |
|---|---|
| Repositorio sin el secreto o la variable | El paso «Credenciales de Docker Hub» falla nombrando lo que falta |
| Fork con `DOCKERHUB_USERNAME` | Publica en el Docker Hub de esa cuenta, con sus credenciales |
| Fork sin `DOCKERHUB_USERNAME` | Construye y no publica, en verde, con un aviso de qué crear. Sin publicar tampoco guarda caché: cada corrida construye desde cero. Tras configurar, se relanza con *Run workflow* sobre `main` |
| Pull request | Construye sin publicar y aprovecha la caché de `main` |

**Probar en local una imagen publicada** sin reconstruirla: un override de
compose con `image: <usuario>/safari-<app>:sha-…`, después
`docker compose ... pull api shop admin` y `up -d --no-build`. No uses
`just stack-up`, que reconstruye en local.

---

## Configuración para desplegar

La guía de despliegue es [`docs/dokploy/`](../docs/dokploy/README.md). Esto es
lo que conviene entender de la aplicación para desplegarla.

**Lo que necesita estado:** la API lee y escribe PostgreSQL. En producción
hace falta `DATABASE_URL` y el esquema aplicado; en el compose de despliegue
lo hace la imagen `safari-db-init`. La tienda y el admin no guardan estado:
solo hablan con la API.

**Qué se lee al construir y qué al ejecutar:** las variables `NEXT_PUBLIC_*`
quedan escritas dentro del JavaScript en `next build`; cambiarlas obliga a
reconstruir. Por eso las URLs no son `NEXT_PUBLIC_*` y se leen al ejecutar:

| Variable | App | Cuándo se lee | Para qué |
|---|---|---|---|
| `/backend` (fijo, no es variable) | tienda y admin | build | prefijo con el que el **navegador** le habla a la API, en el mismo origen; igual en todos los entornos |
| `API_INTERNAL_URL` | tienda | **ejecución** | URL de la API para el render en el servidor, por la red interna (en el compose, `http://api-lb:9001/api`). Si falta, la página falla nombrándola |
| `API_INTERNAL_URL` | admin | solo `next dev` | destino de `/backend` en desarrollo; el admin no llama a la API desde el servidor |
| `SHOP_URL` | admin | **ejecución** | URL pública de la tienda, para los enlaces «ver en la tienda». Si falta, esos enlaces no aparecen |
| `NEXTAUTH_URL` | tienda | **ejecución** | URL pública de la tienda: la usa next-auth y es el dominio de `/sitemap.xml` y `/robots.txt` |

**La tienda se construye sin la API**, así que su imagen se arma en el CI:

- **Rutas dinámicas** (inicio, producto, tienda, autor, fabricante, venta
  flash): ninguna se genera en el build. Cada una se arma en su primera visita
  con los datos del entorno, así que esa primera visita es más lenta.
- **Páginas estáticas** (ayuda, términos, ofertas, listados, perfil,
  checkout…): sin API se generan sin datos y el navegador los pide al
  cargar. Se regeneran cada 60 s.
- **Un fallo pasajero de la API no deja un 404 guardado:** solo hay 404 cuando
  la API dice 404; ante un error, la página nueva da 500 y una ya generada se
  sigue sirviendo.
- **Excepción: `/become-seller`** no se puede armar sin la API. El build la
  guarda como un 404 que se regenera a los 10 s, así que **después de cada
  despliegue su primera visita da 404** y la siguiente ya responde bien.
- `just check-full` construye la tienda sin la API y vigila que esto siga
  funcionando.

**Sitemap y `robots.txt`:** se arman en cada petición
(`src/framework/rest/sitemap.ts`), así que la misma imagen sirve el dominio de
cada despliegue.

- El dominio sale de `NEXTAUTH_URL`: en producción, el dominio público de la
  tienda, no `localhost`.
- El sitemap lista las páginas públicas, los tipos, las tiendas activas y los
  productos publicados.
- Si la API no responde, `/sitemap.xml` da 503 (un buscador lo reintenta);
  `/robots.txt` no depende de la API.
- No pongas un `sitemap.xml` ni un `robots.txt` en `public/`: rompe el build.

**Detrás de Traefik (Dokploy):** Traefik termina el HTTPS y manda los dos
dominios al servicio `proxy`, que reparte como en local. La API no tiene
dominio propio: llega por `/backend`. El `docker/Caddyfile` confía en las
cabeceras `X-Forwarded-*` de la red privada, así la tienda sabe que la
petición llegó por HTTPS.

**Otros detalles:**

- **Imágenes externas:** `next.config.js` tiene una lista de hosts permitidos
  (`images.remotePatterns`). Uno nuevo hay que agregarlo ahí o `next/image`
  falla en producción.
- **`APPLICATION_MODE=production`** hace que el build ignore los errores de
  TypeScript. Sirve para desplegar, pero conviene saber que existe.
- **`PORT`:** la API lo lee del entorno (por defecto `5000`).
- **`apps/deployment/`** son los scripts originales de Pickbazar para una VM
  con Nginx. Quedan como referencia; el camino de este proyecto son los
  contenedores.

---

## Problemas conocidos

### Puerto 9000 ocupado

Las plantillas usan el `9000`. En equipos con **Zscaler**, el proceso
`ZSATunnel` ya escucha ahí: la API falla con `EADDRINUSE :::9000`, o los
frontends reciben respuestas vacías que se cuelgan.

```bash
just check-ports                  # qué proceso ocupa cada puerto
just API_PORT=9001 set-api-port   # cambia el puerto en los tres .env
```

A mano, el puerto se cambia en tres lugares, y tienen que coincidir:

```text
apps/api/rest/.env      PORT=9001
apps/shop/.env          API_INTERNAL_URL="http://localhost:9001/api"
apps/admin/rest/.env    API_INTERNAL_URL="http://localhost:9001/api"
```

### Zscaler y los certificados

Detrás de Zscaler, los builds de Docker fallan al descargar (por ejemplo,
`prisma generate` con `unable to get local issuer certificate`). Exporta
`NODE_EXTRA_CA_CERTS` con el certificado de tu empresa antes de construir: el
compose lo pasa como secreto de build, que no queda en la imagen. Sin esa
variable se usa el archivo vacío `apps/api/rest/no-extra-ca.txt`.

### `TS2688: Cannot find type definition file for 'minimatch'`

`api/rest` está dentro de `apps/`, así que TypeScript sube carpetas y toma los
`@types` del workspace de los frontends. Está resuelto en
`api/rest/tsconfig.json` limitando los tipos automáticos:

```json
"types": ["node", "express", "multer"]
```

El admin todavía tiene este error en su propio `tsc`: por eso su imagen no
comprueba tipos al construir.

### El auditor de rutas falla con `--check`

`node apps/api/rest/scripts/route-audit.mjs --check` espera 250 rutas y hoy
la API tiene 266, así que el inventario está desactualizado y el chequeo
falla, igual que dos casos de su prueba (`route-audit.test.mjs`). No es parte
de `just check`.

### Avisos esperados en la consola

- `apple-mobile-web-app-capable` deprecado, en el admin: es cosmético.
- **Los scripts usan `--webpack`:** con Turbopack, el compilador por defecto
  de Next 16, las dos apps no cargan bien en `dev` (piden archivos que no
  existen) y la tienda da errores de hidratación en producción.
- **React tiene una sola copia** (19.3.1), fijada con `resolutions` en
  `apps/package.json`, aunque `admin/graphql` declare React 18.

---

## Referencia: la variante GraphQL

El stack soportado es **REST**. La variante GraphQL de Pickbazar queda
**congelada** como referencia, para comparar el mismo frontend sobre REST y
sobre GraphQL:

- `api/graphql`: la API GraphQL original, con datos en JSON. Nunca se migró a
  PostgreSQL, así que su catálogo no coincide con el de la tienda.
- `admin/graphql`: el admin que la consume, en el puerto 3004.
- En la tienda, los scripts `dev:gql` y `build:gql`.

**No está soportada:** ninguna receta del `justfile` la arranca, la construye
ni la prueba, y no hay garantía de que funcione. `admin/graphql` sigue en el
workspace de yarn, así que `yarn install` la instala; solo se actualiza lo
necesario para que `yarn.lock` tenga una sola copia de cada paquete
compartido.
