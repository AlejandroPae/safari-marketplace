# safari-marketplace — tareas del monorepo
#
# Uso:   just              -> lista las tareas
#        just setup        -> deja el proyecto listo desde cero
#        just api-dev      -> arranca la API (terminal 1)
#        just shop-dev     -> arranca la tienda (terminal 2)
#        just admin-dev    -> arranca el admin (terminal 3)
#        just verify       -> comprueba que los tres responden
#        just check        -> gate local: lint + typecheck + tests (corta al primer rojo)
#
# Requiere: Node 20+, yarn 1 (`npm i -g yarn`), Python 3.11+ (solo scraper).
# Detalle de cada paso y problemas conocidos: apps/README.md

set shell := ["bash", "-uc"]

# Puertos. Override:  just API_PORT=9002 api-dev   |   API_PORT=9002 just api-dev
API_PORT   := env_var_or_default("API_PORT", "9001")
SHOP_PORT  := env_var_or_default("SHOP_PORT", "3003")
ADMIN_PORT := env_var_or_default("ADMIN_PORT", "3002")

# Postgres del scraper (ver docker-compose.yml)
DB_URL := env_var_or_default("DATABASE_URL", "postgresql://safari:safari@localhost:5433/safari_scraper")

# El venv del scraper cambia de ruta segun el sistema operativo. Se resuelve
# absoluto para que las recetas puedan hacer cd sin romper la ruta.
SCRAPER_DIR := justfile_directory() / "services/scraper-worker"
VENV_BIN    := if os_family() == "windows" { SCRAPER_DIR / ".venv/Scripts" } else { SCRAPER_DIR / ".venv/bin" }

# Lista las tareas disponibles
default:
    @just --list


# ─────────────────────────── setup ───────────────────────────

# Deja el proyecto listo desde cero (env + dependencias). ~15 min la primera vez
[group('setup')]
setup: env install
    @echo ""
    @echo "Listo. Abre tres terminales y ejecuta:"
    @echo "   just api-dev     -> http://localhost:{{API_PORT}}/api"
    @echo "   just shop-dev    -> http://localhost:{{SHOP_PORT}}"
    @echo "   just admin-dev   -> http://localhost:{{ADMIN_PORT}}"

# Crea los .env desde las plantillas (no pisa los existentes)
[group('setup')]
env:
    #!/usr/bin/env bash
    set -euo pipefail
    crear() {
      if [ -f "$2" ]; then
        echo "  = $2 ya existe, no se toca"
      else
        cp "$1" "$2"
        echo "  + $2 creado"
      fi
    }
    crear apps/shop/.env.template       apps/shop/.env
    crear apps/admin/rest/.env.template apps/admin/rest/.env
    crear apps/api/rest/.env.example    apps/api/rest/.env

    # Placeholders del shop que las plantillas dejan sin valor util
    if ! grep -q '^SECRET=.\+' apps/shop/.env; then
      SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
      sed -i "s|^SECRET=.*|SECRET=${SECRET}|" apps/shop/.env
      echo "  * SECRET generado en apps/shop/.env"
    fi
    sed -i 's|^NEXT_PUBLIC_ADMIN_URL=.*|NEXT_PUBLIC_ADMIN_URL="http://localhost:{{ADMIN_PORT}}"|' apps/shop/.env
    sed -i 's|^NEXTAUTH_URL=.*|NEXTAUTH_URL=http://localhost:{{SHOP_PORT}}|'                      apps/shop/.env

    # La API necesita DATABASE_URL desde que /api/settings sale de Postgres.
    # Se añade tambien a un .env que ya existiera: quien monto el entorno antes
    # de esa migracion no lo tiene, y sin el la API arranca y falla al primer
    # request.
    if ! grep -q '^DATABASE_URL=' apps/api/rest/.env; then
      printf '\n# Capa de datos (packages/db). Base local: `just db-up`\nDATABASE_URL={{DB_URL}}\n' >> apps/api/rest/.env
      echo "  + DATABASE_URL añadido a apps/api/rest/.env"
    fi

    # JWT_SECRET (US-22): mismo patron que el SECRET del shop, arriba. Solo
    # rellena la variable si la linea ya existe vacia (viene de un .env
    # copiado de .env.example). Un `.env` de la API previo a esta US no
    # tiene la linea `JWT_SECRET=`: `just setup` no la crea sola (igual que
    # no pisa un `.env` existente) — se documenta el alta manual en
    # apps/README.md.
    if ! grep -q '^JWT_SECRET=.\+' apps/api/rest/.env; then
      JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" apps/api/rest/.env
      echo "  * JWT_SECRET generado en apps/api/rest/.env"
    fi

    just set-api-port

