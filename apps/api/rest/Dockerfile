# API REST (NestJS) en contenedor — US-14.
#
# Contexto de build: la RAÍZ del repo, no esta carpeta. La API depende de
# @safari/db por `link:../../../packages/db`, así que la imagen reproduce esa
# misma estructura (/repo/packages/db y /repo/apps/api/rest) y construye la
# capa de datos dentro: su dist/ y su generated/ no se versionan.
#
#   docker build -f apps/api/rest/Dockerfile .
#
# La configuración llega por variables de entorno (ver docker-compose.yml);
# la imagen no lleva ningún .env (lo impide el .dockerignore de la raíz).
#
# Redes con inspección TLS (Zscaler en equipos corporativos): las descargas
# fallan con "unable to get local issuer certificate" (la primera, la de los
# motores de `prisma generate`). El CA corporativo entra como secreto de
# BuildKit opcional, `extra_ca` (un PEM): se monta solo durante los RUN que
# salen a la red y no queda en ninguna capa. NODE_EXTRA_CA_CERTS va en cada
# RUN y no en un ENV, para que no llegue a la imagen final. Sin el secreto,
# Node avisa de que no encuentra el archivo y sigue con sus CA de siempre.
#
#   docker build --secret id=extra_ca,src="$NODE_EXTRA_CA_CERTS" ...

# Versión exacta, la misma en los tres Dockerfiles (US-105): un tag de solo
# major cambia de contenido sin aviso.
ARG NODE_IMAGE=node:22.22.3-alpine3.23

# --- 1. Capa de datos: npm ci + prisma generate + tsup -> packages/db/dist
FROM ${NODE_IMAGE} AS db-build
WORKDIR /repo/packages/db
COPY packages/db/package.json packages/db/package-lock.json ./
# --ignore-scripts: el `prepare` del paquete construye, y aquí aún no está el
# código. El build va explícito más abajo.
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    npm ci --ignore-scripts
COPY packages/db/ ./
# prisma.config.ts exige DATABASE_URL al cargarse, aunque `prisma generate` no
# se conecta a nada. Este valor solo vive en esta etapa.
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

# --- 2. API: yarn install (con devDependencies) + nest build -> dist/
FROM ${NODE_IMAGE} AS api-build
COPY --from=db-build /repo/packages/db /repo/packages/db
WORKDIR /repo/apps/api/rest
COPY apps/api/rest/package.json apps/api/rest/yarn.lock ./
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    yarn install --frozen-lockfile --non-interactive
COPY apps/api/rest/ ./
RUN yarn build

# --- 3. Runtime: solo dependencias de producción y los dos dist/
#
# Una sola copia de Prisma (US-106). yarn v1 instala también las dependencias
# del paquete enlazado por `link:`: si packages/db ya tuviera su package.json
# aquí, @prisma/client acabaría duplicado en los node_modules de la API, y
# esa copia nunca se carga (Node sigue el realpath del symlink). Por eso la
# API se instala PRIMERO, con packages/db aún vacío: yarn crea el symlink
# y no instala nada más. Después, packages/db instala lo suyo con su propio
# lock, el mismo que generó el cliente. El CLI `prisma` es devDependency: no
# se usa en ejecución.
FROM ${NODE_IMAGE} AS runtime
WORKDIR /repo/apps/api/rest
COPY apps/api/rest/package.json apps/api/rest/yarn.lock ./
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    yarn install --frozen-lockfile --production --non-interactive \
 && yarn cache clean
WORKDIR /repo/packages/db
COPY packages/db/package.json packages/db/package-lock.json ./
# --omit=optional además de --omit=dev: npm marca el árbol del CLI como
# `devOptional` (es devDependency Y peer opcional de @prisma/client), y
# --omit=dev solo no lo quita. Lo único `optional` de verdad en este lock es
# pg-cloudflare, que pg solo carga dentro de Cloudflare Workers.
# Sin la caché de npm en la capa (~110 MB en /root/.npm y /root/.cache).
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    npm ci --omit=dev --omit=optional --ignore-scripts \
 && npm cache clean --force \
 && rm -rf /root/.npm /root/.cache
COPY --from=db-build /repo/packages/db/dist ./dist
WORKDIR /repo/apps/api/rest
COPY --from=api-build /repo/apps/api/rest/dist ./dist
ENV NODE_ENV=production
# Commit del que salió la imagen (US-110): el CI lo pasa con --build-arg y
# /api/health lo devuelve como `revision`, para saber qué versión corre. Va al
# final para no invalidar la caché de las capas de arriba en cada commit.
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
USER node
EXPOSE 9001
CMD ["node", "dist/main.js"]
