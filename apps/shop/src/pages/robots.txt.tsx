import type { GetServerSideProps } from 'next';
import { serveRobots } from '@/framework/sitemap';

// robots.txt en ejecución, con el dominio del entorno donde corre
// (ver pages/sitemap.xml.tsx).
export const getServerSideProps: GetServerSideProps = async (context) => {
  serveRobots(context);
  return { props: {} };
};

export default function Robots() {
  return null;
}
