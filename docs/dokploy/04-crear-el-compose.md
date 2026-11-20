# 04. Crear el Compose

[← 03. Instalar Dokploy](03-instalar-dokploy.md) · [Índice](README.md) · [05. Cargar las variables →](05-variables.md)

---

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

---

[← 03. Instalar Dokploy](03-instalar-dokploy.md) · [Índice](README.md) · [05. Cargar las variables →](05-variables.md)
