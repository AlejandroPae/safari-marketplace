# 08. Cambiar las contraseñas demo (obligatorio)

[← 07. Desplegar y comprobar](07-desplegar-y-comprobar.md) · [Índice](README.md) · [09. Publicar una versión nueva o volver atrás →](09-actualizar-y-volver-atras.md)

---

Los datos iniciales traen cinco usuarios con la **misma contraseña pública**,
`demodemo`, que figura en este repositorio. Con el admin en internet,
cualquiera podría entrar. **Cámbialas apenas termine el primer despliegue.**

| Usuario | Rol |
|---|---|
| `admin@demo.com` | super_admin |
| `store_owner@demo.com` | store_owner |
| `customer@demo.com` | customer |
| `customer2@demo.com` | customer |
| `customer3@demo.com` | customer |

Desde tu equipo, cambia `<tu-dominio>` y elige una contraseña nueva y larga
para cada uno:

```bash
TIENDA=https://tienda.<tu-dominio>
for USUARIO in admin@demo.com store_owner@demo.com customer@demo.com customer2@demo.com customer3@demo.com; do
  read -rsp "Contraseña nueva para $USUARIO: " NUEVA; echo
  TOKEN=$(curl -s -X POST "$TIENDA/backend/token" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$USUARIO\",\"password\":\"demodemo\"}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -s -o /dev/null -w "$USUARIO: %{http_code}\n" -X POST "$TIENDA/backend/change-password" \
    -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
    -d "{\"oldPassword\":\"demodemo\",\"newPassword\":\"$NUEVA\"}"
done
```

Cada línea debe terminar en `200` o `201`. Comprueba que `demodemo` ya no
sirve:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$TIENDA/backend/token" \
  -H 'Content-Type: application/json' -d '{"email":"admin@demo.com","password":"demodemo"}'
```

Las contraseñas nuevas se guardan en la base y los despliegues siguientes no
las tocan, porque el seed no se vuelve a aplicar.

---

[← 07. Desplegar y comprobar](07-desplegar-y-comprobar.md) · [Índice](README.md) · [09. Publicar una versión nueva o volver atrás →](09-actualizar-y-volver-atras.md)
