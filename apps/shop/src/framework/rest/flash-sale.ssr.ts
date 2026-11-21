import type {
  FlashSale,
  Product,
  ProductPaginator,
  SingleFlashSale,
} from '@/types';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
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

type PageProps = {};

export const getStaticProps: GetStaticProps<
  PageProps,
  ParsedQueryParams
> = async ({ params, locale }) => {
  const queryClient = new QueryClient();

  try {
    return {
      props: {
        ...(await serverSideTranslations(locale!, ['common'])),
        dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
      },
      revalidate: 60,
    };
  } catch (error) {
    return {
      notFound: true,
    };
  }
};
