# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

`safari-marketplace` — monorepo didáctico para enseñar sistemas distribuidos.
Integra una tienda e-commerce (Pickbazar: Next.js + NestJS), una capa de datos
Prisma sobre PostgreSQL y un scraper multi-tienda (Python/Scrapy/Playwright)
que recolecta productos tecnológicos de 6 retailers colombianos. Se despliega
con imágenes de Docker (publicadas por el CI en Docker Hub) en un VPS con
Dokploy; la guía de los estudiantes es `docs/README.md`. **No hay Terraform
en el repo.**

La prosa del repo (commits, docs, comentarios) va en **español neutral**;
nombres de archivo, slugs, claves de config e identificadores en
inglés/kebab-case.

## Comandos

Todo se orquesta con `just` desde la raíz (`just` a secas lista las tareas;
el detalle de cada paso está en `apps/README.md`).

```bash
# Setup (una vez; ~15 min por las dos instalaciones de yarn)
just doctor            # comprueba node/yarn/python/.env/deps
just setup             # crea los .env desde plantillas + yarn install x2

# Desarrollo (tres terminales; SIEMPRE la API primero — los frontends hacen SSR)
just api-dev           # NestJS  -> http://localhost:9001/api  (Swagger en /docs)
just shop-dev          # tienda  -> http://localhost:3003
just admin-dev         # admin   -> http://localhost:3002
just verify            # los 3 responden con contenido real (cuenta product-cards)
just check-ports       # diagnóstico de puertos ocupados (Zscaler usa el 9000)

# Gate local. Pide install + db-up + scraper-install; no pide servidores
just check             # lint + typecheck + tests de todo el repo, ~6-10 min, corta al primer rojo
just check-full        # check + build-api + build-admin + build-shop (ninguno pide la API)

# Base de datos (Postgres 16 en Docker, puerto 5433)
just db-up             # levanta el contenedor + aplica db/schema.sql + db/seed.sql
just db-shell          # psql interactivo
just db-reset          # borra el volumen y recrea desde cero
just db-build          # packages/db: npm install + prisma generate + tsup -> dist/
just db-check          # packages/db: typecheck + tests de integración (requiere db-up)

# Scraper (Python 3.11+, venv propio en services/scraper-worker/.venv)
just scraper-install   # venv + requirements + Chromium de Playwright
just spiders           # lista los 6 spiders (alkosto|compulago|compuworking|exito|falabella|tauret)
just scrape <spider>   # corre un spider
just db-test           # prueba el pipeline contra la tabla `products` sin salir a internet

# Build de producción
just build             # shop + admin. Desde Next 16 `next dev` escribe en
                       # .next/dev y puede convivir con un build, pero no dos
                       # `next build` (ni dos `next dev`) de la misma app
                       # NO necesita la API: las rutas dinámicas
                       # se generan en la primera visita y las páginas
                       # estáticas toleran la API caída (avisan en el log).
just build-api         # compila la API a dist/
```

El gate repo-wide es `just check`. Corre 10 pasos en orden; la lista,
la duración de cada uno y lo que queda fuera están en el comentario de la
receta. Las piezas, por separado:

- `just db-check` — vitest de integración en `packages/db` (requiere
  `just db-up` antes).
- `cd apps/api/rest && npx vitest run` — 45 archivos / 714 tests (medido el
  2026-11-21).
  Vitest 4 con `unplugin-swc` (Nest necesita `emitDecoratorMetadata`, que
  esbuild no emite); `vitest.config.ts` mapea `#db/*` a `src/db/pickbazar/`
  y `#src/*` a `src/`. 37 de los 45 specs mockean `@safari/db`, así que no
  necesitan Postgres levantado. La red de tipos es aparte:
  `npx tsc --noEmit -p tsconfig.json` (Vitest no comprueba tipos).
- Lint de la API: `npx eslint "{src,apps,libs,test}/**/*.ts"`. **No** uses
  `yarn lint` ahí: lleva `--fix` y reescribe archivos. En shop y admin,
  `yarn lint` es `eslint src`, sin `--fix`.

## Arquitectura

```
apps/
├── shop/           Next.js 16.4.1 (pages router, `--webpack`: Turbopack se
│                   descartó dos veces), React 19.3.1, Tailwind 4.3.3 con la
│                   config en JS (`@config` en main.css), @pick-bazar/shop,
│                   puerto 3003. Variantes dev:rest (la usada) y dev:gql
│                   (requiere codegen graphql-let).
├── admin/rest/     Igual que el shop (Next 16.4.1, React 19.3.1, Tailwind
│                   4.3.3), panel de administración, puerto 3002.
├── admin/graphql/  Variante GraphQL del admin (instalada por el workspace, no
│                   usada en el stack REST). Sigue en Tailwind 3.4.14 (copia
│                   anidada). Declara React 18.2.0, pero el pin de `resolutions`
│                   de apps/package.json le da la 19.3.1: hay una sola copia.
├── api/rest/       NestJS 12 en ESM (`"type": "module"`, imports `#src/*` y
│                   `#db/*`), TypeScript 6. Casi todo en Postgres vía
│                   @safari/db (verificado 2026-11-21; authors y flash-sale
│                   ya migraron). Sigue en mock:
│                   - payment-method y payment-intent, con JSON de
│                     src/db/pickbazar/ (permanentes por decisión del dueño).
│                     También src/payment/ (servicios de Stripe/PayPal, sin
│                     controlador) y la llamada a la pasarela de
│                     `POST /orders/payment`.
│                   - 9 stubs sin datos ni JSON: addresses, ai, feedbacks,
│                     imports, newsletters, notify-logs, refunds, uploads y
│                     web-hook devuelven literales ("This action...").
│                   - Métodos sueltos con literal en módulos ya migrados (sobre
│                     todo los DELETE y aprobar/desaprobar de shops).
│                   db/schema.sql sigue excluyendo carritos, direcciones y
│                   wallets/balances. Los JSON de src/db/pickbazar/ se quedan en
│                   disco: son la fuente de db/generate-seed.mjs.
│                   FUERA del workspace de yarn: requiere su propio `yarn install`.
│                   @nestjs/cli sigue en la 11: la 12 exige Node 22.22.3 o más.
├── api/graphql/    Variante GraphQL de la API (no usada en el stack REST).
└── deployment/     Scripts zx originales de Pickbazar para VM+Nginx (referencia, no el camino).

