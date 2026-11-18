# US-101 — El staff de tienda entra al admin

> Un staff dado de alta con `POST /staffs` (US-42) no podía entrar al admin:
> solo tenía el permiso `customer`. Esta US le da el permiso `staff` mientras
> sea staff de alguna tienda, le abre en el admin las tiendas que gestiona, y
> antes cierra los catálogos globales que ese permiso habría heredado.

**Fecha:** 2026-11-18
**Status:** Implementado (2026-11-18)
**Depende de:** [US-100](./100-ordenes-acotadas-por-tienda.md) (órdenes
acotadas por tienda; sin ella, el permiso `staff` abría las órdenes de todas
las tiendas). [US-42](./40-identidad-extendida-postgres/42-staffs-postgres.md).
**LOC est.:** ~250

## Historia

**Como** staff de una tienda, **quiero** entrar al admin y trabajar en las
tiendas donde soy staff, **para** gestionar sus productos, órdenes y cupones
sin ser el dueño.

## Contexto — verificado en código (2026-11-18, `main` @ `74be4ab`)

- **El admin exige permiso.** Pide `super_admin`, `store_owner` o `staff`
  (`apps/admin/rest/src/utils/auth-utils.ts:13`). `createShopStaff`
  (`packages/db/src/repositories/staff.repository.ts`) solo daba `customer`.
  El usuario 2 del seed es staff de las tiendas 1 y 2 sin el permiso.
- **Primera auditoría** (sub-agente, 2026-11-18). El permiso `staff` abre las
  rutas `ADMIN_OWNER_AND_STAFF`:
  - **H-1..H-4:** las órdenes, cerradas en US-100;
  - **H-5..H-7:** las escrituras de `flash-sale`, `authors` y
    `manufacturers`, catálogos globales sin chequeo de tienda.
- **Las páginas `[shop]/*` del admin** dejan entrar si la tienda está en
  `me.shops` o es `me.managed_shop` (`pages/[shop]/orders/index.tsx:92-98`).
  La API no emite `managed_shop`, y `shops` solo traía las tiendas propias.
- **Dashboard de inicio (R-6 de US-61).** `/` llama a `/analytics`,
  `/category-wise-product` y `/top-rate-product`, que son `ADMIN_ONLY`. El
  403 cierra la sesión (`data/client/http-client.ts:38-43`). Ya le pasa al
  dueño.

## Decisiones (2026-11-18)

Del dueño:

1. **Permiso.** El alta concede `customer` + `staff`. Retirar la última tienda
   quita `staff` en la misma transacción. El alta idempotente también
   garantiza `staff`.
2. **Seed.** El usuario 2 gana `staff`. `just db-reset` autorizado. Aplicando
   la regla 1, también el 3 (admin), que tiene fila en `shop_staff`.
3. **Gate.** Auditar antes de conceder el permiso.

Del sub-agente, por delegación del dueño:

- **A — catálogos globales:**
  - `POST/PUT/DELETE /flash-sale` → `ADMIN_ONLY`;
  - `POST /authors` y `POST /manufacturers` → `ADMIN_AND_OWNER`;
  - `PUT/DELETE` de autores y marcas → `ADMIN_ONLY`.

  Razones:
  - el admin solo escribe ventas flash como super admin;
  - el dueño crea autores y marcas desde su panel (`[shop]/authors/create`,
    `[shop]/manufacturers/create`), pero no hay pantalla para editarlos ni
    borrarlos;
  - el precedente del repo para catálogo global (`types`, `categories`,
    `tags`, `attributes`) es `ADMIN_ONLY`.
- **B — `/me`:**
  - `shops` lleva las tiendas propias y después las de staff (`shop_id` asc),
    sin duplicados;
  - `managed_shop` sigue sin emitirse;
  - solo en `AuthService.me()`: en `/staffs` y `/users`, `shops` sigue
    significando «es dueño»;
  - funciona sin tocar el frontend.

Asumido por el agente (el dueño no lo contestó): **R-6 no se arregla aquí.**
El smoke del admin entra por `/my-shop` y `/{tienda}`.

## Scope

**Incluye:**
- los permisos en `createShopStaff` y `removeShopStaff`, y
  `listStaffShops`;
- el seed;
- los guards de A;
- `/me` de B;
- los tests.

**NO incluye:**
- R-6, el dashboard de inicio;
- el enlace «Attributes» del menú de staff, que también cierra la sesión;
- que los autores y marcas que crea un dueño nazcan pendientes de
  aprobación;
