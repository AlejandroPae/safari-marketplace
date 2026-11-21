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

### Ejemplo: una máquina virtual con Azure for Students

> **Paso a paso con capturas:** [`docs/azure/`](../azure/README.md) cubre
> activar la suscripción, crear la VM, abrir los puertos, entrar por SSH y
> controlar el crédito. Abajo queda el resumen.

Si eres estudiante, **Azure for Students** da USD 100 de crédito por 12 meses,
sin tarjeta de crédito: solo pide verificar tu email de la universidad
(https://azure.microsoft.com/free/students). Alcanza para una VM como esta
durante el curso.

En el portal de Azure: **Virtual machines → Create → Azure virtual machine**.

| Campo | Valor recomendado | Por qué |
|---|---|---|
| Subscription | **Azure for Students** | Usa el crédito de estudiante |
| Resource group | uno nuevo, por ejemplo `rg-safari` | Para borrar todo junto al terminar |
| Region | la más cercana con disponibilidad (por ejemplo **East US**) | Latencia y disponibilidad del tamaño |
| Image | **Ubuntu Server 24.04 LTS - x64 Gen2** | Linux **x64**, no Arm64 |
| Size | **Standard B2s** (2 vCPU, 4 GiB) | Los 4 GB recomendados. La B1s gratuita (1 GiB) no alcanza |
| Authentication type | **SSH public key** | Más seguro que una contraseña |
| Public inbound ports | **SSH (22)** | Para conectarte; los demás puertos se abren después |
| OS disk size | **64 GiB** o más | Dokploy pide 30 GB como mínimo |

> ![Captura — Resumen «Essentials» de la VM en el portal (tapa el Subscription ID y la IP antes de compartirla)](img/02-azure-vm-essentials.png)

Ejemplo de **Essentials** de una VM creada así (valores ficticios):

```text
Resource group  : rg-safari
Status          : Running
Location        : East US
Subscription    : Azure for Students
Operating system: Linux
Size            : Standard B2s (2 vcpus, 4 GiB memory)
Primary NIC public IP: 203.0.113.10
```

**Abre los puertos de Dokploy.** La IP pública de una VM nueva (SKU Standard)
viene **cerrada a todo el tráfico entrante**, salvo lo que permitas. En la VM:
**Networking → Network settings → Create port rule → Inbound port rule**, y crea
una regla **Allow / TCP** para cada puerto:

| Puerto | Para qué |
|---|---|
| `80` | HTTP: Traefik y la validación de Let's Encrypt |
| `443` | HTTPS: la tienda y el admin |
| `3000` | El panel de Dokploy, solo mientras le pones dominio ([paso 03](03-instalar-dokploy.md)) |

> ![Captura — Reglas de entrada de la VM con los puertos 22, 80, 443 y 3000](img/02-azure-reglas-entrada.png)

Cuando el panel ya esté en `https://dokploy.<tu-dominio>`, puedes borrar la
regla del `3000`.

**Datos útiles de Azure:**
- La **IP pública es estática**: no cambia aunque detengas y vuelvas a
  arrancar la VM, así que el DNS sigue sirviendo.
- **Detener la VM** desde el portal (*Stop*) deja de cobrar el cómputo, pero
  el disco y la IP pública siguen consumiendo crédito. Para no gastar nada,
  borra el *resource group* completo al terminar el curso.
- El crédito restante se ve en https://www.microsoftazuresponsorships.com.
  Si se acaba, la suscripción se deshabilita.
- **No publiques** tu *Subscription ID* ni la IP de tu VM en capturas o
  repositorios públicos.

## Configurar el DNS

> ¿Todavía no tienes dominio, o lo vas a manejar en Cloudflare? La guía
> [`docs/cloudflare/`](../cloudflare/README.md) cubre, con capturas, cómo crear
> la cuenta, comprar el dominio y crear estos registros.

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
