# 06. Configurar los dominios

[← 05. Cargar las variables](05-variables.md) · [Índice](README.md) · [07. Desplegar y comprobar →](07-desplegar-y-comprobar.md)

---

En la pestaña **Domains** del Compose, crea dos dominios. Los dos van al
servicio **`proxy`**, cada uno con su puerto:

| Campo | Tienda | Admin |
|---|---|---|
| Service Name | `proxy` | `proxy` |
| Host | `tienda.<tu-dominio>` | `admin.<tu-dominio>` |
| Path | `/` | `/` |
| Container Port | `3003` | `3002` |
| HTTPS | activado | activado |
| Certificate | Let's Encrypt | Let's Encrypt |

No crees un dominio para la API. El navegador le habla por
`/backend/…` dentro del mismo dominio de la tienda o del admin, y el proxy lo
manda a la API.

Si quieres ver el compose final que va a ejecutar Dokploy, con las etiquetas
de Traefik y la red ya añadidas, pulsa **Preview Compose**.

---

[← 05. Cargar las variables](05-variables.md) · [Índice](README.md) · [07. Desplegar y comprobar →](07-desplegar-y-comprobar.md)
