import { useQuery } from '@tanstack/react-query';

/**
 * URL pública de la tienda, leída al ejecutar desde `/api/runtime-config`
 * (US-103, D-3). Mientras no llega, o si la ruta falla (falta `SHOP_URL`),
 * vale `undefined` y quien la usa no pinta el enlace (DA-2).
 */
let cached: string | undefined;

async function fetchShopUrl(): Promise<string> {
  const response = await fetch('/api/runtime-config');
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message ?? 'runtime-config failed');
  cached = body.shopUrl;
  return body.shopUrl;
}

/**
 * Hook para componentes: devuelve la URL base de la tienda (sin `/` final), o
 * `undefined` hasta tenerla. Se pide una vez por pestaña.
 */
export function useShopUrl(): string | undefined {
  const { data } = useQuery({
    queryKey: ['runtime-config', 'shopUrl'],
    queryFn: fetchShopUrl,
    staleTime: Infinity,
    retry: false,
    enabled: typeof window !== 'undefined',
  });
  return data;
}

/**
 * Para código fuera de React (`config/routes.ts`): la URL de `path` en la
 * tienda, o `undefined` si la URL base aún no se cargó. El componente que la
 * pinta llama antes a `useShopUrl()`, que la carga y lo vuelve a renderizar.
 */
export function shopUrl(path: string): string | undefined {
  return cached ? `${cached}${path}` : undefined;
}
