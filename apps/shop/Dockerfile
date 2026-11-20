# Tienda (Next.js, pages router) en contenedor — US-15, adelgazada en US-105.
#
# Contexto de build: la RAÍZ del repo. La tienda es un workspace de yarn
# (apps/package.json) y su tailwind.config.js lee apps/tailwind-v3-colors.js.
#
#   docker build -f apps/shop/Dockerfile .
#
# La etapa `deps` es IDÉNTICA, byte a byte, a la de apps/admin/rest/Dockerfile:
# BuildKit cachea por contenido, así que el install del workspace (el paso
# más lento) se hace una vez para las dos imágenes. Si se cambia aquí,
# cambiarla allí igual.
#
# El runtime es el build `standalone` de Next (US-105): server.js más solo
# los node_modules que el servidor usa, trazados por Next. Ni el resto del
# workspace ni la caché de compilación (.next/cache) viajan en la imagen.
#
# Detrás de Zscaler, el CA corporativo entra como secreto opcional
# `extra_ca`, igual que en la imagen de la API (ver apps/api/rest/Dockerfile).

# Versión exacta, la misma en los tres Dockerfiles (US-105): un tag de solo
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
# etapa base de la que salen las dos. La URL de la API NO está aquí (US-102):
# el navegador usa /backend y el SSR, API_INTERNAL_URL, de ejecución.
FROM ${NODE_IMAGE} AS config
ARG NEXT_PUBLIC_DEFAULT_LANGUAGE=en
ARG NEXT_PUBLIC_ENABLE_MULTI_LANG=false
ARG NEXT_PUBLIC_AVAILABLE_LANGUAGES=en
ARG NEXT_PUBLIC_VERSION=11.10.2
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_PAYPAL_CLIENT_TOKEN=
ARG NEXT_PUBLIC_RAZORPAY_KEY=
ARG NEXT_PUBLIC_PAYSTACK_KEY=
ARG NEXT_PUBLIC_GOOGLE_MAP_API_KEY=
ENV FRAMEWORK_PROVIDER=rest \
    NEXT_PUBLIC_DEFAULT_LANGUAGE=${NEXT_PUBLIC_DEFAULT_LANGUAGE} \
    NEXT_PUBLIC_ENABLE_MULTI_LANG=${NEXT_PUBLIC_ENABLE_MULTI_LANG} \
    NEXT_PUBLIC_AVAILABLE_LANGUAGES=${NEXT_PUBLIC_AVAILABLE_LANGUAGES} \
    NEXT_PUBLIC_VERSION=${NEXT_PUBLIC_VERSION} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_PAYPAL_CLIENT_TOKEN=${NEXT_PUBLIC_PAYPAL_CLIENT_TOKEN} \
    NEXT_PUBLIC_RAZORPAY_KEY=${NEXT_PUBLIC_RAZORPAY_KEY} \
    NEXT_PUBLIC_PAYSTACK_KEY=${NEXT_PUBLIC_PAYSTACK_KEY} \
    NEXT_PUBLIC_GOOGLE_MAP_API_KEY=${NEXT_PUBLIC_GOOGLE_MAP_API_KEY} \
    NEXT_TELEMETRY_DISABLED=1

# --- 2. Build: next build (standalone)
#
# Sin APPLICATION_MODE=production: `next build` comprueba los tipos de la
# tienda, que hoy pasan. Y no necesita la API (US-104). NEXT_OUTPUT activa
# `output: 'standalone'` en next.config.js (solo aquí, no en `just build`).
FROM config AS build
ENV NEXT_OUTPUT=standalone
COPY --from=deps /repo/apps /repo/apps
COPY apps/tailwind-v3-colors.js /repo/apps/
COPY apps/shop/ /repo/apps/shop/
WORKDIR /repo/apps/shop
RUN yarn build:rest

# --- 3. Runtime: el standalone, más lo que Next no copia solo
#
# .next/standalone reproduce el workspace desde su raíz (apps/): node_modules
# trazados y shop/ con server.js. Se copia sobre /repo/apps para conservar las
# rutas. Encima van .next/static, public (con las traducciones de
# public/locales) y next-i18next.config.js, que serverSideTranslations carga
# en ejecución por ruta y el trazado no ve. Todo es del usuario node: el ISR
# escribe en .next/server/pages y el optimizador de imágenes, en .next/cache.
FROM config AS runtime
# HOSTNAME explícito: Docker lo fija al id del contenedor y server.js
# escucharía solo en esa IP, no en 127.0.0.1 (healthcheck, next-auth).
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /repo/apps
COPY --from=build --chown=node:node /repo/apps/shop/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/shop/.next/static ./shop/.next/static
COPY --from=build --chown=node:node /repo/apps/shop/public ./shop/public
COPY --from=build --chown=node:node /repo/apps/shop/next-i18next.config.js ./shop/
WORKDIR /repo/apps/shop
USER node
EXPOSE 3000
# Sin yarn delante: así la señal de parada llega a Next (con init: true en
# el compose).
CMD ["node", "server.js"]
