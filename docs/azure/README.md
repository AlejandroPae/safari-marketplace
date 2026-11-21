# Azure: la máquina virtual donde corre Dokploy

Esta guía crea el **VPS** del despliegue: una máquina virtual Linux en Azure,
con la suscripción **Azure for Students**, lista para instalar Dokploy
([`docs/dokploy/`](../dokploy/README.md)).

```text
tu equipo ──ssh──▶ VM Ubuntu en Azure (IP pública fija)
                     ├─ 80 / 443  → Traefik (tienda y admin, con Let's Encrypt)
                     └─ 3000      → panel de Dokploy (hasta ponerle dominio)
```

Al terminar vas a tener:
- una VM **Ubuntu Server 24.04 LTS x64**, tamaño **Standard B2s**
  (2 vCPU, 4 GiB) y disco de **64 GiB**;
- su **IP pública**, que no cambia;
- los puertos **22, 80, 443 y 3000** abiertos;
- la conexión por SSH desde tu equipo, con tu llave `.pem`.

## Pasos

Síguelos en orden: cada uno da por hecho el anterior.

1. [Activar Azure for Students](01-activar-azure-for-students.md)
2. [Crear la máquina virtual](02-crear-la-vm.md)
3. [Abrir los puertos de Dokploy](03-abrir-los-puertos.md)
4. [Conectarse por SSH](04-conectarse-por-ssh.md)
5. [Costos, apagado y borrado](05-costos-y-apagado.md)

Al final de cada paso hay un enlace al siguiente.

> **Después de esta guía:** con la IP pública, crea los registros DNS
> ([`docs/cloudflare/03-registros-dns.md`](../cloudflare/03-registros-dns.md))
> e instala Dokploy ([`docs/dokploy/03-instalar-dokploy.md`](../dokploy/03-instalar-dokploy.md)).

> **No publiques** tu *Subscription ID*, la IP de tu VM ni tu llave `.pem` en
> capturas, repositorios o chats. Si compartes una captura del portal, tápalos
> por completo.

Si ya tienes un VPS en otro proveedor (DigitalOcean, Hetzner, AWS…), no
necesitas esta guía: revisa los requisitos en
[`docs/dokploy/02-vps-y-dns.md`](../dokploy/02-vps-y-dns.md).
