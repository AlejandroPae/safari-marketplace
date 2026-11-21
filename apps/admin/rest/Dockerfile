# Admin REST (Next.js, pages router) en contenedor.
#
# Contexto de build: la RAÍZ del repo. El admin es un workspace de yarn
# (apps/package.json) y su tailwind.config.js lee apps/tailwind-v3-colors.js.
#
#   docker build -f apps/admin/rest/Dockerfile .
#
# La etapa `deps` es IDÉNTICA, byte a byte, a la de apps/shop/Dockerfile:
# BuildKit cachea por contenido, así que el install del workspace (el paso
# más lento) se hace una vez para las dos imágenes. Si se cambia aquí,
# cambiarla allí igual.
#
# El runtime es el build `standalone` de Next: server.js más solo
# los node_modules que el servidor usa, trazados por Next. Ni el resto del
# workspace ni la caché de compilación (.next/cache) viajan en la imagen.
#
# Detrás de Zscaler, el CA corporativo entra como secreto opcional
# `extra_ca`, igual que en la imagen de la API (ver apps/api/rest/Dockerfile).

# Versión exacta, la misma en los tres Dockerfiles: un tag de solo
# major cambia de contenido sin aviso.
ARG NODE_IMAGE=node:22.22.3-alpine3.23

# --- 1. Dependencias del workspace, con devDependencies (para el build)
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo/apps
# yarn v1 con --frozen-lockfile exige que estén TODOS los workspaces del
# lockfile, también admin/graphql, aunque esta imagen no lo construya.
COPY apps/package.json apps/yarn.lock ./
COPY apps/shop/package.json shop/
COPY apps/admin/rest/package.json admin/rest/
COPY apps/admin/graphql/package.json admin/graphql/
# Con scripts: sharp 0.32 descarga libvips en su postinstall.
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    yarn install --frozen-lockfile --non-interactive --network-timeout 600000 \
 && yarn cache clean

# --- Configuración pública, compartida por el build y el runtime
#
# Las NEXT_PUBLIC_* se inlinean en el JavaScript durante `next build`; además
# next-i18next.config.js las lee al arrancar el servidor. Por eso van en una
# etapa base de la que salen las dos. Ni la URL de la API (/backend)
# ni la de la tienda (SHOP_URL, de ejecución) están aquí.
FROM ${NODE_IMAGE} AS config
ARG NEXT_PUBLIC_AUTH_TOKEN_KEY=AUTH_CRED
ARG NEXT_PUBLIC_DEFAULT_LANGUAGE=en
ARG NEXT_PUBLIC_ENABLE_MULTI_LANG=false
ARG NEXT_PUBLIC_AVAILABLE_LANGUAGES=en,de
ARG NEXT_PUBLIC_GOOGLE_MAP_API_KEY=
ARG NEXT_PUBLIC_API_BROADCAST_DRIVER=log
ARG NEXT_PUBLIC_PUSHER_DEV_MOOD=false
ARG NEXT_PUBLIC_PUSHER_APP_KEY=your-pusher-app-key
ARG NEXT_PUBLIC_PUSHER_APP_CLUSTER=ap2
ARG NEXT_PUBLIC_BROADCAST_AUTH_URL=/backend/broadcasting/auth
ARG NEXT_PUBLIC_VERSION=11.10.2
ENV NEXT_PUBLIC_AUTH_TOKEN_KEY=${NEXT_PUBLIC_AUTH_TOKEN_KEY} \
    NEXT_PUBLIC_DEFAULT_LANGUAGE=${NEXT_PUBLIC_DEFAULT_LANGUAGE} \
    NEXT_PUBLIC_ENABLE_MULTI_LANG=${NEXT_PUBLIC_ENABLE_MULTI_LANG} \
    NEXT_PUBLIC_AVAILABLE_LANGUAGES=${NEXT_PUBLIC_AVAILABLE_LANGUAGES} \
    NEXT_PUBLIC_GOOGLE_MAP_API_KEY=${NEXT_PUBLIC_GOOGLE_MAP_API_KEY} \
    NEXT_PUBLIC_API_BROADCAST_DRIVER=${NEXT_PUBLIC_API_BROADCAST_DRIVER} \
    NEXT_PUBLIC_PUSHER_DEV_MOOD=${NEXT_PUBLIC_PUSHER_DEV_MOOD} \
    NEXT_PUBLIC_PUSHER_APP_KEY=${NEXT_PUBLIC_PUSHER_APP_KEY} \
    NEXT_PUBLIC_PUSHER_APP_CLUSTER=${NEXT_PUBLIC_PUSHER_APP_CLUSTER} \
    NEXT_PUBLIC_BROADCAST_AUTH_URL=${NEXT_PUBLIC_BROADCAST_AUTH_URL} \
    NEXT_PUBLIC_STORE_NOTICE_CREATED_CHANNEL_PRIVATE=private-store_notice.created \
    NEXT_PUBLIC_ORDER_CREATED_CHANNEL_PRIVATE=private-order.created \
    NEXT_PUBLIC_MESSAGE_CHANNEL_PRIVATE=private-message.created \
    NEXT_PUBLIC_STORE_NOTICE_CREATED_EVENT=store.notice.event \
    NEXT_PUBLIC_ORDER_CREATED_EVENT=order.create.event \
    NEXT_PUBLIC_MESSAGE_EVENT=message.event \
    NEXT_PUBLIC_VERSION=${NEXT_PUBLIC_VERSION} \
    NEXT_TELEMETRY_DISABLED=1

