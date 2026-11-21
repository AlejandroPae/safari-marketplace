# Desplegar Safari: la guía del estudiante

Esta es la guía general. Te lleva **del fork del repositorio a la tienda
funcionando en tu propio dominio**, con HTTPS, desplegada desde **tus**
imágenes de Docker. Cada fase enlaza a una guía con el paso a paso y capturas.

Al terminar vas a tener:

```text
https://tienda.<tu-dominio>   → la tienda
https://admin.<tu-dominio>    → el panel de administración
https://dokploy.<tu-dominio>  → tu panel de despliegue

tu fork (GitHub) ──CI──▶ tus imágenes (Docker Hub) ──▶ Dokploy en tu VM (Azure)
                                                        ▲
                         tu dominio (Cloudflare) ───────┘ DNS
```

---

## Antes de empezar

**Cuentas que vas a necesitar** (todas se crean en las guías):

| Cuenta | Para qué | Costo |
|---|---|---|
| GitHub | Tu fork y su CI | Gratis |
| Docker Hub | Guardar tus imágenes | Gratis (repositorios públicos) |
| Cloudflare | Comprar el dominio y manejar su DNS | El dominio se paga por año |
| Azure for Students | La máquina virtual (VPS) | USD 100 de crédito, sin tarjeta |

**En tu equipo:** un navegador y una terminal con `ssh`, `curl` y
`nslookup`. En Windows usa **Git Bash** (viene con Git for Windows) o **WSL**:
los comandos de las guías son de bash.

**Tiempo:** unas 3 a 4 horas en total, repartidas. Hay esperas (la primera
corrida del CI tarda unos 15 minutos y el DNS puede tardar en propagarse),
así que conviene avanzar en paralelo como indica la tabla de fases.

---

## Tu hoja de datos

Ve completando esta tabla a medida que avanzas: cada fase usa datos de las
anteriores. Guárdala en un lugar privado, **no** en el repositorio.

| Dato | Lo obtienes en | Ejemplo |
|---|---|---|
| Usuario de GitHub | Fase 1 | `ana-dev` |
| Usuario de Docker Hub | Fase 1 | `ana-dev` |
| `IMAGE_TAG` (versión a desplegar) | Fase 1 | `sha-4fcb7f1` |
| Dominio | Fase 2 | `ana-lab.dev` |
| IP pública de la VM | Fase 3 | `203.0.113.10` |
| Llave SSH de la VM | Fase 3 | `~/.ssh/vm-dokploy-key.pem` |
| Contraseñas nuevas del admin y de los usuarios demo | Fase 5 | — |

> **Nunca** pongas en el repositorio, en una captura ni en un chat: el token de
> Docker Hub, la llave `.pem`, los secretos de Dokploy (`JWT_SECRET`,
> `SHOP_SECRET`, `POSTGRES_PASSWORD`) ni tus contraseñas.

---

## El recorrido

| Fase | Qué haces | Guía | Lista cuando… |
|---|---|---|---|
| 1. Fork y CI | Creas tu fork, habilitas Actions, conectas Docker Hub y publicas tus imágenes | [GitHub](github/README.md) | Una corrida verde de `main` con el job **«Imágenes Docker · build y publicación»**, y anotaste su `IMAGE_TAG` |
| 2. Dominio | Creas la cuenta de Cloudflare y compras el dominio | [Cloudflare 01-02](cloudflare/README.md) | El dominio aparece en tu cuenta de Cloudflare |
| 3. Servidor | Activas Azure for Students, creas la VM, abres los puertos y entras por SSH | [Azure 01-04](azure/README.md) | `ssh` a la VM funciona y anotaste su IP |
| 4. DNS | Creas los registros `tienda`, `admin` y `dokploy` apuntando a la IP | [Cloudflare 03-04](cloudflare/03-registros-dns.md) | `nslookup tienda.<tu-dominio>` devuelve la IP de tu VM |
| 5. Despliegue | Instalas Dokploy, creas el proyecto y el Compose, cargas las variables y los dominios, despliegas y cambias las contraseñas demo | [Dokploy 01, 03-09](dokploy/README.md) | `https://tienda.<tu-dominio>` muestra productos con candado válido, y el admin ya no acepta la contraseña demo |
| 6. Operar | Publicas versiones nuevas, vuelves atrás, resuelves problemas y controlas el crédito | [Dokploy 10-11](dokploy/10-actualizar-y-volver-atras.md) y [Azure 05](azure/05-costos-y-apagado.md) | — |

