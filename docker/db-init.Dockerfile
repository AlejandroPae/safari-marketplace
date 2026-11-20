# Imagen de db-init para el despliegue (US-111): Postgres con el esquema, el
# seed y el script que los aplica. Con los archivos dentro de la imagen, el
# compose de despliegue no monta nada del repo. En Dokploy cada despliegue
# hace un git clone nuevo, y un montaje relativo queda vacío o viejo. Además,
# la base queda versionada con el mismo sha-<7> que la API.
#
# Contexto: la raíz del repo (ver .dockerignore).
FROM postgres:16.14-alpine3.23
COPY db/schema.sql db/seed.sql /db/
COPY --chmod=755 docker/db-init.sh /usr/local/bin/db-init.sh
USER postgres
CMD ["db-init.sh"]
