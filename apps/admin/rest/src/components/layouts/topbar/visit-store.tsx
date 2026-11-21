import { HomeIcon } from '@/components/icons/home-icon';
import { Routes } from '@/config/routes';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useShopUrl } from '@/utils/shop-url';

const VisitStore = () => {
  const { t } = useTranslation();
  const { pathname, query } = useRouter();
  // Fuera de una tienda, el slug es '' (no '/'): visitStore ya antepone la
  // barra, y con '/' el enlace quedaba `<SHOP_URL>//`.
  const slug = (pathname === '/[shop]' && `shops/${query?.shop}`) || '';
  const href = useShopUrl() && Routes.visitStore(slug as string);
  if (!href) return null;

  return (
    <>
      <Link
        href={href}
        target="_blank"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-0 text-sm font-medium leading-none text-accent outline-hidden transition duration-300 ease-in-out hover:border-transparent hover:bg-accent-hover hover:text-white focus:shadow focus:outline-hidden"
        rel="noreferrer"
      >
        <HomeIcon />
        {slug === '' ? t('text-visit-site') : t('text-visit-store')}
      </Link>
    </>
  );
};

export default VisitStore;
