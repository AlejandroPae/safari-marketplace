import type { Product } from '@/types';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import client from './client';
import { isNotFound, warnFailedQueries } from './ssr-resilience';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/framework/client/api-endpoints';
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
  product: Product;
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
    const product = await client.products.get({ slug, language: locale });
    warnFailedQueries(queryClient, `product/${slug}`);
    return {
      props: {
        product,
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
