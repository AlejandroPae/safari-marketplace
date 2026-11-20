# 03. Instalar Dokploy

[← 02. El VPS y el DNS](02-vps-y-dns.md) · [Índice](README.md) · [04. Crear el Compose →](04-crear-el-compose.md)

---

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
