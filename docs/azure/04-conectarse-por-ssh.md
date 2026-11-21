# 04. Conectarse por SSH

[← 03. Abrir los puertos de Dokploy](03-abrir-los-puertos.md) · [Índice](README.md) · [05. Costos, apagado y borrado →](05-costos-y-apagado.md)

---

Entras a la VM con el usuario **`azureuser`** y la llave
`vm-dokploy-key.pem` que descargaste en el paso 02. Azure no permite entrar
como `root`: los comandos de administración van con `sudo`.

## Preparar la llave

Mueve la llave a la carpeta `.ssh` de tu usuario y deja que solo tú puedas
leerla. Sin esto, SSH la rechaza con
`WARNING: UNPROTECTED PRIVATE KEY FILE!`.

**Windows (PowerShell):**

```powershell
mkdir $HOME\.ssh -Force
Move-Item $HOME\Downloads\vm-dokploy-key.pem $HOME\.ssh\
icacls $HOME\.ssh\vm-dokploy-key.pem /inheritance:r /grant:r "$($env:USERNAME):R"
```

**macOS, Linux o Git Bash:**

```bash
mkdir -p ~/.ssh
mv ~/Downloads/vm-dokploy-key.pem ~/.ssh/
chmod 400 ~/.ssh/vm-dokploy-key.pem
```

## Entrar a la VM

1. Conéctate con la IP pública del paso 02:

   ```bash
   ssh -i ~/.ssh/vm-dokploy-key.pem azureuser@<IP-de-la-VM>
   ```

   La primera vez pregunta si confías en el servidor
   (`Are you sure you want to continue connecting`). Escribe `yes`.

2. Al entrar, el prompt cambia a `azureuser@vm-dokploy:~$`.

   > ![Captura — Sesión SSH abierta en la VM (tapa la IP)](img/04-ssh-conectado.png)

3. Comprueba que la VM es la esperada:

   ```bash
   uname -m        # x86_64
   free -h         # ~3.8Gi de memoria total
   df -h /         # ~62G de disco
   ```

   > ![Captura — Salida de uname, free y df](img/04-comprobar-vm.png)

## Atajo (opcional)

Para no escribir la llave y la IP cada vez, agrega esto a `~/.ssh/config`
(en Windows, `C:\Users\<tu-usuario>\.ssh\config`):

```text
Host dokploy
  HostName <IP-de-la-VM>
  User azureuser
  IdentityFile ~/.ssh/vm-dokploy-key.pem
```

Desde ahí basta con `ssh dokploy`.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `WARNING: UNPROTECTED PRIVATE KEY FILE!` | La llave tiene permisos abiertos | Repite «Preparar la llave» |
| `Permission denied (publickey)` | Usuario o llave equivocados | El usuario es `azureuser`, no `root`, y la llave es la de esta VM |
| `Connection timed out` | El puerto 22 no está abierto, o la IP es otra | Revisa las reglas del paso 03 y la IP en **Overview** |
| Perdiste el `.pem` | Azure no lo guarda | En la VM: **Help → Reset password → Reset SSH public key**, con una llave nueva |

---

[← 03. Abrir los puertos de Dokploy](03-abrir-los-puertos.md) · [Índice](README.md) · [05. Costos, apagado y borrado →](05-costos-y-apagado.md)
