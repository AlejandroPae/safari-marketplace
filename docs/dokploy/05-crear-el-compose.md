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
     stack en el servidor (y de su red aislada).
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

5. **Isolated Deployments:** actívalo (pestaña **Advanced**). Con esta opción,
   Dokploy crea una red propia para tu Compose y conecta Traefik a ella. Así
   los nombres de los servicios (`postgres`, `api`…) no chocan con otras
   aplicaciones del servidor, y no hay que declarar `dokploy-network`.

   > ![Captura — Isolated Deployments activado](img/05-isolated-deployments.png)

Todavía **no despliegues**: sin las variables del paso siguiente, el Compose
falla al arrancar con un mensaje que nombra la variable que falta.

---

[← 04. Crear el proyecto marketplace](04-crear-el-proyecto.md) · [Índice](README.md) · [06. Cargar las variables →](06-variables.md)
