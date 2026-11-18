# US-100 — Órdenes acotadas por tienda

> Hoy cualquier dueño de tienda lista, lee, cambia de estado y borra las
> órdenes de **cualquier** tienda, y su «Mis pedidos» muestra los de toda la
> plataforma. Esta US acota las órdenes a las tiendas que gestiona quien
> llama, como ya hacen productos, cupones y solicitudes de venta flash.

**Fecha:** 2026-11-18
**Status:** Implementado (2026-11-18)
**Depende de:** ninguna. Es previa a la US del staff en el admin (US-101):
no se puede dar el permiso global `staff` mientras esto siga abierto.
**LOC est.:** ~250

## Historia

**Como** dueño de una tienda, **quiero** que nadie fuera de mi tienda pueda
ver ni tocar sus órdenes, **para** que los datos de mis clientes (nombre,
dirección, líneas, importes) y el estado de mis ventas estén protegidos.

## Contexto — verificado en código y en vivo (2026-11-18, `main` @ `85be31c`)

Lo encontró la auditoría previa a dar el permiso `staff` (H-1 a H-4). Se
reprodujo con `curl`: el dueño 42 (`shop@gmail.com`, `store_owner` sin
tiendas) contra la tienda 7, del dueño 1. Ver «Antes» en el Resultado.

- **`GET /orders`** (`orders.controller.ts:78-92`). Con cualquier permiso de
  `ADMIN_OWNER_AND_STAFF`, la query se respeta tal cual:
  - con `?shop_id=7`, el dueño 42 ve las 6 órdenes de la tienda 7;
  - sin `shop_id`, cualquier dueño ve las 20 órdenes padre de la
    plataforma. Eso incluye «Mis pedidos» del shop cuando el que entra es un
    dueño.
- **`GET /orders/:id`** y **`/orders/tracking-number/:id`**
  (`orders.service.ts:608-623`). `canSeeAllOrders` deja leer cualquier
  orden, con su cliente, dirección y líneas.
- **`PUT /orders/:id`** y **`DELETE /orders/:id`** (`orders.controller.ts:110-120`).
  El guard es `ADMIN_OWNER_AND_STAFF`, y el servicio ni recibe al usuario:
  cambia de estado o borra cualquier orden. En una orden padre, el estado se
  propaga a las hijas de todas sus tiendas.
- **Modelo.** Una orden padre (`shop_id` nulo) agrupa una hija por tienda.
  El admin global lista padres; el panel de un dueño siempre pide
  `?shop_id=` y abre el detalle por el id de la hija.
- **Precedentes que ya acotan bien:**
  - `products.service.ts:122-139`, `coupons.service.ts:121-141`:
    `findShopOwnerById` + `isShopStaff`;
  - `flash-sale-requests.service.ts`: `viewerId`.

## Decisiones del dueño (2026-11-18)

1. **Listado.**
   - Con `?shop_id`, un dueño o staff ve esa tienda solo si la gestiona (es
     su dueño o tiene fila en `shop_staff`). Si no, lista vacía, como
     `/staffs` en US-42; nunca 403, que en el admin cierra la sesión.
   - Sin `shop_id`, ve sus propios pedidos como cliente, igual que un
     cliente.
   - El super admin no cambia.
2. **Detalle.** Un dueño o staff abre sus propios pedidos como cliente
   (padre o hija) y las órdenes hijas de tiendas que gestiona. Nunca la padre
   de otro cliente, porque lleva embebidas las hijas de otras tiendas. Lo
   demás da 404, como hoy para un cliente: no revela que existe.
3. **Escritura** (`PUT` y `DELETE`). Un dueño o staff solo toca órdenes hijas
   de tiendas que gestiona. Una padre solo la toca el super admin. Si no la
   ve: 404; si la ve pero no la gestiona (su propio pedido como cliente):
   403.

## Scope

**Incluye:** las 5 rutas de arriba, con el usuario llegando al servicio, y
los specs que fijan cada regla.

