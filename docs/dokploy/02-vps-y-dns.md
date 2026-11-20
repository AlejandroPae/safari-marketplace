# 02. El VPS y el DNS

[← 01. Antes de empezar](01-antes-de-empezar.md) · [Índice](README.md) · [03. Instalar Dokploy →](03-instalar-dokploy.md)

---

## Contratar el VPS

Requisitos de Dokploy, según su documentación:

- **Arquitectura:** x86_64 (amd64), por las imágenes.
- **RAM:** 2 GB como mínimo. Safari usa unos 350 MB en reposo, medido con
  `docker stats`. Dokploy, Traefik y los picos de la tienda suman bastante
  más: con 4 GB vas holgado.
- **Disco:** 30 GB como mínimo.
- **Sistema:** un Linux reciente (Ubuntu o Debian).
- **Puertos libres:** 80 y 443 (Traefik) y 3000 (el panel de Dokploy). La
  instalación falla si alguno está ocupado.

Anota la **IP pública** del VPS.

## Configurar el DNS

En el panel de tu dominio, crea tres registros **A** que apunten a la IP del
VPS:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `tienda` | IP del VPS |
| A | `admin` | IP del VPS |
| A | `dokploy` | IP del VPS |

También sirve un solo registro comodín `*` apuntando a la IP.

> Con Cloudflare, deja los registros en **DNS only** (nube gris) hasta que
> Let's Encrypt emita los certificados.

Comprueba desde tu equipo que el nombre ya resuelve a la IP del VPS (puede
tardar unos minutos):

```bash
nslookup tienda.<tu-dominio>
```

---

[← 01. Antes de empezar](01-antes-de-empezar.md) · [Índice](README.md) · [03. Instalar Dokploy →](03-instalar-dokploy.md)
