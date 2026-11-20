# 08. Desplegar y comprobar

[← 07. Configurar los dominios](07-dominios.md) · [Índice](README.md) · [09. Cambiar las contraseñas demo (obligatorio) →](09-contrasenas-demo.md)

---

## Desplegar

1. Pulsa **Deploy** y abre los logs del despliegue.
2. El primer arranque tarda unos minutos. Baja las cinco imágenes y la base
   arranca vacía. En el log de `db-init` aparece:

   ```text
   db-init: base vacía, seed aplicado
   db-init: esquema al día
   ```

3. El orden de arranque es: `postgres` → `db-init` (termina) → `api` → `shop`
   y `admin` → `proxy`. Los servicios con healthcheck esperan a estar sanos
   antes de dejar pasar al siguiente.
4. Cuando todo esté arriba, espera unos segundos a que Traefik emita los
   certificados.

En los despliegues siguientes, `db-init` dice
`la base ya tiene datos …, seed omitido`. Los datos iniciales se cargan
**solo una vez**, y lo que crees o borres después no se pisa.

## Comprobar que funciona

Desde tu equipo:

```bash
# La tienda, el admin y la API (por el proxy). Los tres deben dar 200.
curl -sI https://tienda.<tu-dominio>/en | head -1
curl -sI https://admin.<tu-dominio>/en/login | head -1
curl -s  https://tienda.<tu-dominio>/backend/health/ready

# Qué versión corre: «revision» debe ser el commit completo de IMAGE_TAG.
curl -s https://tienda.<tu-dominio>/backend/health

# El sitemap usa tu dominio real.
curl -s https://tienda.<tu-dominio>/robots.txt | grep -i sitemap
```

Después, en el navegador:

- `https://tienda.<tu-dominio>` muestra productos;
- `https://admin.<tu-dominio>` permite entrar con `admin@demo.com` y la
  contraseña demo, que cambias en [09 · Contraseñas demo](09-contrasenas-demo.md);
- el candado del navegador muestra un certificado válido de Let's Encrypt.

---

[← 07. Configurar los dominios](07-dominios.md) · [Índice](README.md) · [09. Cambiar las contraseñas demo (obligatorio) →](09-contrasenas-demo.md)