- el frontend.

## Criterios de aceptación

### CA-1 — El staff entra con rol `staff`
- `customer@demo.com` hace login con `permissions` `customer` + `staff` y
  `role: staff`, y `/me` le da `shops: [1, 2]`.
- Un staff nuevo dado de alta tiene `staff`. Al quitarle su última tienda,
  su siguiente login ya no lo tiene.

### CA-2 — Catálogos globales cerrados
- Ni el staff ni el dueño pueden crear, editar o borrar ventas flash.
- El staff no crea autores ni marcas; el dueño sí los crea, pero no los edita
  ni los borra.
- Los `GET` siguen públicos.

### CA-3 — En el admin
Entrando por `/my-shop`, el staff ve sus dos tiendas y la lista de órdenes de
la tienda 1.

### CA-4 — Seed y regresión
- `db-reset`: entre las 48 tablas solo cambia `permission_user`, con +2
  filas.
- `db-check`, `vitest`, `tsc`, `eslint`, `build-api` y `verify` en verde.

## Definición de Done

- [x] `curl` del CA-1 y del CA-2 pegados.
- [x] Smoke del admin del CA-3.
- [x] Conteos del `db-reset` y verificaciones con recuentos.
- [x] Status y línea del mapa.

## Resultado (2026-11-18, rama `feat/us-101-staff-admin` sobre `main` @ `74be4ab`)

### Qué se hizo

- **`@safari/db`** (`staff.repository.ts`):
  - `createShopStaff` concede `customer` + `staff`. En el caso idempotente,
    `_grantStaffPermission` hace un upsert del permiso.
  - `removeShopStaff` va ahora en una transacción: si el usuario se queda sin
    filas en `shop_staff`, borra su `staff` de `permission_user`.
  - `listStaffShops(userId)` es nueva y está exportada en el barrel.
- **Seed:** `db/generate-seed.mjs` concede `staff` a los usuarios con fila en
  `shop_staff`. `seed.sql` cambia solo en esas filas: `(2, 4)` y `(3, 4)`.
- **API:**
  - guards de la Decisión A en `flash-sale.controller.ts`,
    `authors.controller.ts` y `manufacturers.controller.ts`;
  - `AuthService.me()` mezcla `listStaffShops` en `shops` (Decisión B).
- **Tests:**
  - `staff.integration.test.ts` (+4): permiso al alta, idempotente,
    retirada parcial o total, `listStaffShops`;
  - `catalog-write-guards.spec.ts` (9): guard por verbo, sin `staff` en
    ninguno;
  - `me-staff-shops.spec.ts` (3): orden, sin duplicados, sin `managed_shop`.
- **Dos tests de `packages/db` fijaban el seed viejo y se actualizaron.**
  `users.integration` comprobaba que `staff` no tenía titulares: ahora usa un
  nombre fuera del catálogo para el caso vacío, y un test nuevo fija los
  titulares [2, 3]. `store-notices.integration` fijaba los permisos del admin:
  ahora incluyen `staff`.
- **`openspec/specs/flat-catalogs-api/spec.md`:** el requisito de permisos de
  manufacturers. Las tablas de US-93, US-94 y US-27b no se tocaron: son el
  registro de su momento.

### `db-reset` — conteos de las 48 tablas antes y después

```
25c25
< NOTICE:  permission_user|20
---
> NOTICE:  permission_user|22
```

`permission_id = 4` (`staff`) queda en `2|4` y `3|4`.

### CA-1 y CA-2 — `curl` contra la API viva

