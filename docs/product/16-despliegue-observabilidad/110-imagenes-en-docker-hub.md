# US-110 — Construir y publicar las imágenes en Docker Hub desde el CI

> Las tres imágenes (API, tienda y admin) solo se construyen en local. Esta US
> hace que el CI las construya en cada cambio y, en cada push a `main`, las
> publique en la cuenta de Docker Hub del dueño con la etiqueta del commit.
> Es el paso previo a desplegarlas en Dokploy (US-111 y US-112).

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-20
**Status:** Listo para ejecución. Promovida desde `_backlog/` el 2026-11-20,
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

- [ ] CA-1 a CA-7 verificados, con la salida real pegada en «Resultado».
- [ ] Documentación del CI con los pasos del dueño.
- [ ] PR y rama de prueba cerrados y borrados.
- [ ] Status en `Implementado` y fila del épico marcada.

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
