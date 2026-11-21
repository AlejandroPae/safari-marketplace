"""Prueba del PostgresPipeline sin salir a internet.

Alimenta el pipeline con items sinteticos y comprueba contra la tabla
`products` real (la misma que consulta la tienda, sin mocks de la base) que:

  1. Un producto nuevo se INSERTA, con el precio convertido de "1.299.900 COP"
     a un numero sobre el que se puede hacer aritmetica.
  2. El mismo producto visto otra vez con otro precio se ACTUALIZA en lugar de
     duplicarse (upsert por (source_store, source_product_id) sobre el indice
     parcial products_procedencia_key).
  3. Un producto que cambia de categoria sigue siendo UNA sola fila, y queda
     en UNA sola categoria de category_product.
  4. Dos tiendas distintas pueden usar el mismo source_product_id sin
     pisarse.

Y ademas, sobre las filas relacionadas y las reglas de saneo:

  5. La tienda y la marca se crean como filas reales de `shops` y
     `manufacturers` la primera vez y se reutilizan despues.
  6. Un item que viola una regla (promocion >= precio, sin precio, sin enlace,
     precio que desborda numeric(12,2)) se descarta o se sanea con log,
     cuenta en `stats` y la corrida sigue.

Aislamiento: todos los items usan tiendas y marca centinela con el prefijo
"ZZ Prueba". La limpieza borra esas tiendas (la cascada se lleva sus
`products` y su `category_product`) y esa marca, antes y despues de correr.
Nunca toca las 1200 filas del seed ni filas reales del scraper.

Uso:  just db-test   (requiere `just db-up`)
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pipelines import PostgresPipeline, parse_numero  # noqa: E402

TIENDA_A = "ZZ Prueba Alkosto"
TIENDA_B = "ZZ Prueba Exito"
MARCA = "ZZ Prueba ACME"
TIENDAS = [TIENDA_A, TIENDA_B]


class SpiderFalso:
    """Lo minimo que el pipeline espera de un spider real. Guarda los
    warnings y errores para poder comprobar que cada descarte se logueo."""

    name = "prueba"

    def __init__(self, dsn):
        self.settings = {"DATABASE_URL": dsn}
        self.logger = self
        self.mensajes = []

    def info(self, msg):
        pass

    def warning(self, msg):
        self.mensajes.append(msg)

    def error(self, msg):
        self.mensajes.append(msg)


def item(**kwargs):
    base = {
        "nombre": "Portatil generico",
        "marca": MARCA,
        "precio": "1.299.900 COP",
        "categoria": "computadores",
        "enlace": "https://tienda.com/product/12345/portatil",
        "imagen": "https://tienda.com/img.jpg",
        "tienda": TIENDA_A,
    }
    base.update(kwargs)
    return base


fallos = []


def check(descripcion, condicion, detalle=""):
    if condicion:
        print(f"  OK    {descripcion}")
    else:
        print(f"  FALLA {descripcion}  {detalle}")
        fallos.append(descripcion)


def limpiar(dsn):
    """Borra lo que crea esta prueba y nada mas. `products.shop_id` es
    ON DELETE CASCADE y `category_product` cuelga de products con CASCADE:
    borrar las tiendas centinela basta para sus productos y sus categorias."""
    with psycopg.connect(dsn, autocommit=True) as c:
        c.execute("DELETE FROM shops WHERE slug = ANY(ARRAY[slugify(%s), slugify(%s)])", TIENDAS)
        c.execute("DELETE FROM manufacturers WHERE slug = slugify(%s)", (MARCA,))


def una(c, sql, params=()):
    fila = c.execute(sql, params).fetchone()
    return fila[0] if fila else None


def main():
    dsn = os.environ.get(
        "DATABASE_URL", "postgresql://safari:safari@localhost:5433/safari_scraper"
    )

    # -- Conversion de texto a numero, sin tocar la base ------------------
    print("\nConversion de precios (lo que Mongo nunca obligo a hacer):")
    check('"1.299.900 COP" -> 1299900', parse_numero("1.299.900 COP") == 1299900,
          f'dio {parse_numero("1.299.900 COP")}')
    check('"$ 89.900,50"   -> 89900.50', parse_numero("$ 89.900,50") == 89900.50,
          f'dio {parse_numero("$ 89.900,50")}')
    check('"44%"           -> 44', parse_numero("44%") == 44,
          f'dio {parse_numero("44%")}')
    check("None            -> None", parse_numero(None) is None)
    check('"sin precio"    -> None', parse_numero("sin precio") is None)

    limpiar(dsn)  # corrida abortada previa
    with psycopg.connect(dsn) as c:
        seed_antes = una(c, "SELECT count(*) FROM products WHERE source_store IS NULL")

    spider = SpiderFalso(dsn)
    pipe = PostgresPipeline()
    pipe.open_spider(spider)

    try:
        probar_pipeline(dsn, spider, pipe)
    finally:
        pipe.close_spider(spider)
        consultas(dsn)
        limpiar(dsn)

    with psycopg.connect(dsn) as c:
        seed_despues = una(c, "SELECT count(*) FROM products WHERE source_store IS NULL")
        residuos = una(
            c,
            "SELECT count(*) FROM products WHERE source_store = ANY(%s)",
            (TIENDAS,),
        )
    print("\nLimpieza:")
    check("no quedan filas de la prueba", residuos == 0, f"quedan {residuos}")
    check("las filas del seed siguen intactas", seed_antes == seed_despues,
          f"antes {seed_antes}, despues {seed_despues}")

    print()
    if fallos:
        print(f"FALLARON {len(fallos)} comprobaciones")
        return 1
    print("Todas las comprobaciones pasaron")
    return 0


def fila_producto(c, tienda, product_id):
    return c.execute(
        "SELECT p.id, p.price, p.name, p.shop_id, p.manufacturer_id, p.type_id "
        "FROM products p WHERE p.source_store = %s AND p.source_product_id = %s",
        (tienda, product_id),
    ).fetchall()


def categorias_de(c, producto_id):
    return [
        r[0]
        for r in c.execute(
            "SELECT cat.slug FROM category_product cp "
            "JOIN categories cat ON cat.id = cp.category_id "
            "WHERE cp.product_id = %s ORDER BY cat.slug",
            (producto_id,),
        ).fetchall()
    ]


def probar_pipeline(dsn, spider, pipe):
    print("\nComportamiento del pipeline sobre `products`:")

    # 1. Insercion
    pipe.process_item(item(), spider)
    with psycopg.connect(dsn) as c:
        filas = fila_producto(c, TIENDA_A, "12345")
        gadget = una(c, "SELECT id FROM types WHERE slug = 'gadget'")
        cats = categorias_de(c, filas[0][0]) if filas else []
    check("1. producto nuevo se inserta", len(filas) == 1, f"hay {len(filas)} filas")
    check("1. precio quedo numerico y operable", filas and filas[0][1] == 1299900,
          f"dio {filas[0][1] if filas else None}")
    check("1. queda en el type 'gadget'", filas and filas[0][5] == gadget)
    check("1. queda en la categoria laptop", cats == ["laptop"], f"dio {cats}")

    # 2. Actualizacion, no duplicado
    pipe.process_item(item(precio="1.100.000 COP", nombre="Portatil rebajado"), spider)
    with psycopg.connect(dsn) as c:
        filas = fila_producto(c, TIENDA_A, "12345")
    check("2. volver a verlo no duplica la fila", len(filas) == 1, f"hay {len(filas)} filas")
    check("2. el precio se actualizo", filas and filas[0][1] == 1100000,
          f"dio {filas[0][1] if filas else None}")
    check("2. el nombre se actualizo", filas and filas[0][2] == "Portatil rebajado")

    # 3. Cambio de categoria
    pipe.process_item(item(nombre="Portatil rebajado", categoria="consolas"), spider)
    with psycopg.connect(dsn) as c:
        filas = fila_producto(c, TIENDA_A, "12345")
        cats = categorias_de(c, filas[0][0]) if filas else []
    check("3. cambiar de categoria no duplica", len(filas) == 1, f"hay {len(filas)} filas")
    check("3. queda en una sola categoria, la nueva", cats == ["console"], f"dio {cats}")

    # 4. Mismo source_product_id en otra tienda
    pipe.process_item(item(tienda=TIENDA_B, nombre="Otro producto"), spider)
    with psycopg.connect(dsn) as c:
        n = una(
            c,
            "SELECT count(*) FROM products "
            "WHERE source_product_id = '12345' AND source_store = ANY(%s)",
            (TIENDAS,),
        )
        a = fila_producto(c, TIENDA_A, "12345")
    check("4. dos tiendas pueden compartir source_product_id", n == 2, f"hay {n} filas")
    check("4. la otra tienda no piso la primera", a and a[0][2] == "Portatil rebajado")

    # 5. Tienda y marca como filas reales, reutilizadas
    pipe.process_item(
        item(nombre="Portatil economico", precio="$ 899.900", promocion="799.900 COP",
             enlace="https://tienda.com/product/99999/economico"),
        spider,
    )
    with psycopg.connect(dsn) as c:
        shops_a = una(c, "SELECT count(*) FROM shops WHERE slug = slugify(%s)", (TIENDA_A,))
        shops_b = una(c, "SELECT count(*) FROM shops WHERE slug = slugify(%s)", (TIENDA_B,))
        marcas = una(c, "SELECT count(*) FROM manufacturers WHERE slug = slugify(%s)", (MARCA,))
        refs = c.execute(
            "SELECT count(DISTINCT shop_id), count(DISTINCT manufacturer_id) "
            "FROM products WHERE source_store = %s",
            (TIENDA_A,),
        ).fetchone()
    check("5. la tienda se creo una sola vez", shops_a == 1 and shops_b == 1,
          f"{TIENDA_A}: {shops_a}, {TIENDA_B}: {shops_b}")
    check("5. la marca se creo una sola vez, para las dos tiendas", marcas == 1, f"hay {marcas}")
    check("5. los productos de una tienda reutilizan su shop y su marca", refs == (1, 1),
          f"dio {refs}")

    # 6. Reglas: cada item malo se descarta o se sanea y la corrida sigue
    #    (el ultimo item es sano: prueba que nada la corto).
    antes = dict(pipe.stats)
    malos = [
        item(nombre="Promo incoherente", precio="100.000 COP", promocion="120.000 COP",
             enlace="https://tienda.com/product/70001/promo"),
        item(nombre="Sin precio", precio="N/D", enlace="https://tienda.com/product/70002/np"),
        item(nombre="Precio cero", precio="0 COP", enlace="https://tienda.com/product/70003/cero"),
        item(nombre="Sin enlace", enlace=""),
        item(nombre="Precio desbordado", precio="99.999.999.999 COP",
             enlace="https://tienda.com/product/70004/desborde"),
        item(nombre="Item sano tras los malos", precio="250.000 COP",
             enlace="https://tienda.com/product/70005/sano"),
    ]
    for m in malos:
        pipe.process_item(m, spider)
    delta = {k: pipe.stats[k] - antes[k] for k in pipe.stats}
    with psycopg.connect(dsn) as c:
        promo = fila_producto(c, TIENDA_A, "70001")
        sale_promo = una(
            c, "SELECT sale_price FROM products WHERE source_store = %s AND source_product_id = '70001'",
            (TIENDA_A,),
        )
        sano = fila_producto(c, TIENDA_A, "70005")
        descartados = una(
            c,
            "SELECT count(*) FROM products WHERE source_store = %s "
            "AND source_product_id IN ('70002', '70003', '70004')",
            (TIENDA_A,),
        )
    logs = " | ".join(spider.mensajes)
    check("6. promocion >= precio: se guarda el producto sin la promocion",
          len(promo) == 1 and sale_promo is None, f"filas {len(promo)}, sale_price {sale_promo}")
    check("6. sin precio, precio cero y desbordado no llegan a la base", descartados == 0,
          f"hay {descartados}")
    check("6. la corrida sigue: el item sano de despues se inserta", len(sano) == 1)
    check("6. stats cuentan cada caso",
          delta == {"insertados": 2, "actualizados": 0, "fallidos": 4,
                    "promociones_descartadas": 1},
          f"delta {delta}")
    check("6. cada descarte quedo en el log",
          all(t in logs for t in ("se descarta la promocion", "'Sin precio' sin precio valido",
                                  "'Precio cero' sin precio valido", "'Sin enlace' sin enlace",
                                  "Error guardando 'Precio desbordado'")),
          logs)

    check("estadisticas del pipeline: insertados + actualizados + fallidos == procesados",
          sum(pipe.stats[k] for k in ("insertados", "actualizados", "fallidos")) == 11,
          f"{pipe.stats}")


def consultas(dsn):
    """Lo que con precios en texto era imposible, ahora sobre `products` y
    solo con las filas de esta prueba."""
    print("\nConsultas que con precios en texto eran imposibles:")
    with psycopg.connect(dsn) as c:
        baratos = c.execute(
            "SELECT name, source_store, price FROM products "
            "WHERE source_store = ANY(%s) AND price < 1200000 ORDER BY price",
            (TIENDAS,),
        ).fetchall()
        medio = una(
            c, "SELECT round(avg(price)) FROM products WHERE source_store = ANY(%s)", (TIENDAS,)
        )
        ahorro = c.execute(
            "SELECT name, price - sale_price FROM products "
            "WHERE source_store = ANY(%s) AND sale_price IS NOT NULL "
            "ORDER BY price - sale_price DESC LIMIT 1",
            (TIENDAS,),
        ).fetchone()

    print("  WHERE price < 1200000 ORDER BY price")
    for f in baratos:
        print(f"    {f[2]:>12,.0f} COP  {f[1]:<18} {f[0]}")
    if medio is not None:
        print(f"  AVG(price) -> {medio:,.0f} COP")
    if ahorro:
        print(f"  mayor ahorro -> {ahorro[0]}: {ahorro[1]:,.0f} COP")

    check("WHERE price < 1200000 devuelve resultados", len(baratos) > 0)
    check("AVG(price) se puede calcular", medio is not None)
    check("resta price - sale_price funciona", ahorro is not None and ahorro[1] == 100000,
          f"dio {ahorro[1] if ahorro else None}")


if __name__ == "__main__":
    sys.exit(main())