```
== staff del seed: customer@demo.com (staff de las tiendas 1 y 2)
login                                                    {"permissions":["customer","staff"],"role":"staff"}
GET /me                                                  200 {"id":2,"shops":[1,2],"managed_shop":"(ausente)"}
GET /orders?shop_id=1 (tienda donde es staff)            200 {"total":2,"ids":[36,34]}
GET /orders?shop_id=7 (tienda ajena)                     200 {"total":0,"ids":[]}
== alta, login, baja, login
dueño: POST /staffs (zz-staff101 en la tienda 1)        201 {"id":64,"shops":[],"managed_shop":"(ausente)"}
login del staff nuevo                                    {"permissions":["staff","customer"],"role":"staff"}
GET /me del staff nuevo                                  200 {"id":64,"shops":[1],"managed_shop":"(ausente)"}
dueño: DELETE /staffs/:id                               200 {"id":64,"shops":[],"managed_shop":"(ausente)"}
login tras la baja                                       {"permissions":["customer"],"role":"customer"}
GET /me tras la baja                                     200 {"id":64,"shops":[],"managed_shop":"(ausente)"}
== guards de catálogo global (Decisión A)
staff: POST /authors                                     403 "No tienes permisos suficientes para esta operación."
staff: POST /manufacturers                               403 "No tienes permisos suficientes para esta operación."
staff: POST /flash-sale                                  403 "No tienes permisos suficientes para esta operación."
dueño: POST /flash-sale                                 403 "No tienes permisos suficientes para esta operación."
dueño: PUT /flash-sale/1                                403 "No tienes permisos suficientes para esta operación."
dueño: DELETE /flash-sale/1                             403 "No tienes permisos suficientes para esta operación."
dueño: PUT /authors/1                                   403 "No tienes permisos suficientes para esta operación."
dueño: DELETE /authors/1                                403 "No tienes permisos suficientes para esta operación."
dueño: PUT /manufacturers/1                             403 "No tienes permisos suficientes para esta operación."
dueño: DELETE /manufacturers/1                          403 "No tienes permisos suficientes para esta operación."
dueño: POST /authors (sigue pudiendo crear)             201 {"id":13,"name":"ZZ Autor 101"}
GET /authors (público)                                  200 {"total":12,"ids":[13]}
== limpieza
DELETE 1 DELETE 0 DELETE 1 
authors|11
manufacturers|14
flash_sales|2
users|11
permission_user|22
```

- El alta de un staff nuevo le da `staff`.
- Tras quitarle su única tienda, su siguiente login vuelve a `customer`.
- Por US-100, el staff del seed lista las órdenes de la tienda 1 y no las de
  la 7.
- La limpieza deja la base en sus conteos.

### CA-3 — En el admin

- **Login real con el formulario como `customer@demo.com`.** El token da 201
  y `/me` 200. Pero el dashboard de inicio pide `/analytics`,
  `/category-wise-product` y `/top-rate-product`, que responden 403. El admin
  cierra la sesión y vuelve a `/login`. Es la R-6, fuera de alcance; al dueño
  ya le pasa.
- **Con la cookie del staff, entrando por URL:**
  - `/en/my-shop` muestra las dos tiendas, con enlaces a `/furniture-shop` y
    `/clothing-shop`;
  - el menú de staff tiene Inventory, Attributes, Refunds, Orders, Coupons y
    FAQs;
  - `/en/furniture-shop/orders` lista 2 órdenes («20231025441702 C Customer
    customer@demo.com 1 3 years ago $0.00 $720.00 Processing» y
    «20231025779361 … $650.00 Completed»);
  - `/en/clothing-shop/orders` entra y sale vacía: la tienda 2 no tiene
    órdenes en el seed;
  - `/en/books-shop/orders` (ajena) lo manda al dashboard, que por la R-6 le
    cierra la sesión. La API no le enseña nada de la tienda 7.

### CA-4 — Sin regresión

```
npx vitest run (apps/api/rest, desde C:\)   Test Files 44 passed (44) · Tests 710 passed (710)   (antes 42/698: +12)
npx tsc --noEmit -p tsconfig.json            TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"    ESLINT=0
just db-check                                Test Files 38 passed (38) · Tests 499 passed (499)   (antes 38/494: +5)
just build-api                               Done in 53.01s. BUILD_API=0
just verify
OK   API    :9001/api/settings  200  5503B  427ms
OK   Shop   :3003/en  200  191897B  686ms  cards:30
OK   Admin  :3002/en/login  200  72554B  2326ms  cards:1
```

El primer `db-check` dio 2 rojos. Eran los dos tests de arriba que fijaban
el seed viejo, no regresiones: se diagnosticaron antes de tocarlos.

### Fuera de alcance, mencionado

- **R-6.** Tras el login, el admin lleva a `/`, que cierra la sesión del
  staff y del dueño. Hasta arreglarlo, el staff tiene que entrar por
  `/my-shop` o `/{tienda}`. Es la siguiente US natural.
- **El menú de staff enlaza «Attributes»**, cuya API es `ADMIN_ONLY` incluso
  en `GET`. Le cierra la sesión.
- **Los autores y marcas que crea un dueño nacen aprobados**
  (`is_approved DEFAULT true`).
- **El buscador del admin queda vacío para el staff.** Es cosmético.
- **Las secuencias de `authors` y `users`** avanzan con las altas de prueba
  (ids 13 y 64), aunque las filas se borraron.
