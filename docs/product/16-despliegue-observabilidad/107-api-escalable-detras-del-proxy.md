# US-107 — API escalable detrás de un balanceador, con balanceo real

> Hoy la API del stack en compose no se puede escalar: `container_name` y el
> puerto publicado `9001:9001` impiden `docker compose up --scale api=3`. Y
> aunque se quiten, **el tráfico no se reparte**: Caddy y el SSR de la tienda
> se quedan pegados a una sola réplica. Esta US deja la API escalable de
> verdad, con un balanceo que se puede ver, sin cambiar el comportamiento de
> una sola réplica.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-19
**Status:** Implementado (2026-11-19); CA-7 aceptado sin cumplir «≤ 10 s», por decisión del dueño. Promovida desde `_backlog/` el 2026-11-19,
tras la revisión del sub-agente fable 5. El dueño fijó la topología (D-2),
el SSR por el balanceador (D-4), los health checks pasivos (D-3) y la
cabecera siempre activa (D-5).
**Depende de:** US-105 y US-106 (cerradas). Las tres tocan
`docker-compose.yml` y `apps/README.md`.
**LOC est.:** ~150

## Historia

**Como** docente de Sistemas Distribuidos, **quiero** poder correr varias
réplicas de la API detrás de un balanceador y **ver** cómo se reparte el
tráfico entre ellas y qué pasa cuando una cae, **para** que los estudiantes
practiquen escalado horizontal, balanceo de carga y tolerancia a fallos sobre
el mismo stack que despliegan.

## Contexto (medido el 2026-11-19 sobre `main` @ `3c11633`)

### Lo que impide escalar

- `docker-compose.yml:71-72` y `:91`: el servicio `api` tiene
  `container_name: safari-api` y `ports: "9001:9001"`. Con eso, `--scale api=3`
  falla: dos contenedores no pueden llamarse igual ni publicar el mismo puerto
  del host.
- Para medir, se quitaron las dos cosas con un override temporal fuera del
  repo (`container_name: !reset null`, `ports: !reset []`, Compose 2.29.2).
  Las tres réplicas arrancaron y quedaron `healthy` en ~20 s, en paralelo,
  sin conflicto con `db-init`.

### El balanceo hoy no ocurre (medido con 3 réplicas)

El DNS de Docker sí devuelve las tres IPs (`nslookup api` desde el proxy:
`172.24.0.3`, `.5` y `.4`). Aun así, contando las líneas del log de
peticiones de US-17 en cada réplica:

| Camino | Peticiones | api-1 | api-2 | api-3 |
|---|---|---|---|---|
| Navegador → Caddy `:3003/backend/settings` | 60 | 0 | 0 | **60** |
| Navegador → Caddy `:3002/backend/types` | 30 | **30** | 0 | 0 |
| SSR de la tienda (40 productos nunca visitados) | 40 | 0 | **40** | 0 |

- **Caddy:** `reverse_proxy api:9001` es un upstream **estático** con un solo
  nombre. Caddy resuelve al conectar y reutiliza la conexión keep-alive, así
  que cada bloque del Caddyfile se queda con una réplica.
- **SSR de la tienda:** `API_INTERNAL_URL=http://api:9001/api`
  (`docker-compose.yml:116`) va directo al servicio. El cliente HTTP de Node
  también reutiliza la conexión, y todo el SSR de esa tienda cae en una
  réplica.
- **Lo que sí funciona hoy:** al detener la réplica a la que estaba pegado
  Caddy, las siguientes 5 peticiones dieron 200. Caddy vuelve a resolver y
  conecta con otra.

### Upstreams dinámicos en Caddy (medido con contenedores de prueba)

Con un `caddy:2.11.9-alpine` de prueba y `dynamic a api 9001 { refresh 5s }`,
`lb_policy round_robin` y `lb_try_duration 5s`:

