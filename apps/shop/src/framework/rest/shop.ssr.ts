import type { ProductQueryOptions, Shop } from '@/types';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import client from './client';
import { isNotFound, warnFailedQueries } from './ssr-resilience';
import { API_ENDPOINTS } from './client/api-endpoints';
import { PRODUCTS_PER_PAGE } from './client/variables';
import { SettingsQueryOptions } from '@/types';

// This function gets called at build time
type ParsedQueryParams = {
  slug: string;
};
// Sin prerender de rutas dinámicas. El build no llama a la API;
// cada página se genera en su primera visita, con datos del entorno donde
// corre.
export const getStaticPaths: GetStaticPaths<ParsedQueryParams> = async () => ({
  paths: [],
  fallback: 'blocking',
});
type PageProps = {
  shop: Shop;
  variables: {
    shop_id: string;
    limit: number;
  };
};
export const getStaticProps: GetStaticProps<
  PageProps,
  ParsedQueryParams
> = async ({ params, locale }) => {
  const { slug } = params!; //* we know it's required because of getStaticPaths
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: [API_ENDPOINTS.SETTINGS, { language: locale }],
    queryFn: ({ queryKey }) =>
      client.settings.all(queryKey[1] as SettingsQueryOptions),
  });
  try {
    const shop = await client.shops.get(slug);
    await queryClient.prefetchInfiniteQuery({
      queryKey: [
        API_ENDPOINTS.PRODUCTS,
        { limit: PRODUCTS_PER_PAGE, shop_id: shop.id, language: locale },
      ],
      queryFn: ({ queryKey }) =>
        client.products.all(queryKey[1] as ProductQueryOptions),
      initialPageParam: undefined,
    });
    warnFailedQueries(queryClient, `shop/${slug}`);
    return {
      props: {
        shop,
        variables: {
          shop_id: shop?.id,
          limit: PRODUCTS_PER_PAGE,
        },
        ...(await serverSideTranslations(locale!, ['common'])),
        dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
      },
      revalidate: 60,
    };
  } catch (error) {
    // 404 solo si la API dice que no existe. Red caída, timeout
    // o 5xx se lanzan: Next no cachea la respuesta y conserva la última
    // página buena.
    if (isNotFound(error)) return { notFound: true };
    throw error;
  }
};
