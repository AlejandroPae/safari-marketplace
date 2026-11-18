# US-8 — Realinear el harness del scraper (`db-test`, `db-count`)

> `test_pipeline.py` y las recetas `just db-test` / `just db-count` vuelven a
> ser verdaderas: prueban y cuentan contra `products`, no contra la tabla
> muerta `productos`.

**Épico:** [Épico 5](./README.md)
**Fecha:** 2026-08-25
**Status:** Implementado (2026-11-18)
**Depende de:** US-6
**LOC est.:** ~150

## Historia
**Como** agente (o estudiante) que necesita verificar el pipeline sin salir a
internet, **quiero** que `just db-test` ejercite el pipeline real contra el
esquema real, **para** tener un gate honesto del scraper en local y en el
futuro CI.

## Contexto

- `test_pipeline.py` prueba hoy el contrato viejo (columnas en español,
  upsert por `(tienda, product_id)`): tras US-6 quedaría probando código que
  ya no existe, o rojo.
- `just db-count` (justfile:296) consulta `FROM productos` — falla contra la
  base actual.
- Las 4 propiedades que el test viejo cubría siguen siendo las correctas
  (insertar / actualizar sin duplicar / cambio de categoría en la misma fila /
  mismo product_id en dos tiendas sin pisarse); cambia la tabla y llegan las
  nuevas: procedencia, shops/manufacturers get-or-create, constraints.

## Scope
**Incluye:** reescribir `test_pipeline.py` contra el pipeline de US-6 (las 4
propiedades originales + CA-2/CA-4 de US-6), actualizar la receta `db-count`
del justfile a una consulta equivalente sobre `products` (por `source_store` y
categoría), y dejar `just db-test` verde de punta a punta tras `just db-up`.
**NO incluye:** tocar `pipelines.py` (salvo bug encontrado por el test —
reportarlo y arreglarlo como fix mínimo documentado), tests de los spiders
contra los sitios reales, CI (Épico 9).

## Criterios de aceptación

### CA-1 — `just db-test` verde contra el esquema real
Tras `just db-up`, `just db-test` sale 0 ejercitando el pipeline de US-6
contra la tabla `products` real (sin mocks de la base).

### CA-2 — Las 4 propiedades originales, portadas
Insertar / actualizar-sin-duplicar / cambio de categoría en una sola fila /
mismo `source_product_id` en dos `source_store` distintos: las 4 pasan.

### CA-3 — `just db-count` cuenta lo que hay
`just db-count` responde con el desglose por tienda (source_store o su shop) y
categoría sobre `products`, sin error, con el seed cargado y con filas del
scraper presentes.

### CA-4 — El test limpia lo suyo
El test no deja residuos que alteren corridas siguientes ni rompan el seed
(idempotencia del harness: dos `just db-test` seguidos, ambos verdes).

## Escenarios Gherkin
```gherkin
Feature: Harness honesto del scraper
  Scenario: CA-1 — gate local verde
    Given just db-up ejecutado
    When corro just db-test dos veces seguidas
    Then ambas corridas salen 0
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `services/scraper-worker/test_pipeline.py` | reescritura contra `products` + propiedades nuevas |
| `justfile` | receta `db-count` sobre `products`; `db-test` solo si cambia la invocación |

## Definición de Done
- [x] Salida real de `just db-test` (dos corridas) pegada.
- [x] Salida real de `just db-count` pegada.
- [x] Salida real de `just --list` intacta (el justfile sigue parseando).
- [x] Status de esta US actualizado y fila del épico marcada.

## Resultado (2026-11-18, rama `feat/us-8-harness-scraper` sobre `main` @ `bf2f4b5`)

### Qué se hizo

- **`test_pipeline.py`, reescrito contra `products`.** Sigue siendo un
  script sin pytest, como el original. Cubre:
  - las 4 propiedades originales (CA-2), ahora sobre
    `(source_store, source_product_id)`. La 3 comprueba además que el
    producto queda en una sola fila de `category_product` (US-7);
  - el CA-2 de US-6 como propiedad 5: la tienda y la marca se crean una vez
    y se reutilizan;
  - el CA-4 de US-6 como propiedad 6. Hay cinco items malos:
    promoción ≥ precio, `N/D`, `0 COP`, sin enlace, y un precio que desborda
    `numeric(12,2)`, que es la ruta `psycopg.Error`. Después viene un item
    sano que sí se inserta. Se comprueban el delta de `stats` y cada línea
    del log.
- **Aislamiento (CA-4).** Los items usan las tiendas centinela «ZZ Prueba
  Alkosto» y «ZZ Prueba Exito» y la marca «ZZ Prueba ACME». `limpiar()` borra
  esas tiendas (la cascada `products.shop_id` → `category_product` se lleva
  lo demás) y esa marca, antes de correr y en un `finally`. El test viejo
  hacía `DELETE … WHERE tienda IN ('Alkosto','Exito')`, que sobre `products`
  borraría filas reales del scraper. Al final se comprueba que no quedan
  filas de la prueba y que el conteo del seed no cambió.
- **`just db-count`.** Agrupa `products` por `source_store`, con el seed en
  una sola línea `(seed)`, y por la categoría de `category_product`. Usa
  `ROLLUP` y subtotales con etiqueta. `db-test` no cambió: la invocación es
  la misma.
- `pipelines.py` no se tocó: el test no encontró ningún bug.

### Antes

```
just db-test   → psycopg.errors.UndefinedTable: relation "productos" does not exist
just db-count  → ERROR:  relation "productos" does not exist
```

### CA-1, CA-2 y CA-4 — `just db-test`, dos corridas seguidas

Corrida 1:

```
Conversion de precios (lo que Mongo nunca obligo a hacer):
  OK    "1.299.900 COP" -> 1299900
  OK    "$ 89.900,50"   -> 89900.50
  OK    "44%"           -> 44
  OK    None            -> None
  OK    "sin precio"    -> None