**NO incluye:**
- dar el permiso `staff` (US-101);
- `flash-sale`, `authors` y `manufacturers` (H-5 a H-7 de la auditoría:
  catálogo global editable por `ADMIN_OWNER_AND_STAFF`, decisión aparte);
- `export-order-url` y `download-invoice-url`, que son stubs sin datos;
- cambiar los guards o el frontend;
- `managed_shop` en `/me`.

## Criterios de aceptación

### CA-1 — Listado acotado
- El dueño 42 con `?shop_id=7` recibe la lista vacía, con el envoltorio de
  siempre. El dueño 1 con `?shop_id=7` recibe las 6.
- Sin `shop_id`, el dueño 1 recibe solo sus pedidos como cliente (0 en el
  seed).
- El super admin sigue viendo las 20 padres. El cliente 2 sigue viendo sus
  19.

### CA-2 — Detalle acotado
- El dueño 42 recibe 404 en la hija 6 y en la padre 5.
- El dueño 1 recibe 200 en la hija 6 (su tienda) y 404 en la padre 5 (de
  otro cliente).
- El cliente 2 y el super admin, 200 en la 5.

### CA-3 — Escritura acotada
- El dueño 42 recibe 404 en `PUT` y `DELETE` de la hija 6.
- El dueño 1 recibe 404 en `PUT` y `DELETE` de la padre 5, porque no la ve,
  y 200 en `PUT` de la hija 6.
- El super admin, 200.
- Ninguna orden del seed se borra.

### CA-4 — El staff por pivote funciona igual que el dueño
Lo cubren los specs, porque hoy nadie tiene el permiso `staff`: un usuario
con `staff` y fila en `shop_staff` de la tienda gestiona esa tienda y
ninguna otra.

### CA-5 — Sin regresión
`npx vitest run`, `tsc`, `eslint`, `just db-check`, `just build-api` y
`just verify` en verde, con recuentos.

## Escenarios Gherkin

```gherkin
Feature: Órdenes acotadas por tienda
  Scenario: CA-1 — un dueño no lista otra tienda
    Given el dueño 42 sin tiendas
    When GET /orders?shop_id=7
    Then la lista sale vacía

  Scenario: CA-3 — un dueño no borra una orden ajena
    Given la hija 6 de la tienda 7
    When el dueño 42 hace DELETE /orders/6
    Then responde 404 y la orden sigue en la base
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/rest/src/orders/orders.controller.ts` | el usuario llega a `getOrders`, `update` y `remove` |
| `apps/api/rest/src/orders/orders.service.ts` | reglas de las decisiones 1 a 3 |
| `apps/api/rest/src/orders/orders.service.spec.ts` | specs de cada regla |

## Definición de Done

- [x] `curl` antes y después contra la API viva, con la salida pegada.
- [x] `npx vitest run`, `tsc`, `eslint`, `just db-check`, `just build-api` y
      `just verify` en verde, con recuentos.
- [x] El seed intacto al terminar: 40 órdenes, con el `updated_at` de las que
      toca el script restaurado.
- [x] Status de esta US actualizado y su línea marcada en el mapa.

## Resultado (2026-11-18, rama `fix/us-100-ordenes-por-tienda` sobre `main` @ `85be31c`)

### Qué se hizo

- **`orders.service.ts`.**
  - `canSeeAllOrders` (cualquier permiso de `ADMIN_OWNER_AND_STAFF` veía todo)
    se sustituye por las reglas de las decisiones 1 a 3:
    - `isSuperAdmin` y `hasShopRole`;
    - `managesShop`: dueño por `findShopOwnerById` o staff por
      `isShopStaff`, el precedente de productos y cupones;
    - `canSee` y `canManage`.
  - `getOrders(query, user)` decide la query y delega en `listOrdersPage`, que
    es el cuerpo de antes. Una tienda ajena da el mismo envoltorio con
    `data: []`.
  - `update` y `remove` reciben al usuario y pasan por `assertCanWrite`. El
    super admin no consulta nada y conserva el camino de antes.
