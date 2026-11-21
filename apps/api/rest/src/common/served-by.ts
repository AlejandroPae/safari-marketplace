import { hostname } from 'node:os';
import type { NextFunction, Request, Response } from 'express';

/**
 * Identifica la réplica que atiende. En un contenedor, el hostname
 * es el id corto del contenedor (12 hex), así que con varias réplicas detrás
 * del balanceador se ve cuál respondió cada petición. En `api-dev` es el
 * nombre del equipo.
 */
export const INSTANCE = hostname();

/**
 * Pone `X-Served-By: <INSTANCE>` en TODAS las respuestas. Es un middleware de
 * Express, no un interceptor de Nest, para cubrir también las que no llegan a
 * un controlador: los 401 de los guards y los 404 de rutas inexistentes.
 */
export function servedBy(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Served-By', INSTANCE);
  next();
}