| Prueba | Resultado |
|---|---|
| 30 GET en conexiones nuevas, 3 réplicas | 10 / 10 / 10 |
| 9 URL en un solo `curl` (keep-alive) | 3 / 3 / 3: Caddy elige upstream por petición, no por conexión |
| Réplica reiniciada | vuelve a recibir tráfico en ~2 s |
| `POST` con cuerpo tras `docker stop` o `docker kill` de una réplica | todos 200: si falla la **conexión**, Caddy reintenta cualquier método |
| Tras detener una réplica, sin health checks pasivos | 2 de 9 GET tardan ~3.3 s (timeout de conexión hacia la IP muerta, hasta el siguiente `refresh`) |
| Lo mismo con `fail_duration 30s` | 1 de 12 peticiones lenta |
| Todas las réplicas abajo | 502 a los ~6.3 s y luego 503 a los ~7.8 s, en GET y POST; el log de Caddy registra `no upstreams available` y `failed getting dynamic upstreams` |

Según la documentación de Caddy (`reverse_proxy` → *Dynamic upstreams*):

- `refresh` vale `1m` por defecto;
- los health checks **activos** (`health_uri`) no corren con upstreams
  dinámicos, pero los **pasivos** (`fail_duration`) sí;
- si la conexión se abrió y falla el viaje, por defecto Caddy solo reintenta
  métodos idempotentes. Un `POST` en vuelo en ese instante daría 502.

### La API no guarda estado propio en memoria

En `apps/api/rest/src` no hay `@Cron`, `setInterval`, `ScheduleModule`,
`CacheModule`, `WebSocketGateway` ni `Bull`. Los `Map`/`Set` son locales a
cada petición y `src/common/fuse.ts` es solo interop ESM. Los OTP y la sesión
viven en Postgres o en el JWT (`JWT_SECRET` compartido por variable de
entorno), y `POST /attachments` es un stub que no escribe en disco.

**Excepción conocida:** `payment-method` es un mock declarado permanente
(decisión (b) de `_backlog/api-mock-restante-dominio-transaccional.md`) que
muta arreglos en memoria (`payment-method.service.ts:42, 73, 81, 125`, sobre
`this.paymentMethods`, y `:192`, `paymentGateways.push(...)` sobre un arreglo
a nivel de módulo). Con varias réplicas, una tarjeta guardada en una réplica
no existe en las otras. Es un buen ejemplo para clase de por qué un servicio
replicado debe ser sin estado; esta US no lo arregla, lo documenta (D-6).

### Interbloqueo de arranque si el SSR fuera por el proxy actual

`proxy` espera a `shop` healthy. El healthcheck de `shop` pide `/en`, que no
se pregenera (`home-pages.ssr.ts:28-31`, `fallback: 'blocking'`) y usa
`fetchQuery`, que lanza si no llega a la API. Si el SSR fuera por `proxy`,
`/en` daría 500, `shop` nunca quedaría healthy y `proxy` nunca arrancaría.
Por eso el balanceador es un servicio aparte (D-2).

### Lo que depende del nombre `safari-api` o del puerto 9001

- `safari-api` aparece solo en `docker-compose.yml:71-72` y en
  `apps/README.md:561` (el ejemplo de `API_INTERNAL_URL`). No hay
  `docker logs safari-api` en archivos versionados. Las recetas usan
  `docker compose logs api`, que sigue funcionando con réplicas.
- Hay que actualizar `apps/README.md:148-154` (`api-docker`), `:195`, `:203`,
  `:206`, `:229` y `:428` (cuerpo de `/api/health`), y la cabecera de
  `docker-compose.yml:7-8`.
- `just api-docker` (`justfile:462-475`) levanta la API y espera
  `localhost:9001`, y `api-docker-down` la detiene. `apps/README.md:152-154`
  la documenta para usarse **con la tienda y el admin nativos**.
- No cambian: `justfile:17` (`API_PORT`), `just verify` (usa
  `127.0.0.1:{{API_PORT}}`), el conteo `sanos >= 4` de `just stack-up`
  (sigue valiendo con N réplicas), `CLAUDE.md`, los `.env.template` y el
  healthcheck de la API (`127.0.0.1:9001` dentro de cada contenedor).

### Contrato de `/api/health`