- **`orders.controller.ts`.** El usuario llega a `getOrders`, `update` y
  `remove`. La regla `isAdminLevel` sale del controlador. Los guards no
  cambian.
- **`orders.service.spec.ts`.**
  - Los specs que ya existían pasan `ADMIN_USER`: fijaban el comportamiento
    del que ve todo.
  - Nuevo `describe` «acceso por tienda (US-100)», con 14 tests: las tres
    decisiones para dueño, dueño ajeno, staff por pivote (CA-4), cliente y
    super admin.

### CA-1 a CA-3 — `curl` antes y después (mismo script)

Antes (`main` @ `85be31c`; los `DELETE` se omitieron porque habrían borrado
órdenes del seed):

```
estado actual de la hija 6: order-completed
== listado
admin: GET /orders (padres)                                200 {"total":20,"ids":[48,41,39,37,35,33],"clientes":[2,3]}
dueño 1: GET /orders?shop_id=7 (su tienda)                200 {"total":6,"ids":[24,14,12,10,8,6],"clientes":[2]}
dueño 1: GET /orders sin shop_id («Mis pedidos»)        200 {"total":20,"ids":[48,41,39,37,35,33],"clientes":[2,3]}
dueño 42: GET /orders?shop_id=7 (tienda ajena)            200 {"total":6,"ids":[24,14,12,10,8,6],"clientes":[2]}
dueño 42: GET /orders sin shop_id                         200 {"total":20,"ids":[48,41,39,37,35,33],"clientes":[2,3]}
cliente 2: GET /orders                                     200 {"total":19,"ids":[48,39,37,35,33,31],"clientes":[2]}
cliente 2: GET /orders?shop_id=7                           200 {"total":6,"ids":[24,14,12,10,8,6],"clientes":[2]}
== detalle
dueño 1: GET /orders/6 (hija de su tienda)                200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
dueño 1: GET /orders/5 (padre de otro cliente)            200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
dueño 42: GET /orders/6 (hija ajena)                      200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
dueño 42: GET /orders/5 (padre ajena)                     200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
cliente 2: GET /orders/5 (su pedido)                       200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
admin: GET /orders/5                                       200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
== escritura (PUT con el mismo estado; DELETE solo donde debe fallar)
dueño 42: PUT /orders/6 (hija ajena)                      200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
dueño 42: DELETE /orders/6 (hija ajena)                    (omitido: hoy borraría la orden del seed)
dueño 1: PUT /orders/5 (padre)                            200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
dueño 1: DELETE /orders/5 (padre)                          (omitido: hoy borraría la orden del seed)
dueño 1: PUT /orders/6 (hija de su tienda)                200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
admin: PUT /orders/6                                       200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
== psql
orders|40
hija 6|order-completed
ERROR:  syntax error at or near ":"
LINE 1: ...ET updated_at = '22:11:26.000000+00' WHERE id = 22:11:26.000...
                                                             ^
ERROR:  syntax error at or near ":"
LINE 1: ...ET updated_at = '22:11:26.000000+00' WHERE id = 22:11:26.000...
                                                             ^
updated_at restaurado: 5=2023-04-09 22:11:26.000000 6=2023-04-09 22:11:26.000000
```

Después:

