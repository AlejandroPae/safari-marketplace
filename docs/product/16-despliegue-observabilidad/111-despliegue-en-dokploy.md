# US-111 — Desplegar Safari en un VPS con Dokploy, con subdominios

> Con las imágenes en Docker Hub (US-110), falta un compose de despliegue que
> use esas imágenes y una guía para que el dueño monte el VPS, el DNS y los
> subdominios y despliegue desde el panel de Dokploy. Al final, Safari queda
> publicado en `tienda.<dominio>` y `admin.<dominio>` con HTTPS. Es la
> referencia que los grupos de Sistemas Distribuidos replican en su propio
> VPS. El despliegue disparado por el CI va en US-112.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-20
**Status:** En curso (2026-11-20): CA-1 a CA-4 verificados en local; CA-5 a CA-7 pendientes con el dueño, en el VPS. Promovida desde `_backlog/` el 2026-11-20,
tras la revisión del sub-agente fable 5. El dueño partió el borrador en
US-111 (esta) y US-112 (job `deploy`). Además fijó:
- la topología `proxy` + `api-lb` (D-3);
- el seed solo sobre la base vacía (D-4);
- cambiar las contraseñas demo (D-8);
- medir la RAM al ejecutar.

**Depende de:** US-110 (imágenes en Docker Hub). US-107 (API escalable) y
US-108 (sitemap en ejecución) ya están cerradas.
**LOC est.:** ~150 (compose ~120, plantilla, Caddyfile y `db-init`), más la
guía.

## Historia

**Como** docente, **quiero** publicar Safari en mi VPS con Dokploy, con las
imágenes de mi Docker Hub y subdominios con HTTPS, **para** tener funcionando
la referencia que los grupos deben reproducir en el parcial final.

## Contexto (verificado el 2026-11-20 sobre `main` @ `5d168a0`)

### El compose actual es de desarrollo local

`docker-compose.yml`:
- **Imágenes:** construye (`build:`) `safari-api`, `safari-shop` y
  `safari-admin`.
- **Puertos en el host:** Postgres `5433`, `api-lb` `9001` y `proxy`
  `3003`/`3002`.
- **`container_name`:** en `postgres`, `db-init`, `api-lb`, `shop`, `admin`
  y `proxy`; `api` ya no lo tiene (US-107).
- **Credenciales de Postgres fijas en cinco sitios:**
  - `POSTGRES_USER` y `POSTGRES_PASSWORD` (L21-22);
  - el healthcheck `pg_isready -U safari` (L32);
  - `PGUSER` y `PGPASSWORD` de `db-init` (L49-50);
  - `DATABASE_URL` armada a mano en `api` (L91).
- **Tienda:**
  - `NEXTAUTH_URL: http://localhost:3003` y
    `NEXTAUTH_URL_INTERNAL: http://localhost:3000` (L140-141);
  - `NODE_EXTRA_CA_CERTS: /run/secrets/extra_ca`, también en el admin (L145
    y 171).
- **Secretos y URLs:**
  - `JWT_SECRET` y `SHOP_SECRET` con valores de desarrollo por defecto (L94
    y 142);
  - `SHOP_URL` llega a la API (L95) y al admin.
- **Montajes:** `./db` en `db-init`, `./docker/Caddyfile` en `proxy` y
  `./docker/api-lb.Caddyfile` en `api-lb`.
- **CA corporativo:** el secreto `extra_ca` (L200-202).

### Topología: el README dice otra cosa

- **Lo que dice la documentación hoy:** `apps/README.md:675-687`
  («Dominios en Dokploy») describe Traefik directo, sin Caddy, con dos
  dominios por app (`/` → shop y `/backend` con Strip Path hacia la API). Lo
  repiten `docker/Caddyfile:3-4` y `docker-compose.yml:181-182`.
- **Lo que se despliega:** `proxy` + `api-lb`, la misma topología que en
  local (D-3). Esa documentación se reescribe en esta US.
- **Qué pasa con Caddy detrás de Traefik:** ningún Caddyfile declara
  `trusted_proxies`. Por defecto, Caddy no confía en los `X-Forwarded-*`
  entrantes y los reescribe con lo que ve, así que la tienda y el admin
  recibirían `X-Forwarded-Proto: http` (verificar en la doc de Caddy).
