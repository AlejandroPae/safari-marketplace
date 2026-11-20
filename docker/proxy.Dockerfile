# Imagen de Caddy con las dos configuraciones del stack (US-111): el reverse
# proxy de la tienda y el admin (docker/Caddyfile, el comando por defecto) y
# el balanceador de la API (docker/api-lb.Caddyfile, que el compose elige con
# `command`). Mismo motivo que db-init.Dockerfile: en Dokploy, un montaje
# relativo del repo no sobrevive al git clone de cada despliegue.
#
# Contexto: la raíz del repo (ver .dockerignore).
FROM caddy:2.11.9-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/api-lb.Caddyfile /etc/caddy/api-lb.Caddyfile
