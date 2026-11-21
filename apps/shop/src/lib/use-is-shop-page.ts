import { useRouter } from 'next/router';

// Las páginas de una tienda (`/shops/[slug]` y sus pestañas). Solo ahí el
// `slug` de la ruta es el de una tienda; en `/products/[slug]` es el del
// producto.
export function useIsShopPage() {
  const router = useRouter();
  return router.pathname.startsWith('/shops/[slug]');
}