- **next-auth 4.24.15:** `[...nextauth].ts` no fija `useSecureCookies` ni
  `cookies`. Con `NEXTAUTH_URL` definida, el origen y el prefijo `__Secure-`
  salen de esa variable (de memoria: confirmarlo con un login real en CA-5).

### `db-init` y el seed (crítico)

- **Qué hace `db/seed.sql`:** es una sola transacción, sin `TRUNCATE`,
  `DELETE` ni `UPDATE`. Tiene 41 `ON CONFLICT ... DO NOTHING`, dos
  `ON CONFLICT (id) DO UPDATE` (`settings` y `become_seller`) y 31
  `setval(... GREATEST(max(id), 1))` (`db/generate-seed.mjs:1520`).
- **Qué pasaría si se reaplicara en cada despliegue:**
  - un dato creado por un usuario sobrevive;
  - lo borrado del seed reaparece;
  - `settings` y `become_seller` vuelven al valor del mock;
  - un slug o un email recreado con otro id choca con su `UNIQUE`. Con
    `ON_ERROR_STOP=1`, `db-init` sale con error y la `api`, que exige
    `service_completed_successfully`, no arranca: la tienda queda caída.
- **No hay migraciones:** `schema.sql` es `CREATE ... IF NOT EXISTS`, y una
  columna nueva en una tabla existente no llega al volumen de producción.
- **Usuarios demo:** el seed crea usuarios con la contraseña `demodemo`
  (`db/generate-seed.mjs:77-85, 804-807`). Con `admin.<dominio>` público,
  cualquiera entra al admin.

### Otros hechos

- **El admin**, en ejecución, solo lee `SHOP_URL`
  (`pages/api/runtime-config.ts:12`).
- **La API** usa `SHOP_URL` solo para el retorno de PayPal
  (`paypal-payment.service.ts:59`).
- **US-108:** con `NEXTAUTH_URL=""` cae toda la tienda, y con la variable
  ausente solo fallan `/sitemap.xml` y `/robots.txt`. `${VAR:?}` cubre los
  dos casos.
- **`X-Served-By`** (US-107) publica el id corto del contenedor en todas las
  respuestas: es una fuga menor que se acepta, por su valor didáctico.
- **Redespliegue:** recrea `api`, `shop` y `admin`. Con 0 réplicas, `/backend`
  da 502 entre 8 y 15 s (US-107). Se espera un corte de 1 a 2 minutos, y la
  caché ISR se pierde.
- **RAM:** la tabla del borrador (API 138 MB, tienda 115, admin 113, Postgres
  45 y cada Caddy ~12; ~430 MB) **no tiene evidencia**. Es orientativa hasta
  que el ejecutor la mida.
- **`og:url`:** `NEXT_PUBLIC_SITE_URL` se fija en el build (US-108, «NO
  incluye»), así que en producción no llevará el dominio real. Es una
  limitación conocida.
- **Documentación de Dokploy** (consultada por el dueño el 2026-11-20; el
  ejecutor la verifica):
  - el dominio de un Compose se configura con servicio y puerto, y Traefik
    emite el certificado de Let's Encrypt;
  - los servicios no deben usar `container_name`.

  Queda por verificar:
  - si hace falta declarar la red `dokploy-network`;
  - si los archivos montados del repo clonado están disponibles en la ruta
    relativa;
  - los requisitos mínimos del VPS.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Compose de despliegue | Un archivo nuevo, `docker-compose.deploy.yml`, independiente del de desarrollo. Usa `image: ${DOCKERHUB_USERNAME}/safari-<app>:${IMAGE_TAG}`, sin `build:`, sin `container_name`, **sin puertos publicados en el host** (todo entra por Traefik) y sin el secreto `extra_ca` ni `NODE_EXTRA_CA_CERTS`. Mantiene `postgres` con volumen, `db-init`, `api`, `api-lb`, `shop`, `admin` y `proxy`, con los mismos healthchecks, `init` y Caddyfiles. `NEXTAUTH_URL_INTERNAL: http://127.0.0.1:3000`. |
