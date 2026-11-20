# US-111 — Desplegar Safari en un VPS con Dokploy, con subdominios

> Con las imágenes en Docker Hub (US-110), falta un compose de despliegue que
> use esas imágenes y una guía para que el dueño monte el VPS, el DNS y los
> subdominios y despliegue desde el panel de Dokploy. Al final, Safari queda
> publicado en `tienda.<dominio>` y `admin.<dominio>` con HTTPS. Es la
> referencia que los grupos de Sistemas Distribuidos replican en su propio
> VPS. El despliegue disparado por el CI va en US-112.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-20
**Status:** Listo para ejecución. Promovida desde `_backlog/` el 2026-11-20,
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
| D-6 | Guía del dueño | `docs/despliegue-dokploy.md`, enlazada desde `apps/README.md`. Es la base del enunciado de los grupos, así que debe poder seguirla alguien que no conoce el repo. Cubre: VPS (x86_64, requisitos verificados en la doc de Dokploy; un VPS ARM no sirve), instalación, registros DNS, Compose desde GitHub, variables, dominios, primer despliegue, cambio de contraseñas demo (D-8), redesplegar con otro `IMAGE_TAG` a mano y limitaciones (esquema, `og:url`, corte al redesplegar). |
| D-7 | Corte al redesplegar | Se acepta un corte de 1 a 2 minutos por despliegue y va declarado en la guía. El despliegue sin corte queda fuera. |
| D-8 | Usuarios demo | La guía exige, como paso obligatorio después del primer despliegue, cambiar las contraseñas de los usuarios demo (`demodemo`). Se anota como riesgo. |
| D-9 | RAM | El ejecutor mide con `docker stats --no-stream`, con el compose de despliegue en local, y pega la salida. La guía usa esa medición, más los requisitos de Dokploy. |

## Scope

**Incluye:**
- `docker-compose.deploy.yml` y `.env.deploy.example`;
- `docker/Caddyfile` (`trusted_proxies` y comentario);
- el comentario de `docker-compose.yml:181-182`;
- `docs/despliegue-dokploy.md`;
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
- **CA-7 — La guía funciona.** El dueño sigue `docs/despliegue-dokploy.md` de
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
