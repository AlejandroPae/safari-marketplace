# US-103 — URL de la tienda configurable en ejecución en el admin

> Los enlaces "ver en la tienda" del admin leen `NEXT_PUBLIC_SHOP_URL`, que
> Next escribe en el JavaScript durante `next build`. Esta US la sustituye por
> `SHOP_URL`, que se lee al arrancar: así la misma imagen del admin sirve con
> cualquier dominio de tienda. Sale de partir la US-102 original
> (revisión del 2026-11-18).

**Épico:** [Épico 13](./README.md)
**Fecha:** 2026-11-18
**Status:** Listo para ejecución (decisión DA-2 fijada por el dueño el 2026-11-18)
**Depende de:** [US-102](./102-urls-configurables-en-ejecucion.md), que
comparte las plantillas `.env`, el `justfile` y `apps/README.md`, y fija el
prefijo `/backend` que deja libre `/api/*` para Next.
**LOC est.:** ~120

## Historia

**Como** responsable del despliegue, **quiero** configurar la URL de la tienda
que usa el admin con una variable de ejecución, **para** cambiar el dominio de
la tienda sin reconstruir la imagen del admin.

## Contexto (verificado en el código el 2026-11-18, `main` @ `2f88e7b`)

- **`NEXT_PUBLIC_SHOP_URL` en el admin** (enlaces "ver en la tienda"), 9 usos
  en 8 archivos bajo `apps/admin/rest/src/`:
  - `components/message/views/header-view.tsx:70`;
  - `components/product/product-form.tsx:589` y `:636`;
  - `components/question/question-list.tsx:114`;
  - `components/reviews/review-details.tsx:147` y `review-list.tsx:111`;
  - `components/ui/lang-action/action.tsx:41` y `language-switcher.tsx:77`;
  - `config/routes.ts:158`. Es una función síncrona fuera de React, así que
    no puede usar un hook.
- **El admin no tiene `pages/api/` hoy.** Tras US-102, `/api/*` del dominio
  del admin queda para Next: la API va por `/backend`.
- **Las páginas estáticas se generan en el build:** 78 de las 160 páginas del
  admin exportan `getStaticProps`. Un `window.__ENV` inyectado en `_document`
  quedaría fijo en la imagen: **esa vía no sirve**.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-3 | URL de la tienda en el admin | Variable de ejecución **`SHOP_URL`**. Una ruta nueva, `apps/admin/rest/src/pages/api/runtime-config.ts`, la devuelve. Los componentes la consumen con un hook (`useShopUrl()`); `routes.ts:158` y demás código fuera de React, con un helper con caché (`shopUrl()`). No se usa `_document`. |
| DA-2 | `SHOP_URL` ausente o aún sin cargar | `runtime-config` responde **500 nombrando la variable** si falta `SHOP_URL`. Mientras el valor no llega, el enlace no se pinta: nada de enlaces a `undefined/...`. |
| DA-1′ | `.env` ya existentes | Igual que DA-1 de US-102: `just env` añade `SHOP_URL` si falta. El ejecutor no edita `.env`. |

## Scope

**Incluye:**

- la ruta `runtime-config` y el hook o helper (D-3, DA-2);
- los 9 usos de `NEXT_PUBLIC_SHOP_URL`;
- `apps/admin/rest/.env.template` y la receta `env` del `justfile` (DA-1′);
- la fila de `SHOP_URL` en la tabla de variables de `apps/README.md` (la crea
  US-102).

**NO incluye:**

- el prefijo `/backend` ni `API_INTERNAL_URL` (US-102);
- caché del lado del servidor más allá de leer `process.env` por petición;
- `NEXT_PUBLIC_ADMIN_URL` del shop (US-102, D-4);
- Dockerfiles, compose o configuración de Dokploy.

## Criterios de aceptación

### CA-1 — Enlaces del admin a la tienda en ejecución
Se cambia `SHOP_URL`, se reinicia el admin (`next start`) sin reconstruir, y
los enlaces "ver en la tienda" (producto, reseña, pregunta, visitar tienda)
apuntan al nuevo valor. Evidencia:
- `curl /api/runtime-config` con cada valor;
- el `href` real de un enlace, sacado del DOM con DevTools MCP o del HTML
  renderizado.

### CA-2 — Variable ausente
Sin `SHOP_URL`, `curl -i /api/runtime-config` responde 500 con un mensaje que
nombra `SHOP_URL`, y la página de producto del admin no pinta un enlace roto.

### CA-3 — Sin restos
`grep -rn "NEXT_PUBLIC_SHOP_URL" apps/admin/rest/src apps/admin/rest/.env.template`
no devuelve nada.

### CA-4 — Calidad
- `npx tsc --noEmit` del admin: mismo número de errores que la línea base
  medida antes del primer cambio (pegar ambas).
- `yarn lint` en 0; `just check` y `just build-admin` en verde;
  `just verify` en verde.

## Escenarios Gherkin

```gherkin
Feature: URL de la tienda en ejecución en el admin

  Scenario: CA-1 — cambio del dominio de la tienda
    Given el admin arrancado con SHOP_URL="https://tienda-a.example"
    When reinicio el admin con SHOP_URL="https://tienda-b.example" sin reconstruir
    Then el enlace "ver en la tienda" de un producto apunta a "https://tienda-b.example/products/<slug>"

  Scenario: CA-2 — variable ausente
    Given el admin arrancado sin SHOP_URL
    When pido /api/runtime-config
    Then responde 500 y el mensaje nombra SHOP_URL
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/admin/rest/src/pages/api/runtime-config.ts` | **Nuevo:** devuelve `{ shopUrl }` desde `process.env.SHOP_URL`, o un 500 (DA-2) |
| `apps/admin/rest/src/…` (hook y helper nuevos) | `useShopUrl()` / `shopUrl()`; el agente decide la ubicación |
| Los 8 archivos con `NEXT_PUBLIC_SHOP_URL` | Usar el hook o el helper |
| `apps/admin/rest/.env.template` | `SHOP_URL` en lugar de `NEXT_PUBLIC_SHOP_URL` |
| `justfile` (`env`) | Añadir `SHOP_URL` si falta |
| `apps/README.md` | Fila de `SHOP_URL` en la tabla de variables |

## Definición de Done

- [ ] CA-1 a CA-4 verificados, con la salida real pegada en "Resultado".
- [ ] Status en `Implementado` y fila del Épico 13 marcada.

## Riesgos

- **R-1 — `routes.ts` es síncrono.** El helper necesita el valor ya cargado.
  Si se llama antes de que llegue, devuelve `undefined` y quien lo llama no
  pinta el enlace (DA-2).
- **R-2 — i18n.** `/api/runtime-config` no lleva locale; comprobar que el
  `fetch` desde páginas con prefijo de idioma (`/es/...`) llega a la ruta.

## Notas para el agente ejecutor

- Ejecutar después de US-102: sin el prefijo `/backend`, `/api/*` del admin
  puede chocar con el `rewrites()` de desarrollo.
- Las decisiones están fijadas; si una choca con el código, **detente y
  pregunta**.