packages/
└── db/             @safari/db — capa de datos: Prisma 7 + @prisma/adapter-pg.
                    Cliente singleton + repositorios de funciones planas por agregado.
                    Autónomo (npm, NO yarn workspace). Se construye con tsup a dist/
                    (CJS + .d.ts) para que Nest lo consuma vía `link:`. dist/ y
                    generated/ están gitignored: tras clonar, `just db-build`.

db/                 Fuente de verdad del catálogo compartido:
                    schema.sql (DDL comentado) + seed.sql (GENERADO desde los JSON
                    del mock por generate-seed.mjs) + README.md (el modelo).

services/
└── scraper-worker/ Scrapy + Playwright. 6 spiders de retailers colombianos.
                    Migrado de MongoDB a PostgreSQL (psycopg). Su schema.sql es un
                    tombstone: el esquema vive en db/. pipelines.py upserta en
                    `products`, y test_pipeline.py y `just db-count` la consultan.

docker-compose.yml  Stack local: Postgres 16 (safari/safari@localhost:5433/safari_scraper),
                    db-init, api + api-lb, shop, admin y proxy. `just db-up` levanta
                    solo Postgres; `just stack-up`, todo.
docker-compose.deploy.yml  Stack de producción (Dokploy), con las imágenes del CI.
justfile            Todas las tareas, en español, agrupadas (setup/dev/build/verify/bd/scraper/limpieza).
```

### Reglas que sostienen el diseño

- **`db/schema.sql` es la fuente de verdad del DDL.** Se aplica con
  `just db-migrate` (idempotente, `IF NOT EXISTS` — NO altera tablas
  existentes; para adoptar un cambio de esquema: `just db-reset`). No hay
  migraciones incrementales.
- **`packages/db/prisma/schema.prisma` NO genera migraciones.** Sale de
  `prisma db pull` contra la base real + renombres manuales. Las CHECK
  constraints, que Prisma no modela, se validan en los repositorios y se
  documentan en la cabecera del schema. Los índices trigram sí están
  modelados (`@@index(..., type: Gin)`). No quitar el
  preview `partialIndexes` (el unique parcial de procedencia lo necesita).
- **Contratos HTTP preservados byte a byte** al migrar endpoints del mock a
  Postgres. La API publica snake_case (lo que el frontend consume); la capa
  de datos devuelve camelCase; la traducción vive en los servicios de Nest.
  Precedente: `/api/settings` (5504 bytes antes y después — es el
  `Content-Length`; `just verify` imprime `5503B` porque mide `body.length`
  de una string JS, o sea caracteres UTF-16: el `©` de `copyrightText` es 1
  carácter y 2 bytes. Se verificó el tamaño, no un diff byte a
  byte). Divergencia conocida, ya embarcada, que
  toda migración debe esperar: `created_at`/`updated_at` — el seed no
  inserta esas columnas (las filas toman `now()` del último `db-up`, no las
  fechas por fila del mock) y `Date.toJSON()` emite 3 decimales donde el
  JSON de Laravel trae 6; los timestamps ISO miden lo mismo, por eso el
  conteo de bytes no lo detecta.
- **El scraper no tiene esquema propio.** Escribe en la MISMA tabla
  `products` que consulta la tienda; sus filas se distinguen por
  `source_store`/`source_product_id`/`source_url` y un unique parcial que
  permite upsert idempotente. Su `categorizar()` debe devolver los slugs de
  categoría que ya existen en el catálogo (tabla en `db/README.md`), no
  inventar los suyos.
- **Puertos:** API 9001 (el 9000 lo ocupa Zscaler en equipos corporativos),
  shop 3003, admin 3002, Postgres 5433. `just API_PORT=XXXX set-api-port`
  sincroniza los tres `.env` de una vez.

## Flujo spec-driven (SDD)

- `docs/product/` guarda épicos e historias de usuario (en español neutral;
  ver su README para numeración y plantillas) — leer la US objetivo y el
  README de su épico antes de tocar código.
- `openspec/specs/` refleja las specs implementadas por slug;
  `openspec/changes/` guarda propuestas en curso/archivadas.
  `openspec/config.yaml` es la configuración SDD del repo.
- **Store de persistencia: openspec-only.** El MCP de Engram NO está
  conectado en esta máquina; si los archivos de `.claude/skills/_shared/`
  mencionan Engram, esa rama no aplica — todo artefacto SDD vive en
  `openspec/`.
- Los comandos (`/sdd-new`, `/sdd-continue`, `/sdd-status`, …), agentes y
  skills SDD viven versionados en `.claude/` **de este repo** (skills de
  proyecto en `.claude/skills/`; ninguna referencia a `~/.claude/skills/`).
- Una US = una sesión de agente; lo que el "NO incluye" de una US excluye no
  se implementa aunque sea adyacente y fácil — se menciona en el reporte
  final en vez de accionarlo.
- La Definición de Done se cierra con salida real de comandos pegada
  (`just db-check`, `just db-test`, `just verify`, `curl`, builds), nunca
  con "debería funcionar".
