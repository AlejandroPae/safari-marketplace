# 01. Antes de empezar

[Índice](README.md) · [02. El VPS y el DNS →](02-vps-y-dns.md)

---

## Requisitos

Necesitas:

- **Un fork del repositorio** en tu cuenta de GitHub.
- **Una cuenta de Docker Hub** y, en tu fork, el secreto `DOCKERHUB_TOKEN` y
  la variable `DOCKERHUB_USERNAME`. Cómo crearlos:
  [`docs/github/02-secretos-github-actions.md`](../github/02-secretos-github-actions.md).
- **Una corrida verde del CI en `main` de tu fork.** El job «Imágenes Docker ·
  build y publicación» debe haber publicado las cinco imágenes en tu Docker
  Hub:

  | Imagen | Qué es |
  |---|---|
  | `<usuario>/safari-api` | la API |
  | `<usuario>/safari-shop` | la tienda |
  | `<usuario>/safari-admin` | el admin |
  | `<usuario>/safari-db-init` | el esquema y los datos iniciales de la base |
  | `<usuario>/safari-proxy` | Caddy: el reverse proxy y el balanceador de la API |

- **Un dominio** en el que puedas crear registros DNS (por ejemplo, en
  Cloudflare, en el proveedor donde lo compraste o en el de tu universidad).

> Las imágenes son solo `linux/amd64`. **Un VPS ARM no sirve.**

## Elegir la versión a desplegar

Cada imagen lleva como etiqueta el commit del que salió: `sha-` y los 7
primeros caracteres del commit, por ejemplo `sha-4fcb7f1`.

1. En tu fork, entra a **Actions** y abre la última corrida verde de `main`.
2. Al final de la página está el resumen **«Imágenes (sha-xxxxxxx)»**, con las
   cinco imágenes publicadas.
3. Anota esa etiqueta completa, con el `sha-` incluido. Es tu `IMAGE_TAG`.

Las cinco imágenes de un mismo commit llevan la misma etiqueta. Se despliegan
siempre juntas.

---

[Índice](README.md) · [02. El VPS y el DNS →](02-vps-y-dns.md)
