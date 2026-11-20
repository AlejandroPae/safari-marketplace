# 05. Crear el Compose

[← 04. Crear el proyecto marketplace](04-crear-el-proyecto.md) · [Índice](README.md) · [06. Cargar las variables →](06-variables.md)

---

El **Compose** es el servicio que levanta todo el stack de Safari a partir del
archivo `docker-compose.deploy.yml` de tu fork. Dokploy clona el repositorio en
cada despliegue y ejecuta ese archivo.

## Crear el servicio

1. Dentro del proyecto `marketplace`, en el entorno **production**
   ([paso 04](04-crear-el-proyecto.md)), pulsa **Create Service** y elige
   **Compose**.

   > ![Captura — Menú «Create Service» con la opción Compose](img/05-create-service.png)
   

2. Completa el formulario:
   - **Name:** `safari`
   - **App Name:** déjalo como lo propone Dokploy. Es el nombre interno del
     stack en el servidor (y de su red). Dokploy le agrega un sufijo al
     final, por ejemplo `marketplace-safari-t14qck`.
   - **Compose Type:** **Docker Compose** (no *Stack*).

   Pulsa **Create**.

   > ![Captura — Formulario «Create Compose» con el nombre safari y el tipo Docker Compose](img/05-create-compose.png)

## Conectar el repositorio

3. En la pestaña **General**, sección del proveedor, elige **Git**. Como el
   fork es público, no hace falta conectar tu cuenta de GitHub:
   - **Repository URL:** `https://github.com/<tu-usuario>/<tu-fork>.git`
   - **Branch:** `main`
   - **Compose Path:** `./docker-compose.deploy.yml`

   Pulsa **Save**.

   > ![Captura — Proveedor Git con la URL del fork, la rama main y el Compose Path](img/05-proveedor-git.png)
   

> No uses el `docker-compose.yml` de la raíz: es el de desarrollo. Construye
> las imágenes, publica puertos y trae valores de prueba.

## Ajustes del despliegue

4. **Auto Deploy:** déjalo **apagado** (está en la misma pestaña **General**).
   Despliegas tú, eligiendo la versión (`IMAGE_TAG`).

   > ![Captura — Interruptor Auto Deploy apagado](img/05-auto-deploy.png)
   

5. **Isolated Deployment:** déjalo **apagado** (pestaña **Advanced**, sección
   *Enable Isolated Deployment*). Dokploy lo marca como **Deprecated** desde
   la versión 0.30 y ya no hace falta:

   > ![Captura — Pestaña Advanced del Compose](img/05-isolated-deployments-1.png)

   > ![Captura — Enable Isolated Deployment apagado, con el aviso Deprecated](img/05-isolated-deployment-apagado.png)

   - Docker Compose crea una **red propia del stack**
     (`<App Name>_default`). Ahí se encuentran `postgres`, `api`, `shop`,
     `admin` y el resto, y sus nombres no chocan con los de otras
     aplicaciones del servidor.
   - Al desplegar, Dokploy conecta a la red compartida `dokploy-network`
     **solo el servicio que tiene dominio** (`proxy`, [paso 07](07-dominios.md)),
     sin sacarlo de la red del stack. Así Traefik llega al proxy y el proxy
     sigue llegando a la tienda, al admin y a la API.

   No hace falta tocar la sección **Networks** que sugiere el aviso, ni
   declarar `dokploy-network` en el compose.

Todavía **no despliegues**: sin las variables del paso siguiente, el Compose
falla al arrancar con un mensaje que nombra la variable que falta.

---

[← 04. Crear el proyecto marketplace](04-crear-el-proyecto.md) · [Índice](README.md) · [06. Cargar las variables →](06-variables.md)