# Sincroniza el puerto de la API en los tres .env (usar si el puerto esta ocupado)
[group('setup')]
set-api-port:
    #!/usr/bin/env bash
    set -euo pipefail
    sed -i 's|^PORT=.*|PORT={{API_PORT}}|'                       apps/api/rest/.env
    sed -i 's|localhost:[0-9]\+/api|localhost:{{API_PORT}}/api|' apps/shop/.env
    sed -i 's|localhost:[0-9]\+/api|localhost:{{API_PORT}}/api|' apps/admin/rest/.env
    echo "  * API fijada al puerto {{API_PORT}} en los tres .env"

# Instala dependencias de Node (dos instalaciones separadas, ~15 min)
[group('setup')]
install: install-apps install-api

# Workspace del frontend: shop + admin/rest + admin/graphql (~11 min).
# La variante GraphQL está congelada (US-12): se instala pero ninguna receta
# la arranca, construye ni verifica. Ver apps/README.md.
[group('setup')]
[working-directory: 'apps']
install-apps:
    yarn install --network-timeout 600000

# API NestJS: fuera del workspace, necesita su propio install (~4 min)
[group('setup')]
[working-directory: 'apps/api/rest']
install-api:
    yarn install --network-timeout 600000


# ──────────────────────── desarrollo ─────────────────────────

# API mock NestJS. Arrancala primero: los frontends la consultan en SSR
[group('dev')]
[working-directory: 'apps/api/rest']
api-dev:
    PORT={{API_PORT}} yarn start:dev

# Tienda Next.js (REST)
[group('dev')]
[working-directory: 'apps/shop']
shop-dev:
    yarn dev:rest

# Panel de administracion Next.js (REST)
[group('dev')]
[working-directory: 'apps/admin/rest']
admin-dev:
    yarn dev


# ────────────────────── build y produccion ───────────────────

# Build de produccion de shop + admin. Detén antes los `dev`: comparten .next
[group('build')]
build: build-shop build-admin

# Solo la tienda
[group('build')]
[working-directory: 'apps/shop']
build-shop:
    yarn build:rest

# Solo el admin
[group('build')]
[working-directory: 'apps/admin/rest']
build-admin:
    yarn build

# Compila la API a dist/ (para desplegar sin ts-node)
[group('build')]
[working-directory: 'apps/api/rest']
build-api:
    yarn build

# Sirve el build de la tienda (next start -> puerto 3000)
[group('build')]
[working-directory: 'apps/shop']
start-shop:
    yarn start

# Sirve el build del admin (next start -> puerto 3002)
[group('build')]
[working-directory: 'apps/admin/rest']
start-admin:
    yarn start


# ───────────────────────── verificacion ──────────────────────

