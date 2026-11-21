# US-114 — Correcciones de las guías de despliegue

> Las guías dicen lo mismo que el código, entre sí y con un solo juego de
> valores de ejemplo.

**Épico:** [Épico 16](./README.md)
**Fecha:** 2026-11-21
**Status:** Listo para ejecución (promovida desde `_backlog/`, refinada con fable; partida en US-114 y US-116)
**Depende de:** cierre de US-111 (comparte `docs/dokploy/`)
**LOC est.:** ~150 de documentación

## Historia
**Como** estudiante que sigue las guías, **quiero** que cada paso funcione tal
como está escrito, **para** no trabarme en contradicciones que solo el docente
sabe resolver.

## Contexto
Revisión del 2026-11-20 (fable, solo lectura): las guías de `docs/github`,
`docs/cloudflare` y `docs/dokploy` están completas, pero tienen afirmaciones
falsas, pasos que asumen cosas no explicadas y valores de ejemplo distintos en
cada archivo. Esta US corrige eso; el punto de entrada y la guía del fork van
en la US-116.

## Refinamiento — Decisiones tomadas
| # | Decisión |
|---|---|
| D-1 | **Placeholders y ejemplos se distinguen.** Los `<tu-dominio>`, `<usuario>`, `<tu-usuario-de-docker-hub>` se quedan. Solo se unifican los ejemplos concretos: usuario `ana-dev`, dominio `ana-lab.dev`, etiqueta `sha-4fcb7f1`. |
| D-2 | **`deploy.variables.example` lleva placeholders evidentes**, no ejemplos: un valor olvidado no debe desplegar imágenes de una cuenta ajena. |
| D-3 | **Terraform:** se quita del README raíz. Se propone al dueño el texto nuevo de `CLAUDE.md:11-13` y de la nota del Épico 16 (`README.md:69-71`); no se editan sin su autorización. |
| D-4 | **Enlaces:** se verifican con un comando puntual (script de node o `grep`) cuya salida va al DoD; no se agrega una receta ni un paso del CI. Alcance: `docs/github`, `docs/cloudflare`, `docs/dokploy`, README raíz y `apps/README.md`. |
| D-5 | **La prueba en limpio** la hace el dueño al cerrar la US-111 en el VPS (CA-5 a CA-7 de esa US); no es criterio de esta. |

## Scope
**Incluye:**
1. README raíz:
   - quitar «Terraform» y «Orm» y nombrar Dokploy;
   - aclarar que la insignia del CI es la del repositorio original. El enlace
     a `docs/README.md` lo agrega la US-116.
2. `apps/README.md`:
   - cinco imágenes, si la US-113 no lo hizo antes;
   - unificar `sha-1a2b3c4` y `tienda.example.com`/`admin.example.com`
     (`:614-616`, `:707`, `:729-730`).
3. `docs/dokploy/03-instalar-dokploy.md`:
   - SSH con el usuario de la VM (`azureuser` en el ejemplo de Azure) y
     `ssh -i <llave>.pem`;
   - el instalador con `sudo`.
4. `docs/github/secretos-github-actions.md`: vigencia del token de 90 días o
   la duración del curso (hoy «30 days», `:59`), con aviso de cuándo
   renovarlo.
5. `docs/dokploy/11-limitaciones-y-problemas.md`: el 404 de `/become-seller`
   en la primera visita después de desplegar (`apps/README.md:698-699`).
6. `docs/dokploy/01-antes-de-empezar.md`:
   - el dominio y el VPS se hacen en paralelo (la dependencia cruzada con
     Cloudflare 03);
   - unificar `sha-xxxxxxx` (`:38`).
7. Ejemplos concretos unificados según D-1 en `docs/github`, `docs/cloudflare`
   y `docs/dokploy`.
8. `deploy.variables.example` según D-2.
9. Nota de Git Bash o WSL donde las guías usan bash
   (`docs/dokploy/06-variables.md:17` y `09-contrasenas-demo.md:23-32`).

**NO incluye:**
- El CI en forks (US-113) ni el punto de entrada y la guía del fork (US-116).
- Archivar `docs/product/` (US-115).
- Renombrar carpetas, mover `docs/pickbazar/` o reescribir lo que funciona.
- Una guía de operación (renovar token, logs, respaldo, apagar la VM).
- Editar `CLAUDE.md` (D-3).

## Criterios de aceptación
### CA-1 — README raíz sin afirmaciones falsas
No menciona Terraform ni «Orm», nombra Dokploy y aclara la insignia.

### CA-2 — Correcciones puntuales aplicadas
Los puntos 2 a 6 y 9 de Scope están aplicados.

### CA-3 — Un solo juego de ejemplos
Un `grep` de los ejemplos viejos en el alcance de D-4 da 0: `mi-usuario`,
`tu-dominio.com`, `sha-1234567`, `sha-1a2b3c4`, `sha-xxxxxxx`,
`tienda.example.com` y `admin.example.com`. Las capturas quedan fuera.

### CA-4 — Plantilla segura
`deploy.variables.example` no trae ningún valor que funcione si se deja sin
cambiar.

### CA-5 — Enlaces sanos
El chequeo de D-4 no encuentra enlaces relativos rotos.

## Escenarios Gherkin
```gherkin
Feature: Guías de despliegue coherentes
  Scenario: CA-3 — un solo juego de ejemplos
    When se buscan los ejemplos viejos en las guías
    Then no aparece ninguno fuera de las capturas

  Scenario: CA-4 — plantilla segura
    Given un estudiante que copia deploy.variables.example sin cambiar un valor
    Then el despliegue falla con un mensaje, no despliega imágenes ajenas
```

## Archivos a crear / modificar
| Archivo | Cambio |
|---------|--------|
| `README.md` | Afirmaciones falsas e insignia |
| `apps/README.md` | Cinco imágenes y ejemplos |
| `docs/dokploy/01`, `03`, `11` | Correcciones puntuales |
| `docs/dokploy/06`, `09` | Nota de Git Bash o WSL |
| `docs/github/secretos-github-actions.md` | Vigencia del token y ejemplos |
| `docs/cloudflare/03-registros-dns.md` | Ejemplos |
| `deploy.variables.example` | Placeholders (D-2) |

## Definición de Done
- [ ] Salida del `grep` de CA-3 y del chequeo de enlaces de CA-5 pegada.
- [ ] Texto propuesto para `CLAUDE.md:11-13` y la nota del Épico 16
      entregado al dueño (D-3).
- [ ] Lint: no aplica (solo Markdown y la plantilla).

## Notas para el agente ejecutor
- Prosa en español neutral. Las guías mantienen su formato numerado, la barra
  de navegación y las líneas de captura.
- `deploy.variables.example` no lleva `.env` en el nombre a propósito (hook).
- No ejecutar en paralelo con la US-111, la US-113 ni la US-116: comparten
  archivos.
