# US-42 — `staffs` desde Postgres

> Las 8 rutas de staff dejan de devolver lista vacía y `null`, y pasan a leer
> y escribir el pivote staff↔tienda. No es un módulo mock: son huecos
> declarados dentro de `shops` y `users`, que ya leen Postgres.

**Épico:** [Épico 40](./README.md)
**Fecha:** 2026-09-15
**Status:** Implementado (2026-11-18)
**Depende de:** [US-41](./41-esquema-identidad-extendida.md)
**LOC est.:** ~1200

## Historia
**Como** dueño de tienda y como admin, **quiero** gestionar el staff de una
tienda de verdad, **para** que el panel deje de mostrar una lista siempre
vacía y los permisos por tienda signifiquen algo.

## Contexto — verificado en código

- **No hay módulo `staffs`.** Las rutas viven repartidas en dos módulos ya
  migrados:
  - `StaffsController` (`apps/api/rest/src/shops/shops.controller.ts:99`) —
    6 rutas, delega en `ShopsService`.
  - `MyStaffsController` (`apps/api/rest/src/users/users.controller.ts:121`)
    y `AllStaffsController` (`:131`) — 1 ruta cada uno, delegan en
    `UsersService`. `all-staffs` está tras `@Permissions(...ADMIN_ONLY)`.
- Hoy: `ShopsService.getStaffs` devuelve `{ data: [], ...paginate(0, page,
  limit, 0, url) }` (`shops.service.ts:220-226`); `createStaff()` y
  `updateStaff()` devuelven `null` (`:359-366`, criterio `DD30-8`).
- Consecuencia de dimensionado: esta US **no** migra un módulo entero, rellena
  huecos en dos servicios vivos. Más barato, pero con más riesgo de regresión
  sobre identidad y catálogo (R-3 del épico).

## Scope

**Incluye:** las 8 rutas de staff leyendo y escribiendo el pivote de US-41; el
repositorio de funciones planas en `packages/db` con sus tests de integración;
la traducción camelCase→snake_case en los servicios de Nest; los tests de Nest
con `@safari/db` mockeado, siguiendo el patrón de las 9 suites existentes.

**NO incluye:** cambiar el contrato HTTP de ninguna de las 8 rutas;
`ownership-transfer`, `become-seller` ni `withdraws`; tocar
`permission_user` ni el sistema de permisos globales; frontend.

## Criterios de aceptación

### CA-1 — Lectura real, contrato intacto
`GET /staffs`, `GET /my-staffs` y `GET /all-staffs` devuelven staff de
Postgres con la misma forma de respuesta y la misma paginación que hoy. La
lista vacía deja de ser un literal: si no hay staff, sale vacía **porque la
consulta no encontró filas**.

### CA-2 — Escritura real
`POST /staffs` asigna un usuario como staff de una tienda y
`DELETE /staffs/:id` lo retira. Dejan de devolver `null`. La asignación
repetida MUST ser idempotente (PK compuesta), no un 500.

### CA-3 — Autorización preservada
**`my-staffs` y `all-staffs` están AMBAS tras `@Permissions(...ADMIN_ONLY)`
a nivel de clase** (`apps/api/rest/src/users/users.controller.ts:120` y
`:130`). Corregido el 2026-09-15: esta CA afirmaba antes que `my-staffs`
estaba «acotada al usuario autenticado», leído de un volcado que cortaba el
decorador. Ningún cambio de guard: los de US-23 se respetan tal cual. Si el
comportamiento correcto fuera acotar `my-staffs` al dueño de la tienda, eso
es un cambio de contrato y **no** entra en esta US: se menciona en el reporte.

### CA-4 — Errores de dominio, nunca crudos de Prisma
Usuario o tienda inexistente responde 404/400 según el precedente de US-25 y
US-30, no un error de Prisma filtrado. Ids fuera del rango `bigint` caen en
las guardas de US-31.

### CA-5 — Reloj explícito
Toda ruta de escritura fija `updatedAt: now()` desde `clock.ts`
(política de US-32). El test del invariante NO detecta una ruta olvidada: la
garantía es el inventario de rutas del repositorio, no la suite.

### CA-6 — Sin regresión
`just db-check`, `npx jest`, `just build-api` y `just verify` verdes con
recuentos. Los conteos del seed intactos.

## Escenarios Gherkin