`health.controller.spec.ts:33` espera `toEqual({ status: 'ok' })`. D-5 añade
un campo, así que esa prueba y `apps/README.md:428` se actualizan. El
healthcheck del compose usa `/api/health/ready`, que no cambia.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Servicio `api` escalable | Sin `container_name` ni `ports` en `api`. Los demás servicios conservan su `container_name`. Escalar es `docker compose up -d --scale api=N`. `just stack-up` sigue levantando **una** réplica, y **devuelve a una** si estaba escalada (se documenta). |
| D-2 | Topología (dueño) | **Servicio aparte `api-lb`:** un `caddy:2.11.9-alpine` con su propio Caddyfile (`docker/api-lb.Caddyfile`), **sin `depends_on`** (Caddy arranca aunque `api` aún no resuelva), que escucha `:9001` y publica `9001:9001`. El `proxy` actual conserva su `depends_on`, y su `/backend/*` va a `api-lb:9001` con la misma reescritura a `/api`. Todo el balanceo vive en `api-lb`. |
| D-3 | Balanceo en `api-lb` (dueño) | `dynamic a api 9001 { refresh 5s }`, `lb_policy round_robin`, `lb_try_duration 5s` y health checks **pasivos** con `fail_duration 5s` (5 s para no chocar con el «≤ 10 s» de CA-6). Comentario en el Caddyfile: por qué no basta `reverse_proxy api:9001`, que con upstreams dinámicos no hay health checks activos pero sí pasivos, y que un `POST` en vuelo cuando cae una réplica no se reintenta. |
| D-4 | SSR de la tienda (dueño) | `API_INTERNAL_URL=http://api-lb:9001/api`. El SSR se balancea y conmuta igual que el navegador. `shop` depende de `api` healthy y de `api-lb` started. Coste aceptado: con la API caída del todo, el 500 de una página nueva tarda ~8 s, porque el cliente de la tienda no reintenta un 503 (`http-client.ts:16-27` solo reintenta errores de red). |
| D-5 | Ver qué réplica respondió (dueño) | **Siempre**: un middleware de Express en `src/common/`, junto a `requestLogger`, registrado con `app.use` en `main.ts`, pone `X-Served-By: <os.hostname()>` en **todas** las respuestas (también 401 de guards y 404). En el contenedor es el id corto (12 hex); en `api-dev`, el nombre del equipo. Un interceptor no cubriría los 401 ni los 404. `HealthService.liveness()` añade `instance` con el mismo valor. `/api/health/ready` no cambia. **Excepción declarada al contrato byte a byte** (CLAUDE.md): `/api/health` cambia de cuerpo y el resto solo gana una cabecera; los 5504 bytes de `/api/settings` no cambian. |
| D-6 | Estado en memoria | `payment-method` no se migra. Se documenta en `apps/README.md` como el caso que rompe con réplicas, con las líneas del servicio. |
| D-7 | `api-docker` | Pasa a `docker compose up -d --build api api-lb` y espera `localhost:9001`. `api-docker-down` detiene `api` y `api-lb`. 3003 y 3002 quedan libres para `shop-dev`/`admin-dev`, como hoy. |
| D-8 | Lo que no cambia | Con una sola réplica, el comportamiento es idéntico al de hoy: la tabla de regresión de US-105 (CA-3, CA-4 y CA-6) da lo mismo, byte a byte donde aplique. |

## Scope

**Incluye:**

- `docker-compose.yml`:
  - servicio `api` (D-1);
  - servicio nuevo `api-lb` (D-2);
  - `proxy` hacia `api-lb`;
  - `shop` (D-4);
  - la cabecera del archivo;
- `docker/api-lb.Caddyfile` (nuevo) y `docker/Caddyfile` (D-2, D-3);
- `apps/api/rest/src`: el middleware de D-5, con su prueba (en `logging.spec.ts`
  o en un spec propio), y `instance` en `HealthService.liveness()`, con
  `health.controller.spec.ts` actualizado;
- `justfile`: `api-docker` y `api-docker-down` (D-7), y el mensaje de
  `stack-up` si hace falta. Una receta `just stack-scale N` es opcional;
- `apps/README.md`:
  - cómo escalar y qué se observa (comandos copiables);
  - la limitación de `payment-method`;
  - el ejemplo corregido de `API_INTERNAL_URL`;
  - las líneas listadas en el contexto.

**NO incluye:**

- escalar la tienda o el admin (su ISR escribe en el disco de cada réplica y
  la caché divergería: es otra US);
- migrar `payment-method` a Postgres;
- réplicas de Postgres;
- que la API drene peticiones al pararse (`enableShutdownHooks`): CA-11 solo
  lo mide;
- Dokploy, Swarm o Kubernetes: esta US es el compose local. Si el balanceo de
  Traefik en Dokploy se comporta distinto, se anota como hallazgo;
