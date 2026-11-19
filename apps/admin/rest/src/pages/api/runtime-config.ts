import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Configuración que el admin lee al ejecutar, no al construir (US-103).
 *
 * `SHOP_URL` no lleva `NEXT_PUBLIC_`: Next no la escribe en el JavaScript, así
 * que el navegador la pide aquí. Cambiarla solo exige reiniciar el admin. Si
 * falta, 500 con un mensaje que la nombra (DA-2).
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const shopUrl = process.env.SHOP_URL;
  if (!shopUrl) {
    res.status(500).json({
      message:
        'SHOP_URL is not defined: set it to the public URL of the shop (e.g. http://localhost:3003)',
    });
    return;
  }
  res.status(200).json({ shopUrl });
}
