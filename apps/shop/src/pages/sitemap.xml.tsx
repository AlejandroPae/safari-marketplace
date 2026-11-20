import type { GetServerSideProps } from 'next';
import { serveSitemap } from '@/framework/sitemap';

// US-108: el sitemap se arma en cada petición con el dominio y el catálogo
// del entorno donde corre. getServerSideProps escribe y cierra la respuesta;
// Next no renderiza la página cuando la respuesta ya se envió.
export const getServerSideProps: GetServerSideProps = async (context) => {
  await serveSitemap(context);
  return { props: {} };
};

export default function Sitemap() {
  return null;
}
