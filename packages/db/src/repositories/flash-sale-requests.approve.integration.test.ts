/**
 * Test de integración contra el Postgres real (sembrado por `just db-up`).
 * Aprobar y rechazar solicitudes de venta flash (US-98).
 *
 * Escenario: la venta 3 tiene 951 y 952; una solicitud de la tienda 9 pide
 * 951 (ya en la venta) y 950 (no). Aprobar mete solo 950 y lo marca; rechazar
 * retira solo 950 (DA-6). Las solicitudes llevan el centinela `zz-fsa-`.
 *
 * Escribe en `flash_sales`/`flash_sale_products` del seed: `beforeAll`
 * guarda la venta 3 y `afterAll` la restaura (filas puente, `sale_builder` y
 * `updatedAt`), aunque un test falle a mitad.
 */

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../../generated/prisma/client/client';
import { prisma } from '../client';
import { _setNowProvider } from '../clock';
import { RecordNotFoundError } from '../domain-errors';
import {
  approveFlashSaleRequest,
  createFlashSaleRequest,
  FlashSaleRequestStateError,
  rejectFlashSaleRequest,
} from './flash-sale-requests.repository';

const SENTINEL_PREFIX = 'zz-fsa-';
const SALE = 3n;

let original: {
  saleBuilder: Prisma.JsonValue;
  updatedAt: Date;
  productIds: bigint[];
};

const cleanupRequests = () =>
  prisma.flashSaleRequest.deleteMany({
    where: { title: { startsWith: SENTINEL_PREFIX } },
  });

beforeAll(async () => {
  await cleanupRequests(); // corrida abortada previa
  const sale = await prisma.flashSale.findUniqueOrThrow({
    where: { id: SALE },
    select: { saleBuilder: true, updatedAt: true },
  });
  const links = await prisma.flashSaleProduct.findMany({
    where: { flashSaleId: SALE },
  });
  original = {
    saleBuilder: sale.saleBuilder,
    updatedAt: sale.updatedAt,
    productIds: links.map((l) => l.productId),
  };
});

afterAll(async () => {
  try {
    await cleanupRequests();
    await prisma.flashSaleProduct.deleteMany({
      where: { flashSaleId: SALE, productId: { notIn: original.productIds } },
    });
    await prisma.flashSale.update({
      where: { id: SALE },
      data: {
        saleBuilder: original.saleBuilder as Prisma.InputJsonValue,
        updatedAt: original.updatedAt,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

const saleState = async () => {
  const [sale, links] = await Promise.all([
    prisma.flashSale.findUniqueOrThrow({
      where: { id: SALE },
      select: { saleBuilder: true },
    }),
    prisma.flashSaleProduct.findMany({
      where: { flashSaleId: SALE },
      orderBy: { productId: 'asc' },
    }),
  ]);
  return {
    productIds: links.map((l) => Number(l.productId)),
    builder: sale.saleBuilder,
  };
};

const marks = async (requestId: number) =>
  (
    await prisma.flashSaleRequestProduct.findMany({
      where: { requestId },
      orderBy: { productId: 'asc' },
    })
  ).map((r) => [Number(r.productId), r.addedToSale]);

const newRequest = (title: string, productIds = [951, 950]) =>
  createFlashSaleRequest({
    title: `${SENTINEL_PREFIX}${title}`,
    flashSaleId: Number(SALE),
    note: 'Queremos entrar',
    productIds,
    createdBy: 1,
  });

describe('approveFlashSaleRequest y rejectFlashSaleRequest — ciclo completo', () => {
  it('aprobar mete solo lo que falta y lo marca; rechazar retira solo eso', async () => {
    const request = await newRequest('Ciclo');
    expect(await saleState()).toEqual({
      productIds: [951, 952],
      builder: { data_type: 'handpick_category', product_ids: [951, 952] },
    });

    const future = new Date('2030-01-01T00:00:00.000Z');
    try {
      _setNowProvider(() => future);
      const approved = await approveFlashSaleRequest(request.id);
      expect(approved.status).toBe('approved');
      expect(approved.updatedAt.toJSON()).toBe(future.toJSON());
      expect(approved.flashSale.products.map((p) => p.id)).toEqual([
        950, 951, 952,
      ]);
      const sale = await prisma.flashSale.findUniqueOrThrow({
        where: { id: SALE },
      });
      expect(sale.updatedAt.toJSON()).toBe(future.toJSON());
    } finally {
      _setNowProvider(() => new Date());
    }

    expect(await saleState()).toEqual({
      productIds: [950, 951, 952],
      // Se conservan las demás claves del sale_builder; product_ids sale de la tabla puente.
      builder: {
        data_type: 'handpick_category',
        product_ids: [950, 951, 952],
      },
    });
    expect(await marks(request.id)).toEqual([
      [950, true],
      [951, false],
    ]);

    const rejected = await rejectFlashSaleRequest(request.id);
    expect(rejected.status).toBe('rejected');
    expect(await saleState()).toEqual({
      productIds: [951, 952],
      builder: { data_type: 'handpick_category', product_ids: [951, 952] },
    });
    expect(await marks(request.id)).toEqual([
      [950, false],
      [951, false],
    ]);

    // Una rechazada se puede volver a aprobar.
    const again = await approveFlashSaleRequest(request.id);
    expect(again.status).toBe('approved');
    expect((await saleState()).productIds).toEqual([950, 951, 952]);
    await rejectFlashSaleRequest(request.id);
    expect((await saleState()).productIds).toEqual([951, 952]);
  });
});

describe('estados', () => {
  it('aprobar dos veces ⇒ FlashSaleRequestStateError y la venta no cambia', async () => {
    const request = await newRequest('DosVeces');
    await approveFlashSaleRequest(request.id);
    const before = await saleState();
    await expect(approveFlashSaleRequest(request.id)).rejects.toBeInstanceOf(
      FlashSaleRequestStateError
    );
    expect(await saleState()).toEqual(before);
    await rejectFlashSaleRequest(request.id);
  });

  it('rechazar dos veces ⇒ FlashSaleRequestStateError', async () => {
    const request = await newRequest('RechazoDoble');
    await rejectFlashSaleRequest(request.id);
    await expect(rejectFlashSaleRequest(request.id)).rejects.toBeInstanceOf(
      FlashSaleRequestStateError
    );
  });

  it('rechazar una pending no toca la venta', async () => {
    const before = await saleState();
    const request = await newRequest('Pendiente');
    const rejected = await rejectFlashSaleRequest(request.id);
    expect(rejected.status).toBe('rejected');
    expect(await saleState()).toEqual(before);
  });

  it('una aprobación que no añade nada no marca nada y rechazarla no retira nada', async () => {
    const request = await newRequest('YaEstaban', [951, 952]);
    await approveFlashSaleRequest(request.id);
    expect(await marks(request.id)).toEqual([
      [951, false],
      [952, false],
    ]);
    await rejectFlashSaleRequest(request.id);
    expect((await saleState()).productIds).toEqual([951, 952]);
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(approveFlashSaleRequest(999_999)).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
    await expect(rejectFlashSaleRequest(999_999)).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
  });
});
