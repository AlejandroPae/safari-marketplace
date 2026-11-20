# US-112 — Despliegue continuo a Dokploy desde el CI, con vuelta atrás

> Con el compose de despliegue y el primer despliegue manual (US-111), falta
> que cada push a `main` en verde quede publicado solo: un job `deploy` del CI
> le dice a Dokploy qué etiqueta desplegar, espera a ver esa versión en
> producción, y permite volver a una versión anterior.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-20
**Status:** Listo para ejecución. Sale del borrador
`_backlog/111-despliegue-en-dokploy.md`, que el dueño partió en dos el
2026-11-20 tras la revisión del sub-agente fable 5. El dueño fijó la señal de
versión (D-3) y verificar el OpenAPI de Dokploy antes de tocar las variables
(D-2).
**Depende de:** US-110 (imágenes, `revision` en `/api/health`) y US-111
(compose de despliegue y primer despliegue).
**LOC est.:** ~100, más una sección de la guía

## Historia

**Como** docente, **quiero** que cada push a `main` en verde se despliegue
solo en mi VPS y poder volver a la versión anterior con un clic, **para**
mostrar a los grupos un despliegue continuo de verdad, con su red de
seguridad.

## Contexto (verificado el 2026-11-20 sobre `main` @ `5d168a0`)

- El CI es un solo workflow (`ci.yml`, D-8 de US-109): `check` → `images`
  (US-110) → `deploy`.
- `concurrency` no cancela en `main` (US-110 D-9).
- `images` se salta cuando un `workflow_dispatch` trae la entrada
  `image_tag` (US-110 D-3).
- La etiqueta es `sha-<7 primeros de github.sha>` (US-110 D-2) y es el
  `IMAGE_TAG` del Compose (US-111 D-2).
- `/api/health` devuelve `revision` con el SHA de la imagen de la API
  (US-110 D-7); por la tienda se lee en `https://tienda.<dominio>/backend/health`.
- **API de Dokploy** (documentación consultada por el dueño el 2026-11-20;
  el ejecutor la verifica):
  - se autentica con la cabecera `x-api-key`;
  - `POST /api/compose.deploy` recibe `{ "composeId": "..." }`;
  - el webhook de Docker Hub hacia Dokploy solo existe para *Applications*,
    no para *Compose*, por eso el disparo lo hace el CI.
- **Pendientes de verificar contra el OpenAPI de la versión instalada:**
  - cómo se cambia una variable del Compose;
  - si `compose.deploy` es asíncrono.
- El auto-deploy por push de Dokploy está **apagado** (US-111 D-5).

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| D-1 | Job `deploy` | `needs: [check, images]`, dentro del environment de GitHub `produccion` (restringido a la rama `main`). Corre en push a `main` y en `workflow_dispatch` **solo desde `refs/heads/main`**, con `if:` explícito; nunca en `pull_request`. Tiene su propio `concurrency` (`deploy-produccion`, `cancel-in-progress: false`) y su `timeout-minutes`. |
| D-2 | Cambiar `IMAGE_TAG` | El ejecutor verifica **primero** en el OpenAPI de la instancia instalada cómo se actualiza una variable del Compose. Si se puede cambiar solo `IMAGE_TAG`, se hace así y después se llama a `compose.deploy`. Si la API solo permite reemplazar todo el bloque de variables (lo que haría pasar `JWT_SECRET` y el resto de secretos por el runner), **se detiene y pregunta** antes de implementarlo. Se anota la versión de Dokploy. |
| D-3 | Verificación por versión | Tras desplegar, el job espera hasta 5 min a que `https://tienda.<dominio>/backend/health` devuelva `revision` igual al SHA desplegado. Además, `https://tienda.<dominio>/en` y `https://admin.<dominio>/en/login` deben dar 200. Si no se cumple, el job falla. El resumen del job muestra la etiqueta, la `revision` vista y los códigos. |
| D-4 | Vuelta atrás | `workflow_dispatch` con la entrada opcional `image_tag`. Se valida con `^sha-[0-9a-f]{7}$` y se pasa siempre por `env:`, nunca como `${{ inputs.image_tag }}` dentro de `run:`. Con `image_tag`, `images` se salta y `deploy` comprueba que la etiqueta existe en Docker Hub (`docker buildx imagetools inspect`) antes de desplegarla. La verificación de D-3 compara contra el SHA de esa etiqueta. |
| D-5 | Secretos y variables | Secreto `DOKPLOY_API_KEY`, solo en el `env:` del step que llama a la API, con `curl --fail-with-body` y sin `-v`. Variables del environment `produccion`: `DOKPLOY_URL`, `DOKPLOY_COMPOSE_ID`, `DEPLOY_SHOP_URL` y `DEPLOY_ADMIN_URL`; con el prefijo `DEPLOY_` no se confunden con el `SHOP_URL` del Compose. El JSON se arma con `jq -n --arg`. El agente no crea ni lee estos valores. |
| D-6 | Guía | Una sección nueva en `docs/dokploy/README.md` (US-111): crear la API key, el environment `produccion`, los secretos y las variables, cómo leer el resumen del job y cómo volver atrás. Incluye el desfase de R-4 de US-111: el compose y `db/` son siempre los de HEAD. |