| D-2 | Variables | Todo lo que cambia por entorno va por variable del Compose en Dokploy, **obligatoria con `${VAR:?mensaje}`** y sin valores por defecto inseguros: `DOCKERHUB_USERNAME`, `IMAGE_TAG` (`sha-<7>`, US-110 D-2), `SHOP_URL` (`https://tienda.<dominio>`, también `NEXTAUTH_URL`, la API y el admin), `JWT_SECRET`, `SHOP_SECRET` y `POSTGRES_PASSWORD` (alimenta `POSTGRES_PASSWORD`, `PGPASSWORD` de `db-init` y `DATABASE_URL`). La guía pide una contraseña alfanumérica larga, porque `@ : / # ?` rompen la URL, y advierte que solo se aplica al crear el volumen. Se versiona `.env.deploy.example`, sin secretos. |
| D-3 | Topología y subdominios | Se mantienen `proxy` y `api-lb`. `tienda.<dominio>` → `proxy:3003`; `admin.<dominio>` → `proxy:3002`; el panel de Dokploy en `dokploy.<dominio>`. La API **no** tiene subdominio público: el navegador la usa por `/backend` en el mismo origen (US-102). Todos con HTTPS de Let's Encrypt. En `docker/Caddyfile` se añade `servers { trusted_proxies static private_ranges }` en las opciones globales; es inocuo en local. Se reescribe «Dominios en Dokploy» en `apps/README.md` y los comentarios de `docker/Caddyfile:3-4` y `docker-compose.yml:181-182`. |
| D-4 | Seed solo sobre la base vacía | En el compose de despliegue, `db-init` aplica `pg_trgm` y `schema.sql` siempre, y `seed.sql` **solo si `settings` no tiene filas**. Después, `VACUUM ANALYZE`. El compose de desarrollo no cambia. Los cambios de esquema futuros son una **limitación documentada**: no hay migraciones, así que van como paso manual o con una base nueva. |
| D-5 | Despliegue manual | En esta US, el dueño despliega desde el panel de Dokploy: crea el Compose desde el repo de GitHub con la ruta `docker-compose.deploy.yml`, las variables de D-2, los dominios de D-3 y el auto-deploy **apagado** (el disparo automático es US-112). |
| D-6 | Guía del dueño | `docs/dokploy/README.md`, enlazada desde `apps/README.md`. Es la base del enunciado de los grupos, así que debe poder seguirla alguien que no conoce el repo. Cubre: VPS (x86_64, requisitos verificados en la doc de Dokploy; un VPS ARM no sirve), instalación, registros DNS, Compose desde GitHub, variables, dominios, primer despliegue, cambio de contraseñas demo (D-8), redesplegar con otro `IMAGE_TAG` a mano y limitaciones (esquema, `og:url`, corte al redesplegar). |
| D-7 | Corte al redesplegar | Se acepta un corte de 1 a 2 minutos por despliegue y va declarado en la guía. El despliegue sin corte queda fuera. |
| D-8 | Usuarios demo | La guía exige, como paso obligatorio después del primer despliegue, cambiar las contraseñas de los usuarios demo (`demodemo`). Se anota como riesgo. |
| D-9 | RAM | El ejecutor mide con `docker stats --no-stream`, con el compose de despliegue en local, y pega la salida. La guía usa esa medición, más los requisitos de Dokploy. |

## Scope

**Incluye:**
- `docker-compose.deploy.yml` y la plantilla de variables (`deploy.variables.example`, ver «Actualización»);
- `docker/Caddyfile` (`trusted_proxies` y comentario);
- el comentario de `docker-compose.yml:181-182`;
- `docs/dokploy/README.md`;
- `apps/README.md` («Dominios en Dokploy» y el enlace a la guía);
- la nota del README del Épico 16.

**NO incluye:**
- el job `deploy` del CI, la señal de versión y la vuelta atrás automática
  (US-112);
- el `docker-compose.yml` de desarrollo, salvo el comentario;
- protección de `main`;
- backups de Postgres, monitoreo y alertas;
- migraciones de esquema;
- varias réplicas en el VPS (se pueden escalar a mano, pero no es criterio);
- despliegue sin corte;
- `og:url`;
- el enunciado del parcial.

## Tareas del dueño (no las hace el agente)

