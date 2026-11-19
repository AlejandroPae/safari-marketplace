# Tienda (Next.js, pages router) en contenedor — US-15.
#
# Contexto de build: la RAÍZ del repo. La tienda es un workspace de yarn
# (apps/package.json) y su tailwind.config.js lee apps/tailwind-v3-colors.js.
#
#   docker build -f apps/shop/Dockerfile .
#
# Las etapas `deps` y `prod-deps` son IDÉNTICAS, byte a byte, a las de
# apps/admin/rest/Dockerfile: BuildKit cachea por contenido, así que el
# install del workspace (el paso más lento) se hace una vez para las dos
# imágenes. Si se cambian aquí, cambiarlas allí igual.
#
# Detrás de Zscaler, el CA corporativo entra como secreto opcional
# `extra_ca`, igual que en la imagen de la API (ver apps/api/rest/Dockerfile).

ARG NODE_IMAGE=node:22-alpine

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

# --- 2. Dependencias de producción (las que se embarcan)
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /repo/apps
COPY apps/package.json apps/yarn.lock ./
COPY apps/shop/package.json shop/
COPY apps/admin/rest/package.json admin/rest/
COPY apps/admin/graphql/package.json admin/graphql/
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca \
    yarn install --frozen-lockfile --production --non-interactive --network-timeout 600000 \
 && yarn cache clean

# --- Configuración pública, compartida por el build y el runtime
#
# Las NEXT_PUBLIC_* se inlinean en el JavaScript durante `next build`; además
# next-i18next.config.js las lee al arrancar `next start`. Por eso van en una
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

# --- 3. Build: next build + next-sitemap (postbuild)
#
# Sin APPLICATION_MODE=production: `next build` comprueba los tipos de la
# tienda, que hoy pasan. Y no necesita la API (US-104).
FROM config AS build
COPY --from=deps /repo/apps /repo/apps
COPY apps/tailwind-v3-colors.js /repo/apps/
COPY apps/shop/ /repo/apps/shop/
WORKDIR /repo/apps/shop
RUN yarn build:rest

# --- 4. Runtime: dependencias de producción + .next + public
FROM config AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /repo/apps /repo/apps
WORKDIR /repo/apps/shop
COPY --from=build /repo/apps/shop/package.json /repo/apps/shop/next.config.js /repo/apps/shop/next-i18next.config.js ./
COPY --from=build /repo/apps/shop/public ./public
COPY --from=build --chown=node:node /repo/apps/shop/.next ./.next
USER node
EXPOSE 3000
# Sin yarn delante: así la señal de parada llega a Next (con init: true en
# el compose).
CMD ["node", "/repo/apps/node_modules/next/dist/bin/next", "start", "-p", "3000"]
