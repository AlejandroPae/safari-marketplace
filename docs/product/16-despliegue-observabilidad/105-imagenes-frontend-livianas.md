# US-105 — Imágenes livianas de la tienda y el admin, y versiones fijas

> Las imágenes del Épico 13 funcionan, pero pesan entre 1.5 y 2 GB: admin
> 2.07 GB, tienda 1.86 GB y API 1.47 GB. En el laboratorio de Sistemas
> Distribuidos cada grupo las sube a Docker Hub desde Azure Pipelines y las
> baja en una VM con Dokploy, así que ese peso sale caro en tiempo, disco y
> cuota de pulls. Esta US adelgaza la tienda y el admin con el modo
> `standalone` de Next, sin cambiar su comportamiento. También fija las
> versiones de todas las imágenes base. La API va aparte, en
> [US-106](./106-imagen-api-liviana.md).

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-19
**Status:** Implementado (2026-11-19). Promovida desde `_backlog/` el 2026-11-19,
tras la revisión del sub-agente fable 5. El dueño la partió en US-105 y
US-106, fijó el standalone condicionado (D-1) y la ubicó en el Épico 16.
**Depende de:** ninguna. US-106 va **después**: las dos tocan
`apps/api/rest/Dockerfile` y `apps/README.md`.
**LOC est.:** ~150

## Historia

**Como** responsable del despliegue, **quiero** imágenes de la tienda y el
admin con solo lo que necesitan para correr, y versiones fijas en todas las
imágenes base, **para** que subirlas a Docker Hub y desplegarlas en Dokploy
sea rápido, quepa en una VM modesta y dé el mismo resultado cada vez.

## Contexto (medido el 2026-11-19 sobre las imágenes de `main` @ `a0e5d44`)

### Tamaños actuales (`docker images`)

| Imagen | Tamaño |
|---|---|
| `safari-admin` | 2.07 GB |
| `safari-shop` | 1.86 GB |
| `safari-api` | 1.47 GB (se adelgaza en US-106) |

### De dónde viene el peso (`docker history` y `du` dentro de las imágenes)

| Capa | Tienda | Admin | Causa |
|---|---|---|---|
| `COPY /repo/apps /repo/apps` (etapa `prod-deps`) | 1.02 GB | 1.02 GB | `node_modules` de producción de **todo el workspace** (904 MB, 570 paquetes): la tienda carga las dependencias del admin y de GraphQL, y viceversa |
| `COPY .next` | 294 MB | 494 MB | De eso, **`.next/cache` pesa 264 MB en la tienda y 425 MB en el admin**: es la caché de compilación de webpack, sin uso en ejecución |
| Base `node:22-alpine` | ~166 MB | ~166 MB | Normal |

### Hechos verificados para `standalone` (Next 16.4.5, el del código)

- Ningún `next.config.js` usa `output: 'standalone'`.
- `outputFileTracingRoot` ya vale `apps/`: Next lo infiere del `yarn.lock`
  (`apps/shop/.next/required-server-files.json`). Fijarlo es explícito, no
  cambia nada.
- `server.js` queda en `.next/standalone/shop/server.js` y en
  `.next/standalone/admin/rest/server.js`. Hace `process.chdir(__dirname)` y
  escucha en `PORT || 3000` y `HOSTNAME || '0.0.0.0'`
  (`apps/node_modules/next/dist/build/utils.js:1187-1205`). `public` y
  `.next/static` hay que copiarlos a mano.
- **Docker fija `HOSTNAME` al id del contenedor.** Sin `ENV HOSTNAME=0.0.0.0`,
  `server.js` escucharía solo en esa IP, y fallarían el healthcheck
  (`wget http://127.0.0.1:3000/...`) y `NEXTAUTH_URL_INTERNAL=http://localhost:3000`.
- **`next-i18next` en ejecución:** `serverSideTranslations` (201 usos, ninguno
  pasa config) carga `path.resolve('./next-i18next.config.js')` con
  `createRequire`. Ese archivo no lo traza Next: hay que copiarlo junto a
  `server.js`. Además requiere `tiny-invariant`, que hoy entra al trace por
  casualidad (tienda: `src/framework/rest/search.ssr.ts`; admin:
  `src/config/index.ts`). `public/locales` va con la copia de `public`.
