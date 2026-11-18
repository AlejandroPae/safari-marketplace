# US-99 — Los `console.log` heredados de la API pasan al Logger

> Quedan 21 `console.log` de Pickbazar en `apps/api/rest/src`. Uno imprime el
> `access_token` del login social, que es real cuando el login con Google de
> US-70 está activo. Pasan todos al Logger de Nest de US-17, sin volcar datos
> sensibles, y una regla de lint impide que vuelvan.

**Fecha:** 2026-11-18
**Status:** Listo para ejecución — con propuesta por defecto en DA-1..DA-4;
el ejecutor las confirma con el dueño antes de tocar código.
**Depende de:** [US-17](./16-despliegue-observabilidad/17-salud-logging-api.md)
(el Logger con timestamp ISO y nivel ya está en `main`)
**LOC est.:** ~200

## Historia

**Como** operador de la API, **quiero** que todo lo que la API escribe en el
log pase por el Logger de Nest y nunca incluya tokens, cuerpos de request ni
datos personales, **para** poder guardar y compartir los logs sin filtrar
secretos, y que cada línea tenga timestamp y nivel.

## Contexto — verificado en código (2026-11-18, `main` @ `f840a36`)

US-17 dejó el Logger de la API configurado:

- `IsoConsoleLogger` en `src/common/logging.ts`: timestamp ISO 8601 UTC y
  nivel.
- Una línea `[HTTP]` por request.
- Los errores de Prisma pasan por `setPrismaLogSink`.

Su Resultado anotó que 21 `console.log` se saltan ese Logger. Lo que imprime
cada uno:

| Archivo | Líneas | Qué imprime | Riesgo |
|---|---|---|---|
| `auth/auth.service.ts` | 321 | el `SocialLoginDto` entero: `{ provider, access_token }` | **Alto.** El shop monta `<SocialLogin />` en `_app.tsx`. Con Google configurado (US-70), tras la sesión de next-auth hace `POST /social-login-token` (`@Public()`) con el **access token real de Google**, y la API lo imprime en claro. El endpoint sigue siendo el stub D-11. |
| `users/users.controller.ts` | 87, 92 | `CreateProfileDto` y `UpdateProfileDto` completos | Datos personales: `contact`, `bio`, `socials`, avatar. Son stubs: no guardan nada, solo imprimen. |
| `uploads/uploads.controller.ts` | 17 | el array de `Express.Multer.File` | El `buffer` del archivo subido entero, más el nombre original y el mimetype. Un archivo grande inunda el log. |
| `imports/imports.controller.ts` | 16, 21, 26 | el `ImportDto` de cada import | El cuerpo entero del request. Son stubs que devuelven `true`. |
| `payment/stripe-payment.service.ts` | 41, 53, 64, 84, 98, 118, 137, 151, 169, 183 | el objeto de error de Stripe, en los `catch` | El error completo (`raw`, cabeceras de respuesta, `requestId`). Además, el `catch` traga el error y el método devuelve `undefined`. |
| `payment/paypal-payment.service.ts` | 42 | el error de PayPal, en el `catch` | Igual que Stripe. |
| `payment-method/payment-method.service.ts` | 49, 94 | el error al guardar la tarjeta | Igual. |
| `payment-intent/payment-intent.controller.ts` | 10 | el literal `'payment_intent', 'payment_intent'` | Ruido sin información. |

Total: 1 + 2 + 1 + 3 + 10 + 1 + 2 + 1 = **21**. No hay `console.error`,
`console.warn`, `console.info` ni `console.debug` en `src/` fuera de los
specs.

Las líneas de `console.log` salen sin el prefijo `[Nest] pid - timestamp
NIVEL [Contexto]`. Por eso US-17 no pudo cerrar del todo su CA-3 («cada línea
de log lleva timestamp y nivel»): quedó documentado como excepción.

## Decisiones abiertas — con propuesta por defecto

**DA-1 — Qué registra `socialLogin`.**
Propuesta: `Logger.warn` con el `provider` y nada más, por ejemplo
`social-login es un stub (D-11): provider=google`. Nunca el `access_token`,
ni enmascarado ni sus primeros caracteres. Alternativa: no registrar nada.
Se descarta porque el `warn` avisa en el log de que alguien usa un login que
no funciona.

**DA-2 — Qué registran los stubs que imprimen cuerpos** (`imports`, `uploads`,
`profiles`).
Propuesta: una línea `Logger.warn` que diga que la ruta es un stub, con
metadatos que no son contenido:

- `uploads`: número de archivos, más `mimetype` y `size` de cada uno. Ni
  `buffer` ni `originalname`, porque el nombre de archivo puede traer datos
  personales.
- `imports`: solo el nombre de la ruta.
- `profiles`: solo el `id` de la ruta (en el `PUT`).

Alternativa: borrar la línea sin reemplazo.

**DA-3 — Los `catch` de pagos.**
Propuesta: `Logger.error` con `error.message` y el `stack`, nunca el objeto
de error entero. El flujo no se toca: el `catch` sigue devolviendo lo mismo
que hoy (`undefined`, o `this.paymentMethods[0]`). Que trague el error es un
defecto aparte (ver «NO incluye»).

**DA-4 — Cómo se impide que vuelvan.**
Propuesta: `'no-console': 'error'` en `apps/api/rest/eslint.config.mjs`
para `src/**/*.ts`, con excepción para `*.spec.ts`, que espían la consola.
Así `npx eslint` falla con cualquier `console.*` nuevo. `main.ts` ya no usa
`console` desde US-17.

## Scope

**Incluye:**

