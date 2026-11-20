# 09. Publicar una versión nueva o volver atrás

[← 08. Cambiar las contraseñas demo (obligatorio)](08-contrasenas-demo.md) · [Índice](README.md) · [10. Limitaciones y problemas frecuentes →](10-limitaciones-y-problemas.md)

---

**Versión nueva:**
1. Haz push a `main` de tu fork y espera la corrida verde.
2. Toma la etiqueta nueva del resumen «Imágenes (sha-…)».
3. En Dokploy, cambia `IMAGE_TAG` en **Environment** y pulsa **Deploy**.

**Volver atrás:** es lo mismo, con la etiqueta de una versión anterior. Como
la base (`safari-db-init`) y el proxy (`safari-proxy`) van en imágenes con la
misma etiqueta, también vuelve su configuración.

Comprueba la versión que quedó corriendo con `/backend/health` ([07 · Comprobar que funciona](07-desplegar-y-comprobar.md#comprobar-que-funciona)).

> Dokploy clona `main` en cada despliegue. Lo que sale del repositorio es
> solo `docker-compose.deploy.yml`. Si ese archivo cambió entre las dos
> versiones, al volver atrás se usa el actual.

---

[← 08. Cambiar las contraseñas demo (obligatorio)](08-contrasenas-demo.md) · [Índice](README.md) · [10. Limitaciones y problemas frecuentes →](10-limitaciones-y-problemas.md)
