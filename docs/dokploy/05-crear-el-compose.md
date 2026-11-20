# 05. Crear el Compose

[← 04. Crear el proyecto marketplace](04-crear-el-proyecto.md) · [Índice](README.md) · [06. Cargar las variables →](06-variables.md)

---

1. Dentro del proyecto `marketplace` ([paso 04](04-crear-el-proyecto.md)):
   **Create Service → Compose**, con el tipo **Docker Compose**.
2. En la pestaña **General**, sección del proveedor, elige **Git**. Como el
   fork es público, no hace falta conectar GitHub:
   - **Repository URL:** `https://github.com/<tu-usuario>/<tu-fork>.git`
   - **Branch:** `main`
   - **Compose Path:** `./docker-compose.deploy.yml`

   Pulsa **Save**.
3. **Isolated Deployments:** actívalo. Con esta opción, Dokploy crea una red
   propia para tu Compose y conecta Traefik a ella. Así los nombres de los
   servicios (`postgres`, `api`…) no chocan con otras aplicaciones del
   servidor, y no hay que declarar `dokploy-network`.
4. **Auto Deploy:** déjalo **apagado**. Despliegas tú, eligiendo la versión
   (`IMAGE_TAG`).

> No uses el `docker-compose.yml` de la raíz: es el de desarrollo. Construye
> las imágenes, publica puertos y trae valores de prueba.

---

[← 04. Crear el proyecto marketplace](04-crear-el-proyecto.md) · [Índice](README.md) · [06. Cargar las variables →](06-variables.md)
