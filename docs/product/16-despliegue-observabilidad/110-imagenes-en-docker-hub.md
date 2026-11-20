# US-110 — Construir y publicar las imágenes en Docker Hub desde el CI

> Las tres imágenes (API, tienda y admin) solo se construyen en local. Esta US
> hace que el CI las construya en cada cambio y, en cada push a `main`, las
> publique en la cuenta de Docker Hub del dueño con la etiqueta del commit.
> Es el paso previo a desplegarlas en Dokploy (US-111 y US-112).

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-20
**Status:** Implementado (2026-11-20); CA-6 probado en una rama, porque los secretos ya existían. Promovida desde `_backlog/` el 2026-11-20,
tras la revisión del sub-agente fable 5. El dueño fijó: un job con tres
builds (D-4), no cancelar en `main` (D-9), fallar sin credenciales salvo en
forks (D-6), construir en PR sin escribir caché (D-3 y D-5), y que la API
exponga su revisión (D-7).
**Depende de:** US-109 (job `check`). Va **antes** de US-111 y US-112.
**LOC est.:** ~120

## Historia

**Como** docente que publica la aplicación de referencia, **quiero** que cada
push a `main` deje las tres imágenes en mi cuenta de Docker Hub, etiquetadas
con el commit, **para** desplegar en Dokploy exactamente lo que pasó el CI y
poder volver a una versión anterior cambiando una etiqueta.

## Contexto (verificado el 2026-11-20 sobre `main` @ `5d168a0`)

