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
# Requiere: Node 22.22.3+ (.nvmrc; lo pide el CLI de Nest 12), yarn 1 (`npm i -g yarn`), Python 3.11+ (solo scraper).
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
    sed -i 's|^NEXTAUTH_URL=.*|NEXTAUTH_URL=http://localhost:{{SHOP_PORT}}|'                      apps/shop/.env

    # La API necesita DATABASE_URL desde que /api/settings sale de Postgres.
    # Se añade tambien a un .env que ya existiera: quien monto el entorno antes
    # de esa migracion no lo tiene, y sin el la API arranca y falla al primer
    # request.
    if ! grep -q '^DATABASE_URL=' apps/api/rest/.env; then
      printf '\n# Capa de datos (packages/db). Base local: `just db-up`\nDATABASE_URL={{DB_URL}}\n' >> apps/api/rest/.env
      echo "  + DATABASE_URL añadido a apps/api/rest/.env"
    fi

    # API_INTERNAL_URL: la URL de la API para el SSR del shop y el
    # rewrite de `next dev` de los dos frontends. Se añade también a un .env que
    # ya existiera, como DATABASE_URL: sin ella `next dev` no arranca.
    for f in apps/shop/.env apps/admin/rest/.env; do
      if ! grep -q '^API_INTERNAL_URL=' "$f"; then
        printf '\n# URL de la API para el servidor y el rewrite de next dev (US-102)\nAPI_INTERNAL_URL="http://localhost:{{API_PORT}}/api"\n' >> "$f"
        echo "  + API_INTERNAL_URL añadido a $f"
      fi
    done

    # SHOP_URL: enlaces del admin a la tienda, leídos al ejecutar.
    # También para un .env que ya existiera, como API_INTERNAL_URL.
    if ! grep -q '^SHOP_URL=' apps/admin/rest/.env; then
      printf '\n# URL pública de la tienda para los enlaces del admin (US-103)\nSHOP_URL="http://localhost:{{SHOP_PORT}}"\n' >> apps/admin/rest/.env
      echo "  + SHOP_URL añadido a apps/admin/rest/.env"
    fi

    # La URL de broadcasting va por /backend. Un .env anterior
    # la tiene derivada de la URL absoluta de la API, que el build escribiría en
    # el JavaScript del admin.
    sed -i 's|^NEXT_PUBLIC_BROADCAST_AUTH_URL=.*|NEXT_PUBLIC_BROADCAST_AUTH_URL="/backend/broadcasting/auth"|' apps/admin/rest/.env

    # JWT_SECRET: mismo patron que el SECRET del shop, arriba. Solo
    # rellena la variable si la linea ya existe vacia (viene de un .env
    # copiado de .env.example). Un `.env` de la API anterior a JWT_SECRET no
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
# La variante GraphQL está congelada: se instala pero ninguna receta
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

# Instalación del CI: todo lo que pide `just check`, sin reescribir
# ningún lockfile. Si un package.json no coincide con su lockfile, falla en
# vez de actualizarlo. En local siguen siendo `just install`, `just db-build`
# y `just scraper-install`.
#   - packages/db con --ignore-scripts: su `prepare` construye, y el paso 1 de
#     `just check` ya lo hace (~107 s menos).
#   - El scraper sin el navegador de Playwright: el `db-test` de `check` solo
#     usa psycopg.
[group('setup')]
[doc('Instalación del CI: lockfiles congelados y scraper sin Playwright')]
install-ci:
    #!/usr/bin/env bash
    set -euo pipefail
    (cd apps && yarn install --frozen-lockfile --network-timeout 600000)
    (cd apps/api/rest && yarn install --frozen-lockfile --network-timeout 600000)
    (cd packages/db && npm ci --ignore-scripts)
    python -m venv "{{SCRAPER_DIR}}/.venv"
    "{{VENV_BIN}}/python" -m pip install -r "{{SCRAPER_DIR}}/requirements.txt"


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
    # Los schematics de Nest 12 (`nest generate`, `nest upgrade`,
    # @nestjs/cli 12) piden Node 22.22.3+, 24.15+ o 26+. Ejecutar la API en
    # Nest 12 (ESM) solo pide 20.19+ o 22.12+ (la linea 21 no sirve). Mientras
    # la maquina tenga menos, la API se queda con @nestjs/cli 11.
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

