# 03. Instalar Dokploy

[← 02. El VPS y el DNS](02-vps-y-dns.md) · [Índice](README.md) · [04. Crear el Compose →](04-crear-el-compose.md)

---

> **Video de apoyo:** [«Dokploy me ha hecho olvidar Vercel (y no pienso volver
> atrás)»](https://www.youtube.com/watch?v=7XU74Di9UmE&t=270s), del canal Kuro.
> El enlace empieza en el minuto 4:30, donde se ve la instalación en un VPS.
> Sirve para ver el proceso en pantalla. La interfaz de Dokploy puede cambiar
> entre versiones: si algo no coincide, sigue los pasos de esta guía y la
> [documentación oficial](https://docs.dokploy.com/docs/core/installation).

1. Conéctate al VPS por SSH como `root`, o con un usuario con `sudo`:

   ```bash
   ssh root@<IP-del-VPS>
   ```

2. Ejecuta el instalador oficial (instala Docker si no está):

   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```

3. Abre `http://<IP-del-VPS>:3000` en el navegador y crea la cuenta de
   administrador de Dokploy.
4. **Pon el panel detrás de HTTPS.** En **Settings → Web Server**, asigna el
   dominio `dokploy.<tu-dominio>` con certificado de Let's Encrypt. Desde ahí
   entra siempre por `https://dokploy.<tu-dominio>`.

---

[← 02. El VPS y el DNS](02-vps-y-dns.md) · [Índice](README.md) · [04. Crear el Compose →](04-crear-el-compose.md)
