# Cómo crear secretos y variables en GitHub Actions

Esta guía explica cómo guardar en tu repositorio de GitHub las credenciales
que necesita el CI para publicar tus imágenes en Docker Hub. Se puede hacer
de dos formas, con el mismo resultado:

- [Opción A: desde la interfaz web de GitHub](#opción-a-desde-la-interfaz-web)
- [Opción B: desde la terminal, con GitHub CLI (`gh`)](#opción-b-desde-la-terminal-con-github-cli)

Al terminar vas a tener en tu repositorio:

| Nombre | Tipo | Valor |
|---|---|---|
| `DOCKERHUB_TOKEN` | **Secreto** | Tu *Personal Access Token* de Docker Hub |
| `DOCKERHUB_USERNAME` | **Variable** | Tu usuario de Docker Hub (p. ej. `mi-usuario`) |

---

## Antes de empezar: secreto o variable

GitHub Actions guarda dos tipos de valores:

- **Secreto:** un valor sensible, como un token o una contraseña. Una vez
  guardado **no se puede volver a ver**; solo se puede reemplazar. Si el CI
  lo imprime por error, GitHub lo oculta en los logs con `***`. En el
  workflow se lee como `${{ secrets.NOMBRE }}`.
- **Variable:** un valor que no es secreto, como un nombre de usuario o una
  URL. Se puede ver y editar. En el workflow se lee como
  `${{ vars.NOMBRE }}`.

Regla práctica: si alguien que lo vea podría usarlo para entrar a tu cuenta,
es un **secreto**.

> **Importante:** nunca pegues un token en un archivo del repositorio, en un
> commit, en un issue ni en un chat. Si te pasa, revócalo en Docker Hub y
> crea uno nuevo.

---

## Paso previo: crear el token en Docker Hub

El CI no usa tu contraseña de Docker Hub, sino un **Personal Access Token**
(PAT). Puedes revocar el token sin cambiar tu contraseña, y su permiso es
limitado.

1. Entra a https://hub.docker.com e inicia sesión.
2. Haz clic en tu avatar (arriba a la derecha) y elige **Account settings**.

   > **[Captura 1 — Menú del avatar con «Account settings»]**
   > Archivo sugerido: `img/01-dockerhub-account-settings.png`

3. En el menú lateral, entra a **Personal access tokens** y pulsa
   **Generate new token**.

   > **[Captura 2 — Página «Personal access tokens» con el botón «Generate new token»]**
   > Archivo sugerido: `img/02-dockerhub-personal-access-tokens.png`

4. Completa el formulario:
   - **Access token description:** algo que te diga para qué es, p. ej.
     `github-actions-safari`.
   - **Expiration date:** la que pida tu curso (por ejemplo, hasta el fin
     del semestre).
   - **Access permissions:** **Read & Write**. Hace falta escritura para
     publicar imágenes.

   > **[Captura 3 — Formulario del token con «Read & Write» seleccionado]**
   > Archivo sugerido: `img/03-dockerhub-token-form.png`

5. Pulsa **Generate** y **copia el token**. Docker Hub solo lo muestra una
   vez: si cierras la ventana sin copiarlo, tendrás que generar otro.

   > **[Captura 4 — Token generado, con el botón de copiar]**
   > Archivo sugerido: `img/04-dockerhub-token-generado.png`

Guárdalo un momento en un lugar seguro (tu gestor de contraseñas, por
ejemplo) mientras haces los pasos siguientes.

---

## Opción A: desde la interfaz web

### A.1 Abrir la configuración de secretos del repositorio

1. Entra a tu repositorio en GitHub
   (`https://github.com/<tu-usuario>/<tu-repo>`).
2. Pulsa la pestaña **Settings** (la última de la barra superior del
   repositorio). Si no la ves, no tienes permisos de administrador en ese
   repositorio: pídeselos a quien lo creó.

   > **[Captura 5 — Barra del repositorio con la pestaña «Settings» resaltada]**
   > Archivo sugerido: `img/05-github-settings-tab.png`

3. En el menú lateral izquierdo, abre **Secrets and variables** y elige
   **Actions**.

   > **[Captura 6 — Menú lateral con «Secrets and variables → Actions»]**
   > Archivo sugerido: `img/06-github-secrets-and-variables.png`

   Atajo: también puedes ir directo a
   `https://github.com/<tu-usuario>/<tu-repo>/settings/secrets/actions`.

### A.2 Crear el secreto `DOCKERHUB_TOKEN`

1. En la pestaña **Secrets**, pulsa **New repository secret**.

   > **[Captura 7 — Pestaña «Secrets» con el botón «New repository secret»]**
   > Archivo sugerido: `img/07-github-new-repository-secret.png`

2. Completa:
   - **Name:** `DOCKERHUB_TOKEN` (exactamente así, en mayúsculas).
   - **Secret:** pega el token de Docker Hub.

   > **[Captura 8 — Formulario «New secret» con el nombre DOCKERHUB_TOKEN]**
   > Archivo sugerido: `img/08-github-secret-form.png`

3. Pulsa **Add secret**. El secreto aparece en la lista con la fecha de
   actualización; su valor ya no se puede ver.

   > **[Captura 9 — Lista de secretos con DOCKERHUB_TOKEN creado]**
   > Archivo sugerido: `img/09-github-secret-creado.png`

### A.3 Crear la variable `DOCKERHUB_USERNAME`

1. En la misma página, cambia a la pestaña **Variables** y pulsa
   **New repository variable**.

   > **[Captura 10 — Pestaña «Variables» con el botón «New repository variable»]**
   > Archivo sugerido: `img/10-github-new-repository-variable.png`

2. Completa:
   - **Name:** `DOCKERHUB_USERNAME`
   - **Value:** tu usuario de Docker Hub, tal como aparece en tu perfil
     (sin `@` ni la URL).

   > **[Captura 11 — Formulario «New variable» con DOCKERHUB_USERNAME]**
   > Archivo sugerido: `img/11-github-variable-form.png`

3. Pulsa **Add variable**.

   > **[Captura 12 — Lista de variables con DOCKERHUB_USERNAME creada]**
   > Archivo sugerido: `img/12-github-variable-creada.png`

Listo. Sigue con [Comprobar que quedó bien](#comprobar-que-quedó-bien).

---

## Opción B: desde la terminal, con GitHub CLI

### B.1 Instalar GitHub CLI (`gh`)

Elige tu sistema operativo. Las instrucciones oficiales y actualizadas están
en https://github.com/cli/cli#installation.

**Windows** (PowerShell o Terminal):

```powershell
winget install --id GitHub.cli
```

Cierra y vuelve a abrir la terminal para que encuentre el comando `gh`.

**macOS** (con [Homebrew](https://brew.sh)):

```bash
brew install gh
```

**Linux (Debian / Ubuntu):** sigue la guía oficial, que agrega el
repositorio de paquetes de GitHub:
https://github.com/cli/cli/blob/trunk/docs/install_linux.md

Comprueba la instalación:

```bash
gh --version
```

Debe imprimir algo como `gh version 2.x.x (...)`.

### B.2 Iniciar sesión

```bash
gh auth login
```

Responde las preguntas así:

1. **Where do you use GitHub?** → `GitHub.com`
2. **What is your preferred protocol for Git operations?** → `HTTPS`
3. **Authenticate Git with your GitHub credentials?** → `Yes`
4. **How would you like to authenticate?** → `Login with a web browser`

`gh` muestra un código de 8 caracteres y abre el navegador. Pega el código
allí y autoriza. Al volver a la terminal verás `Logged in as <tu-usuario>`.

Comprueba la sesión:

```bash
gh auth status
```

### B.3 Crear el secreto y la variable

Ejecuta los comandos desde cualquier carpeta, indicando tu repositorio con
`--repo` (formato `usuario/repositorio`). Si estás dentro de la carpeta del
repositorio clonado, puedes omitir `--repo`.

**Secreto** (te pide el valor sin mostrarlo en pantalla):

```bash
gh secret set DOCKERHUB_TOKEN --repo <tu-usuario>/<tu-repo>
```

Cuando aparezca `? Paste your secret`, pega el token y pulsa Enter.

> No pases el token como argumento (`--body <token>`): quedaría guardado en
> el historial de tu terminal.

**Variable:**

```bash
gh variable set DOCKERHUB_USERNAME --body <tu-usuario-de-docker-hub> --repo <tu-usuario>/<tu-repo>
```

---

## Comprobar que quedó bien

Sirve para cualquiera de las dos opciones.

**En la web:** en *Settings → Secrets and variables → Actions* deben
aparecer `DOCKERHUB_TOKEN` en la pestaña **Secrets** y `DOCKERHUB_USERNAME`
en **Variables**.

**En la terminal:**

```bash
gh secret list --repo <tu-usuario>/<tu-repo>
gh variable list --repo <tu-usuario>/<tu-repo>
```

Salida esperada (las fechas cambian):

```text
NAME             UPDATED
DOCKERHUB_TOKEN  less than a minute ago

NAME                VALUE            UPDATED
DOCKERHUB_USERNAME  mi-usuario       less than a minute ago
```

`gh secret list` nunca muestra el valor del secreto: es lo esperado.

La prueba definitiva es la siguiente ejecución del workflow después de un
push a `main`: el paso de login en Docker Hub debe terminar en verde y las
imágenes deben aparecer en `https://hub.docker.com/repositories/<tu-usuario-de-docker-hub>`.

---

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| No veo la pestaña **Settings** | No eres administrador del repositorio | Pide el rol *Admin* o que el dueño cree el secreto |
| El CI dice que falta `DOCKERHUB_TOKEN` o `DOCKERHUB_USERNAME` | El nombre está mal escrito, o lo creaste en otro repositorio | Revisa mayúsculas y guiones bajos, y el repositorio en `gh secret list` |
| `unauthorized: incorrect username or password` en el login | Token mal pegado, vencido o revocado | Genera un token nuevo y reemplaza el secreto (mismo nombre) |
| `denied: requested access to the resource is denied` al publicar | El token es de solo lectura, o el usuario no coincide con el de la imagen | Crea el token con **Read & Write** y revisa `DOCKERHUB_USERNAME` |
| En un *fork* el CI no publica | GitHub no comparte los secretos con los forks | Crea los secretos en **tu** repositorio (el fork) |
| `gh: command not found` | `gh` no está instalado o la terminal no se reinició | Repite B.1 y abre una terminal nueva |

## Cambiar o borrar un secreto

- **Reemplazar:** en la web, pulsa el lápiz junto al secreto y pega el valor
  nuevo. En la terminal, vuelve a correr `gh secret set DOCKERHUB_TOKEN`.
- **Borrar:** en la web, el ícono de papelera. En la terminal,
  `gh secret delete DOCKERHUB_TOKEN --repo <tu-usuario>/<tu-repo>`.
- **Si el token se filtró:** primero revócalo en Docker Hub (*Account
  settings → Personal access tokens → Delete*), después crea uno nuevo y
  reemplaza el secreto.