- **El ISR del pages router escribe en `.next/server/pages`**
  (`file-system-cache.js:478`), y el optimizador de imágenes en
  `.next/cache/images`. Todo el `.next` del runtime debe pertenecer a `node`.
- **El optimizador usa el `sharp` de Next** (`next/node_modules/sharp`
  ^0.35.5, con `@img/sharp-linuxmusl-x64`), no el `sharp@0.32.6` declarado
  en los `package.json`, que nadie importa. El trace ya incluye los
  `@img/sharp-libvips-*`.
- **`next start` no funciona con standalone:** imprime `"next start" does not
  work with "output: standalone"` (`next/dist/server/next.js:257`). Por eso
  standalone va condicionado (D-1): `just start-shop` y `just start-admin`
  usan `next start`.

### Versiones flotantes

- `ARG NODE_IMAGE=node:22-alpine` en los tres Dockerfiles
  (`apps/shop/Dockerfile:16`, `apps/admin/rest/Dockerfile:16`,
  `apps/api/rest/Dockerfile:23`). Las tres imágenes corren hoy Node
  **v22.22.2**. La API en ejecución pide Node 20.19+ o 22.12+; el 22.22.3
  del `justfile:280-290` lo exige el CLI de Nest 12, no el runtime.
- `docker-compose.yml` usa `postgres:16-alpine` (líneas 15 y 39) y
  `caddy:2-alpine` (línea 163). En caché local están Postgres 16.9 y Caddy
  2.11.9, sobre Alpine 3.22.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Standalone, **condicionado** (dueño) | `output: 'standalone'` solo cuando `process.env.NEXT_OUTPUT === 'standalone'`, que el Dockerfile define como `ENV` en la etapa `build`. `outputFileTracingRoot` explícito en `apps/` (`path.join(__dirname, '..')` en la tienda, `'../..'` en el admin). Así `just build`, `just check-full` y `just start-*` quedan idénticos, sin el aviso de `next start` ni symlinks del trace en Windows. |
| D-2 | Runtime standalone | La etapa `runtime` copia `.next/standalone` a `/repo/apps`, para que las rutas (`/repo/apps/shop`, `/repo/apps/admin/rest`) no cambien. Encima copia `.next/static`, `public` y `next-i18next.config.js`, con `--chown=node:node`. Define `ENV HOSTNAME=0.0.0.0 PORT=3000` y arranca con `node server.js`. La etapa `prod-deps` desaparece. |
| D-3 | `.next` | La `.next/cache` del build no viaja en la imagen. Todo el `.next` del runtime pertenece a `node`: el ISR escribe en `.next/server/pages` y el optimizador crea `.next/cache/images`. |
| D-4 | Versiones fijas | `NODE_IMAGE=node:22.22.3-alpine3.23` (verificado con `docker manifest inspect`; es el último parche, no una exigencia de la API) en los **tres** Dockerfiles. `postgres` y `caddy` del compose con versión exacta, confirmada en Docker Hub al ejecutar: 16.x-alpine3.yy y 2.x.y-alpine. Sin `latest` ni tags de solo major. Sin digest: repo didáctico. |
| D-5 | Meta de tamaño | Tienda y admin **≤ 500 MB** cada una, y en ningún caso por encima del 50 % de su tamaño actual (tienda ≤ 0.93 GB, admin ≤ 1.03 GB). La estimación de la revisión es ~350-450 MB. Si alguna no llega, **detenerse y reportar** qué lo impide antes de forzar cambios. |
| D-6 | Lo que no cambia | El comportamiento de los contenedores: puertos internos, healthchecks, `init: true`, secreto `extra_ca` (build y runtime), usuario `node` y variables de ejecución (US-102/103/104). Las etapas `deps` de la tienda y el admin siguen idénticas byte a byte (BuildKit comparte el install). |

## Scope

**Incluye:**

- `apps/shop/Dockerfile` y `apps/admin/rest/Dockerfile`, con sus comentarios
  de cabecera (hoy hablan de `deps` y `prod-deps` idénticas);
