import type { Manufacturer, SettingsQueryOptions } from '@/types';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import client from './client';
import { isNotFound, warnFailedQueries } from './ssr-resilience';
import { PRODUCTS_PER_PAGE, TYPES_PER_PAGE } from './client/variables';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/framework/client/api-endpoints';

// This function gets called at build time
type ParsedQueryParams = {
  manufacturer: string;
};
// Sin prerender de rutas dinámicas. El build no llama a la API;
// cada página se genera en su primera visita, con datos del entorno donde
// corre.
export const getStaticPaths: GetStaticPaths<ParsedQueryParams> = async () => ({
  paths: [],
  fallback: 'blocking',
});
type PageProps = {
  manufacturer: Manufacturer;
};
export const getStaticProps: GetStaticProps<
  PageProps,
  ParsedQueryParams
> = async ({ params, locale }) => {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: [API_ENDPOINTS.SETTINGS, { language: locale }],
    queryFn: ({ queryKey }) =>
      client.settings.all(queryKey[1] as SettingsQueryOptions),
  });

  try {
    const manufacturer = await client.manufacturers.get({
      slug: params!.manufacturer,
      language: locale,
    });
    warnFailedQueries(queryClient, `manufacturer/${params!.manufacturer}`);
    return {
      props: {
        manufacturer,
        variables: {
          limit: PRODUCTS_PER_PAGE,
          manufacturer: manufacturer?.slug,
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
