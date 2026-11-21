import { GetStaticProps } from 'next';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { API_ENDPOINTS } from './client/api-endpoints';
import client from './client';
import { HttpError } from './client/http-client';
import { isNotFound } from './ssr-resilience';
import { QueryOptions, SettingsQueryOptions } from '@/types';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  const queryClient = new QueryClient();

  try {
    const settingsData = await queryClient.fetchQuery({
      queryKey: [API_ENDPOINTS.SETTINGS, { language: locale }],
      queryFn: ({ queryKey }) =>
        client.settings.all(queryKey[1] as SettingsQueryOptions),
    });

    const data = await queryClient.fetchQuery({
      queryKey: [API_ENDPOINTS.BECAME_SELLER, { language: locale }],
      queryFn: ({ queryKey }) =>
        client.becomeSeller.get(queryKey[1] as QueryOptions),
    });

    return {
      props: {
        data: {
          ...data,
          page_options: {
            ...data.page_options,
            page_options: {
              ...data.page_options.page_options,
              isMultiCommissionRate: settingsData.options.isMultiCommissionRate,
            },
          },
        },
        ...(await serverSideTranslations(locale!, ['common'])),
        dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
      },
      revalidate: 60,
    };
  } catch (error) {
    if (isNotFound(error)) return { notFound: true };
    // La página necesita `data` del servidor y no hay hook de
    // cliente que la rescate. Lanzar mataría el build sin API, así que ante
    // un fallo de la API sale un 404 que se regenera a los 10 s, cuando la
    // API vuelve. Un error que no es de la API es un bug: se relanza.
    if (!(error instanceof HttpError)) throw error;
    console.warn(
      `[ssr] become-seller: sin datos de servidor, 404 temporal: ${error.message}`,
    );
    return { notFound: true, revalidate: 10 };
  }
};
