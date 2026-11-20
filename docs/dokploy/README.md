# Desplegar Safari en un VPS con Dokploy

Esta guía publica **tu fork** de Safari en un servidor propio, con dos
subdominios con HTTPS:

- `https://tienda.<tu-dominio>`: la tienda;
- `https://admin.<tu-dominio>`: el panel de administración.

Dokploy es un panel de despliegue que se instala en el VPS. Usa Docker y
Traefik: Traefik recibe el tráfico de internet, emite los certificados de
Let's Encrypt y lo pasa a tus contenedores.

```text
Internet ──https──▶ Traefik (Dokploy)
                        │  tienda.<dominio> ─▶ proxy:3003 ─▶ shop
                        │  admin.<dominio>  ─▶ proxy:3002 ─▶ admin
                        │            /backend/* ─▶ api-lb:9001 ─▶ api ─▶ postgres
```

Todo corre con las **imágenes que publica el CI de tu fork** en tu cuenta de
Docker Hub. En el servidor no se compila nada.

## Índice

1. [Antes de empezar](#1-antes-de-empezar)
2. [Elegir la versión a desplegar](#2-elegir-la-versión-a-desplegar)
3. [Contratar el VPS](#3-contratar-el-vps)
4. [Configurar el DNS](#4-configurar-el-dns)
5. [Instalar Dokploy](#5-instalar-dokploy)
6. [Crear el Compose](#6-crear-el-compose)
7. [Cargar las variables](#7-cargar-las-variables)
8. [Configurar los dominios](#8-configurar-los-dominios)
9. [Desplegar](#9-desplegar)
10. [Comprobar que funciona](#10-comprobar-que-funciona)
11. [Cambiar las contraseñas demo (obligatorio)](#11-cambiar-las-contraseñas-demo-obligatorio)
12. [Publicar una versión nueva o volver atrás](#12-publicar-una-versión-nueva-o-volver-atrás)
13. [Limitaciones conocidas](#13-limitaciones-conocidas)
14. [Problemas frecuentes](#14-problemas-frecuentes)

---

## 1. Antes de empezar

Necesitas:

- **Un fork del repositorio** en tu cuenta de GitHub.
- **Una cuenta de Docker Hub** y, en tu fork, el secreto `DOCKERHUB_TOKEN` y
  la variable `DOCKERHUB_USERNAME`. Cómo crearlos:
  [`docs/github/secretos-github-actions.md`](../github/secretos-github-actions.md).
- **Una corrida verde del CI en `main` de tu fork.** El job «Imágenes Docker ·
  build y publicación» debe haber publicado las cinco imágenes en tu Docker
  Hub:

  | Imagen | Qué es |
  |---|---|
  | `<usuario>/safari-api` | la API |
  | `<usuario>/safari-shop` | la tienda |
  | `<usuario>/safari-admin` | el admin |
  | `<usuario>/safari-db-init` | el esquema y los datos iniciales de la base |
  | `<usuario>/safari-proxy` | Caddy: el reverse proxy y el balanceador de la API |

- **Un dominio** en el que puedas crear registros DNS (por ejemplo, en
  Cloudflare, en el proveedor donde lo compraste o en el de tu universidad).

> Las imágenes son solo `linux/amd64`. **Un VPS ARM no sirve.**

## 2. Elegir la versión a desplegar

Cada imagen lleva como etiqueta el commit del que salió: `sha-` y los 7
primeros caracteres del commit, por ejemplo `sha-4fcb7f1`.

1. En tu fork, entra a **Actions** y abre la última corrida verde de `main`.
2. Al final de la página está el resumen **«Imágenes (sha-xxxxxxx)»**, con las
   cinco imágenes publicadas.
3. Anota esa etiqueta completa, con el `sha-` incluido. Es tu `IMAGE_TAG`.

Las cinco imágenes de un mismo commit llevan la misma etiqueta. Se despliegan
siempre juntas.

## 3. Contratar el VPS

Requisitos de Dokploy, según su documentación:

- **Arquitectura:** x86_64 (amd64), por las imágenes.
- **RAM:** 2 GB como mínimo. Safari usa unos 350 MB en reposo, medido con
  `docker stats`. Dokploy, Traefik y los picos de la tienda suman bastante
  más: con 4 GB vas holgado.
- **Disco:** 30 GB como mínimo.
- **Sistema:** un Linux reciente (Ubuntu o Debian).
- **Puertos libres:** 80 y 443 (Traefik) y 3000 (el panel de Dokploy). La
  instalación falla si alguno está ocupado.

Anota la **IP pública** del VPS.

## 4. Configurar el DNS

En el panel de tu dominio, crea tres registros **A** que apunten a la IP del
VPS:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `tienda` | IP del VPS |
| A | `admin` | IP del VPS |
| A | `dokploy` | IP del VPS |

También sirve un solo registro comodín `*` apuntando a la IP.

> Con Cloudflare, deja los registros en **DNS only** (nube gris) hasta que
> Let's Encrypt emita los certificados.

Comprueba desde tu equipo que el nombre ya resuelve a la IP del VPS (puede
tardar unos minutos):

```bash
nslookup tienda.<tu-dominio>
```

## 5. Instalar Dokploy

1. Conéctate al VPS por SSH como `root`, o con un usuario con `sudo`:

   ```bash
   ssh root@<IP-del-VPS>
   ```

2. Ejecuta el instalador oficial (instala Docker si no está):

   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```

3. Abre `http://<IP-del-VPS>:3000` en el navegador y crea la cuenta de
   administrador de Dokploy.
4. **Pon el panel detrás de HTTPS.** En **Settings → Web Server**, asigna el
   dominio `dokploy.<tu-dominio>` con certificado de Let's Encrypt. Desde ahí
   entra siempre por `https://dokploy.<tu-dominio>`.

## 6. Crear el Compose

1. **Projects → Create Project.** Ponle un nombre, por ejemplo `safari`.
2. Dentro del proyecto: **Create Service → Compose**, con el tipo
   **Docker Compose**.
3. En la pestaña **General**, sección del proveedor, elige **Git**. Como el
   fork es público, no hace falta conectar GitHub:
   - **Repository URL:** `https://github.com/<tu-usuario>/<tu-fork>.git`
   - **Branch:** `main`
   - **Compose Path:** `./docker-compose.deploy.yml`

   Pulsa **Save**.
4. **Isolated Deployments:** actívalo. Con esta opción, Dokploy crea una red
   propia para tu Compose y conecta Traefik a ella. Así los nombres de los
   servicios (`postgres`, `api`…) no chocan con otras aplicaciones del
   servidor, y no hay que declarar `dokploy-network`.
5. **Auto Deploy:** déjalo **apagado**. Despliegas tú, eligiendo la versión
   (`IMAGE_TAG`).

> No uses el `docker-compose.yml` de la raíz: es el de desarrollo. Construye
> las imágenes, publica puertos y trae valores de prueba.

## 7. Cargar las variables

En la pestaña **Environment** del Compose, pega el contenido de
[`deploy.variables.example`](../../deploy.variables.example) (en la raíz del
repositorio) y **cambia todos los valores**:

| Variable | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | tu usuario de Docker Hub |
| `IMAGE_TAG` | la etiqueta del paso 2, por ejemplo `sha-4fcb7f1` |
| `SHOP_URL` | `https://tienda.<tu-dominio>`, con `https` y **sin `/` final** |
| `JWT_SECRET` | una cadena aleatoria larga |
| `SHOP_SECRET` | otra cadena aleatoria larga, distinta de la anterior |
| `POSTGRES_PASSWORD` | una contraseña **solo con letras y números** |

Para generar las cadenas aleatorias, en el VPS o en tu equipo:

```bash
openssl rand -hex 32
```

Guarda y no compartas estos valores. En particular:

- **`POSTGRES_PASSWORD` solo se aplica al crear la base.** Si la cambias
  después, la API ya no podrá conectarse. Sin símbolos, porque `@ : / # ?`
  rompen la URL de conexión.
- **Cambiar `JWT_SECRET`** cierra la sesión de todos los usuarios.
- **Si falta una variable**, el despliegue falla al empezar y el log dice
  cuál (`Falta JWT_SECRET …`).

## 8. Configurar los dominios

En la pestaña **Domains** del Compose, crea dos dominios. Los dos van al
servicio **`proxy`**, cada uno con su puerto:

| Campo | Tienda | Admin |
|---|---|---|
| Service Name | `proxy` | `proxy` |
| Host | `tienda.<tu-dominio>` | `admin.<tu-dominio>` |
| Path | `/` | `/` |
| Container Port | `3003` | `3002` |
| HTTPS | activado | activado |
| Certificate | Let's Encrypt | Let's Encrypt |

No crees un dominio para la API. El navegador le habla por
`/backend/…` dentro del mismo dominio de la tienda o del admin, y el proxy lo
manda a la API.

Si quieres ver el compose final que va a ejecutar Dokploy, con las etiquetas
de Traefik y la red ya añadidas, pulsa **Preview Compose**.

## 9. Desplegar

1. Pulsa **Deploy** y abre los logs del despliegue.
2. El primer arranque tarda unos minutos. Baja las cinco imágenes y la base
   arranca vacía. En el log de `db-init` aparece:

   ```text
   db-init: base vacía, seed aplicado
   db-init: esquema al día
   ```

3. El orden de arranque es: `postgres` → `db-init` (termina) → `api` → `shop`
   y `admin` → `proxy`. Los servicios con healthcheck esperan a estar sanos
   antes de dejar pasar al siguiente.
4. Cuando todo esté arriba, espera unos segundos a que Traefik emita los
   certificados.

En los despliegues siguientes, `db-init` dice
`la base ya tiene datos …, seed omitido`. Los datos iniciales se cargan
**solo una vez**, y lo que crees o borres después no se pisa.

## 10. Comprobar que funciona

Desde tu equipo:

```bash
# La tienda, el admin y la API (por el proxy). Los tres deben dar 200.
curl -sI https://tienda.<tu-dominio>/en | head -1
curl -sI https://admin.<tu-dominio>/en/login | head -1
curl -s  https://tienda.<tu-dominio>/backend/health/ready

# Qué versión corre: «revision» debe ser el commit completo de IMAGE_TAG.
curl -s https://tienda.<tu-dominio>/backend/health

# El sitemap usa tu dominio real.
curl -s https://tienda.<tu-dominio>/robots.txt | grep -i sitemap
```

Después, en el navegador:

- `https://tienda.<tu-dominio>` muestra productos;
- `https://admin.<tu-dominio>` permite entrar con `admin@demo.com` y la
  contraseña demo, que cambias en el paso siguiente;
- el candado del navegador muestra un certificado válido de Let's Encrypt.

## 11. Cambiar las contraseñas demo (obligatorio)

Los datos iniciales traen cinco usuarios con la **misma contraseña pública**,
`demodemo`, que figura en este repositorio. Con el admin en internet,
cualquiera podría entrar. **Cámbialas apenas termine el primer despliegue.**

| Usuario | Rol |
|---|---|
| `admin@demo.com` | super_admin |
| `store_owner@demo.com` | store_owner |
| `customer@demo.com` | customer |
| `customer2@demo.com` | customer |
| `customer3@demo.com` | customer |

Desde tu equipo, cambia `<tu-dominio>` y elige una contraseña nueva y larga
para cada uno:

```bash
TIENDA=https://tienda.<tu-dominio>
for USUARIO in admin@demo.com store_owner@demo.com customer@demo.com customer2@demo.com customer3@demo.com; do
  read -rsp "Contraseña nueva para $USUARIO: " NUEVA; echo
  TOKEN=$(curl -s -X POST "$TIENDA/backend/token" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$USUARIO\",\"password\":\"demodemo\"}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -s -o /dev/null -w "$USUARIO: %{http_code}\n" -X POST "$TIENDA/backend/change-password" \
    -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
    -d "{\"oldPassword\":\"demodemo\",\"newPassword\":\"$NUEVA\"}"
done
```

Cada línea debe terminar en `200` o `201`. Comprueba que `demodemo` ya no
sirve:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$TIENDA/backend/token" \
  -H 'Content-Type: application/json' -d '{"email":"admin@demo.com","password":"demodemo"}'
```

Las contraseñas nuevas se guardan en la base y los despliegues siguientes no
las tocan, porque el seed no se vuelve a aplicar.

## 12. Publicar una versión nueva o volver atrás

**Versión nueva:**
1. Haz push a `main` de tu fork y espera la corrida verde.
2. Toma la etiqueta nueva del resumen «Imágenes (sha-…)».
3. En Dokploy, cambia `IMAGE_TAG` en **Environment** y pulsa **Deploy**.

**Volver atrás:** es lo mismo, con la etiqueta de una versión anterior. Como
la base (`safari-db-init`) y el proxy (`safari-proxy`) van en imágenes con la
misma etiqueta, también vuelve su configuración.

Comprueba la versión que quedó corriendo con `/backend/health` (paso 10).

> Dokploy clona `main` en cada despliegue. Lo que sale del repositorio es
> solo `docker-compose.deploy.yml`. Si ese archivo cambió entre las dos
> versiones, al volver atrás se usa el actual.

## 13. Limitaciones conocidas

- **Corte de 1 a 2 minutos en cada despliegue.** Se recrean la API, la
  tienda y el admin, y las primeras visitas son lentas mientras la tienda
  regenera sus páginas.
- **No hay migraciones de base.** El esquema se aplica con
  `CREATE ... IF NOT EXISTS`: una tabla nueva sí llega, pero una **columna
  nueva en una tabla existente no**. Si un cambio del esquema la necesita,
  hay que aplicarla a mano o empezar con una base nueva (se pierden los
  datos).
- **`og:url`** (la URL de las vistas previas en redes sociales) no usa tu
  dominio: queda fija en el build.
- **Sin copias de seguridad ni monitoreo.** Los datos viven en el volumen
  `postgres-data` del VPS.
- **Imágenes de productos:** solo se optimizan las de los hosts permitidos en
  `apps/shop/next.config.js` (`images.remotePatterns`). Las fotos del seed sí
  lo están.

## 14. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El despliegue falla con `required variable … is missing a value: Falta …` | Falta esa variable o está vacía | Complétala en **Environment** y vuelve a desplegar |
| `pull access denied` o `manifest unknown` | `DOCKERHUB_USERNAME` o `IMAGE_TAG` mal escritos, o esa versión no se publicó | Compara con el resumen «Imágenes (sha-…)» de la corrida; el `IMAGE_TAG` lleva `sha-` |
| `exec format error` | El VPS es ARM | Usa un VPS x86_64 |
| El dominio da 404 de Traefik | El dominio no apunta a `proxy` con el puerto correcto, o el DNS no resuelve | Revisa la tabla del paso 8 y `nslookup` |
| Certificado inválido o «no seguro» | Let's Encrypt aún no emitió, o Cloudflare está en modo proxy | Espera un minuto; con Cloudflare, deja el registro en **DNS only** |
| La API queda `unhealthy` tras cambiar `POSTGRES_PASSWORD` | La contraseña solo se aplica al crear el volumen | Vuelve a la contraseña original |
| `db-init` termina con error | Ver su log en Dokploy | Si es por un cambio de esquema, ver «No hay migraciones» (paso 13) |
| El login del admin redirige a `http://` | `SHOP_URL` sin `https://` | Corrige `SHOP_URL` y vuelve a desplegar |