1. Contratar el VPS (x86_64, con los requisitos de la guía) y anotar su IP.
2. Crear en su DNS los registros `A` de `tienda`, `admin` y `dokploy`, o un
   comodín `*`, apuntando a esa IP.
3. Instalar Dokploy siguiendo la guía y entrar al panel.
4. Crear el Compose (D-5) y desplegar.
5. Cambiar las contraseñas demo (D-8).

El agente prepara el código y la guía, y valida en local todo lo que puede.
Lo que requiere el VPS se valida **con el dueño**, que pega las salidas.

## Criterios de aceptación

- **CA-1 — Compose de despliegue en local.** Con las imágenes de Docker Hub
  (US-110), `docker compose -f docker-compose.deploy.yml --env-file <archivo
  de prueba en el scratchpad> up -d` levanta el stack sano. Se prueba con un
  override de puertos solo para la prueba, o desde un contenedor en la misma
  red. La tabla de regresión de US-105 da lo mismo. Se pega
  `docker stats --no-stream` (D-9).
- **CA-2 — Variables obligatorias.** Sin `JWT_SECRET` (y, por separado, con
  `SHOP_URL` vacía), el compose falla con un mensaje que la nombra. Pegar la
  salida.
- **CA-3 — Sin restos de desarrollo.** `grep` en
  `docker-compose.deploy.yml`: ningún `build:`, `container_name`, `ports:`,
  `localhost`, `solo-desarrollo` ni `extra_ca`.
- **CA-4 — Seed solo una vez.** En local, sobre el compose de despliegue:
  1. se levanta con la base vacía y el seed se aplica;
  2. se crea un usuario, se borra un producto del seed y se cambia un dato de
     `settings`;
  3. se redespliega (`up -d --force-recreate`);
  4. el usuario sigue, el producto **no** reaparece, `settings` conserva el
     cambio y `db-init` termina bien.
- **CA-5 — Subdominios con HTTPS (con el dueño).** `curl -I` a
  `https://tienda.<dominio>/en`, `https://admin.<dominio>/en/login` y
  `https://tienda.<dominio>/backend/health/ready` devuelve 200 con
  certificado válido. El login del admin funciona sin redirigir a `http://`,
  y `/sitemap.xml` usa el dominio real (US-108).
- **CA-6 — Los datos sobreviven al redespliegue (con el dueño).** Se crea un
  usuario o un pedido, se redespliega desde el panel, y el dato sigue ahí.
- **CA-7 — La guía funciona.** El dueño sigue `docs/dokploy/README.md` de
  principio a fin. Lo que no le funcionó o no entendió se corrige en la guía.

## Definición de Done

- [ ] CA-1 a CA-4 verificados por el agente, y CA-5 a CA-7 con el dueño, con
  la salida real pegada en «Resultado».
- [ ] Guía revisada por el dueño.
- [ ] Status en `Implementado` y fila del épico marcada.

## Riesgos

- **R-1 — Caddy detrás de Traefik.** Si next-auth arma alguna URL con
  `http://` pese a `trusted_proxies` y `NEXTAUTH_URL`, CA-5 lo detecta.
- **R-2 — Archivos montados.** Los Caddyfiles y `./db` se montan desde el
  repo que Dokploy clona. Si la doc de Dokploy no lo confirma, **detente y
  pregunta** (alternativa: `configs:` en línea).
- **R-3 — Red de Dokploy.** Confirmar en su documentación si los dominios de
  un Compose requieren declarar `dokploy-network`.
- **R-4 — Desfase del repo clonado.** Dokploy clona `main` en su HEAD: al
  desplegar un `IMAGE_TAG` anterior, el compose, los Caddyfiles y `db/` son
  los actuales. Va en la guía.
- **R-5 — Credenciales demo.** Hasta que el dueño las cambie (D-8), el admin
  queda abierto con `demodemo`.

## Notas para el agente ejecutor

- Leer antes US-102 y US-103 (configuración en ejecución), US-107 (proxy y
  `api-lb`), US-108 (sitemap con `NEXTAUTH_URL`) y US-110.
- Consultar la documentación de Dokploy (docker compose, dominios, red,
  requisitos) antes de escribir el compose y la guía. No inventar.
- El archivo de variables de prueba va en el scratchpad, nunca en el repo.
  Los hooks bloquean leer `.env` reales: no se buscan atajos.