- Reemplazar los 21 `console.log` de `apps/api/rest/src` por el Logger de
  Nest, con un `new Logger(Clase.name)` por clase, según DA-1..DA-3.
- La regla `no-console` de DA-4.
- Specs que fijen las dos garantías que importan: que `socialLogin` no
  registra el `access_token` y que `uploads` no registra el `buffer`.

**NO incluye:**

- Cambiar el contrato HTTP de ninguna ruta. Los stubs siguen devolviendo lo
  mismo: `socialLogin` su respuesta fija, `imports` `true`, `profiles`
  `undefined`.
- Arreglar que los `catch` de pagos se traguen el error. Es un defecto de
  comportamiento: se menciona y encaja con
  [US-87](./75-actualizacion-dependencias/87-stripe-sdks.md).
- Implementar el login social de verdad (D-11).
- Logs de shop y admin, que son frontends; `services/scraper-worker`, que es
  Python; y los scripts de `db/`.
- Redactar campos sensibles de forma genérica (un interceptor o un
  serializador).

## Criterios de aceptación

### CA-1 — El token del login social no llega al log

`POST /api/social-login-token` con
`{"provider":"google","access_token":"zz-token-de-prueba"}` responde lo mismo
que hoy, y en el log de la API no aparece `zz-token-de-prueba`. La línea que
queda, si DA-1 la mantiene, lleva timestamp, nivel `WARN` y contexto
`[AuthService]`.

### CA-2 — Cero `console.*` en el código de la API

`grep -rn "console\." apps/api/rest/src --include=*.ts`, quitando los
`*.spec.ts`, da 0. `npx eslint "{src,apps,libs,test}/**/*.ts"` sale limpio
con la regla de DA-4 activa.

### CA-3 — Las líneas que quedan pasan por el Logger y no llevan datos

Cada ruta tocada registra, si registra, a través del Logger: timestamp ISO,
nivel y contexto. Ninguna línea incluye cuerpos de request, `buffer` de
archivos ni objetos de error completos. Evidencia: fragmento real del log
tras llamar a `social-login-token`, `uploads` (un archivo pequeño), un
`import-*` y `PUT /profiles/:id` (`ADMIN_ONLY`).

### CA-4 — La regla de lint funciona

Se mete un `console.log('x')` temporal en un archivo de `src/`, se corre
`npx eslint` y falla con `no-console`, con la salida pegada. Después se
quita.

### CA-5 — Sin regresión

`npx vitest run` (desde `C:\`), `npx tsc --noEmit -p tsconfig.json`,
`just build-api` y `just verify` en verde, con recuentos.

## Escenarios Gherkin

```gherkin
Feature: El log de la API no filtra secretos
  Scenario: CA-1 — token del login social
    Given la API corriendo
    When POST /api/social-login-token con un access_token de prueba
    Then la respuesta es la misma de antes
    And el log no contiene el access_token

  Scenario: CA-4 — un console.log nuevo no pasa el lint
    Given un console.log añadido en src/
    When corro npx eslint
    Then falla con la regla no-console
```

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/rest/src/auth/auth.service.ts` | `socialLogin`: Logger sin el token (DA-1) |
| `apps/api/rest/src/users/users.controller.ts` | `createProfile` y `updateProfile` (DA-2) |
| `apps/api/rest/src/uploads/uploads.controller.ts` | metadatos sin `buffer` (DA-2) |
| `apps/api/rest/src/imports/imports.controller.ts` | los 3 stubs (DA-2) |
| `apps/api/rest/src/payment/stripe-payment.service.ts` | 10 `catch` (DA-3) |
| `apps/api/rest/src/payment/paypal-payment.service.ts` | 1 `catch` (DA-3) |
| `apps/api/rest/src/payment-method/payment-method.service.ts` | 2 `catch` (DA-3) |
| `apps/api/rest/src/payment-intent/payment-intent.controller.ts` | quitar el literal |
| `apps/api/rest/eslint.config.mjs` | `no-console` (DA-4) |
| specs de `auth` y `uploads` | el token y el `buffer` no se registran |

## Definición de Done

- [ ] DA-1..DA-4 confirmadas por el dueño, citadas en el reporte.
- [ ] `grep` del CA-2 en 0, con la salida pegada.
- [ ] Fragmento real del log del CA-1 y del CA-3 pegado.
- [ ] Salida de `npx eslint` en rojo con el `console.log` temporal (CA-4) y
      en verde sin él.
- [ ] Lint sin escribir en 0 en la API, con la salida pegada
      (`npx eslint "{src,apps,libs,test}/**/*.ts"`; nunca `yarn lint`, que
      lleva `--fix`).
- [ ] `npx vitest run`, `tsc`, `just build-api` y `just verify` en verde, con
      recuentos.
- [ ] Status de esta US actualizado y su línea marcada en el mapa del
      backlog.

## Notas para el agente ejecutor

- **No va en paralelo con US-87** (Stripe SDKs): las dos tocan
  `stripe-payment.service.ts`. Tampoco con **US-74** (fronteras de
  arquitectura): las dos tocan `eslint.config.mjs`. El orden entre ellas da
  igual; quien llegue segunda rebasea.
- **Apagar los servidores desde su raíz.** Matar el PID del puerto deja vivo
  `nest start --watch`, que relanza la API huérfana y falsea la evidencia
  (Resultado de US-17).
- Antes de cambiar nada, comprobar el conteo con el `grep` del CA-2. Si ya
  no es 21, el `main` se movió: actualizar la tabla del Contexto antes de
  seguir.
- El `access_token` de prueba del CA-1 tiene que ser un literal inventado
  (`zz-token-de-prueba`). Nunca un token real de Google.