# Comprueba que API, shop y admin responden con contenido real
[group('verify')]
verify:
    #!/usr/bin/env node
    const http = require('http');
    const targets = [
      { name: 'API   ', port: {{API_PORT}},   path: '/api/settings' },
      { name: 'Shop  ', port: {{SHOP_PORT}},  path: '/en' },
      { name: 'Admin ', port: {{ADMIN_PORT}}, path: '/en/login' },
    ];
    let fallos = 0;
    (async () => {
      for (const t of targets) {
        await new Promise((done) => {
          const t0 = Date.now();
          const req = http.get({ host: '127.0.0.1', port: t.port, path: t.path }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              const cards = [...body.matchAll(/product-card[^>]*>/g)].length;
              const ok = res.statusCode === 200;
              if (!ok) fallos++;
              console.log(
                `${ok ? 'OK  ' : 'FALLA'} ${t.name} :${t.port}${t.path}  ` +
                `${res.statusCode}  ${body.length}B  ${Date.now() - t0}ms` +
                (cards ? `  cards:${cards}` : '')
              );
              done();
            });
          });
          // Next.js compila la ruta en el primer request: puede tardar ~90s
          req.setTimeout(180000, () => { console.log(`FALLA ${t.name} :${t.port} timeout`); fallos++; req.destroy(); done(); });
          req.on('error', (e) => { console.log(`FALLA ${t.name} :${t.port} ${e.code || e.message}`); fallos++; done(); });
        });
      }
      process.exit(fallos ? 1 : 0);
    })();

# Revisa si los puertos estan libres y quien los ocupa (ver Zscaler en el README)
[group('verify')]
check-ports:
    #!/usr/bin/env node
    const net = require('net');
    const { execSync } = require('child_process');
    const ports = [{{API_PORT}}, {{SHOP_PORT}}, {{ADMIN_PORT}}];
    const quien = (port) => {
      try {
        if (process.platform !== 'win32') return '';
        const out = execSync(`netstat -ano | findstr ":${port} " | findstr LISTENING`, { encoding: 'utf8' });
        const pid = out.trim().split(/\r?\n/)[0].trim().split(/\s+/).pop();
        const tl = execSync(`tasklist /FI "PID eq ${pid}" /NH /FO CSV`, { encoding: 'utf8' });
        return `  <- PID ${pid} (${tl.split(',')[0].replace(/"/g, '')})`;
      } catch { return ''; }
    };
    // Se prueba CONECTANDO, no bindeando: en Windows SO_REUSEADDR deja
    // re-bindear un puerto que ya tiene un servidor Node y da falsos "libre".
    (async () => {
      for (const port of ports) {
        const ocupado = await new Promise((r) => {
          const s = net.connect({ host: '127.0.0.1', port });
          const cerrar = (v) => { s.destroy(); r(v); };
          s.setTimeout(2000);
          s.once('connect', () => cerrar(true));
          s.once('timeout', () => cerrar(true));
          s.once('error', () => cerrar(false));
        });
        console.log(`${ocupado ? 'OCUPADO ' : 'libre   '} ${port}${ocupado ? quien(port) : ''}`);
      }
    })();

# Revisa que el entorno tenga todo lo necesario
[group('verify')]
doctor:
    #!/usr/bin/env bash
    set -uo pipefail
    # DA-1 de US-91: los schematics de Nest 12 (`nest generate`, `nest upgrade`,
    # @nestjs/cli 12) piden Node 22.22.3+, 24.15+ o 26+. Ejecutar la API en
    # Nest 12 (ESM) solo pide 20.19+ o 22.12+ (la linea 21 no sirve). Mientras
    # la maquina tenga menos, la API se queda con @nestjs/cli 11 (ver US-91).
    if ! node_v="$(node -v 2>/dev/null)"; then
      echo "node    FALTA - instala Node 22.22.3+ o 24.15+"
    elif node -e 'const [M, m, p] = process.versions.node.split(".").map(Number); process.exit(M >= 26 || (M === 24 && m >= 15) || (M === 22 && (m > 22 || (m === 22 && p >= 3))) ? 0 : 1)'; then
      echo "node    $node_v OK"
    elif node -e 'const [M, m] = process.versions.node.split(".").map(Number); process.exit(M > 22 || (M === 22 && m >= 12) || (M === 20 && m >= 19) ? 0 : 1)'; then
      echo "node    $node_v VIEJO - la API (NestJS 12) arranca, pero el CLI de Nest 12 (nest generate, nest upgrade) pide Node 22.22.3+ o 24.15+"
    else
      echo "node    $node_v VIEJO - la API (NestJS 12, ESM) pide Node 20.19+ o 22.12+; el CLI de Nest 12, 22.22.3+ o 24.15+"
    fi
    echo "yarn    $(yarn -v 2>/dev/null || echo 'FALTA - npm i -g yarn')"
    echo "python  $(python --version 2>&1 || echo 'FALTA - solo necesario para el scraper')"
    for f in apps/api/rest/.env apps/shop/.env apps/admin/rest/.env; do
      [ -f "$f" ] && echo "env     $f OK" || echo "env     $f FALTA - corre 'just env'"
    done
    for d in apps/node_modules apps/api/rest/node_modules; do
      [ -d "$d" ] && echo "deps    $d OK" || echo "deps    $d FALTA - corre 'just install'"
    done