Comportamiento del pipeline sobre `products`:
  OK    1. producto nuevo se inserta
  OK    1. precio quedo numerico y operable
  OK    1. queda en el type 'gadget'
  OK    1. queda en la categoria laptop
  OK    2. volver a verlo no duplica la fila
  OK    2. el precio se actualizo
  OK    2. el nombre se actualizo
  OK    3. cambiar de categoria no duplica
  OK    3. queda en una sola categoria, la nueva
  OK    4. dos tiendas pueden compartir source_product_id
  OK    4. la otra tienda no piso la primera
  OK    5. la tienda se creo una sola vez
  OK    5. la marca se creo una sola vez, para las dos tiendas
  OK    5. los productos de una tienda reutilizan su shop y su marca
  OK    6. promocion >= precio: se guarda el producto sin la promocion
  OK    6. sin precio, precio cero y desbordado no llegan a la base
  OK    6. la corrida sigue: el item sano de despues se inserta
  OK    6. stats cuentan cada caso
  OK    6. cada descarte quedo en el log
  OK    estadisticas del pipeline: insertados + actualizados + fallidos == procesados

Consultas que con precios en texto eran imposibles:
  WHERE price < 1200000 ORDER BY price
         100,000 COP  ZZ Prueba Alkosto  Promo incoherente
         250,000 COP  ZZ Prueba Alkosto  Item sano tras los malos
         899,900 COP  ZZ Prueba Alkosto  Portatil economico
  AVG(price) -> 769,940 COP
  mayor ahorro -> Portatil economico: 100,000 COP
  OK    WHERE price < 1200000 devuelve resultados
  OK    AVG(price) se puede calcular
  OK    resta price - sale_price funciona

Limpieza:
  OK    no quedan filas de la prueba
  OK    las filas del seed siguen intactas

Todas las comprobaciones pasaron
EXIT=0
```

Corrida 2 (cola):

```
  OK    no quedan filas de la prueba
  OK    las filas del seed siguen intactas

Todas las comprobaciones pasaron
EXIT=0
```

**Rojo a propósito.** Se reemplazó en memoria `DELETE_CATEGORY_PRODUCT` del
pipeline por un `SELECT` que no hace nada, sin editar el archivo:

```
  FALLA 3. queda en una sola categoria, la nueva  dio ['console', 'laptop']
FALLARON 1 comprobaciones
EXIT=1
```

Después de esa corrida roja quedaron 0 productos, 0 shops y 0 manufacturers
`zz-prueba`: la limpieza del `finally` también corre cuando el test falla.

### CA-3 — `just db-count`

Con solo el seed:

```
 tienda  |    categoria    |  n   | precio_medio
---------+-----------------+------+--------------
 (seed)  | (sin categoria) | 1200 |           53
 (seed)  | (todas)         | 1200 |           53
 (total) | (todas)         | 1200 |           53
(3 rows)
```

Con 5 filas del scraper cargadas por el pipeline (con tiendas centinela, y
borradas después):

```
      tienda       |    categoria    |  n   | precio_medio
-------------------+-----------------+------+--------------
 (seed)            | (sin categoria) | 1200 |           53
 (seed)            | (todas)         | 1200 |           53
 ZZ Prueba Alkosto | laptop          |    2 |      2000000
 ZZ Prueba Alkosto | mobiles         |    1 |       899900
 ZZ Prueba Alkosto | (todas)         |    3 |      1633300
 ZZ Prueba Exito   | sound-box       |    1 |       349900
 ZZ Prueba Exito   | headphone       |    1 |       199900
 ZZ Prueba Exito   | (todas)         |    2 |      274900
 (total)           | (todas)         | 1205 |         4804
(9 rows)

EXIT=0
```

El `precio_medio` del total mezcla el seed (USD) con el scraper (COP). Es la
decisión de moneda pendiente en `_backlog/moneda-cop-vs-usd.md`, no un bug de
la receta.

### `just --list`

```
Available recipes:
    db-count         # Cuantos productos hay, por tienda y por categoria
    db-test          # Prueba el pipeline contra la base, sin salir a internet
LIST_EXIT=0
```

### Fuera de alcance, mencionado

- `db-test` no entra en ningún gate todavía. Agregarlo a `just check` es
  US-10 y llevarlo a CI es US-11 (Épico 9).
- `CLAUDE.md` todavía dice que `just db-test` y `just db-count` están rotos.

## Notas para el agente ejecutor
- Esta US toca el `justfile`, que es compartido por todo el repo: cambio
  mínimo, solo las recetas nombradas.
- Si US-6 dejó un script sintético temporal para su DoD, esta US lo reemplaza
  por `test_pipeline.py` formal — no mantener dos harnesses.
