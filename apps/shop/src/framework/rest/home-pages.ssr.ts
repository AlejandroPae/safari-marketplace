import type {
  CategoryQueryOptions,
  HomePageProps,
  PopularProductQueryOptions,
  SettingsQueryOptions,
  TypeQueryOptions,
  BestSellingProductQueryOptions,
} from '@/types';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import client from './client';
import { API_ENDPOINTS } from './client/api-endpoints';
import {
  CATEGORIES_PER_PAGE,
  PRODUCTS_PER_PAGE,
  TYPES_PER_PAGE,
} from './client/variables';

type ParsedQueryParams = {
  pages: string[];
};

// D-1 (US-104): sin prerender de rutas dinámicas. El build no llama a la API;
// cada página se genera en su primera visita, con datos del entorno donde
// corre. `[]` también para la raíz del inicio: `[[...pages]]` genera `/` en
// la primera visita igual que el resto.
export const getStaticPaths: GetStaticPaths<ParsedQueryParams> = async () => ({
  paths: [],
  fallback: 'blocking',
});

export const getStaticProps: GetStaticProps<
  HomePageProps,
  ParsedQueryParams
> = async ({ locale, params }) => {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: [API_ENDPOINTS.SETTINGS, { language: locale }],
    queryFn: ({ queryKey }) =>
      client.settings.all(queryKey[1] as SettingsQueryOptions),
  });
  const types = await queryClient.fetchQuery({
    queryKey: [
      API_ENDPOINTS.TYPES,
      { limit: TYPES_PER_PAGE, language: locale },
    ],
    queryFn: ({ queryKey }) =>
      client.types.all(queryKey[1] as TypeQueryOptions),
  });

  const { pages } = params!;
  let pageType: string | undefined;
  if (!pages) {
    pageType =
      types.find((type) => type?.settings?.isHome)?.slug ?? types?.[0]?.slug;
  } else {
    pageType = pages[0];
  }

  if (!types?.some((t) => t.slug === pageType)) {
    return {
      notFound: true,
      // This is require to regenerate the page
      revalidate: 120,
    };
  }

  await queryClient.prefetchQuery({
    queryKey: [API_ENDPOINTS.TYPES, { slug: pageType, language: locale }],
    queryFn: ({ queryKey }: any) => client.types.get(queryKey[1]),
  });
  const productVariables = {
    type: pageType,
    limit: PRODUCTS_PER_PAGE,
  };
  await queryClient.prefetchInfiniteQuery({
    queryKey: [
      API_ENDPOINTS.PRODUCTS,
      { limit: PRODUCTS_PER_PAGE, type: pageType, language: locale },
    ],
    queryFn: ({ queryKey }) => client.products.all(queryKey[1] as any),
    initialPageParam: undefined,
  });

  const popularProductVariables = {
    type_slug: pageType,
    limit: 10,
    with: 'type;author',
    language: locale,
  };

  // Only prefetch popular products for `book` demo
  if (pageType === 'book') {
    await queryClient.prefetchQuery({
      queryKey: [API_ENDPOINTS.PRODUCTS_POPULAR, popularProductVariables],
      queryFn: ({ queryKey }) =>
        client.products.popular(queryKey[1] as PopularProductQueryOptions),
    });

    await queryClient.prefetchQuery({
      queryKey: [API_ENDPOINTS.BEST_SELLING_PRODUCTS, popularProductVariables],
      queryFn: ({ queryKey }) =>
        client.products.bestSelling(
          queryKey[1] as BestSellingProductQueryOptions,
        ),
    });
  }

  const categoryVariables = {
    type: pageType,
    limit: CATEGORIES_PER_PAGE,
    language: locale,
    parent:
      types.find((t) => t.slug === pageType)?.settings.layoutType === 'minimal'
        ? 'all'
        : 'null',
  };
  await queryClient.prefetchInfiniteQuery({
    queryKey: [API_ENDPOINTS.CATEGORIES, categoryVariables],
    queryFn: ({ queryKey }) =>
      client.categories.all(queryKey[1] as CategoryQueryOptions),
    initialPageParam: undefined,
  });
  return {
    props: {
      variables: {
        popularProducts: popularProductVariables,
        products: productVariables,
        categories: categoryVariables,
        bestSellingProducts: popularProductVariables,
        layoutSettings: {
          ...types.find((t) => t.slug === pageType)?.settings,
        },
        types: {
          type: pageType,
        },
      },
      layout:
        types.find((t) => t.slug === pageType)?.settings.layoutType ??
        'default',
      ...(await serverSideTranslations(locale!, ['common', 'banner'])),
      dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
    },
    revalidate: 120,
  };
};

/* Fix : locales: 14kB,
popularProducts: 30kB,
category: 22kB,
groups: 8kB,
group: 2kB,
settings: 2kB,
perProduct: 4.2 * 30 = 120kB,
total = 14 + 30 + 22 + 8 + 2 + 2 + 120 = 198kB
others: 225 - 198 = 27kB

 */
