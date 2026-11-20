# Desplegar Safari en un VPS con Dokploy

Esta guía publica **tu fork** de Safari en un servidor propio, con dos
subdominios con HTTPS:

- `https://tienda.<tu-dominio>`: la tienda;
- `https://admin.<tu-dominio>`: el panel de administración.

Dokploy es un panel de despliegue que se instala en el VPS. Usa Docker y
Traefik: Traefik recibe el tráfico de internet, emite los certificados de
Let's Encrypt y lo pasa a tus contenedores.

```text
Internet ──https──▶ Traefik (Dokploy)
                        │  tienda.<dominio> ─▶ proxy:3003 ─▶ shop
                        │  admin.<dominio>  ─▶ proxy:3002 ─▶ admin
                        │            /backend/* ─▶ api-lb:9001 ─▶ api ─▶ postgres
```

Todo corre con las **imágenes que publica el CI de tu fork** en tu cuenta de
Docker Hub. En el servidor no se compila nada.

## Pasos

Síguelos en orden: cada uno da por hecho el anterior.

1. [Antes de empezar](01-antes-de-empezar.md) (requisitos · elegir la versión a desplegar)
2. [El VPS y el DNS](02-vps-y-dns.md) (Contratar el VPS · Configurar el DNS)
3. [Instalar Dokploy](03-instalar-dokploy.md)
4. [Crear el Compose](04-crear-el-compose.md)
5. [Cargar las variables](05-variables.md)
6. [Configurar los dominios](06-dominios.md)
7. [Desplegar y comprobar](07-desplegar-y-comprobar.md) (Desplegar · Comprobar que funciona)
8. [Cambiar las contraseñas demo (obligatorio)](08-contrasenas-demo.md)
9. [Publicar una versión nueva o volver atrás](09-actualizar-y-volver-atras.md)
10. [Limitaciones y problemas frecuentes](10-limitaciones-y-problemas.md) (Limitaciones conocidas · Problemas frecuentes)

Al final de cada paso hay un enlace al siguiente.