# Gate local (US-10): lint, typecheck y tests de todo el monorepo. Corta al primer rojo
#
# Pide: `just install`, `just db-up` y `just scraper-install`. Si falta algo,
# lo dice antes de correr nada. No necesita API, tienda ni admin levantados.
#
# Pasos y duración medida (2026-11-18, secuencial). En total, 568s en frío y
# 340s con las cachés calientes. La columna es la primera medición:
#    1. packages/db  build       prisma generate + tsup -> dist/   ~107s
#       Va primero: el typecheck usa generated/ y la API usa dist/ (R-2).
#    2. packages/db  lint        biome check                        ~8s
#    3. packages/db  typecheck   tsc --noEmit                       ~19s
#    4. api/rest     typecheck   tsc --noEmit                       ~79s
#    5. api/rest     lint        eslint SIN --fix                   ~76s
#       `yarn lint` lleva --fix: dejaría el gate verde sobre un árbol reescrito.
#    6. admin/rest   lint        eslint src                         ~32s
#    7. shop         lint        eslint src                         ~171s
#    8. api/rest     test        vitest (mockea @safari/db)         ~68s
#    9. packages/db  test        vitest de integración, Postgres    ~127s
#   10. scraper      db-test     pipeline contra Postgres           ~5s
#
# Fuera del gate, y por qué:
#   - Builds de Next y de la API: van en `just check-full`.
#   - Build de la tienda: prerenderiza por HTTP contra la API en :9001, y el
#     gate no depende de servicios levantados a mano.
#   - `tsc` de shop y admin: no son scripts del repo; `next build` ya
#     comprueba los tipos.
#   - Tests de frontend: no existen.
#   - Variante GraphQL: congelada (US-12).
[group('verify')]
[doc('Gate local (US-10): lint, typecheck y tests del monorepo; corta al primer rojo (~6-10 min)')]
check:
    #!/usr/bin/env bash
    set -uo pipefail
    falta=0
    precondicion() { echo "PRECONDICIÓN  $1 -> corre '$2'"; falta=1; }
    for d in apps/node_modules apps/api/rest/node_modules packages/db/node_modules; do
      [ -d "$d" ] || precondicion "falta $d" "just install / just db-build"
    done
    if ! docker compose exec -T postgres pg_isready -U safari -d safari_scraper >/dev/null 2>&1; then
      precondicion "Postgres no responde en :5433" "just db-up"
    fi
    [ -x "{{VENV_BIN}}/python" ] || [ -x "{{VENV_BIN}}/python.exe" ] || precondicion "falta el venv del scraper" "just scraper-install"
    [ "$falta" -eq 0 ] || { echo "check: NO se ejecutó ningún paso"; exit 2; }

    # `cd "$(pwd)/..."` deja la unidad en mayúscula vía MSYS: con c:\ vitest
    # carga dos veces el módulo y da 0 tests (ver la receta db-check).
    raiz="$(pwd)"
    pasos=(
      "packages/db build|packages/db|npm run build"
      "packages/db lint|packages/db|npm run lint"
      "packages/db typecheck|packages/db|npm run typecheck"
      "api/rest typecheck|apps/api/rest|npx tsc --noEmit -p tsconfig.json"
      "api/rest lint|apps/api/rest|npx eslint \"{src,apps,libs,test}/**/*.ts\""
      "admin/rest lint|apps/admin/rest|yarn lint"
      "shop lint|apps/shop|yarn lint"
      "api/rest test|apps/api/rest|npx vitest run"
      "packages/db test|packages/db|npm test"
      "scraper db-test|.|just db-test"
    )
    total=${#pasos[@]}
    resumen=()
    inicio=$(date +%s)
    for i in "${!pasos[@]}"; do
      IFS='|' read -r nombre dir cmd <<< "${pasos[$i]}"
      n=$((i + 1))
      echo ""
      echo "━━━ [$n/$total] $nombre ($cmd)"
      t0=$(date +%s)
      (cd "$raiz/$dir" && eval "$cmd")
      rc=$?
      dt=$(( $(date +%s) - t0 ))
      if [ "$rc" -ne 0 ]; then
        resumen+=("FALLA [$n/$total] $nombre  ${dt}s  (exit $rc)")
        for j in $(seq $((n + 1)) "$total"); do
          resumen+=("  --   [$j/$total] $(cut -d'|' -f1 <<< "${pasos[$((j - 1))]}")  no ejecutado")
        done
        echo ""; echo "━━━ Resumen de just check"; printf '%s\n' "${resumen[@]}"
        echo "check: ROJO en '$nombre'"
        exit 1
      fi
      resumen+=("OK    [$n/$total] $nombre  ${dt}s")
    done
    echo ""; echo "━━━ Resumen de just check"; printf '%s\n' "${resumen[@]}"
    echo "check: VERDE ($total pasos, $(( $(date +%s) - inicio ))s)"

# `check` más los builds de la API (nest build, ~45-54s) y del admin (next
# build, ~195s; no necesita la API). Sin el de la tienda: ese sí (ver `check`)
[group('verify')]
[doc('check + build de la API y del admin (sin la tienda: necesita la API levantada)')]
check-full: check build-api build-admin
    @echo "check-full: VERDE (check + build-api + build-admin)"


# ────────────────────── base de datos ────────────────────────

# Levanta Postgres en Docker, espera a que este listo y aplica el esquema
[group('bd')]
db-up:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d postgres
    echo -n "esperando a Postgres"
    for i in $(seq 1 30); do
      if docker compose exec -T postgres pg_isready -U safari -d safari_scraper >/dev/null 2>&1; then
        echo " listo"; break
      fi
      echo -n "."; sleep 1
    done
    just db-migrate
    if [ ! -f services/scraper-worker/.env ]; then
      cp services/scraper-worker/.env.example services/scraper-worker/.env
      echo "  + services/scraper-worker/.env creado"
    fi

# Aplica db/schema.sql + db/seed.sql (idempotente)
[group('bd')]
db-migrate:
    docker compose exec -T postgres psql -U safari -d safari_scraper -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    docker compose exec -T postgres psql -U safari -d safari_scraper -v ON_ERROR_STOP=1 -q < db/schema.sql
    docker compose exec -T postgres psql -U safari -d safari_scraper -v ON_ERROR_STOP=1 -q < db/seed.sql
    @# US-69: el seed entra en la pending list de los GIN trigram (creados antes
    @# que los datos) y el planificador no los usa hasta el primer VACUUM.
    docker compose exec -T postgres psql -U safari -d safari_scraper -v ON_ERROR_STOP=1 -q -c "VACUUM ANALYZE;"
    @echo "  * esquema y datos de referencia aplicados"

# Regenera db/seed.sql desde los JSON del mock de la aplicacion
[group('bd')]
db-seed-generate:
    node db/generate-seed.mjs

# Abre una sesion psql interactiva contra la base
[group('bd')]
db-shell:
    docker compose exec postgres psql -U safari -d safari_scraper

# Cuantos productos hay, por tienda y por categoria
[group('bd')]
db-count:
    docker compose exec -T postgres psql -U safari -d safari_scraper -c "SELECT CASE WHEN grouping(tienda) = 1 THEN '(total)' ELSE tienda END AS tienda, CASE WHEN grouping(categoria) = 1 THEN '(todas)' ELSE categoria END AS categoria, count(*) AS n, round(avg(price)) AS precio_medio FROM (SELECT coalesce(p.source_store, '(seed)') AS tienda, coalesce(c.slug, '(sin categoria)') AS categoria, p.price FROM products p LEFT JOIN category_product cp ON cp.product_id = p.id LEFT JOIN categories c ON c.id = cp.category_id) t GROUP BY ROLLUP (tienda, categoria) ORDER BY grouping(tienda), tienda, grouping(categoria), n DESC;"

# Prueba el pipeline contra la base, sin salir a internet
[group('bd')]
db-test:
    cd "{{SCRAPER_DIR}}" && DATABASE_URL="{{DB_URL}}" "{{VENV_BIN}}/python" test_pipeline.py

# Apaga Postgres. Los datos sobreviven en el volumen
[group('bd')]
db-down:
    docker compose down

# Borra la base entera, volumen incluido, y la recrea vacia
[group('bd')]
db-reset:
    docker compose down -v
    just db-up


# ────────────────────── capa de datos ────────────────────────

# Instala y construye packages/db (prisma generate + tsup -> dist/)
[group('bd')]
[working-directory: 'packages/db']
db-build:
    npm install
    npm run build

# Typecheck + tests de integracion de packages/db
# El `cd "$(pwd)"` re-normaliza la letra de unidad del cwd (c:\ -> C:\ via
# MSYS): si el invocador tenia la unidad en minuscula, vitest carga dos
# instancias del modulo (cache ESM de Node case-sensitive por URL) y falla
# con "Vitest failed to find the current suite" / 0 tests.
[group('bd')]
[working-directory: 'packages/db']
db-check:
    npm run typecheck
    cd "$(pwd)" && npm test


# ─────────────────────────── scraper ─────────────────────────

# Crea el venv e instala dependencias + el navegador de Playwright
[group('scraper')]
scraper-install:
    #!/usr/bin/env bash
    set -euo pipefail
    python -m venv "{{SCRAPER_DIR}}/.venv"
    "{{VENV_BIN}}/python" -m pip install --upgrade pip
    "{{VENV_BIN}}/python" -m pip install -r "{{SCRAPER_DIR}}/requirements.txt"
    "{{VENV_BIN}}/python" -m playwright install chromium

# Ejecuta un spider (alkosto|compulago|compuworking|exito|falabella|tauret)
[group('scraper')]
scrape spider:
    cd "{{SCRAPER_DIR}}" && "{{VENV_BIN}}/python" -m scrapy crawl {{spider}}

# Lista los spiders que Scrapy reconoce (util para validar la configuracion)
[group('scraper')]
spiders:
    cd "{{SCRAPER_DIR}}" && "{{VENV_BIN}}/python" -m scrapy list


# ─────────────────────────── limpieza ────────────────────────

# Borra artefactos de build (.next, dist). No toca node_modules ni .env
[group('limpieza')]
clean:
    rm -rf apps/shop/.next apps/admin/rest/.next apps/admin/graphql/.next apps/api/rest/dist

# Borra ademas node_modules: obliga a reinstalar (~15 min). No toca los .env
[group('limpieza')]
clean-all: clean
    rm -rf apps/node_modules apps/api/rest/node_modules apps/api/graphql/node_modules