- Las decisiones son del dueño. Si una choca con la documentación de Dokploy,
  **detente y pregunta**.

## Actualización durante la ejecución (2026-11-20)

> Sección añadida sin reescribir las decisiones de arriba.

- **D-1, montajes (resuelve R-2).** La documentación de Dokploy
  (*Troubleshooting → Volumes & Mounts*) dice que cada despliegue hace un
  `git clone` nuevo, y que un montaje relativo del repo (`./docker/...`,
  `./db`) queda vacío o viejo en los despliegues siguientes. Pide usar *File
  Mounts* (`../files/…`), que se cargan a mano en el panel. Además, el comando
  por defecto (`docker compose -p <app> -f <compose> up -d --build
  --remove-orphans`) no recrea los contenedores sin cambios, así que `proxy`,
  `api-lb` y `db-init` seguirían apuntando al clon anterior. `seed.sql` pesa
  920 KB: no cabe en línea ni en un *File Mount*.
  **El dueño decidió dos imágenes más**, `safari-db-init` (Postgres con
  `schema.sql`, `seed.sql` y `docker/db-init.sh`) y `safari-proxy` (Caddy con
  los dos Caddyfiles). El job `images` de US-110 las publica con el mismo
  `sha-<7>`. El compose de despliegue no monta nada del repo. Efecto
  secundario: la base y el proxy quedan versionados con la API, así que volver
  atrás también vuelve el esquema y la configuración (se reduce R-4: lo único
  que sale de HEAD es el propio `docker-compose.deploy.yml`).
- **Red (resuelve R-3).** Se usa **Isolated Deployments**: Dokploy crea una
  red propia para el Compose y conecta Traefik a ella, sin declarar
  `dokploy-network`. Así los nombres genéricos (`postgres`, `api`) no chocan
  con otras apps del VPS.
- **Plantilla de variables:** `deploy.variables.example`, en vez de
  `.env.deploy.example`. Un nombre con `.env` choca con el hook del proyecto
  que bloquea leer archivos `.env` (US-72), y el contenido no es un `.env`
  de una app.
- **Guía:** `docs/dokploy/README.md`, a pedido del dueño (D-6 decía
  `docs/despliegue-dokploy.md`). Está escrita para que los grupos desplieguen
  **las imágenes de su propio fork**.

## Resultado (2026-11-20) — parte local

Commit de código `3b07100`, en `main`.

### Qué se hizo

- `docker-compose.deploy.yml`:
  - imágenes `${DOCKERHUB_USERNAME}/safari-<app>:${IMAGE_TAG}` con
    `pull_policy: always`;
  - sin `build:`, puertos ni `container_name`;
  - seis variables obligatorias con `${VAR:?mensaje}`;
  - `NEXTAUTH_URL` = `SHOP_URL` y `NEXTAUTH_URL_INTERNAL` en
    `http://127.0.0.1:3000`;
  - `restart: unless-stopped`;
  - el healthcheck de Postgres por TCP.
- `docker/db-init.sh`: `pg_trgm` + `schema.sql` siempre, `seed.sql` solo si
  `SELECT count(*) FROM settings` da 0, y `VACUUM ANALYZE`. Va dentro de la
  imagen `docker/db-init.Dockerfile`.
- `docker/proxy.Dockerfile`: Caddy con `Caddyfile` (comando por defecto) y
  `api-lb.Caddyfile` (`command` del servicio `api-lb`).
- `docker/Caddyfile`: `servers { trusted_proxies static private_ranges }`,
  validado con `caddy validate`.
- `.dockerignore` readmite `db/schema.sql`, `db/seed.sql`, `docker/db-init.sh`
  y los Caddyfiles.
- `ci.yml`: «Imagen de db-init» e «Imagen del proxy» en el job `images`, sin
  caché `gha` porque tardan segundos.
- `deploy.variables.example`, `docs/dokploy/README.md`, la sección «Dominios en
  Dokploy» de `apps/README.md` (reescrita a esta topología) y el comentario del
  `proxy` en `docker-compose.yml`.

### Imágenes publicadas por el CI (corrida 44775374733, `3b07100`)