```gherkin
Feature: Staff de tienda desde Postgres
  Scenario: CA-1 — la lista sale de la base
    Given una tienda con dos staff asignados
    When GET /staffs
    Then devuelve los dos con la paginacion de siempre

  Scenario: CA-2 — asignar staff dos veces es idempotente
    Given un usuario ya asignado como staff de una tienda
    When POST /staffs repite la misma pareja
    Then no se duplica la fila ni responde 500

  Scenario: CA-3 — all-staffs sigue siendo solo de admin
    Given un usuario sin rol de admin
    When GET /all-staffs
    Then responde 403 igual que hoy
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `packages/db/src/repositories/staff.repository.ts` | repositorio nuevo |
| `packages/db/src/repositories/staff.integration.test.ts` | tests de integración |
| `packages/db/index.ts` | barrel |
| `apps/api/rest/src/shops/shops.service.ts` | `getStaffs`/`createStaff`/`updateStaff` reales |
| `apps/api/rest/src/users/users.service.ts` | `getMyStaffs`/`getAllStaffs` reales |
| `apps/api/rest/src/shops/shops.service.spec.ts` | tests con `@safari/db` mockeado |
| `apps/api/rest/src/users/users.service.spec.ts` | ídem |

## Definición de Done

- [x] `curl` contra las rutas, con la salida pegada, antes y después.
- [x] `just db-check` y los tests de la API verdes con recuentos (Vitest:
  la API dejó Jest en US-88..91).
- [x] `just build-api` y `just verify` verdes.
- [x] Inventario de rutas de escritura que fijan `updatedAt` pegado (CA-5).
- [x] Status de esta US actualizado y su fila marcada en el épico.

## Resultado (2026-11-18, rama `feat/us-42-staffs` sobre `main` @ `c9af5b1`)

### Decisiones del dueño durante la US

El contrato real del admin no era el que suponía la US. El formulario
«Add staff» manda `{ email, password, name, shop_id }`: crea un usuario, no
asigna uno existente. `DELETE /staffs/:id` lleva solo el id del usuario.
Se preguntó y el dueño eligió la opción recomendada en las cuatro:

1. **`POST /staffs` crea el usuario y su fila.** Con un email nuevo crea el
   usuario (password con bcrypt, permiso `customer`, como el registro) y su
   fila en `shop_staff`, en una transacción. Si el email ya es staff de esa
   tienda, es idempotente: devuelve el usuario sin tocarlo (CA-2). Si el
   email es de otro usuario, da 409: no se ata un usuario existente en
   silencio ni se cambia su password.
2. **`DELETE /staffs/:id` retira las filas que gestiona quien llama:**
   todas si es super admin y las de sus tiendas si es dueño. `?shop_id`
   opcional acota a una. El usuario no se borra.
3. **Todo se acota por quien llama**, sin tocar el guard, con el patrón de
   US-97. El super admin ve y escribe cualquier tienda. Un dueño solo las
   suyas: ver una ajena da la lista vacía y escribir en una ajena, 403.
4. **`my-staffs` y `all-staffs` salen del pivote**, no del permiso global
   `staff`, que nadie tiene en el seed. `all-staffs` lista los usuarios con
   alguna fila. `my-staffs` lista el staff de las tiendas del que llama,
   acotado por `shop_id` si viene.

### Qué se hizo

- **`@safari/db`.**
  - `staff.repository.ts`, nuevo, con `createShopStaff` y
    `removeShopStaff`.
  - `ListUsersInput.staffOf: { shopId?, ownerId? }` en
    `users.repository.ts`. Así los tres listados reutilizan
    `listUsersWithRelations`, con el mismo `include` y el mismo orden.
  - `staff.integration.test.ts`: 11 tests.
- **API.**
  - `getStaffs`, `createStaff` y `removeStaff` en `shops.service.ts`.
  - `getMyStaffs` y `getAllStaffs` en `users.service.ts`.
  - El `@CurrentUser()` llega a las cuatro rutas que lo necesitan.
  - `CreateStaffDto` con la forma del `AddStaffInput` del admin. Se valida a
    mano, como el resto de DTOs del proyecto, que no usan `class-validator`.
- **Tests de la API.** `staff.service.spec.ts` es nuevo (27 tests).
  - Sustituye a los dos `describe` de `shops.service.spec.ts` que fijaban los
    stubs (`createStaff()` → `null`, `getStaffs` → `data: []`). Su contrato
    vigente (mismo key-set, `per_page` crudo, `updateStaff` → `null`) se
    conserva ahí.
  - Se actualizaron los dos tests de `users.service.spec.ts` que comprobaban
    el filtro por el permiso `staff`.
- **Sin cambiar.**
  - `PUT /staffs/:id` sigue devolviendo `null`: el pivote no tiene columnas
    que editar y el admin no llama a esta ruta.
  - `GET /staffs/:slug` sigue sirviendo la tienda (`getShop`).
  - El guard de cada ruta: CA-3.

**Rutas: son 7, no 8.** `StaffsController` tiene 5 (`POST`, `GET`,
`GET :slug`, `PUT :id`, `DELETE :id`); `users.controller.ts` suma
`my-staffs` y `all-staffs`.

### CA-1 a CA-4 — `curl` antes y después (mismo script)

Antes (`main` @ `c9af5b1`):

```
== GET
dueño: GET /staffs?shop_id=1                        200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
admin: GET /staffs?shop_id=1                         200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
admin: GET /staffs?shop_id=2&limit=1                 200 {"ids":[],"total":0,"per_page":"1","current_page":0,"keys":12}
otro dueño: GET /staffs?shop_id=1 (tienda ajena)    200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
admin: GET /staffs?shop_id=6 (sin staff)             200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
cliente: GET /staffs                                 403 "No tienes permisos suficientes para esta operación."
admin: GET /all-staffs                               200 {"ids":[],"total":0,"per_page":30,"current_page":0,"keys":12}
admin: GET /my-staffs                                200 {"ids":[],"total":0,"per_page":30,"current_page":0,"keys":12}
dueño: GET /all-staffs                              403 "No tienes permisos suficientes para esta operación."
dueño: GET /my-staffs                               403 "No tienes permisos suficientes para esta operación."
admin: GET /staffs/:slug (getShop)                   200 {"id":1,"slug":"furniture-shop"}
== POST / PUT / DELETE
dueño: POST /staffs usuario nuevo en tienda 1       201 ""
dueño: POST /staffs repetido (idempotente)          201 ""
dueño: POST /staffs email existente no staff        201 ""
otro dueño: POST /staffs en tienda ajena            201 ""
admin: POST /staffs tienda inexistente               201 ""
admin: POST /staffs sin email                        201 ""
dueño: GET /staffs?shop_id=1 tras el alta           200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
admin: PUT /staffs/:id                               200 ""
otro dueño: DELETE /staffs/:id (no gestiona)        200 "This action removes a #0 shop"
dueño: DELETE /staffs/:id                           200 "This action removes a #0 shop"
dueño: DELETE /staffs/:id otra vez                  200 "This action removes a #0 shop"
admin: DELETE /staffs/abc                            200 "This action removes a #NaN shop"
admin: DELETE /staffs/99999999999999999999           200 "This action removes a #100000000000000000000 shop"
== psql
shop_staff|3
zz users|0
NEWID=
```

Después:

```
== GET
dueño: GET /staffs?shop_id=1                        200 {"ids":[2,3],"total":2,"per_page":10,"current_page":1,"keys":12}
admin: GET /staffs?shop_id=1                         200 {"ids":[2,3],"total":2,"per_page":10,"current_page":1,"keys":12}
admin: GET /staffs?shop_id=2&limit=1                 200 {"ids":[2],"total":1,"per_page":"1","current_page":1,"keys":12}
otro dueño: GET /staffs?shop_id=1 (tienda ajena)    200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
admin: GET /staffs?shop_id=6 (sin staff)             200 {"ids":[],"total":0,"per_page":10,"current_page":0,"keys":12}
cliente: GET /staffs                                 403 "No tienes permisos suficientes para esta operación."
admin: GET /all-staffs                               200 {"ids":[2,3],"total":2,"per_page":30,"current_page":1,"keys":12}
admin: GET /my-staffs                                200 {"ids":[],"total":0,"per_page":30,"current_page":0,"keys":12}
dueño: GET /all-staffs                              403 "No tienes permisos suficientes para esta operación."
dueño: GET /my-staffs                               403 "No tienes permisos suficientes para esta operación."
admin: GET /staffs/:slug (getShop)                   200 {"id":1,"slug":"furniture-shop"}
== POST / PUT / DELETE
dueño: POST /staffs usuario nuevo en tienda 1       201 {"id":60,"email":"zz-staff@demo.com","keys":15}
dueño: POST /staffs repetido (idempotente)          201 {"id":60,"email":"zz-staff@demo.com","keys":15}
dueño: POST /staffs email existente no staff        409 "Ya existe un usuario con el email customer2@demo.com."
otro dueño: POST /staffs en tienda ajena            403 "No tienes permisos sobre la tienda 1."
admin: POST /staffs tienda inexistente               400 "`staff.shop_id` referencia un registro inexistente (`999999`)."
admin: POST /staffs sin email                        400 "Faltan datos del staff: name, email, password y shop_id son obligatorios."
dueño: GET /staffs?shop_id=1 tras el alta           200 {"ids":[2,3,60],"total":3,"per_page":10,"current_page":1,"keys":12}
admin: PUT /staffs/:id                               200 ""
otro dueño: DELETE /staffs/:id (no gestiona)        404 "El usuario 60 no es staff de ninguna tienda que gestiones."
dueño: DELETE /staffs/:id                           200 {"id":60,"email":"zz-staff@demo.com","keys":15}
dueño: DELETE /staffs/:id otra vez                  404 "El usuario 60 no es staff de ninguna tienda que gestiones."
admin: DELETE /staffs/abc                            404 "No existe un staff con id abc."
admin: DELETE /staffs/99999999999999999999           404 "No existe un staff con id 99999999999999999999."
== psql
shop_staff|3
zz users|1
NEWID=60
```

Lo que muestra:

- **CA-1.**
  - El dueño y el admin ven los 2 staff del seed de la tienda 1. La
    paginación es la de siempre: mismo key-set (12 claves), `per_page: 10`
    sin `limit` y `"1"` (string) con `limit=1`.
  - La tienda 6 sale vacía porque no tiene filas, y la tienda ajena del
    usuario 42 sale vacía porque no es suya.
  - `all-staffs` da [2, 3]. `my-staffs` del admin sale vacía: el admin del
    seed no es dueño de ninguna tienda.
- **CA-2.**
  - El alta repetida devuelve el mismo usuario (60) sin duplicar.
  - La baja retira y la segunda baja da 404.
  - El staff nuevo hace login: token con `["customer"]`, `password_hash` en
    bcrypt.
- **CA-3.** El guard es el de siempre: el cliente recibe 403 en `/staffs` y
  el dueño 403 en `all-staffs` y `my-staffs`.
- **CA-4.** Ningún error crudo de Prisma:
  - tienda inexistente: 400;
  - email ajeno: 409;
  - tienda ajena: 403;
  - id `abc` o fuera de `bigint`: 404, con la guarda de US-31.

Al terminar se borró el usuario de prueba (60). La base queda como el seed:
11 usuarios y 3 filas en `shop_staff`.

**Admin (`just admin-dev`).** Como dueño, `/en/furniture-shop/staffs` lista
«Customer customer@demo.com Active» y «Jhon Doe admin@demo.com Active».
Antes salía siempre vacía.

### CA-5 — Inventario de rutas de escritura y reloj

| Ruta | Escritura | Reloj |
|---|---|---|
| `POST /staffs` (usuario nuevo) | `users` + `permission_user` + `shop_staff` | `users.createdAt`/`updatedAt` y `shop_staff.createdAt` = `now()` de `clock.ts` (el integration test lo comprueba con `_setNowProvider`) |
| `POST /staffs` (repetido) | ninguna | — |
| `DELETE /staffs/:id` | borra filas de `shop_staff` | el pivote no tiene `updated_at`; `users` no se toca |
| `PUT /staffs/:id` | ninguna (`null`) | — |

### CA-6 — Sin regresión

```
npx vitest run (apps/api/rest, desde C:\)   Test Files 40 passed (40) · Tests 678 passed (678)   (antes 39/653)
npx tsc --noEmit -p tsconfig.json            TSC=0
npx eslint "{src,apps,libs,test}/**/*.ts"    ESLINT=0
just db-check                                Test Files 38 passed (38) · Tests 494 passed (494)   (antes 37/483: +11)
just build-api                               Done in 38.74s. BUILD_API=0
just verify
OK   API    :9001/api/settings  200  5503B  510ms
OK   Shop   :3003/en  200  191897B  1240ms  cards:30
OK   Admin  :3002/en/login  200  72554B  12080ms  cards:1
```

En la API: +27 tests en `staff.service.spec.ts`, −3 de los stubs y +1 en
`users.service.spec.ts` (653 + 27 − 3 + 1 = 678). El conteo del seed queda
intacto.

### Fuera de alcance, mencionado

- **Un staff dado de alta no puede entrar al admin.** Solo tiene el permiso
  `customer`, y el admin exige `super_admin`, `store_owner` o `staff`. Darle
  el permiso global `staff` es tocar `permission_user`, que esta US excluye.
  Le pasa igual al usuario 2 del seed.
- **`my-staffs` sigue tras `ADMIN_ONLY`** (CA-3). Para el super admin
  significa «staff de las tiendas de las que soy dueño», que en el seed es
  ninguna. Si debiera abrirse a los dueños, es un cambio de guard.
- **`PUT /staffs/:id` sigue siendo un stub.** Retirarlo o darle sentido es
  otra US.
- **Ciclo de imports `shops.service` ↔ `users/user-dto.mapper`.** Ya existía
  en sentido inverso (`toShopDto`). Es seguro en ESM, y está comentado en el
  import.
- **El aviso `organizeImports` de biome en `packages/db/index.ts` ya estaba
  en `HEAD`.** El hook de formato reordenó exports de flash-sale al tocar el
  barrel. Se revirtió para no mezclar ese refactor con la US.

## Notas para el agente ejecutor

- **El barrel `packages/db/index.ts` lo comparten las US del épico.** Si otra
  va en paralelo, quien arranque segundo rebasea sobre él.
- Esta US toca `shops.service.ts` y `users.service.ts`, que sostienen catálogo
  y autenticación. Las suites de `shops` y `users` de `apps/api/rest` son la
  red: correrlas antes de empezar para tener la línea base.
- No inventar rutas nuevas. Las 8 existen; esta US las llena.
