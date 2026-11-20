# safari-marketplace
[![CI](https://github.com/rcuello/safari-marketplace/actions/workflows/ci.yml/badge.svg)](https://github.com/rcuello/safari-marketplace/actions/workflows/ci.yml)

Monorepo didáctico para enseñar sistemas distribuidos. Integra scraping avanzado (Python/Playwright), orquestación de datos, interfaces modernas (Next.js) y despliegue automatizado con Terraform, Docker y Orm.

Cada push a `main` y cada PR corren en GitHub Actions los pasos de `just check` (lint, typecheck y tests del monorepo) y los builds de la API, el admin y la tienda, cada uno como un step propio y con una tabla de resumen al final. En local es la misma lista: `just check`, `just check <id>` para un solo paso y `just check-full` con los builds (`apps/README.md`).