- `apps/shop/next.config.js` y `apps/admin/rest/next.config.js` (D-1);
- `apps/api/rest/Dockerfile`: **solo** la línea `ARG NODE_IMAGE` (D-4);
- `docker-compose.yml`: solo los tags de `postgres` y `caddy` (D-4);
- `apps/README.md`: tamaños, cómo se construye standalone, por qué se fijan
  versiones, y las líneas que citan `next start`, `caddy:2-alpine` y los
  pesos (hoy ~176, 196-198 y 226-230).

**NO incluye:**

- la imagen de la API más allá de su `NODE_IMAGE` (es US-106);
- cambiar Node de major (22 → 24);
- quitar el `sharp@0.32.6` sin uso de los `package.json`;
- imágenes distroless o multi-arquitectura;
- la variante GraphQL;
- pipelines de CI o publicar en Docker Hub.

## Criterios de aceptación

### CA-0 — Línea base, antes de tocar nada
Con las imágenes actuales y `just stack-up`, se guardan en la evidencia:
`docker images` de las tres, la tabla de CA-3 y el `initialI18nStore` de CA-6.
Sin esto, «da lo mismo» no tiene contra qué compararse.

### CA-1 — Tamaños
Tabla antes/después con la salida de `docker images` para tienda y admin. Se
cumple D-5. La tabla sirve de material de clase: legible.

### CA-2 — El stack sigue vivo
`just stack-up` deja los 4 servicios en `healthy` y `just verify` en verde.

### CA-3 — Sin regresión funcional
Con el stack arriba, da lo mismo que en CA-0:

| Prueba | Esperado |
|---|---|
| `curl localhost:3003/backend/settings` y `localhost:3002/backend/settings` | 200 |
| `curl localhost:3003/api/auth/providers` | 200 (next-auth) |
| `curl localhost:3002/api/runtime-config` | `{"shopUrl":"http://localhost:3003"}` |
| `SHOP_URL=https://tienda-b.example docker compose up -d --no-build admin`, luego `runtime-config` | `{"shopUrl":"https://tienda-b.example"}`. Ojo: también recrea `api`, que interpola `SHOP_URL`. Restaurar después con `docker compose up -d --no-build admin api` |
| Visitar `/en/products/apples` con la API arriba (nada se pregenera desde US-104) | 200 |
| `docker compose stop api` y pedir un producto **nunca visitado** | 500, no 404 |
| Con la API detenida: `/en/products/apples` (ya visitado) y `/en` | 200 |
| `docker compose start api` y el mismo producto nuevo | 200 |
| `/en/products/no-existe` | 404 |
| `docker compose exec shop grep -rl "localhost:9001\|api:9001" .next/static` | vacío |

### CA-4 — Optimizador de imágenes
`curl` a `/_next/image?url=<una imagen del seed en S3>&w=256&q=75` en la
tienda responde 200 con `content-type: image/*`. Los logs del contenedor no
muestran errores de `sharp` ni `EACCES`.

### CA-5 — ISR escribe en ejecución
`docker compose exec shop ls -l .next/server/pages/en/products/` antes y
después de que pase el `revalidate` (60 s) y se vuelva a pedir un producto:
el archivo existe y su mtime cambia, sin `EACCES` en los logs.

### CA-6 — Textos traducidos
El `__NEXT_DATA__` de `/en` (tienda) y de `/en/login` (admin) trae
`initialI18nStore.en.common` no vacío e igual que en CA-0. Los logs no tienen
`Cannot find module` ni `unable to find a user config`.

### CA-7 — Standalone de verdad
Dentro de cada imagen:

- **no** existen `/repo/apps/node_modules/@next/swc-*` ni `.next/cache/webpack`;
- **sí** existen `server.js`, `next-i18next.config.js` y
  `node_modules/tiny-invariant`, este último resuelto desde el directorio
  de `server.js`.

### CA-8 — Versiones fijas
`grep -n "NODE_IMAGE=\|image:" apps/shop/Dockerfile apps/admin/rest/Dockerfile apps/api/rest/Dockerfile docker-compose.yml`
no muestra tags flotantes (`latest`, `22-alpine`, `2-alpine`, `16-alpine`).
Los `image: safari-*` son nombres de build, no tags de base. Además,
`docker run --rm --entrypoint node <img> -v` da la misma versión en las tres
imágenes.

### CA-9 — Parada limpia
`docker compose stop` detiene la tienda, el admin y la API en menos de 10 s,
con código 0 o 143, no 137.