# --- 2. Build: next build (standalone)
#
# CON APPLICATION_MODE=production, a propósito (decisión del dueño):
# next.config.js lo traduce en `typescript.ignoreBuildErrors`. El admin no
# pasa hoy el chequeo de tipos: `tsc` falla con
#   TS2688: Cannot find type definition file for 'minimatch'
# (ver apps/README.md). Cuando eso se arregle, quitar esa
# variable para que el build vuelva a comprobar tipos, como el de la tienda.
# NEXT_OUTPUT activa `output: 'standalone'` en next.config.js (solo aquí, no
# en `just build`).
FROM config AS build
ENV APPLICATION_MODE=production \
    NEXT_OUTPUT=standalone
COPY --from=deps /repo/apps /repo/apps
COPY apps/tailwind-v3-colors.js /repo/apps/
COPY apps/admin/rest/ /repo/apps/admin/rest/
WORKDIR /repo/apps/admin/rest
RUN yarn build

# --- 3. Runtime: el standalone, más lo que Next no copia solo
#
# .next/standalone reproduce el workspace desde su raíz (apps/): node_modules
# trazados y admin/rest/ con server.js. Se copia sobre /repo/apps para
# conservar las rutas. Encima van .next/static, public (con las traducciones
# de public/locales) y next-i18next.config.js, que serverSideTranslations
# carga en ejecución por ruta y el trazado no ve. Todo es del usuario node:
# el ISR escribe en .next/server/pages y el optimizador, en .next/cache.
FROM config AS runtime
# HOSTNAME explícito: Docker lo fija al id del contenedor y server.js
# escucharía solo en esa IP, no en 127.0.0.1 (healthcheck).
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /repo/apps
COPY --from=build --chown=node:node /repo/apps/admin/rest/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/rest/.next/static ./admin/rest/.next/static
COPY --from=build --chown=node:node /repo/apps/admin/rest/public ./admin/rest/public
COPY --from=build --chown=node:node /repo/apps/admin/rest/next-i18next.config.js ./admin/rest/
WORKDIR /repo/apps/admin/rest
USER node
EXPOSE 3000
# Sin yarn delante: así la señal de parada llega a Next (con init: true en
# el compose).
CMD ["node", "server.js"]
