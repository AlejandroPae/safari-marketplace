import type { QueryClient } from '@tanstack/react-query';
import { HttpError } from './client/http-client';

/**
 * Resiliencia de las páginas estáticas ante una API caída (US-104).
 *
 * `prefetchQuery` y `prefetchInfiniteQuery` nunca lanzan: si la API falla, la
 * query queda en estado `error` y `dehydrate` la omite. La página se genera
 * sin esos datos y el cliente los pide al montar. Esto hace visible lo que
 * hoy pasa en silencio:
 *
 * - un `HttpError` (red caída, timeout, 5xx, 4xx o falta `API_INTERNAL_URL`)
 *   deja una línea en el log por query y la página sigue (D-2);
 * - cualquier otro error es un bug de código: se relanza (R-4).
 *
 * Se llama después de los prefetch y antes de `dehydrate`.
 */
export function warnFailedQueries(queryClient: QueryClient, page: string) {
  for (const query of queryClient.getQueryCache().getAll()) {
    const { error } = query.state;
    if (!error) continue;
    if (!(error instanceof HttpError)) throw error;
    console.warn(
      `[ssr] ${page}: sin datos de servidor para ${JSON.stringify(query.queryKey)}: ${error.message}`,
    );
  }
}

/**
 * La API respondió 404: el recurso no existe (D-4). Un fallo de red, un
 * timeout o un 5xx NO lo son: quien llama lanza el error para que Next no
 * cachee un 404 y siga sirviendo la última página buena.
 */
export function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}
