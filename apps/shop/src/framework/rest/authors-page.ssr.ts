import type { SettingsQueryOptions, TypeQueryOptions } from '@/types';
import type { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import { QueryClient, useQuery, dehydrate } from '@tanstack/react-query';
import client from './client';
import { warnFailedQueries } from './ssr-resilience';
import { API_ENDPOINTS } from './client/api-endpoints';
import { TYPES_PER_PAGE } from './client/variables';

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: [API_ENDPOINTS.SETTINGS, { language: locale }],
    queryFn: ({ queryKey }) =>
      client.settings.all(queryKey[1] as SettingsQueryOptions),
  });
  await queryClient.prefetchQuery({
    queryKey: [
      API_ENDPOINTS.TYPES,
      { limit: TYPES_PER_PAGE, language: locale },
    ],
    queryFn: ({ queryKey }) =>
      client.types.all(queryKey[1] as TypeQueryOptions),
  });
  await queryClient.prefetchInfiniteQuery({
    queryKey: [API_ENDPOINTS.AUTHORS, { limit: 30, language: locale }],
    queryFn: ({ queryKey }) => client.authors.all(queryKey[1] as any),
    initialPageParam: undefined,
  });
  warnFailedQueries(queryClient, 'authors');
  return {
    props: {
      ...(await serverSideTranslations(locale!, ['common', 'banner'])),
      dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
    },
    // D-3 (US-104): se regenera con datos reales en vez de quedar congelada
    // con los del build.
    revalidate: 60,
  };
};
