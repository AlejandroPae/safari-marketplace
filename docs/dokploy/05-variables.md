# 05. Cargar las variables

[← 04. Crear el Compose](04-crear-el-compose.md) · [Índice](README.md) · [06. Configurar los dominios →](06-dominios.md)

---

En la pestaña **Environment** del Compose, pega el contenido de
[`deploy.variables.example`](../../deploy.variables.example) (en la raíz del
repositorio) y **cambia todos los valores**:

| Variable | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | tu usuario de Docker Hub |
| `IMAGE_TAG` | la etiqueta que anotaste en [01 · Elegir la versión](01-antes-de-empezar.md#elegir-la-versión-a-desplegar), por ejemplo `sha-4fcb7f1` |
| `SHOP_URL` | `https://tienda.<tu-dominio>`, con `https` y **sin `/` final** |
| `JWT_SECRET` | una cadena aleatoria larga |
| `SHOP_SECRET` | otra cadena aleatoria larga, distinta de la anterior |
| `POSTGRES_PASSWORD` | una contraseña **solo con letras y números** |

Para generar las cadenas aleatorias, en el VPS o en tu equipo:

```bash
openssl rand -hex 32
```

Guarda y no compartas estos valores. En particular:

- **`POSTGRES_PASSWORD` solo se aplica al crear la base.** Si la cambias
  después, la API ya no podrá conectarse. Sin símbolos, porque `@ : / # ?`
  rompen la URL de conexión.
- **Cambiar `JWT_SECRET`** cierra la sesión de todos los usuarios.
- **Si falta una variable**, el despliegue falla al empezar y el log dice
  cuál (`Falta JWT_SECRET …`).

---

[← 04. Crear el Compose](04-crear-el-compose.md) · [Índice](README.md) · [06. Configurar los dominios →](06-dominios.md)