### CA-10 — El flujo nativo no cambia
- `just check-full` en verde;
- tras `just build-shop` no existe `apps/shop/.next/standalone` (D-1);
- con el stack de Docker **abajo** (comparten puertos), `just shop-dev` y
  `just admin-dev` responden 200 en `/en` y `/en/login`.

### CA-11 — Tiempos
El «antes» son las cifras de US-15 (tienda 23 min 20 s, admin 6 min 43 s). El
«después» es el primer build tras fijar `NODE_IMAGE`, que de hecho es en frío.
Es un dato, sin meta. No hace falta repetir el «antes» con `--no-cache`.

## Escenarios Gherkin

```gherkin
Feature: Imágenes de frontend livianas sin cambiar el comportamiento

  Scenario: CA-1 — tamaño de la tienda
    Given la imagen safari-shop construida con esta US
    When ejecuto "docker images safari-shop"
    Then su tamaño es menor o igual a 500 MB

  Scenario: CA-3 — la caída de la API sigue sin dejar 404
    Given el stack arriba con las imágenes nuevas
    And la API detenida
    When pido un producto que nunca se visitó
    Then la respuesta es 500
    When levanto la API y lo pido de nuevo
    Then la respuesta es 200

  Scenario: CA-5 — ISR con el usuario node
    Given la tienda corre como usuario node, sin la caché de build
    When se regenera un producto tras su revalidate
    Then cambia el mtime de su archivo en .next/server/pages y no hay EACCES
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/shop/Dockerfile`, `apps/admin/rest/Dockerfile` | `NEXT_OUTPUT=standalone` en el build; runtime standalone sin `.next/cache`; `HOSTNAME`/`PORT`; `NODE_IMAGE` fija; cabeceras al día |
| `apps/shop/next.config.js`, `apps/admin/rest/next.config.js` | `output: 'standalone'` condicionado + `outputFileTracingRoot` |
| `apps/api/rest/Dockerfile` | Solo `ARG NODE_IMAGE` fija |
| `docker-compose.yml` | Tags exactos de `postgres` y `caddy` |
| `apps/README.md` | Tamaños, standalone, versiones fijas y líneas desactualizadas |

## Definición de Done

- [x] CA-0 a CA-11 verificados, con la salida real pegada en «Resultado».
- [x] Tabla final de tamaños en `apps/README.md`.
- [x] `just check-full` y `yarn lint` en 0 en tienda y admin, con la salida pegada.
- [x] Status de esta US en `Implementado` y fila del Épico 16 marcada.

## Riesgos

- **R-1 — next-i18next en standalone.** Si no se copia
  `next-i18next.config.js` o falta `public/locales`, la página muestra claves
  (`text-product-image`) en vez de textos (CA-6).
- **R-2 — Permisos de escritura.** Si algún trozo de `.next` no es de `node`,
  el contenedor arranca y falla en la primera regeneración o en la primera
  imagen optimizada (CA-4, CA-5).
- **R-3 — `HOSTNAME`.** Sin `ENV HOSTNAME=0.0.0.0`, el healthcheck falla y el
  servicio nunca pasa a `healthy` (CA-2).
- **R-4 — `tiny-invariant` trazado por casualidad.** Si mañana desaparece el
  import que lo arrastra, el contenedor arranca y da 500 en el primer SSR.
  CA-7 lo vigila. Si el trace no lo trae, copiarlo explícito y anotarlo.
- **R-5 — Caché de BuildKit.** Las etapas `deps` de tienda y admin deben seguir
  idénticas. Si standalone obliga a separarlas, anotar la pérdida de tiempo
  en CA-11.
- **R-6 — Docker Desktop inestable** (incidente de US-15). Si se pierde la
  caché a mitad de sesión, cada iteración vuelve a ≥ 10 min de install. Se
  admite cerrar parcialmente con la evidencia de lo verificado y lo pendiente.
- **R-7 — Postgres a otro parche.** Fijar un 16.x distinto del 16.9 en caché
  obliga a un pull tras Zscaler. El volumen sigue siendo compatible dentro de
  la major 16.

## Notas para el agente ejecutor

- Leer antes el `CLAUDE.md` raíz, `apps/README.md` y las US-14, US-15 y
  US-104 del Épico 13: sus decisiones (CA corporativo como secreto, `init`,
  usuario `node`, build sin API) se conservan.
