# Cloudflare: cuenta, dominio y registros DNS

Esta guía deja listo el **dominio** que necesita el despliegue en Dokploy
([`docs/dokploy/`](../dokploy/README.md)):

- una cuenta de Cloudflare, protegida con 2FA;
- un dominio propio, comprado en Cloudflare Registrar;
- los registros DNS `tienda`, `admin` y `dokploy` apuntando a tu VPS.

```text
navegador ──▶ DNS de Cloudflare ──▶ tienda.<tu-dominio>  ─┐
              (registros A)         admin.<tu-dominio>   ─┼─▶ IP de tu VPS (Dokploy)
                                    dokploy.<tu-dominio> ─┘
```

Cloudflare cumple aquí dos papeles: es el **registrador** (te vende el
dominio) y el **DNS** (dice a qué IP apunta cada subdominio). El HTTPS no lo
pone Cloudflare: lo emite Let's Encrypt desde Dokploy.

## Pasos

Síguelos en orden: cada uno da por hecho el anterior.

1. [Crear la cuenta](01-crear-la-cuenta.md) (registro · verificar el email · 2FA)
2. [Comprar el dominio](02-comprar-el-dominio.md)
3. [Crear los registros DNS](03-registros-dns.md)
4. [Comprobar que el dominio resuelve](04-comprobar.md)
5. [Proxy y SSL de Cloudflare (opcional)](05-proxy-y-ssl-opcional.md)

Al final de cada paso hay un enlace al siguiente.

> **Antes del paso 3** necesitas la **IP pública de tu VPS**
> ([`docs/dokploy/02-vps-y-dns.md`](../dokploy/02-vps-y-dns.md)). Puedes hacer
> los pasos 1 y 2 antes de contratarlo.

## Si ya tienes un dominio en otro proveedor

No hace falta comprar otro. Tienes dos opciones:

- **Crear los registros en tu proveedor actual**, con los valores del
  [paso 3](03-registros-dns.md). El resto de la guía no cambia.
- **Agregar el dominio a Cloudflare** (*Add a domain* en el panel) y cambiar
  los *nameservers* en tu proveedor por los que te indique Cloudflare. Esta
  guía no cubre esa opción: sigue la
  [documentación de Cloudflare](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).