- métricas o trazas distribuidas.

## Criterios de aceptación

### CA-0 — Línea base
Antes de cambiar nada, con el stack actual, se corre la tabla de regresión de
US-105 (CA-3, CA-4 y CA-6, en `105-imagenes-frontend-livianas.md`) y se guarda
la salida. El script de US-105 no está versionado: hay que reescribirlo y
guardarlo fuera del repo, en el scratchpad. Correrlo **antes de escalar**: sus
filas paran y recrean `api`.

### CA-1 — Una réplica, sin regresión
`just stack-up` y `just verify` en verde. La tabla de CA-0 da lo mismo
(`diff`). El grep de estáticos busca también `api-lb:9001`.

### CA-2 — Arranque limpio, sin interbloqueo
`docker compose down` (sin `-v`) y `just stack-up` llegan a los 4 servicios
`healthy`, con `api-lb` y `proxy` `Up`.

### CA-3 — Escala
`docker compose up -d --scale api=3`: las tres réplicas `healthy`, y
`just verify` en verde. `docker compose logs api` muestra los prefijos
`api-1`, `api-2` y `api-3`.

### CA-4 — Balanceo por el navegador
60 peticiones a `localhost:3003/backend/settings` y 60 a
`localhost:3002/backend/settings`: cada réplica recibe **entre 18 y 22** en
cada caso, contadas por `X-Served-By`. Se confirma con los logs, filtrando
por ruta (el healthcheck pide `/api/health/ready` cada 10 s). Con keep-alive
(varias URL en un solo `curl`), el reparto se mantiene.

### CA-5 — Balanceo del SSR
30 productos nunca visitados: **ninguna réplica recibe más del 45 %** de sus
peticiones de SSR. Se cuenta por las líneas del log de cada réplica, porque
`X-Served-By` no se ve desde el navegador en el SSR.

### CA-6 — Una réplica cae
Con 3 réplicas, `docker stop` de una: 30 peticiones por `/backend`, todas
200, **ninguna de más de 4 s**; se pega cuántas fueron lentas. La réplica
vuelve con `docker start` y, en ≤ 10 s, vuelve a recibir tráfico.

### CA-7 — Todas caen
Con la API detenida:

- `/backend/settings` da 502 o 503 en **≤ 10 s**;
- un producto nunca visitado sigue dando 500, no 404, como en el Épico 13; se
  anota cuánto tarda (~8 s esperados por D-4).

### CA-8 — Sesión entre réplicas
Con 3 réplicas: `POST /backend/token` (admin@demo.com) y luego 6 ×
`GET /backend/me` con ese token, todas 200, con **al menos 2 `X-Served-By`
distintos**. El JWT emitido por una réplica vale en otra.

### CA-9 — Estado compartido
Con 3 réplicas, una escritura reversible por `/backend`, servida por una
réplica, se lee igual desde otra (`X-Served-By` distinto). Ejemplo: crear y
luego borrar un tag con el token del admin. Opcional: demostrar la
divergencia de `payment-method` (D-6) con la misma técnica.

### CA-10 — `localhost:9001` y `api-docker`
- `curl localhost:9001/api/health` devuelve `status` e `instance`, y la
  cabecera `X-Served-By`;
- con el stack abajo, `just api-docker` deja la API en `localhost:9001`, con
  3003 y 3002 libres, y `just shop-dev` responde 200 en `/en` contra ella;
- `just api-docker-down` detiene `api` y `api-lb`.

### CA-11 — Escalar hacia abajo
De 3 a 1 réplica (`--scale api=1`), con un bucle de 1 petición cada 200 ms
durante el cambio. Se pega cuántas fallaron y por qué. Con la API sin drenaje
(sale con 143 en ~2 s), un GET en vuelo se reintenta y un POST en vuelo daría
502. No bloquea el cierre, pero se documenta.

### CA-12 — Gate
`just check` en verde, con la prueba nueva del middleware y la de
`/api/health` actualizada.

## Escenarios Gherkin