- **Orden sugerido:** CA-0 con las imágenes actuales → fijar `NODE_IMAGE`
  (un solo rebuild en frío) → standalone → verificación.
- Detrás de Zscaler, construir con el secreto `extra_ca`, como hacen
  `just api-docker` y `just stack-up`.
- **Secuencia de verificación:** `just check` pide Postgres arriba; el smoke
  de `shop-dev`/`admin-dev` pide el stack de Docker abajo, porque comparten
  puertos.
- Las decisiones son del dueño. Si una choca con el código o con la
  documentación de Next 16, **detente y pregunta**.
- Esta US prepara las imágenes que los estudiantes de Sistemas Distribuidos
  publicarán en Docker Hub y desplegarán en Dokploy.

## Resultado (2026-11-19, rama `feat/us-105-imagenes-frontend-livianas` sobre `main` @ `93b30b5`)

### Qué cambió

| Archivo | Cambio |
|---|---|
| `apps/shop/next.config.js`, `apps/admin/rest/next.config.js` | `output: 'standalone'` + `outputFileTracingRoot` (`apps/`), solo con `NEXT_OUTPUT=standalone` (D-1). El hook de prettier del repo reformateó además el `return [...]` de `backendRewrites` (3 líneas, sin cambio de comportamiento) |
| `apps/shop/Dockerfile`, `apps/admin/rest/Dockerfile` | sin la etapa `prod-deps`; `NEXT_OUTPUT=standalone` en el build; runtime con el standalone copiado sobre `/repo/apps`, más `.next/static`, `public` y `next-i18next.config.js`, todo `--chown=node:node`; `HOSTNAME=0.0.0.0`, `PORT=3000`; `CMD node server.js`; `NODE_IMAGE` fija; cabeceras al día |
| `apps/api/rest/Dockerfile` | solo `ARG NODE_IMAGE=node:22.22.3-alpine3.23` |
| `docker-compose.yml` | `postgres:16.14-alpine3.23` (×2) y `caddy:2.11.9-alpine` |
| `apps/README.md` | tabla de servicios con los tags, «Versiones fijas», «Imágenes standalone», y pesos antes/después |

### Decisión tomada al ejecutar

- **Postgres 16.14, no 16.9.** En caché local estaba la 16.9, pero en Docker
  Hub hay parches hasta la 16.14 (`docker manifest inspect` de 16.10 a
  16.14). Fijar la 16.9 habría congelado un año de correcciones. R-7 ya
  contemplaba este caso: el volumen creado con la 16.9 arrancó sin cambios
  (`PostgreSQL 16.14 on x86_64-pc-linux-musl`). Caddy no tiene versión más
  nueva que la 2.11.9 (`2.11.10`, `2.11.11` y `2.12.0` no existen).

### Corrección a la US

- **El ISR de Next 16.4.5 no escribe en `.next/server/pages`**, como decían
  D-3, R-2 y CA-5 siguiendo la revisión. Las páginas que se generan en
  ejecución van a `.next/server/route-cache/PAGES/<hash>/$/...`, y las
  imágenes optimizadas a `.next/cache/images`. Como todo `.next` es de
  `node`, no cambia nada. CA-5 se verificó en la ruta real (abajo).

### CA-0 — Línea base (imágenes de `main` @ `a0e5d44`, etiquetadas `:base`)

```text
safari-admin:latest 2.07GB
safari-shop:latest 1.86GB
safari-api:latest 1.47GB
OK   API    :9001/api/settings  200  5503B  550ms
OK   Shop   :3003/en  200  192788B  24ms  cards:30
OK   Admin  :3002/en/login  200  73118B  13ms  cards:1
```

La tabla de CA-3, CA-4 y CA-6 la generó el mismo script antes y después. La
salida de antes es idéntica a la de después, que se pega abajo:
`diff` → «idéntico a la línea base».

### CA-1 — Tamaños

```text
$ docker images
safari-shop:latest   377MB      (antes 1.86GB)
safari-admin:latest  409MB      (antes 2.07GB)
```

