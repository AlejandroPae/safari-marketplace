# 11. Limitaciones y problemas frecuentes

[← 10. Publicar una versión nueva o volver atrás](10-actualizar-y-volver-atras.md) · [Índice](README.md)

---

## Limitaciones conocidas

- **Corte de 1 a 2 minutos en cada despliegue.** Se recrean la API, la
  tienda y el admin, y las primeras visitas son lentas mientras la tienda
  regenera sus páginas.
- **No hay migraciones de base.** El esquema se aplica con
  `CREATE ... IF NOT EXISTS`: una tabla nueva sí llega, pero una **columna
  nueva en una tabla existente no**. Si un cambio del esquema la necesita,
  hay que aplicarla a mano o empezar con una base nueva (se pierden los
  datos).
- **`og:url`** (la URL de las vistas previas en redes sociales) no usa tu
  dominio: queda fija en el build.
- **Sin copias de seguridad ni monitoreo.** Los datos viven en el volumen
  `postgres-data` del VPS.
- **Imágenes de productos:** solo se optimizan las de los hosts permitidos en
  `apps/shop/next.config.js` (`images.remotePatterns`). Las fotos del seed sí
  lo están.

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El despliegue falla con `required variable … is missing a value: Falta …` | Falta esa variable o está vacía | Complétala en **Environment** y vuelve a desplegar |
| `pull access denied` o `manifest unknown` | `DOCKERHUB_USERNAME` o `IMAGE_TAG` mal escritos, o esa versión no se publicó | Compara con el resumen «Imágenes (sha-…)» de la corrida; el `IMAGE_TAG` lleva `sha-` |
| `exec format error` | El VPS es ARM | Usa un VPS x86_64 |
| El dominio da 404 de Traefik | El dominio no apunta a `proxy` con el puerto correcto, o el DNS no resuelve | Revisa la tabla de [07 · Dominios](07-dominios.md) y `nslookup` |
| Certificado inválido o «no seguro» | Let's Encrypt aún no emitió, o Cloudflare está en modo proxy | Espera un minuto; con Cloudflare, deja el registro en **DNS only** |
| La API queda `unhealthy` tras cambiar `POSTGRES_PASSWORD` | La contraseña solo se aplica al crear el volumen | Vuelve a la contraseña original |
| `db-init` termina con error | Ver su log en Dokploy | Si es por un cambio de esquema, ver «No hay migraciones» en [Limitaciones conocidas](#limitaciones-conocidas) |
| El login del admin redirige a `http://` | `SHOP_URL` sin `https://` | Corrige `SHOP_URL` y vuelve a desplegar |

---

[← 10. Publicar una versión nueva o volver atrás](10-actualizar-y-volver-atras.md) · [Índice](README.md)