```gherkin
Feature: API escalable detrás de un balanceador

  Scenario: CA-4 — el tráfico se reparte
    Given el stack arriba con 3 réplicas de la API
    When hago 60 peticiones a localhost:3003/backend/settings
    Then cada réplica, según X-Served-By, recibe entre 18 y 22

  Scenario: CA-6 — una réplica cae
    Given el stack arriba con 3 réplicas de la API
    When detengo una réplica
    And hago 30 peticiones por /backend
    Then todas responden 200 y ninguna tarda más de 4 s

  Scenario: CA-8 — la sesión vale en cualquier réplica
    Given un token obtenido con POST /backend/token
    When hago 6 peticiones a GET /backend/me con ese token
    Then todas responden 200 desde al menos 2 réplicas distintas
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `docker-compose.yml` | `api` escalable, servicio `api-lb`, `proxy` → `api-lb`, `API_INTERNAL_URL` de `shop`, cabecera |
| `docker/api-lb.Caddyfile` | Nuevo: `:9001` con upstreams dinámicos, round robin y health checks pasivos |
| `docker/Caddyfile` | `/backend/*` → `api-lb:9001` |
| `apps/api/rest/src/common/` + `main.ts` | Middleware `X-Served-By` y su prueba |
| `apps/api/rest/src/health/` | `instance` en liveness; spec actualizado |
| `justfile` | `api-docker`, `api-docker-down` (y `stack-scale` opcional) |
| `apps/README.md` | Sección de escalado, `payment-method`, líneas listadas |

## Definición de Done

- [x] CA-0 a CA-12 verificados, con la salida real pegada en «Resultado».
- [x] `apps/README.md` con la sección de escalado y la limitación de
  `payment-method`.
- [x] Status de esta US en `Implementado` y fila del Épico 16 marcada.

## Riesgos

- **R-1 — Ventana de `refresh`.** Con `refresh 5s`, una réplica nueva tarda
  hasta 5 s en recibir tráfico, y una que se fue sigue en la lista hasta 5 s
  (la cubren `lb_try_duration` y `fail_duration`). Si CA-6 o CA-11 fallan por
  esto, ajustar y anotar el valor elegido.
- **R-2 — `fail_duration` con IP reutilizada.** No se probó: una réplica que
  vuelve con la misma IP podría seguir marcada hasta 5 s. Lo cubre el
  «≤ 10 s» de CA-6.
- **R-3 — `depends_on: api: service_healthy` con N réplicas.** No se verificó
  si espera a todas. Con `--scale` sobre un stack ya arriba no aplica.
- **R-4 — Pool de Prisma por réplica** frente al `max_connections` de
  Postgres. Con 3 réplicas es irrelevante; anotarlo para clase.
- **R-5 — Docker Desktop inestable** (incidentes de US-15 y US-106). Se admite
  cerrar parcialmente con la evidencia de lo verificado y lo pendiente.

## Notas para el agente ejecutor

- Leer antes:
  - US-15 (stack en compose y Caddyfile);
  - US-17 (health y log de peticiones);
  - US-105 (tabla de regresión);
  - US-106;
  - la documentación de Caddy 2.11, `reverse_proxy` → *Dynamic upstreams*,
    *Load balancing* y *Passive health checks*.
- **Orden sugerido:**
  1. CA-0 con el stack actual;
  2. D-5 y su prueba, con `just check` (una sola reconstrucción de la imagen
     de la API);
  3. compose y Caddyfiles;
  4. verificación, primero con una réplica y después escalando.
- Detrás de Zscaler, construir con el secreto `extra_ca`, como `just stack-up`.
- Las decisiones son del dueño. Si una choca con el código o con la
  documentación de Caddy, **detente y pregunta**.
- Esta US alimenta el laboratorio de Sistemas Distribuidos: los comandos para
  escalar y observar el balanceo deben quedar en `apps/README.md` de forma que
  un estudiante los pueda copiar.

## Resultado (2026-11-19, rama `feat/us-107-api-escalable` sobre `main` @ `d8de954`)

### Qué cambió

| Archivo | Cambio |
|---|---|
| `apps/api/rest/src/common/served-by.ts` (+ spec) | nuevo: `INSTANCE = os.hostname()` y el middleware `servedBy`, que pone `X-Served-By` en todas las respuestas. 3 tests: respuesta normal sin tocar el cuerpo, 401 y 404 sin controlador |
| `apps/api/rest/src/main.ts` | `app.use(servedBy)` antes de `requestLogger` |
| `apps/api/rest/src/health/health.service.ts` (+ spec) | `liveness()` devuelve `{ status, instance }` |
| `docker-compose.yml` | `api` sin `container_name` ni `ports`; servicio nuevo `api-lb` (Caddy, sin `depends_on`, publica 9001); `shop` con `API_INTERNAL_URL=http://api-lb:9001/api` y `depends_on: api-lb: service_started`; cabecera |
| `docker/api-lb.Caddyfile` | nuevo: `dynamic a api 9001 { refresh 5s }`, `round_robin`, `lb_try_duration 5s`, `fail_duration 5s`, con comentarios |
| `docker/Caddyfile` | `/backend/*` → `api-lb:9001` |
| `justfile` | `api-docker` levanta `api api-lb`; `api-docker-down` detiene los dos; comentario de `stack-up` (vuelve a 1 réplica) |
| `apps/README.md` | sección «Escalar la API», tabla de servicios con `api-lb`, ejemplos de `API_INTERNAL_URL` y de `/api/health` corregidos |

### Decisión del dueño al ejecutar

- **CA-7 se acepta y se documenta**, no se ajusta. Con 0 réplicas no se
  cumple «≤ 10 s» (detalle abajo). El dueño eligió conservar su D-3 y anotar
  los tiempos medidos y su causa.

### CA-0 — Línea base (`main` @ `d8de954`, una API con `container_name`)

La tabla de regresión de US-105 se reescribió en el scratchpad, fuera del
repo, con el grep de estáticos ampliado a `api-lb:9001` y la imagen de CA-4
tomada de la API: `/en` puede regenerarse sin productos mientras la API está
parada, la degradación de 60 s de US-104.

```text
== CA-3
backend/settings tienda: 200  admin: 200
tienda /api/auth/providers: 200
admin runtime-config: {"shopUrl":"http://localhost:3003"}
admin runtime-config con SHOP_URL=https://tienda-b.example: {"shopUrl":"https://tienda-b.example"}
admin runtime-config restaurado: {"shopUrl":"http://localhost:3003"}
visita previa /en/products/apples: 200
API parada -> producto nunca visitado /en/products/pat-mcgrath-glitter: 500
API parada -> /en/products/apples: 200  /en: 200
API de vuelta -> /en/products/pat-mcgrath-glitter: 200
/en/products/no-existe: 404
estáticos con localhost:9001|api:9001|api-lb:9001: 0 archivos
== CA-4
optimizador w=256: 200 image/jpeg 6215B
logs de la tienda con sharp|EACCES: 0
== CA-6
http://localhost:3003/en common: 553 claves; 404-heading = "Error code: 404"
http://localhost:3002/en/login common: 553 claves; text-guest = "Guest"
logs con Cannot find module|unable to find a user config: 0
$ curl -s localhost:9001/api/health
{"status":"ok"}         (sin X-Served-By)
```

### CA-1 — Una réplica, sin regresión

```text
$ just verify
OK   API    :9001/api/settings  200  5503B  478ms
OK   Shop   :3003/en  200  192788B  21ms  cards:30
OK   Admin  :3002/en/login  200  73118B  20ms  cards:1
$ diff <(tr -d '\r' < antes) <(tr -d '\r' < después)
idéntico sin CR
```

La tabla da lo mismo, con un producto nunca visitado distinto en cada
corrida (`mary-kay-lipstick`, normalizado en el `diff`). El primer intento
mostró `(la API no volvió a healthy)`: la espera del script buscaba el
contenedor `safari-api`, que ya no existe (R-3). Se cambió por
`docker compose ps api`.

### CA-2 — Arranque limpio, sin interbloqueo

```text
$ docker compose down && time just stack-up
safari-admin               Up 8 seconds (healthy)
safari-api-lb              Up 23 seconds
safari-marketplace-api-1   Up 14 seconds (healthy)
safari-postgres            Up 23 seconds (healthy)
safari-proxy               Up 2 seconds
safari-shop                Up 8 seconds (healthy)
real    0m38.842s
```

### CA-3 — Escala

```text
$ time docker compose up -d --no-build --scale api=3
real    0m12.311s
safari-marketplace-api-1 Up 38 seconds (healthy)    c413bd18b795
safari-marketplace-api-2 Up 9 seconds (healthy)     1fe058d013ea
safari-marketplace-api-3 Up 10 seconds (healthy)    18b26bc5055c
OK   API    :9001/api/settings  200  5503B  561ms
OK   Shop   :3003/en  200  192788B  19ms  cards:30
OK   Admin  :3002/en/login  200  73118B  16ms  cards:1
$ docker compose logs api | grep -oE "^api-[0-9]+" | sort | uniq -c
    419 api-1
    410 api-2
    411 api-3
```

### CA-4 — Balanceo por el navegador

```text
60 GET :3003/backend/settings
  safari-marketplace-api-3 (18b26bc5055c): 20
  safari-marketplace-api-2 (1fe058d013ea): 19
  safari-marketplace-api-1 (c413bd18b795): 21
60 GET :3002/backend/settings
  safari-marketplace-api-3 (18b26bc5055c): 20
  safari-marketplace-api-2 (1fe058d013ea): 21
  safari-marketplace-api-1 (c413bd18b795): 19
keep-alive: 9 URL en un solo curl
  safari-marketplace-api-3: 3
  safari-marketplace-api-2: 3
  safari-marketplace-api-1: 3
logs: GET /api/settings 200 por réplica (120 + 9 de keep-alive esperadas)
  safari-marketplace-api-1: 43
  safari-marketplace-api-2: 43
  safari-marketplace-api-3: 43
```

### CA-5 — Balanceo del SSR

30 productos nunca visitados, contados por el log de cada réplica:

```text
códigos:      30 200
  safari-marketplace-api-1: 10 peticiones de SSR
  safari-marketplace-api-2: 10 peticiones de SSR
  safari-marketplace-api-3: 10 peticiones de SSR
  total: 30
```

33 % por réplica (máximo: 45 %).

### CA-6 — Una réplica cae

```text
detenida safari-marketplace-api-1 (c413bd18b795)
30 peticiones:      30 200 | > 4 s: 0 | máx 0.056774s
  safari-marketplace-api-1 healthy a los 6 s
  safari-marketplace-api-1 vuelve a recibir tráfico a los 7 s del start
```

Con `docker stop` el contenedor sale de la red de inmediato y la conexión se
rechaza al momento. `fail_duration` la deja fuera y `lb_try_duration`
reintenta en otra. Ninguna petición lenta.

### CA-7 — Todas caen (aceptado por el dueño, sin cumplir «≤ 10 s»)

```text
API detenida (todas las réplicas)
  /backend/settings: 502 en 11.015426s
  POST /backend/token: 503 en 7.795407s
  producto nunca visitado /en/products/frei-ol: 500 en 55.823231s
  localhost:9001/api/health: 503 en 15.512817s
log de api-lb:
     11 failed getting dynamic upstreams
     10 no upstreams available
      1 dial tcp 172.24.0.4:9001: i/o timeout
segunda tanda, ya sin réplicas en el DNS:
  /backend/settings: 503 en 14.229403s
  /backend/settings: 503 en 15.712969s
  /backend/settings: 503 en 8.028389s
  producto nunca visitado (otro): 500 en 70.296068s
```

- **Los códigos son los correctos:** 502/503 en `/backend` y 500, no 404,
  en una página nueva. Nada se queda colgado indefinidamente.
- **Lo que no se cumple es el tiempo:** 8-15 s por petición, y una página
  nueva tarda ~1 min porque su SSR encadena varias llamadas a la API. Lo
  domina la consulta DNS de `api` cuando ya no queda ninguna réplica
  (`failed getting dynamic upstreams`), no los parámetros de Caddy.
- **Ajustes probados, sin commitear y deshechos:**
  - `dial_timeout 1s` en `dynamic a` y en el transporte: 7.8 s estables
    en 4 peticiones;
  - además `lb_try_duration 2s`: 13-15 s, y 70 s el SSR. Resultado
    inconsistente, porque depende del DNS de Docker Desktop.
- El dueño eligió aceptar y documentar; queda en `apps/README.md` como
  límite medido.

### CA-8 — Sesión entre réplicas

```text
token de 256 caracteres
  HTTP/1.1 200 OK 1fe058d013ea
  HTTP/1.1 200 OK c413bd18b795
  HTTP/1.1 200 OK 18b26bc5055c
  HTTP/1.1 200 OK 1fe058d013ea
  HTTP/1.1 200 OK c413bd18b795
  HTTP/1.1 200 OK 18b26bc5055c
```

El JWT emitido por una réplica vale en las tres (`GET /backend/me`).

### CA-9 — Estado compartido

```text
creado tag us107-prueba-14609 (id 64) por safari-marketplace-api-3
  GET tags/us107-prueba-14609: 200 us107-prueba-14609 desde safari-marketplace-api-1
  GET tags/us107-prueba-14609: 200 us107-prueba-14609 desde safari-marketplace-api-3
  GET tags/us107-prueba-14609: 200 us107-prueba-14609 desde safari-marketplace-api-1
  GET tags/us107-prueba-14609: 200 us107-prueba-14609 desde safari-marketplace-api-1
  GET tags/us107-prueba-14609: 200 us107-prueba-14609 desde safari-marketplace-api-2
  GET tags/us107-prueba-14609: 200 us107-prueba-14609 desde safari-marketplace-api-1
  DELETE: 200
  GET tras borrar: 404
```

Una corrida anterior (tag 63) dio lo mismo; su salida se perdió por un error
del script al leer el cuerpo. Los dos tags de prueba se borraron. La
divergencia opcional de `payment-method` no se demostró; queda documentada
en el README con las líneas del servicio.

### CA-10 — `localhost:9001` y `api-docker`

```text
$ curl -s -D - http://localhost:9001/api/health
HTTP/1.1 200 OK
X-Served-By: c413bd18b795
{"status":"ok","instance":"c413bd18b795"}
$ just stack-down && just api-docker
esperando a la API lista en http://localhost:9001/api
safari-api-lb Up 13 seconds
safari-marketplace-api-1 Up 6 seconds (healthy)
safari-postgres Up 13 seconds (healthy)
3003/3002 libres
$ just shop-dev   ->   shop-dev /en: 200 191904B, cards: 30
$ just api-docker-down
 Container safari-marketplace-api-1  Stopped
 Container safari-api-lb  Stopped
```

### CA-11 — Escalar hacia abajo

De 3 réplicas a 1 con un bucle de 1 petición cada 200 ms durante 40 s:

```text
  scale a 1 en 4 s
  peticiones: 78 |      78 200 | > 1 s: 1
  la más lenta: 200 en 2.343406s
```

Ninguna falló. Una tardó 2.3 s en la transición, mientras `refresh` aún
devolvía la IP de una réplica que se iba.

### CA-12 — Gate

```text
$ just check
OK    [1/10] packages/db build  77s
OK    [2/10] packages/db lint  2s
OK    [3/10] packages/db typecheck  8s
OK    [4/10] api/rest typecheck  57s
OK    [5/10] api/rest lint  90s
OK    [6/10] admin/rest lint  15s
OK    [7/10] shop lint  9s
OK    [8/10] api/rest test  25s      (Test Files 45 passed, Tests 713 passed)
OK    [9/10] packages/db test  68s   (Test Files 38 passed, Tests 499 passed)
OK    [10/10] scraper db-test  3s
check: VERDE (10 pasos, 354s)
```

La API pasa de 44 a 45 archivos y de 710 a 713 tests: los 3 del middleware.

### Incidentes

- **Primer `just check` en rojo, sin relación con la US.** A las 22:04:49 UTC
  el dueño levantó el stack de la rama a mano y a las 22:05:29 lo paró,
  Postgres incluido, en mitad del gate. Fallaron los tests de integración de
  `packages/db` por falta de base. Se repitió con la base arriba y pasó.
- **El puerto 5433 tardó unos segundos en liberarse** tras parar Postgres: lo
  retenía `wslrelay`. Es normal en Docker Desktop.

Al terminar se apagaron `shop-dev` (por su PID raíz) y el stack, y los
puertos quedaron libres.

### Hallazgos que no se accionaron (NO incluye)

- **La caída total tarda en responder** (CA-7). Si interesa, se puede
  explorar con una respuesta rápida cuando no hay upstreams o con
  `resolvers` propios en `dynamic a`.
- **La API no drena peticiones al pararse** (`enableShutdownHooks`). Con
  `docker stop` no se vio ningún fallo, pero un `POST` en vuelo podría dar
  502.
- **CLAUDE.md** sigue describiendo el compose como «Solo Postgres 16». Es
  del dueño.