```
estado actual de la hija 6: order-completed
== listado
admin: GET /orders (padres)                                200 {"total":20,"ids":[48,41,39,37,35,33],"clientes":[2,3]}
dueño 1: GET /orders?shop_id=7 (su tienda)                200 {"total":6,"ids":[24,14,12,10,8,6],"clientes":[2]}
dueño 1: GET /orders sin shop_id («Mis pedidos»)        200 {"total":0,"ids":[],"clientes":[]}
dueño 42: GET /orders?shop_id=7 (tienda ajena)            200 {"total":0,"ids":[],"clientes":[]}
dueño 42: GET /orders sin shop_id                         200 {"total":0,"ids":[],"clientes":[]}
cliente 2: GET /orders                                     200 {"total":19,"ids":[48,39,37,35,33,31],"clientes":[2]}
cliente 2: GET /orders?shop_id=7                           200 {"total":6,"ids":[24,14,12,10,8,6],"clientes":[2]}
== detalle
dueño 1: GET /orders/6 (hija de su tienda)                200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
dueño 1: GET /orders/5 (padre de otro cliente)            404 "No existe la orden 5."
dueño 42: GET /orders/6 (hija ajena)                      404 "No existe la orden 6."
dueño 42: GET /orders/5 (padre ajena)                     404 "No existe la orden 5."
cliente 2: GET /orders/5 (su pedido)                       200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
admin: GET /orders/5                                       200 {"id":5,"shop_id":null,"customer_id":2,"order_status":"order-completed"}
== escritura (PUT con el mismo estado; DELETE solo donde debe fallar)
dueño 42: PUT /orders/6 (hija ajena)                      404 "No existe la orden 6."
dueño 42: DELETE /orders/6 (hija ajena)                   404 "No existe la orden 6."
dueño 1: PUT /orders/5 (padre)                            404 "No existe la orden 5."
dueño 1: DELETE /orders/5 (padre)                         404 "No existe la orden 5."
dueño 1: PUT /orders/6 (hija de su tienda)                200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
admin: PUT /orders/6                                       200 {"id":6,"shop_id":7,"customer_id":2,"order_status":"order-completed"}
== psql
orders|40
hija 6|order-completed
updated_at restaurado: 5=2023-04-09_22:11:26.000000 6=2023-04-09_22:11:26.000000
```

El script restaura el `updated_at` de las órdenes 5 y 6, que los `PUT` mueven
a `now()`. En la corrida «antes» el restaurado falló por un espacio en la
fecha y se hizo a mano:

```
UPDATE orders SET updated_at = '2023-04-09 22:11:26+00' WHERE id IN (5, 6);
```

La corrida «después» ya lo hace sola. Al terminar: 40 órdenes y
`5|2023-04-09 22:11:26+00`, `6|2023-04-09 22:11:26+00`.

**Admin (`just admin-dev`, como `store_owner@demo.com`).**
- `/en/books-shop/orders` (tienda 7) lista las 6 órdenes, por ejemplo
  «20231013992713 C Customer customer@demo.com 1 3 years ago $0.00 $180.00
  Completed».
- `/en/books-shop/orders/6` abre el detalle con el tracking `20230410566504`.

El panel del dueño sigue funcionando: siempre pide `?shop_id=` de su tienda y
abre las hijas.

### CA-5 — Sin regresión

```
npx vitest run (apps/api/rest, desde C:\)   Test Files 42 passed (42) · Tests 698 passed (698)   (antes 42/684: +14)
npx tsc --noEmit -p tsconfig.json            TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"    ESLINT=0
just db-check                                Test Files 38 passed (38) · Tests 494 passed (494)
just build-api                               Done in 128.44s. BUILD_API=0
just verify
OK   API    :9001/api/settings  200  5503B  492ms
OK   Shop   :3003/en  200  191897B  630ms  cards:30
OK   Admin  :3002/en/login  200  72554B  7571ms  cards:1
```

### Fuera de alcance, mencionado

- **H-5 a H-7 de la auditoría.** `flash-sale`, `authors` y `manufacturers`
  siguen siendo editables por cualquier `ADMIN_OWNER_AND_STAFF`, y son
  catálogo global. Antes de dar el permiso `staff` (US-101) hay que decidir
  si bajan a `ADMIN_ONLY` o `ADMIN_AND_OWNER`.
- **US-101 necesita además `managed_shop` en `/me`.** Sin él, las páginas
  `[shop]/*` del admin echan al staff.
- **El panel global `/orders` del admin es `adminOnly`.** No hacía falta
  tocarlo.

## Notas para el agente ejecutor

- En la corrida «antes», **no** lanzar los `DELETE`: hoy borrarían órdenes
  del seed. Ese es justo el hueco.
- Apagar los servidores desde su raíz (memoria del proyecto y Resultado de
  US-17).