# Gate local: lint, typecheck y tests de todo el monorepo. Corta al primer rojo
#
# Pide: `just install`, `just db-up` y `just scraper-install`. Si falta algo,
# lo dice antes de correr nada. No necesita API, tienda ni admin levantados.
# En CI, .github/workflows/ci.yml corre cada paso como un step propio
# (`just check <id>`) tras `just install-ci` y `just db-up`, y al
# final `just check resumen` escribe la tabla de la corrida.
#
# Pasos y duración medida (2026-11-18, secuencial). En total, 568s en frío y
# 340s con las cachés calientes. La columna es la primera medición:
#    1. packages/db  build       prisma generate + tsup -> dist/   ~107s
#       Va primero: el typecheck usa generated/ y la API usa dist/.
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
#   - Builds de Next y de la API: van en `just check-full` (lentos). Ninguno
#     necesita la API levantada.
#   - `tsc` de shop y admin: no son scripts del repo. OJO: `next build` NO
#     comprueba tipos con APPLICATION_MODE=production, que traen las
#     plantillas .env. El CI construye la tienda con development;
#     el admin no los comprueba en ningún lado (TS2688 de minimatch).
#   - Tests de frontend: no existen.
#   - Variante GraphQL: congelada.
[group('verify')]
[doc('Gate local: lint, typecheck y tests del monorepo; corta al primer rojo (~6-10 min). `just check <id>...` corre solo esos pasos')]
check *ids:
    #!/usr/bin/env bash
    set -uo pipefail
    # Una sola lista de pasos: id|nombre|carpeta|comando|grupo.
    #   grupo `check`: los 10 que corre `just check` a secas.
    #   grupo `build`: los builds de `check-full`; solo corren si se piden por
    #   id (el CI los pide uno por uno, para verlos como steps separados).
    pasos=(
      "db-build|packages/db build|packages/db|npm run build|check"
      "db-lint|packages/db lint|packages/db|npm run lint|check"
      "db-typecheck|packages/db typecheck|packages/db|npm run typecheck|check"
      "api-typecheck|api/rest typecheck|apps/api/rest|npx tsc --noEmit -p tsconfig.json|check"
      "api-lint|api/rest lint|apps/api/rest|npx eslint \"{src,apps,libs,test}/**/*.ts\"|check"
      "admin-lint|admin/rest lint|apps/admin/rest|yarn lint|check"
      "shop-lint|shop lint|apps/shop|yarn lint|check"
      "api-test|api/rest test|apps/api/rest|npx vitest run|check"
      "db-test|packages/db test|packages/db|npm test|check"
      "scraper-test|scraper db-test|.|just db-test|check"
      "api-build|api/rest build|.|just build-api|build"
      "admin-build|admin/rest build|.|just build-admin|build"
      "shop-build|shop build|.|just build-shop|build"
    )
    campo() { cut -d'|' -f"$2" <<< "$1"; }
    read -r -a pedidos <<< "{{ids}}"

    # `just check resumen`: la tabla del CI en $GITHUB_STEP_SUMMARY,
    # con lo que cada paso dejó en $CHECK_REPORT. Lo que no aparece ahí no se
    # ejecutó (GitHub corta en el primer step rojo).
    if [ "${pedidos[0]:-}" = "resumen" ]; then
      reporte="${CHECK_REPORT:?CHECK_REPORT no está definida}"
      # Va al resumen del job y también al log del step, que sí se puede leer por API.
      {
        echo "### just check — resumen"
        echo ""
        echo "| Paso | Resultado | Duración | Pruebas |"
        echo "|---|---|---|---|"
        estado="VERDE"; pruebas_ok=0; pruebas_total=0
        for p in "${pasos[@]}"; do
          id=$(campo "$p" 1); nombre=$(campo "$p" 2)
          linea=$(grep "^$id|" "$reporte" 2>/dev/null | tail -1)
          if [ -z "$linea" ]; then
            res="— no ejecutado"; dt="—"
          else
            res=$(campo "$linea" 2); dt="$(campo "$linea" 3) s"
            [ "$res" = "OK" ] && res="✅ OK" || { res="❌ FALLA"; estado="ROJO"; }
          fi
          tests="—"
          if [ -f "$reporte.$id.json" ]; then
            read -r ok tot < <(node -e "const r=require(process.argv[1]);console.log(r.numPassedTests,r.numTotalTests)" "$reporte.$id.json")
            tests="$ok / $tot"
            pruebas_ok=$((pruebas_ok + ok)); pruebas_total=$((pruebas_total + tot))
          fi
          echo "| $nombre (\`$id\`) | $res | $dt | $tests |"
        done
        echo ""
        echo "**check: $estado** — pruebas: $pruebas_ok de $pruebas_total pasaron."
      } | if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then tee -a "$GITHUB_STEP_SUMMARY"; else cat; fi
      exit 0
    fi

    # Pasos elegidos: sin ids, los del grupo `check`; con ids, esos y en ese orden.
    seleccion=()
    if [ "${#pedidos[@]}" -eq 0 ]; then
      for p in "${pasos[@]}"; do [ "$(campo "$p" 5)" = check ] && seleccion+=("$p"); done
    else
      for id in "${pedidos[@]}"; do
        p=$(printf '%s\n' "${pasos[@]}" | grep "^$id|")
        [ -n "$p" ] || { echo "check: id desconocido '$id'. Ids: $(printf '%s\n' "${pasos[@]}" | cut -d'|' -f1 | tr '\n' ' ')resumen"; exit 2; }
        seleccion+=("$p")
      done
    fi
    ids_elegidos=" $(printf '%s\n' "${seleccion[@]}" | cut -d'|' -f1 | tr '\n' ' ')"

    falta=0
    precondicion() { echo "PRECONDICIÓN  $1 -> corre '$2'"; falta=1; }
    for d in apps/node_modules apps/api/rest/node_modules packages/db/node_modules; do
      [ -d "$d" ] || precondicion "falta $d" "just install / just db-build"
    done
    # Solo dos pasos usan la base, y solo uno el venv del scraper.
    if [[ "$ids_elegidos" == *" db-test "* || "$ids_elegidos" == *" scraper-test "* ]]; then
      if ! docker compose exec -T postgres pg_isready -U safari -d safari_scraper >/dev/null 2>&1; then
        precondicion "Postgres no responde en :5433" "just db-up"
      fi
    fi
    if [[ "$ids_elegidos" == *" scraper-test "* ]]; then
      [ -x "{{VENV_BIN}}/python" ] || [ -x "{{VENV_BIN}}/python.exe" ] || precondicion "falta el venv del scraper" "just scraper-install"
    fi
    [ "$falta" -eq 0 ] || { echo "check: NO se ejecutó ningún paso"; exit 2; }

    # `cd "$(pwd)/..."` deja la unidad en mayúscula vía MSYS: con c:\ vitest
    # carga dos veces el módulo y da 0 tests (ver la receta db-check).
    raiz="$(pwd)"
    total=${#seleccion[@]}
    resumen=()
    inicio=$(date +%s)
    for i in "${!seleccion[@]}"; do
      p="${seleccion[$i]}"
      id=$(campo "$p" 1); nombre=$(campo "$p" 2); dir=$(campo "$p" 3); cmd=$(campo "$p" 4)
      n=$((i + 1))
      echo ""
      echo "━━━ [$n/$total] $nombre ($cmd)"
      # En CI, vitest deja sus conteos en JSON para `just check resumen`.
      if [ -n "${CHECK_REPORT:-}" ]; then export VITEST_JSON_OUT="$CHECK_REPORT.$id.json"; fi
      t0=$(date +%s)
      (cd "$raiz/$dir" && eval "$cmd")
      rc=$?
      dt=$(( $(date +%s) - t0 ))
      if [ -n "${CHECK_REPORT:-}" ]; then
        [ "$rc" -eq 0 ] && r=OK || r=FALLA
        echo "$id|$r|$dt" >> "$CHECK_REPORT"
      fi
      if [ "$rc" -ne 0 ]; then
        resumen+=("FALLA [$n/$total] $nombre  ${dt}s  (exit $rc)")
        for j in $(seq $((n + 1)) "$total"); do
          resumen+=("  --   [$j/$total] $(campo "${seleccion[$((j - 1))]}" 2)  no ejecutado")
        done
        echo ""; echo "━━━ Resumen de just check"; printf '%s\n' "${resumen[@]}"
        echo "check: ROJO en '$nombre'"
        exit 1
      fi
      resumen+=("OK    [$n/$total] $nombre  ${dt}s")
    done
    echo ""; echo "━━━ Resumen de just check"; printf '%s\n' "${resumen[@]}"
    echo "check: VERDE ($total pasos, $(( $(date +%s) - inicio ))s)"

# `check` más los builds de la API (nest build, ~45-54s), del admin (next
# build, ~195-430s) y de la tienda (next build). Ninguno necesita la API
# levantada: tampoco el de la tienda, que es lo que este gate vigila.
[group('verify')]
[doc('check + builds de la API, del admin y de la tienda (sin servicios levantados)')]
check-full: check build-api build-admin build-shop
    @echo "check-full: VERDE (check + build-api + build-admin + build-shop)"


# ────────────────────── base de datos ────────────────────────

# Levanta Postgres en Docker, espera a que este listo y aplica el esquema
[group('bd')]
db-up:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d postgres
    echo -n "esperando a Postgres"
    # Por TCP, no por socket: con un volumen nuevo, la imagen
    # inicializa con un servidor temporal que solo escucha en el socket y se
    # apaga al terminar. Por socket daba «listo» con ese servidor y db-migrate
    # fallaba con «the database system is shutting down».
    listo=0
    for i in $(seq 1 30); do
      if docker compose exec -T postgres pg_isready -h 127.0.0.1 -U safari -d safari_scraper >/dev/null 2>&1; then
        listo=1; echo " listo"; break
      fi
      echo -n "."; sleep 1
    done
    [ "$listo" -eq 1 ] || { echo; echo "db-up: Postgres no respondió en 30 s"; exit 1; }
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
    @# El seed entra en la pending list de los GIN trigram (creados antes
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

# Apaga Postgres (y la API en contenedor, si esta arriba). Los datos sobreviven
# en el volumen
[group('bd')]
db-down:
    docker compose down

# Borra la base entera, volumen incluido, y la recrea vacia
[group('bd')]
db-reset:
    docker compose down -v
    just db-up


# ────────────────────── docker ───────────────────────────────

# API en contenedor: Postgres sembrado y la imagen de la API, en el
# 9001. Es el mismo puerto que `just api-dev`: una u otra, no las dos. La
# primera vez construye la imagen (~15 min tras Zscaler); con Zscaler el build
# toma el CA de NODE_EXTRA_CA_CERTS (ver apps/api/rest/Dockerfile). Siembra el
# servicio db-init del compose, del que depende la API. El 9001 lo
# publica el balanceador api-lb, no la API: por eso se levantan los
# dos. 3003 y 3002 quedan libres para shop-dev y admin-dev.
[group('docker')]
[doc('API en contenedor en :9001 con Postgres sembrado (en vez de api-dev, no a la vez)')]
api-docker:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d --build api api-lb
    echo -n "esperando a la API"
    for i in $(seq 1 60); do
      if curl -sf -o /dev/null http://localhost:9001/api/settings; then
        echo " lista en http://localhost:9001/api"; exit 0
      fi
      echo -n "."; sleep 1
    done
    echo " no responde; ultimas lineas del log:"
    docker compose logs --tail 30 api
    exit 1

# Apaga la API y su balanceador. Postgres sigue arriba
[group('docker')]
api-docker-down:
    docker compose stop api api-lb

# Stack completo en contenedores: Postgres, siembra (db-init), API,
# tienda, admin y el proxy que publica 3003 y 3002 y enruta /backend a la API.
# Mismos puertos que el desarrollo nativo, así que `just verify` sirve de
# smoke; por lo mismo, no convive con api-dev/shop-dev/admin-dev. La primera
# vez construye las tres imágenes (ver tiempos en apps/README.md). Levanta UNA
# réplica de la API: si estaba escalada, vuelve a una.
[group('docker')]
[doc('Stack completo en Docker: tienda :3003, admin :3002, API :9001')]
stack-up:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d --build
    echo -n "esperando a que los servicios esten healthy"
    for i in $(seq 1 120); do
      sanos=$(docker compose ps --format '{{{{.Name}} {{{{.Status}}' | grep -c '(healthy)' || true)
      if [ "$sanos" -ge 4 ] && curl -sf -o /dev/null http://localhost:3003/en; then
        echo " listo"; docker compose ps --format 'table {{{{.Name}}\t{{{{.Status}}'
        echo "tienda http://localhost:3003  admin http://localhost:3002  API http://localhost:9001/api"
        exit 0
      fi
      echo -n "."; sleep 2
    done
    echo " no termino de arrancar:"
    docker compose ps --format 'table {{{{.Name}}\t{{{{.Status}}'
    exit 1

# Apaga el stack completo. Los datos de Postgres sobreviven en el volumen
[group('docker')]
stack-down:
    docker compose stop


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