```text
Calidad · lint, tipos, pruebas y builds: success 16:38:23 -> 16:46:59
Imágenes Docker · build y publicación: success 16:47:01 -> 16:48:23
### Imágenes (sha-3b07100)
| `ronaldcuello/safari-api:sha-3b07100` | `sha256:c4ad5e85707765727aaaa03c629cb1415d5b11f8fcb1cbd0bf7eb6056c438972` |
| `ronaldcuello/safari-shop:sha-3b07100` | `sha256:6024d3852f949b0368b5384045c6019c087a0f73837e69f59d60335c05bd0863` |
| `ronaldcuello/safari-admin:sha-3b07100` | `sha256:b62f41c4339509eae7495a2f2a9aa8bee35259b7e848f00d382a256c20094467` |
| `ronaldcuello/safari-db-init:sha-3b07100` | `sha256:303805ea3028493bf0ac9d16ee15e3c615883c785851e6c05e66e69552878071` |
| `ronaldcuello/safari-proxy:sha-3b07100` | `sha256:a80ae6a162a1a72a6667cdd2cbc933fe20e862b296472274716e3521162361fc` |
```

### CA-1 — Compose de despliegue en local

El proyecto se llama `safari-deploy`, separado del de desarrollo. Las
variables de prueba van en un archivo del scratchpad. El override solo
publica los puertos `3003`, `3002` y `9001` para probar. Todo se baja del Hub
(`sha-3b07100`):

```text
real	0m32.743s
admin ronaldcuello/safari-admin:sha-3b07100 Up 8 seconds (healthy)
api ronaldcuello/safari-api:sha-3b07100 Up 14 seconds (healthy)
api-lb ronaldcuello/safari-proxy:sha-3b07100 Up 22 seconds
db-init ronaldcuello/safari-db-init:sha-3b07100 Exited (0) 15 seconds ago
postgres postgres:16.14-alpine3.23 Up 23 seconds (healthy)
proxy ronaldcuello/safari-proxy:sha-3b07100 Up 2 seconds
shop ronaldcuello/safari-shop:sha-3b07100 Up 8 seconds (healthy)
db-init-1  | db-init: base vacía, seed aplicado
db-init-1  | db-init: esquema al día
OK   API    :9001/api/settings  200  5503B  522ms
OK   Shop   :3003/en  200  192788B  25ms  cards:30
OK   Admin  :3002/en/login  200  73118B  31ms  cards:1
{"status":"ok","instance":"bed1443e34f5","revision":"3b07100cd25cd564c8e3c76824c91bd1e6335493"}
Sitemap: http://localhost:3003/sitemap.xml
```

**Regresión de US-105.** Se corrió antes, con `db-init` y `proxy` construidos
en local y `sha-4fcb7f1` para el resto. El script es el de US-110, con la
espera del admin por `docker compose ps admin`, que sirve en los dos stacks.
Todo da lo mismo que en US-108 CA-9, salvo el optimizador:

```text
== CA-3
backend/settings tienda: 200  admin: 200
tienda /api/auth/providers: 200
admin runtime-config: {"shopUrl":"http://localhost:3003"}
admin runtime-config con SHOP_URL=https://tienda-b.example: {"shopUrl":"https://tienda-b.example"}
admin runtime-config restaurado: {"shopUrl":"http://localhost:3003"}
visita previa /en/products/apples: 200
API parada -> producto nunca visitado /en/products/black-hawk-puppy-chicken-rice-2: 500
API parada -> /en/products/apples: 200  /en: 200
API de vuelta -> /en/products/black-hawk-puppy-chicken-rice-2: 200
/en/products/no-existe: 404
estáticos con localhost:9001|api:9001|api-lb:9001: 0 archivos
== CA-4
optimizador w=256: 500  21B
logs de la tienda con sharp|EACCES: 0
== CA-6
http://localhost:3003/en common: 553 claves; 404-heading = "Error code: 404"
http://localhost:3002/en/login common: 553 claves; text-guest = "Guest"
logs con Cannot find module|unable to find a user config: 0
```

El 500 del optimizador es de **este equipo**, no de la imagen. El compose de
despliegue no lleva el CA corporativo (`NODE_EXTRA_CA_CERTS`), y detrás de
Zscaler la tienda no puede bajar las fotos del seed desde S3:

```text
shop-1  | ⨯ Error: unable to get local issuer certificate
shop-1  |   code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
```

Con un override de prueba que inyecta el CA, como el compose de desarrollo, da
lo mismo que en US-105:

```text
optimizador w=256 (con el CA de Zscaler): 200 image/jpeg 6215B
```

En el VPS no hay Zscaler, así que no hace falta ningún CA.

**RAM (D-9)**, `docker stats --no-stream` en reposo, con una sola réplica:

```text
safari-deploy-shop-1	77.46MiB / 7.579GiB	0.01%
safari-deploy-admin-1	81.04MiB / 7.579GiB	0.00%
safari-deploy-api-1	107.8MiB / 7.579GiB	0.00%
safari-deploy-proxy-1	11.64MiB / 7.579GiB	0.00%
safari-deploy-api-lb-1	11.25MiB / 7.579GiB	0.05%
safari-deploy-postgres-1	53.21MiB / 7.579GiB	0.02%
```

Son ~342 MB, menos que los ~430 MB orientativos del borrador. La guía pide
el mínimo de Dokploy (2 GB de RAM y 30 GB de disco) y recomienda 4 GB.

### CA-2 — Variables obligatorias

```text
== CA-2 sin JWT_SECRET
error while interpolating services.api.environment.JWT_SECRET: required variable JWT_SECRET is missing a value: Falta JWT_SECRET (cadena larga y aleatoria)
rc=15
== CA-2 con SHOP_URL vacía
error while interpolating services.api.environment.SHOP_URL: required variable SHOP_URL is missing a value: Falta SHOP_URL (https://tienda.<tu-dominio>)
rc=15
== con todas
rc=0
```

### CA-3 — Sin restos de desarrollo

```text
$ grep -v '^\s*#' docker-compose.deploy.yml | grep -cE 'build:|container_name|ports:|localhost|solo-desarrollo|extra_ca'
0
```

Con los comentarios, `grep` encuentra 2 líneas: las que explican que no hay
`build:` ni `container_name`.

### CA-4 — Seed solo una vez

```text
== 1. estado tras el primer despliegue (base vacía)
db-init-1  | db-init: la base ya tiene datos (settings: 1 fila/s), seed omitido
db-init-1  | db-init: esquema al día
productos: 1200  usuarios: 11
== 2. cambios de un usuario del sistema
POST /api/register: 201
producto del seed borrado: apples
settings.siteTitle ahora: Safari CA-4
== 3. redespliegue (up -d --force-recreate)
 Container safari-deploy-proxy-1  Healthy
== 4. después del redespliegue
db-init-1  | db-init: la base ya tiene datos (settings: 1 fila/s), seed omitido
db-init-1  | db-init: esquema al día
exit de db-init: Exited (0) 15 seconds ago
usuario ca4-1795192141@prueba.example: 1 fila/s
producto apples: 0 fila/s (debe ser 0)
settings.siteTitle: Safari CA-4
productos: 1199
```

El paso 1 ya muestra «seed omitido» porque el stack se había reiniciado una
vez para la prueba del CA. Su primer arranque, sobre la base vacía, dijo
`db-init: base vacía, seed aplicado` (ver CA-1).

### Cambio de contraseñas demo (D-8), el bloque de la guía

El paso 11 de la guía se corrió sobre el stack de despliegue local, contra
`/backend` del proxy, con contraseñas nuevas aleatorias:

```text
token de admin@demo.com: eyJhbGciOiJI…
admin@demo.com: 201
store_owner@demo.com: 201
customer@demo.com: 201
customer2@demo.com: 201
customer3@demo.com: 201
login con demodemo después: 401
```

Los stacks de prueba se bajaron con `docker compose down -v`. Era el
proyecto `safari-deploy`, creado para la prueba; el volumen de desarrollo,
`safari-marketplace_postgres-data`, no se tocó.

### Pendiente con el dueño

- **CA-5:** subdominios con HTTPS y login sin redirigir a `http://`.
- **CA-6:** los datos sobreviven a un redespliegue desde el panel.
- **CA-7:** seguir la guía de principio a fin.

Hacen falta el VPS, el DNS y Dokploy instalado. R-1 (next-auth detrás de
Traefik) se confirma en CA-5.
