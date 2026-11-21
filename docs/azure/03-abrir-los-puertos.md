# 03. Abrir los puertos de Dokploy

[← 02. Crear la máquina virtual](02-crear-la-vm.md) · [Índice](README.md) · [04. Conectarse por SSH →](04-conectarse-por-ssh.md)

---

La IP pública de la VM llega **cerrada a todo el tráfico entrante**, salvo lo
que permitas. En el paso 02 abriste el 22, el 80 y el 443. Falta el **3000**,
el del panel de Dokploy:

| Puerto | Para qué |
|---|---|
| `22` | SSH: tu conexión a la VM |
| `80` | HTTP: Traefik y la validación de Let's Encrypt |
| `443` | HTTPS: la tienda y el admin |
| `3000` | El panel de Dokploy, solo mientras le pones dominio |

1. En la VM, entra a **Networking → Network settings**. Verás las reglas de
   entrada que creó el paso 02.

   > ![Captura — Network settings con las reglas de 22, 80 y 443](img/03-network-settings.png)

2. Pulsa **Create port rule → Inbound port rule** y completa:

   | Campo | Valor |
   |---|---|
   | Source | **Any** |
   | Source port ranges | `*` |
   | Destination | **Any** |
   | Service | **Custom** |
   | Destination port ranges | `3000` |
   | Protocol | **TCP** |
   | Action | **Allow** |
   | Priority | la que propone Azure |
   | Name | `Allow-Dokploy-3000` |

   Pulsa **Add**.

   > ![Captura — Formulario de la regla de entrada para el puerto 3000](img/03-regla-3000.png)

3. La lista muestra las cuatro reglas: **22, 80, 443 y 3000**.

   > ![Captura — Reglas de entrada con los puertos 22, 80, 443 y 3000](img/03-reglas-completas.png)

> **Cierra el 3000 después.** Cuando el panel ya responda en
> `https://dokploy.<tu-dominio>` ([`docs/dokploy/03`](../dokploy/03-instalar-dokploy.md)),
> borra la regla `Allow-Dokploy-3000`: el panel ya entra por el 443.

---

[← 02. Crear la máquina virtual](02-crear-la-vm.md) · [Índice](README.md) · [04. Conectarse por SSH →](04-conectarse-por-ssh.md)