Las fases **1, 2 y 3 son independientes**: puedes hacerlas en paralelo (por
ejemplo, dejar corriendo el CI mientras creas la VM). La **4** necesita el
dominio y la IP; la **5**, todo lo anterior.

### Fase 1 — Tu fork y tus imágenes

1. [Crear tu fork y habilitar GitHub Actions](github/01-fork-y-actions.md)
2. [Secretos y variables de GitHub Actions](github/02-secretos-github-actions.md):
   el token y el usuario de Docker Hub, y relanzar el CI para que publique.
3. Anota el `IMAGE_TAG`: [cómo encontrarlo](dokploy/01-antes-de-empezar.md#elegir-la-versión-a-desplegar).

### Fase 2 — Tu dominio

1. [Crear la cuenta de Cloudflare](cloudflare/01-crear-la-cuenta.md)
2. [Comprar el dominio](cloudflare/02-comprar-el-dominio.md)

¿Ya tienes un dominio en otro proveedor? Sáltate esta fase y crea los
registros allí en la fase 4
([opciones](cloudflare/README.md#si-ya-tienes-un-dominio-en-otro-proveedor)).

### Fase 3 — Tu servidor

1. [Activar Azure for Students](azure/01-activar-azure-for-students.md)
2. [Crear la máquina virtual](azure/02-crear-la-vm.md)
3. [Abrir los puertos de Dokploy](azure/03-abrir-los-puertos.md)
4. [Conectarse por SSH](azure/04-conectarse-por-ssh.md)

¿Usas otro proveedor de VPS? Revisa los requisitos en
[Dokploy 02](dokploy/02-vps-y-dns.md) y sigue con la fase 4.

### Fase 4 — El DNS

1. [Crear los registros DNS](cloudflare/03-registros-dns.md)
2. [Comprobar que el dominio resuelve](cloudflare/04-comprobar.md)

### Fase 5 — Desplegar con Dokploy

1. [Antes de empezar](dokploy/01-antes-de-empezar.md): repasa los requisitos.
   Si hiciste las fases 1 a 4, ya los cumples.
2. [Instalar Dokploy](dokploy/03-instalar-dokploy.md) en la VM.
3. [Crear el proyecto marketplace](dokploy/04-crear-el-proyecto.md)
4. [Crear el Compose](dokploy/05-crear-el-compose.md)
5. [Cargar las variables](dokploy/06-variables.md)
6. [Configurar los dominios](dokploy/07-dominios.md)
7. [Desplegar y comprobar](dokploy/08-desplegar-y-comprobar.md)
8. [Cambiar las contraseñas demo](dokploy/09-contrasenas-demo.md):
   **obligatorio**, el admin queda público en internet.

### Fase 6 — Operar

- [Publicar una versión nueva o volver atrás](dokploy/10-actualizar-y-volver-atras.md)
- [Limitaciones y problemas frecuentes](dokploy/11-limitaciones-y-problemas.md)
- [Costos, apagado y borrado de la VM](azure/05-costos-y-apagado.md)
- Opcional: [proxy y SSL de Cloudflare](cloudflare/05-proxy-y-ssl-opcional.md),
  solo cuando todo funcione.

---

## Qué hay en esta carpeta

| Carpeta | Contenido |
|---|---|
| [`github/`](github/README.md) | Fork, GitHub Actions y secretos |
| [`cloudflare/`](cloudflare/README.md) | Cuenta, dominio y DNS |
| [`azure/`](azure/README.md) | La máquina virtual en Azure for Students |
| [`dokploy/`](dokploy/README.md) | Instalar Dokploy y desplegar Safari |
| [`product/`](product/README.md) | Las épicas e historias de usuario con las que se construyó el proyecto (flujo spec-driven). No hace falta leerlas para desplegar |
| `pickbazar/` | Copia de las imágenes del catálogo (archivos `.zip`). **No es una guía** |

**Correr el proyecto en tu equipo** no es necesario para desplegar. Si
quieres hacerlo (para programar cambios y verlos antes de publicarlos), la
guía de arranque local está en [`apps/README.md`](../apps/README.md).