- **Cuenta de Docker Hub del dueño:** `ronaldcuello`
  (https://hub.docker.com/repositories/ronaldcuello). Hoy no tiene
  repositorios de Safari; los `safari-*` se crean con el primer push.
  **Sin verificar:** que un token *Read & Write* cree el repositorio en el
  primer push y con qué privacidad nace (depende de la cuenta).
- **Dockerfiles:** `apps/api/rest/Dockerfile`, `apps/shop/Dockerfile` y
  `apps/admin/rest/Dockerfile`, los tres con contexto en la raíz
  (`docker-compose.yml:72-75,120-122,157-159`) y un único `.dockerignore` de
  lista blanca, que excluye `**/.env` y `**/.env.*`.
- **Secreto `extra_ca`:** los `RUN` con red lo montan con `required=false`, y
  `NODE_EXTRA_CA_CERTS` va por `RUN`, no como `ENV`. **Nunca se ejercitó sin
  el secreto:** compose siempre pasa un archivo (por defecto
  `no-extra-ca.txt`). El CI será la primera prueba real.
- **Tienda y admin, la tienda primero:**
  - comparten la etapa `deps` (210 s en frío en US-105);
  - la tienda construye sin `APPLICATION_MODE` y comprueba tipos (33.9 s);
  - el admin la fija en `production` y no los comprueba (US-15 DA-3).
- **«La misma imagen sirve para cualquier dominio»:** es cierto. Ninguna
  `NEXT_PUBLIC_*` lleva host. `API_INTERNAL_URL`, `NEXTAUTH_URL`, `SECRET` y
  `SHOP_URL` se leen en ejecución (US-102, US-103 y US-108).
- **Lo que sí queda fijo en la imagen:**
  - idiomas, versión y claves públicas de pago y mapas (vacías);
  - `images.remotePatterns` (`apps/shop/next.config.js:47-54`).

  Un grupo que quiera otros valores debe reconstruir.
- **Tamaños y tiempos:**
  - tienda 377 MB y admin 409 MB (US-105);
  - API 504 MB (US-106);
  - las tres en frío, 13 min 37 s en un solo BuildKit detrás de Zscaler
    (US-105, CA-11);
  - en el runner, sin medir.
- **`ci.yml`:** `permissions: contents: read` basta para publicar en Docker
  Hub y usar la caché `gha`. Hoy `concurrency` cancela también en `main`.
- **La caché de Actions** tiene un tope por repo (10 GB por defecto; verificar
  el valor vigente). US-11 ya ocupa ~1.8 GB con yarn, npm y pip.
- **El repo es público** (`github.com/rcuello/safari-marketplace`). Los PR
  desde forks no reciben secretos.
- **No hay secretos ni variables** en el repo hoy (verificar con
  `gh secret list` y `gh variable list` al ejecutar).

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Nombres | `<usuario>/safari-api`, `<usuario>/safari-shop` y `<usuario>/safari-admin`, públicos. El usuario sale de la variable de repo `DOCKERHUB_USERNAME`, no queda fijo en el workflow, para que otro dueño pueda reutilizarlo. |
| D-2 | Etiqueta | `sha-` seguido de los **primeros 7 caracteres de `github.sha`** (`${GITHUB_SHA::7}`; no `git rev-parse --short`, que puede dar más). Ese valor completo, con el prefijo, es el `IMAGE_TAG` de US-111 y US-112. Sin `latest`. La etiqueta se arma a mano, sin `docker/metadata-action`. |
| D-3 | Cuándo | En `pull_request` se **construyen sin publicar**, para detectar un Dockerfile roto antes del merge. En `push` a `main` se construyen y publican. `workflow_dispatch` publica **solo desde `main`** (`github.ref == 'refs/heads/main'`), y se salta cuando llega la entrada `image_tag` de vuelta atrás (US-112). |
| D-4 | Job | Job `images` con `needs: check` y `timeout-minutes` propio. **Un solo job con los tres builds en el mismo builder de BuildKit** (un step con nombre por imagen), para que la etapa `deps` de tienda y admin se haga una vez. Actions oficiales de Docker (`setup-buildx-action`, `login-action` y `build-push-action`), **fijadas por SHA** con el tag en comentario y verificadas en su documentación vigente. |
| D-5 | Caché | `type=gha` con `mode=max`. `cache-to` **solo en push a `main`**; los PR leen la caché de `main` y no escriben la suya, para no llenar el tope ni desalojar las de US-11. Tienda y admin leen también el scope de la otra (comparten `deps`). |
| D-6 | Credenciales | `DOCKERHUB_TOKEN` como **secreto** de repo (un *Personal Access Token* de Docker Hub *Read & Write*, no la contraseña) y `DOCKERHUB_USERNAME` como **variable**. Antes del login, un paso valida los dos (el secreto llega por `env:` y se comprueba en shell) y falla con un mensaje propio que los nombra. **En un fork** (`github.repository` distinto del repo del dueño), la publicación se omite con un aviso en el resumen y no falla. El login solo ocurre cuando se publica. |
| D-7 | Trazabilidad | Cada imagen lleva las labels OCI `org.opencontainers.image.revision` (SHA completo) y `org.opencontainers.image.source` (URL del repo), pasadas con `labels:`. **La API recibe además el SHA como `ARG`/`ENV` (`GIT_SHA`) y `/api/health` lo devuelve** como `revision`, junto a `instance` (US-107). Es la señal de versión que usa US-112. Sin la variable, `revision` vale `unknown`. `provenance: false`, para que el manifiesto sea simple (sin la entrada `unknown/unknown`). El resumen del job lista las tres imágenes publicadas, con etiqueta y digest. |
| D-8 | Plataforma | Solo `linux/amd64`. La guía de US-111 dice que un VPS ARM no sirve. |
| D-9 | `concurrency` | Se cancela solo en `pull_request`; en `main` las corridas se encolan, para que todo SHA de `main` en verde tenga sus tres imágenes. Ajusta la D-7 de US-109. |

## Scope

**Incluye:**
- el job `images` y el `concurrency` en `.github/workflows/ci.yml`;
- `ARG`/`ENV GIT_SHA` en `apps/api/rest/Dockerfile`;
- `revision` en el health de la API, con su spec;
- la documentación del CI: qué secreto y qué variable crear, y cómo
  generar el token.

**NO incluye:**
- el despliegue (US-111 y US-112);
- `latest`;
- multi-arquitectura;
- firma de imágenes y escaneo de vulnerabilidades;
- arreglar `NEXT_PUBLIC_SITE_URL` en `seo.tsx` o las claves fijas en el build
  (anotados como limitación).

## Tareas del dueño

**CA-6 se prueba antes de crear el secreto.** Después:

1. En Docker Hub: *Account settings → Personal access tokens*. Crear un token
   con permiso *Read & Write*.
2. En GitHub, en el repo: *Settings → Secrets and variables → Actions*:
   - secreto `DOCKERHUB_TOKEN` con el token;
   - variable `DOCKERHUB_USERNAME = ronaldcuello`.

El agente **no** crea ni lee estos valores. Si faltan cuando se necesitan, se
detiene y lo reporta.

## Criterios de aceptación

- **CA-1 — PR construye sin publicar.** En un PR de prueba, el job `images`
  construye las tres imágenes sin el secreto `extra_ca`, y no hace login, ni
  push, ni `cache-to` (se ve en el log).
- **CA-2 — Push publica.** Tras un push a `main`, Docker Hub tiene las tres
  imágenes con la etiqueta `sha-<7>` del commit. Pegar la salida de
  `docker buildx imagetools inspect <usuario>/safari-shop:sha-<7>`.
- **CA-3 — La imagen publicada funciona.** En local, con un override
  temporal de compose sin versionar (`image:` del Hub), se hace
  `docker compose ... pull api shop admin` y después `up -d --no-build`. No
  vale `just stack-up`, que reconstruye. Resultado esperado:
  - `just verify` en verde;
  - la tabla de regresión de US-105 sin cambios;
  - el digest de la imagen en ejecución igual al de `imagetools inspect`.
- **CA-4 — Trazabilidad.** Dos comprobaciones:
  - `docker inspect` de una imagen publicada muestra
    `org.opencontainers.image.revision` igual al SHA del commit;
  - `/api/health` de esa API devuelve `revision` con el mismo SHA.
- **CA-5 — Caché.** Un segundo push sin cambios en las apps tarda **menos de
  la mitad** que el primero en el job `images`. Pegar los dos tiempos y el
  tamaño de la caché observado.
- **CA-6 — Fallo sin credenciales.** Antes de crear el secreto, un
  `workflow_dispatch` en `main` falla en el paso de validación con el mensaje
  que nombra `DOCKERHUB_TOKEN`, no en un paso posterior. La corrida roja
  queda en `main`, aceptada.
  **Ajuste (2026-11-20):** el dueño creó el secreto y la variable antes de
  ejecutar la US (guía `docs/github/secretos-github-actions.md`). Para no
  tocarlos, CA-6 se prueba en una rama con PR cuyo workflow fuerza el camino
  de publicación y lee un secreto inexistente. Ese PR se cierra sin merge.
- **CA-7 — `concurrency`.** Dos pushes seguidos a `main`: la primera corrida
  termina (no se cancela) y publica sus imágenes.

## Definición de Done

- [x] CA-1 a CA-7 verificados, con la salida real pegada en «Resultado».
- [x] Documentación del CI con los pasos del dueño.
- [x] PR y rama de prueba cerrados y borrados.
- [x] Status en `Implementado` y fila del épico marcada.

## Riesgos

- **R-1 — Tiempo del runner.** Las tres imágenes en frío pueden pasar de 10
  min. Se fija un `timeout-minutes` propio y se mide. Si pasa de 30 min, se
  anota y se propone cómo partir el job.
- **R-2 — Tope de la caché de Actions.** `mode=max` pesa. Si se desalojan las
  cachés de US-11 o la propia, el build vuelve a frío: se anota lo
  observado.
- **R-3 — Límites de Docker Hub.** El job `images` baja
  `node:22.22.3-alpine3.23`. En PR no hay login, así que esos pulls son
  anónimos y cuentan contra la IP compartida del runner.
- **R-4 — `extra_ca` ausente.** Primer build sin el secreto: si algún `RUN`
  lo necesita de verdad, CA-1 lo detecta.

## Notas para el agente ejecutor

- Verificar en la documentación vigente de `docker/setup-buildx-action`,
  `docker/login-action` y `docker/build-push-action` las entradas y los SHA.
- Pushear ramas, abrir PR y publicar en Docker Hub son acciones visibles:
  confirmar con el dueño justo antes.
- Las decisiones son del dueño. Si una choca con lo que encuentres,
  **detente y pregunta**.

## Resultado (2026-11-20)

Commits en `main`:
- `e3d1388`: el job `images`, el `concurrency`, `GIT_SHA` y `revision`, y
  `apps/README.md`;
- `5657c63` y `b996189`: dos cambios de documentación, que sirvieron para
  CA-5 y CA-7.

### Qué se hizo

- **Job `images`** (`needs: check`, `ubuntu-26.04`, `timeout-minutes: 40`):
  1. «Etiqueta y destino»: `IMAGE_TAG=sha-${GITHUB_SHA::7}` y el registro
     sale de `vars.DOCKERHUB_USERNAME`;
  2. «Credenciales de Docker Hub», solo si se publica;
  3. `setup-buildx`;
  4. `login`, solo si se publica;
  5. tres `build-push-action` en el mismo builder;
  6. «Resumen de las imágenes», con etiqueta y digest, en el resumen del job
     y en el log.
- **Actions nuevas**, fijadas por SHA (resueltas con
  `gh api repos/<r>/git/ref/tags/<t>` y comprobadas con
  `gh api repos/<r>/commits/<t>`; los tres tags son ligeros):

  | Action | Tag | SHA | Publicado |
  |---|---|---|---|
  | `docker/setup-buildx-action` | v4.4.1 | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | 2026-09-16 |
  | `docker/login-action` | v4.8.0 | `8aa5831fb8d48d8f76594c7ddde61ae58019f550` | 2026-11-05 |
  | `docker/build-push-action` | v7.4.0 | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | 2026-09-15 |

- **Cuándo se publica:** `PUBLICAR` es `true` solo con
  `github.ref == 'refs/heads/main'` y un evento `push` o
  `workflow_dispatch`. En un fork (`github.event.repository.fork`) se
  construye sin publicar, con un aviso. Así no hace falta fijar el nombre del
  repositorio del dueño.
- **Caché y manifiesto:**
  - `cache-from`: el scope propio; tienda y admin leen también el de la
    otra;
  - `cache-to` (`type=gha,mode=max`) solo cuando se publica;
  - `provenance: false`;
  - las labels `org.opencontainers.image.revision` y `.source`.
- **`concurrency`:** el grupo es `ci-<workflow>-<ref>` en un PR (con
  cancelación) y `ci-<workflow>-<sha>` fuera de un PR (sin cancelación). No
  bastaba con `cancel-in-progress: false`: GitHub igual cancela las corridas
  pendientes que se acumulan detrás de la que corre. Con el SHA en el grupo,
  cada commit de `main` termina.
- **API:**
  - `ARG GIT_SHA=unknown` + `ENV GIT_SHA` al final del Dockerfile (después
    de las capas caras, para no invalidar su caché);
  - `liveness()` devuelve `revision: process.env.GIT_SHA || 'unknown'`;
  - spec nuevo para `revision`, con `vi.stubEnv`.
- **`apps/README.md`:**
  - sección «Imágenes en Docker Hub (US-110)», con los secretos, los casos
    (PR, fork, faltan credenciales) y cómo probar una imagen publicada;
  - el cuerpo de `/api/health` actualizado.
- **Guía de los estudiantes:** `docs/github/secretos-github-actions.md`
  enlaza a esa sección.

### CA-1 — PR construye sin publicar

PR #4 (rama `feat/us-110-imagenes`), corrida 44755832954, `success`:

```text
job check: success 14:41:14 -> 14:47:35
job images: success 14:47:37 -> 14:54:47
   Credenciales de Docker Hub: skipped
   Run docker/login-action@8aa5831...: skipped
   Imagen de la API: success 14:47:58 -> 14:49:23
   Imagen de la tienda: success 14:49:23 -> 14:52:17
   Imagen del admin: success 14:52:17 -> 14:53:48
```

El log de cada build dice `push: false` y no hay `cache-to`. El builder
importa la caché (`importing cache manifest from gha:…`) y no la exporta.

**Primer build real sin el secreto `extra_ca` (R-4):** cada `RUN` que lo
monta avisa y sigue:

```text
#12 0.289 Warning: Ignoring extra certs from `/run/secrets/extra_ca`, load failed: error:80000002:system library::No such file or directory
```

El admin reutiliza la etapa `deps` de la tienda, en el mismo builder:

```text
#9 [deps 2/7] WORKDIR /repo/apps
#9 CACHED
#10 [deps 5/7] COPY apps/admin/rest/package.json admin/rest/
#10 CACHED
```

### CA-2 — Push publica

Push de `e3d1388` a `main`, corrida 44758306342, `success`. El job `images`
tardó 13 min 25 s (15:03:11 → 15:16:36). Resumen del job:

```text
### Imágenes (sha-e3d1388)
Publicadas en Docker Hub.
| `ronaldcuello/safari-api:sha-e3d1388` | `sha256:d31206608a9bcb0fe31679c7e4fd5c76d41b36511f187800f60a197afc7be6f4` |
| `ronaldcuello/safari-shop:sha-e3d1388` | `sha256:2316c0f99a623a5b2c459fa843f409f8e334fbabdc410f44ed93078ca6802c9d` |
| `ronaldcuello/safari-admin:sha-e3d1388` | `sha256:4b757a9b81ec287392c843b87592bc9366612bf3d1ddd41742a6c5ad87751f48` |
```

```text
$ docker buildx imagetools inspect ronaldcuello/safari-shop:sha-e3d1388
Name:      docker.io/ronaldcuello/safari-shop:sha-e3d1388
MediaType: application/vnd.oci.image.manifest.v1+json
Digest:    sha256:2316c0f99a623a5b2c459fa843f409f8e334fbabdc410f44ed93078ca6802c9d
```

El manifiesto es simple, sin índice ni entrada `unknown/unknown`: es efecto
de `provenance: false`. La API de Docker Hub da `is_private=false` para
`safari-api`, `safari-shop` y `safari-admin`: el token *Repo Read & Write*
creó los tres repositorios en el primer push, ya públicos. El de la API
quedó registrado `2026-11-20T15:05:06Z`, con una sola etiqueta.

### CA-3 — La imagen publicada funciona

En local, con un override temporal fuera del repo (`image:` de las tres del
Hub). `COMPOSE_FILE` lo aplica a todos los comandos, también a los del script
de regresión:

```text
$ docker compose pull api shop admin
 shop Pulled
 admin Pulled
 api Pulled
$ docker compose up -d --no-build --wait
$ docker compose ps
admin ronaldcuello/safari-admin:sha-e3d1388 Up 8 seconds (healthy)
api ronaldcuello/safari-api:sha-e3d1388 Up 15 seconds (healthy)
shop ronaldcuello/safari-shop:sha-e3d1388 Up 8 seconds (healthy)
== just verify
OK   API    :9001/api/settings  200  5503B  582ms
OK   Shop   :3003/en  200  192788B  31ms  cards:30
OK   Admin  :3002/en/login  200  73118B  20ms  cards:1
== digest local vs Docker Hub
safari-api  local=sha256:d31206608a9b…f6f4  hub=sha256:d31206608a9b…f6f4  contenedor-usa-esta-imagen=si
safari-shop  local=sha256:2316c0f99a62…2c9d  hub=sha256:2316c0f99a62…2c9d  contenedor-usa-esta-imagen=si
safari-admin  local=sha256:4b757a9b81ec…1f48  hub=sha256:4b757a9b81ec…1f48  contenedor-usa-esta-imagen=si
```

La tabla de regresión de US-105 sale igual, línea por línea, que la pegada en
US-108 (CA-9):

```text
== CA-3
backend/settings tienda: 200  admin: 200
tienda /api/auth/providers: 200
admin runtime-config: {"shopUrl":"http://localhost:3003"}
admin runtime-config con SHOP_URL=https://tienda-b.example: {"shopUrl":"https://tienda-b.example"}
admin runtime-config restaurado: {"shopUrl":"http://localhost:3003"}
visita previa /en/products/apples: 200
API parada -> producto nunca visitado /en/products/blue-wilderness-chicken-recepie-2: 500
API parada -> /en/products/apples: 200  /en: 200
API de vuelta -> /en/products/blue-wilderness-chicken-recepie-2: 200
/en/products/no-existe: 404
estáticos con localhost:9001|api:9001|api-lb:9001: 0 archivos
== CA-4
optimizador w=256: 200 image/jpeg 6215B
logs de la tienda con sharp|EACCES: 0
== CA-6
http://localhost:3003/en common: 553 claves; 404-heading = "Error code: 404"
http://localhost:3002/en/login common: 553 claves; text-guest = "Guest"
logs con Cannot find module|unable to find a user config: 0
```

El script se reconstruyó en el scratchpad con el mismo contenido de su
versión de US-107, porque el scratchpad anterior se borró.

### CA-4 — Trazabilidad

```text
== labels OCI (safari-api)
e3d1388a4f7c7f93ad86abd44e6dd0296346e279 https://github.com/rcuello/safari-marketplace
== /api/health
{"status":"ok","instance":"929eaac98c74","revision":"e3d1388a4f7c7f93ad86abd44e6dd0296346e279"}
{"status":"ok","instance":"929eaac98c74","revision":"e3d1388a4f7c7f93ad86abd44e6dd0296346e279"}
commit e3d1388 completo: e3d1388a4f7c7f93ad86abd44e6dd0296346e279
```

La segunda línea de `/api/health` sale de `localhost:3003/backend/health`, por
la tienda, el camino que usará US-112.

### CA-5 — Caché

| Corrida | Job `images` | Builds (API / tienda / admin) |
|---|---|---|
| 44758306342 (`e3d1388`, primera publicación, caché vacía en `main`) | 13 min 25 s | 4 min 13 s / 5 min 41 s / 2 min 07 s |
| 44761906295 (`5657c63`, sin cambios en las apps) | 38 s | 5 s / 4 s / 4 s |
| 44761969538 (`b996189`, sin cambios en las apps) | 40 s | 6 s / 5 s / 5 s |

La corrida con caché tarda menos del 5 % de la primera. El build de la tienda
reporta 16 capas `CACHED`.

Caché de Actions del repo tras las corridas:
`4590 MB en 51 entradas` (`gh api …/actions/cache/usage`), de un tope de
10 GB. Se suma a la de yarn, npm y pip de US-11 (R-2).

El PR #4 tardó 7 min 10 s en `images` sin escribir caché, contra 13 min 25 s
en `main`. La diferencia es la exportación `mode=max` y el push.

### CA-6 — Fallo sin credenciales

Ajustado (ver el criterio): PR #5 (rama `ci/prueba-sin-credenciales`), cuyo
workflow fuerza `PUBLICAR: true` y lee `secrets.DOCKERHUB_TOKEN_QUE_NO_EXISTE`.
Corrida 44755859163, `failure`:

```text
job images: failure 14:47:20 -> 14:47:36
   Etiqueta y destino: success
   Credenciales de Docker Hub: failure
   Run docker/login-action@8aa5831...: skipped
   Imagen de la API: skipped
   Imagen de la tienda: skipped
   Imagen del admin: skipped
##[error]Falta el secreto DOCKERHUB_TOKEN (Settings → Secrets and variables → Actions). Guía: docs/github/secretos-github-actions.md
##[error]Process completed with exit code 1.
```

### CA-7 — `concurrency`

Dos pushes a `main` con 24 s de diferencia (`5657c63` a las 15:18:13 y
`b996189` a las 15:18:37). Las dos corridas corrieron a la vez, ninguna se
canceló, y cada una publicó sus tres imágenes (`sha-5657c63` y `sha-b996189`,
con sus digests en el resumen de cada job). Antes de esta US, la segunda
habría cancelado a la primera.

### Ramas y PR

- Los PR #4 y #5 se cerraron sin merge con `gh pr close --delete-branch`.
- Ese comando también borró la rama **local** `feat/us-110-imagenes`. Se
  recreó desde `e3d1388`, que seguía en el repositorio local, y `main` la
  recibió por fast-forward: no se perdió nada.
- `git ls-remote --heads origin` solo lista `main`.

### Para otra US (no se tocó)

- `NEXT_PUBLIC_SITE_URL` (`og:url`) y las claves públicas quedan fijas en el
  build de la tienda.
- La caché de Actions va en 4.6 GB. Si crece y desaloja la de US-11, se puede
  pasar a `type=registry`.
- Cada commit de `main` publica tres imágenes nuevas. Limpiar las etiquetas
  viejas de Docker Hub queda para más adelante.