## Scope

**Incluye:**
- el job `deploy` y la entrada `image_tag` de `workflow_dispatch` en
  `.github/workflows/ci.yml`;
- la sección del CI en `docs/dokploy/README.md`.

**NO incluye:**
- cambios en el compose de despliegue (US-111);
- protección de `main`;
- despliegue sin corte;
- notificaciones;
- varios entornos (staging).

## Tareas del dueño (no las hace el agente)

1. En Dokploy: *Settings → API Keys*, generar una clave.
2. En GitHub: crear el environment `produccion`, restringido a `main`, con el
   secreto `DOKPLOY_API_KEY` y las variables de D-5.

## Criterios de aceptación

- **CA-1 — Contrato verificado.** Pegar la versión de Dokploy y los
  endpoints del OpenAPI que se usan (D-2), antes de escribir el job.
- **CA-2 — Despliegue real (con el dueño).** Un push a `main` dispara
  `check` → `images` → `deploy`. Dokploy despliega el SHA del commit y el
  resumen del job muestra la `revision` vista igual al SHA. Pegar el
  resumen.
- **CA-3 — Falla si no cambia la versión.** Con un `DOKPLOY_COMPOSE_ID`
  equivocado, o con el despliegue sin completar, el job falla en la
  verificación, no da verde.
- **CA-4 — Vuelta atrás (con el dueño).** Un `workflow_dispatch` con
  `image_tag` del SHA anterior despliega esa versión sin reconstruir
  imágenes: `images` aparece como omitido y `/backend/health` devuelve la
  `revision` anterior. Después se vuelve a la actual.
- **CA-5 — Entrada inválida.** `workflow_dispatch` con
  `image_tag=sha-xyz; echo hola` falla en la validación sin ejecutar nada.
- **CA-6 — Sin deploy en PR.** En un PR, el job `deploy` no aparece o sale
  omitido.

## Definición de Done

- [ ] CA-1, CA-5 y CA-6 verificados por el agente, y CA-2 a CA-4 con el
  dueño, con la salida real pegada en «Resultado».
- [ ] Sección de la guía revisada por el dueño.
- [ ] Status en `Implementado` y fila del épico marcada.

## Riesgos

- **R-1 — Contrato de la API de Dokploy.** Puede cambiar entre versiones. Se
  verifica contra el OpenAPI de la instancia y se anota la versión (CA-1).
- **R-2 — Despliegue asíncrono.** Si `compose.deploy` responde antes de
  terminar, solo la espera por `revision` (D-3) dice si funcionó.
- **R-3 — Corte de 1 a 2 min por despliegue** (US-111 D-7). La espera de D-3
  lo cubre.

## Notas para el agente ejecutor

- Leer antes US-110 y US-111 (sus «Resultado») y la documentación de la API
  de Dokploy de la versión instalada. No inventar endpoints.
- Las decisiones son del dueño. Si una choca con la documentación de Dokploy,
  **detente y pregunta**.
