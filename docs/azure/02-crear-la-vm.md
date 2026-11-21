# 02. Crear la máquina virtual

[← 01. Activar Azure for Students](01-activar-azure-for-students.md) · [Índice](README.md) · [03. Abrir los puertos de Dokploy →](03-abrir-los-puertos.md)

---

En el portal (https://portal.azure.com), busca **Virtual machines** y pulsa
**Create → Azure virtual machine**.

> ![Captura — Virtual machines → Create → Azure virtual machine](img/02-create-vm.png)

## Pestaña Basics

1. **Project details** e **Instance details**:

   | Campo | Valor | Por qué |
   |---|---|---|
   | Subscription | **Azure for Students** | Usa el crédito de estudiante |
   | Resource group | **Create new** → `rg-safari` | Agrupa todo: al terminar se borra de una vez |
   | Virtual machine name | `vm-dokploy` | |
   | Region | la más cercana con disponibilidad, por ejemplo **East US** | Si el tamaño no está disponible, prueba otra región |
   | Availability options | **No infrastructure redundancy required** | Una sola VM |
   | Security type | **Standard** | |
   | Image | **Ubuntu Server 24.04 LTS - x64 Gen2** | Linux **x64**: las imágenes de Safari son `linux/amd64`, no sirven en Arm64 |
   | VM architecture | **x64** | |
   | Size | **Standard B2s** (2 vCPU, 4 GiB) | Dokploy pide 2 GB; con 4 vas holgado. La B1s (1 GiB) no alcanza |

   Si **Standard B2s** no aparece, pulsa **See all sizes** y búscala.

   > ![Captura — Basics: proyecto, región, imagen y tamaño (tapa el Subscription ID)](img/02-basics-instancia.png)

2. **Administrator account**:

   | Campo | Valor |
   |---|---|
   | Authentication type | **SSH public key** |
   | Username | `azureuser` |
   | SSH public key source | **Generate new key pair** |
   | SSH Key Type | **RSA SSH Format** |
   | Key pair name | `vm-dokploy-key` |

   Con una llave SSH, la VM no acepta contraseñas: nadie puede entrar
   adivinándola.

   > ![Captura — Administrator account con SSH public key y azureuser](img/02-basics-administrador.png)

3. **Inbound port rules**:

   | Campo | Valor |
   |---|---|
   | Public inbound ports | **Allow selected ports** |
   | Select inbound ports | **SSH (22)**, **HTTP (80)** y **HTTPS (443)** |

   El portal avisa que los puertos quedan abiertos a internet: es lo que
   necesita Dokploy. El `3000` (el panel) se abre en el paso 03.

   > ![Captura — Inbound port rules con 22, 80 y 443](img/02-basics-puertos.png)

## Pestaña Disks

4. Pulsa **Next: Disks**:

   | Campo | Valor | Por qué |
   |---|---|---|
   | OS disk size | **64 GiB** | Dokploy pide 30 GB como mínimo, y las imágenes de Safari ocupan varios GB |
   | OS disk type | **Standard SSD** | Más barato que Premium y suficiente para el curso |
   | Delete with VM | activado | Borra el disco si borras la VM |

   > ![Captura — Disks con 64 GiB y Standard SSD](img/02-disks.png)

## Pestaña Networking

5. Pulsa **Next: Networking**. Deja lo que propone Azure (una red virtual
   nueva, una subred y una **IP pública** nueva) y activa
   **Delete public IP and NIC when VM is deleted**.

   La IP pública nueva es de tipo **Standard** y **estática**: no cambia
   aunque detengas y vuelvas a arrancar la VM, así que el DNS sigue sirviendo.

   > ![Captura — Networking con la IP pública nueva y el borrado junto con la VM](img/02-networking.png)

## Crear

6. Pulsa **Review + create**. Azure valida la configuración y muestra el
   **costo estimado por hora**. Revisa que diga **Validation passed** y pulsa
   **Create**.

   > ![Captura — Review + create con «Validation passed» y el costo estimado](img/02-review-create.png)

7. Se abre **Generate new key pair**. Pulsa
   **Download private key and create resource**: el navegador descarga
   `vm-dokploy-key.pem`.

   > **Guarda bien ese archivo.** Es la única forma de entrar a la VM y Azure
   > no lo vuelve a mostrar. No lo subas a ningún repositorio ni lo compartas.

   > ![Captura — Ventana «Generate new key pair» con el botón de descarga](img/02-descargar-llave.png)

8. El despliegue tarda uno o dos minutos. Cuando diga
   **Your deployment is complete**, pulsa **Go to resource**.

   > ![Captura — «Your deployment is complete» con Go to resource](img/02-despliegue-completo.png)

9. En **Overview** de la VM, anota la **Public IP address**. La vas a usar
   para el DNS y para entrar por SSH.

   > ![Captura — Overview de la VM con la IP pública (tápala antes de compartir)](img/02-overview-ip.png)

---

[← 01. Activar Azure for Students](01-activar-azure-for-students.md) · [Índice](README.md) · [03. Abrir los puertos de Dokploy →](03-abrir-los-puertos.md)
