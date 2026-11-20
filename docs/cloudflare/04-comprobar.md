# 04. Comprobar que el dominio resuelve

[← 03. Crear los registros DNS](03-registros-dns.md) · [Índice](README.md) · [05. Proxy y SSL de Cloudflare (opcional) →](05-proxy-y-ssl-opcional.md)

---

Antes de instalar Dokploy o configurar los dominios en el panel, comprueba
que cada subdominio ya apunta a tu VPS.

## Desde tu equipo

**Windows** (PowerShell o CMD), **macOS** o **Linux**:

```bash
nslookup tienda.<tu-dominio>
nslookup admin.<tu-dominio>
nslookup dokploy.<tu-dominio>
```

Cada respuesta debe terminar con la IP de tu VPS:

```text
Name:    tienda.<tu-dominio>
Address: 203.0.113.10
```

En macOS o Linux también sirve `dig +short tienda.<tu-dominio>`, que imprime
solo la IP.

> **[Captura 17 — Salida de nslookup con la IP del VPS]**
> Archivo sugerido: `img/17-nslookup.png`

## Si todavía no resuelve

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Non-existent domain` o `NXDOMAIN` justo después de comprar | El dominio recién registrado aún se está activando | Espera unos minutos y vuelve a probar |
| Resuelve a otra IP | El registro tiene la IP equivocada, o tu red guarda una respuesta vieja | Revisa el registro en **DNS → Records**; prueba con `nslookup tienda.<tu-dominio> 1.1.1.1` |
| Resuelve a IPs de Cloudflare, no a la de tu VPS | El registro quedó en **Proxied** (nube naranja) | Cámbialo a **DNS only** ([paso 03](03-registros-dns.md)) |
| Dejó de resolver días después de la compra | No verificaste el email de contacto del dominio | Busca el correo de verificación ([paso 02](02-comprar-el-dominio.md#después-de-comprar)) |

## Siguiente

Con los tres subdominios resolviendo, sigue con la instalación de Dokploy:
[`docs/dokploy/03-instalar-dokploy.md`](../dokploy/03-instalar-dokploy.md).

---

[← 03. Crear los registros DNS](03-registros-dns.md) · [Índice](README.md) · [05. Proxy y SSL de Cloudflare (opcional) →](05-proxy-y-ssl-opcional.md)