| Imagen | Antes | Después | Reducción | D-5 |
|---|---|---|---|---|
| tienda | 1.86 GB | **377 MB** | −80 % | ≤ 500 MB ✅ |
| admin | 2.07 GB | **409 MB** | −80 % | ≤ 500 MB ✅ |

Los `node_modules` del runtime pasan de 904 MB, el workspace entero, a
~87 MB trazados por Next (CA-7).

### CA-2 — El stack sigue vivo

```text
$ time just stack-up
NAME              STATUS
safari-admin      Up 9 seconds (healthy)
safari-api        Up 15 seconds (healthy)
safari-postgres   Up 27 seconds (healthy)
safari-proxy      Up 3 seconds
safari-shop       Up 9 seconds (healthy)
real    1m6.005s
$ just verify
OK   API    :9001/api/settings  200  5503B  543ms
OK   Shop   :3003/en  200  192788B  24ms  cards:30
OK   Admin  :3002/en/login  200  73118B  14ms  cards:1
```

El HTML de `/en` y de `/en/login` mide lo mismo que en CA-0, byte a byte.

### CA-3, CA-4 y CA-6 — Sin regresión, optimizador y traducciones

```text
== CA-3
backend/settings tienda: 200  admin: 200
tienda /api/auth/providers: 200
admin runtime-config: {"shopUrl":"http://localhost:3003"}
admin runtime-config con SHOP_URL=https://tienda-b.example: {"shopUrl":"https://tienda-b.example"}
admin runtime-config restaurado: {"shopUrl":"http://localhost:3003"}
visita previa /en/products/apples: 200
API parada -> producto nunca visitado /en/products/lucy-minerals-foundation: 500
API parada -> /en/products/apples: 200  /en: 200
API de vuelta -> /en/products/lucy-minerals-foundation: 200
/en/products/no-existe: 404
estáticos con localhost:9001|api:9001: 0 archivos
== CA-4
optimizador w=256: 200 image/png 1235B
logs de la tienda con sharp|EACCES: 0
== CA-6
http://localhost:3003/en common: 553 claves; 404-heading = "Error code: 404"
http://localhost:3002/en/login common: 553 claves; text-guest = "Guest"
logs con Cannot find module|unable to find a user config: 0
```

### CA-5 — ISR escribe en ejecución

```text
antes:   2026-11-19 19:38:04.435201536 +0000 node
petición tras 65 s: 200
segunda petición: 200
después: 2026-11-19 19:39:43.783734887 +0000 node
logs EACCES|EPERM: 0
```

La ruta es `.next/server/route-cache/PAGES/<hash>/$/en/products/lucy-minerals-foundation.html`.
Pasado el `revalidate` (60 s), la primera petición sirve la página vieja y
dispara la regeneración, que reescribe el archivo como `node`.

### CA-7 — Standalone de verdad

```text
== safari-shop
cwd: /repo/apps/shop  usuario: node  node: v22.22.3
@next/swc-*: 0
.next/cache/webpack: 0
existe server.js
existe next-i18next.config.js
existe public/locales
existe .next/static
existe .next/server/pages
tiny-invariant desde aquí: /repo/apps/node_modules/tiny-invariant/dist/tiny-invariant.cjs.js
dueño de .next: node / server/pages: node
86.7M   /repo/apps/node_modules
21.8M   .
== safari-admin
cwd: /repo/apps/admin/rest  usuario: node  node: v22.22.3
@next/swc-*: 0
.next/cache/webpack: 0
existe server.js
existe next-i18next.config.js
existe public/locales
existe .next/static
existe .next/server/pages
tiny-invariant desde aquí: /repo/apps/node_modules/tiny-invariant/dist/tiny-invariant.cjs.js
dueño de .next: node / server/pages: node
87.4M   /repo/apps/node_modules
49.9M   .
```

### CA-8 — Versiones fijas

```text
$ grep -n "NODE_IMAGE=\|image:" apps/shop/Dockerfile apps/admin/rest/Dockerfile apps/api/rest/Dockerfile docker-compose.yml
apps/shop/Dockerfile:22:ARG NODE_IMAGE=node:22.22.3-alpine3.23
apps/admin/rest/Dockerfile:22:ARG NODE_IMAGE=node:22.22.3-alpine3.23
apps/api/rest/Dockerfile:25:ARG NODE_IMAGE=node:22.22.3-alpine3.23
docker-compose.yml:15:    image: postgres:16.14-alpine3.23
docker-compose.yml:39:    image: postgres:16.14-alpine3.23
docker-compose.yml:71:    image: safari-api
docker-compose.yml:108:    image: safari-shop
docker-compose.yml:141:    image: safari-admin
docker-compose.yml:163:    image: caddy:2.11.9-alpine
$ docker run --rm --entrypoint node <img> -v
safari-shop v22.22.3 | safari-admin v22.22.3 | safari-api v22.22.3
```

