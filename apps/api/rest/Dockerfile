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

ARG NODE_IMAGE=node:22-alpine

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
FROM ${NODE_IMAGE} AS runtime
WORKDIR /repo/packages/db
COPY packages/db/package.json packages/db/package-lock.json ./
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    npm ci --omit=dev --ignore-scripts
COPY --from=db-build /repo/packages/db/dist ./dist
WORKDIR /repo/apps/api/rest
COPY apps/api/rest/package.json apps/api/rest/yarn.lock ./
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    yarn install --frozen-lockfile --production --non-interactive \
 && yarn cache clean
COPY --from=api-build /repo/apps/api/rest/dist ./dist
ENV NODE_ENV=production
USER node
EXPOSE 9001
CMD ["node", "dist/main.js"]