Los `image: safari-*` son los nombres de las imágenes que se construyen, no
tags de base.

### CA-9 — Parada limpia

```text
$ docker compose stop shop admin api
stop tardó 1879 ms
safari-admin Exited (143) 2 seconds ago
safari-api Exited (143) 1 second ago
safari-shop Exited (143) 2 seconds ago
```

### CA-10 — El flujo nativo no cambia

```text
$ time just check-full
OK    [1/10] packages/db build  84s
OK    [2/10] packages/db lint  3s
OK    [3/10] packages/db typecheck  12s
OK    [4/10] api/rest typecheck  65s
OK    [5/10] api/rest lint  75s
OK    [6/10] admin/rest lint  132s       ($ eslint src  Done in 129.40s.)
OK    [7/10] shop lint  47s              ($ eslint src  Done in 44.76s.)
OK    [8/10] api/rest test  66s          (Test Files 44 passed, Tests 710 passed)
OK    [9/10] packages/db test  82s       (Test Files 38 passed, Tests 499 passed)
OK    [10/10] scraper db-test  4s
check: VERDE (10 pasos, 570s)
✓ Generating static pages using 11 workers (77/77) in 11.9s     (admin, nativo)
✓ Generating static pages using 11 workers (29/29) in 11.4s     (tienda, nativo)
check-full: VERDE (check + build-api + build-admin + build-shop)
real    15m41.426s
$ ls -d apps/shop/.next/standalone apps/admin/rest/.next/standalone
ls: cannot access 'apps/shop/.next/standalone': No such file or directory
ls: cannot access 'apps/admin/rest/.next/standalone': No such file or directory
```

Con el stack de Docker abajo, salvo la API en contenedor (`just api-docker`,
que no comparte puertos con los frontends), `just shop-dev` y
`just admin-dev`:

```text
OK   API    :9001/api/settings  200  5503B  595ms
OK   Shop   :3003/en  200  191897B  946ms  cards:30
OK   Admin  :3002/en/login  200  72554B  78ms  cards:1
```

### CA-11 — Tiempos

```text
$ time docker compose build --progress=plain shop admin api      (base nueva: sin caché)
#38 [admin deps 7/7] RUN ... yarn install --frozen-lockfile ...   DONE 210.1s   (una vez, para las dos)
#51 Running TypeScript ... Finished TypeScript in 33.9s ...       (tienda; el admin: Skipping validation of types)
#51 ✓ Generating static pages using 11 workers (29/29) in 2.8s
#53 ✓ Generating static pages using 11 workers (77/77) in 6.1s
#20 [api api-build 5/7] RUN ... yarn install                      DONE 142.2s
#16 [api runtime 8/9] RUN ... yarn install --production           DONE 137.3s
real    13m37.211s
```

Antes (US-15): tienda 23 min 20 s y admin 6 min 43 s, por separado; la API
~15 min (US-14). Ahora las tres juntas tardan 13 min 37 s. Parte de la mejora
es la etapa `prod-deps`, que ya no existe; el resto depende de la red del
día, así que es un dato, no una comparación controlada.

Al terminar se apagaron los servidores `*-dev` (por su PID raíz) y el stack,
y se borraron las etiquetas `:base`. Los puertos quedaron libres.

### Hallazgos que no se accionaron (NO incluye)

- **El `sharp@0.32.6` de los `package.json` sigue sin uso**, y su
  `postinstall` descarga libvips en cada install de `deps`. Quitarlo
  aceleraría el build.
- **La API sigue en 1.47 GB:** es US-106, que puede ejecutarse ya.
- **CLAUDE.md** sigue diciendo Next 16.4.1 (el código tiene 16.4.5) y que
  `docker-compose.yml` es «Solo Postgres 16». Es del dueño.
