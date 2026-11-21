/**
 * Test de integración contra el Postgres real (sembrado por `just db-up`:
 * 2 ventas, ids 3 y 1, con los productos 951/952 y 1013/1023). Lectura y
 * escritura.
 *
 * Las escrituras usan el centinela `zz-flash-` en el título, que
 * `generateSlug` lleva al slug. Las lecturas van ANTES que las escrituras:
 * asertan conteos del seed y vitest corre los `describe` de un archivo en
 * orden.
 */

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../client';
import { _setNowProvider } from '../clock';
import {
  EmptySlugError,
  InvalidFieldValueError,
  InvalidReferenceError,
  RecordNotFoundError,
} from '../domain-errors';
import {
  createFlashSale,
  deleteFlashSale,
  findFlashSaleBySlug,
  listFlashSaleProducts,
  listFlashSales,
  listProductFlashSales,
  updateFlashSale,
} from './flash-sale.repository';
import { findProductBySlug, listProducts } from './products.repository';

const SENTINEL_PREFIX = 'zz-flash-';

const cleanup = () =>
  prisma.flashSale.deleteMany({
    where: { slug: { startsWith: SENTINEL_PREFIX } },
  });

beforeAll(cleanup); // corrida abortada previa

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    await prisma.$disconnect();
  }
});

const baseInput = (title: string) => ({
  title: `${SENTINEL_PREFIX}${title}`,
  startDate: new Date('2026-12-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
  type: 'percentage',
  rate: 20,
});

const bridgeIds = async (flashSaleId: number) =>
  (
    await prisma.flashSaleProduct.findMany({
      where: { flashSaleId },
      orderBy: { productId: 'asc' },
    })
  ).map((r) => Number(r.productId));

describe('listFlashSales — seed', () => {
  it('lista las 2, id desc, con sus productos en orden de product_id', async () => {
    const { items, total } = await listFlashSales();
    expect(total).toBe(2);
    expect(items.map((s) => s.id)).toEqual([3, 1]);
    expect(items.map((s) => s.products.map((p) => p.id))).toEqual([
      [951, 952],
      [1013, 1023],
    ]);
    expect(() => JSON.stringify(items)).not.toThrow();
  });

  it('pagina: limit 1 página 2 es la venta 1', async () => {
    const { items, total } = await listFlashSales({ page: 2, limit: 1 });
    expect(total).toBe(2);
    expect(items.map((s) => s.id)).toEqual([1]);
  });

  it('busca por título, case-insensitive', async () => {
    expect(
      (await listFlashSales({ title: 'DISCOUNTS' })).items.map((s) => s.id)
    ).toEqual([1]);
  });
});

describe('findFlashSaleBySlug', () => {
  it('conserva fechas sin zona, rate number y json verbatim', async () => {
    const sale = await findFlashSaleBySlug('limited-time-offer-act-fast');
    expect(sale?.startDate.toISOString()).toBe('2023-10-31T06:49:59.000Z');
    expect(sale?.rate).toBe(50);
    expect(sale?.saleBuilder).toEqual({
      data_type: 'handpick_category',
      product_ids: [951, 952],
    });
    expect(Object.keys(sale?.image as object)).toEqual([
      'thumbnail',
      'original',
      'id',
      'file_name',
    ]);
  });

  it('devuelve null si no existe', async () => {
    expect(await findFlashSaleBySlug('no-existe')).toBeNull();
  });
});

describe('listFlashSaleProducts', () => {
  it('los productos de la venta del slug', async () => {
    const result = await listFlashSaleProducts({
      slug: 'limited-time-discounts',
    });
    expect(result?.total).toBe(2);
    expect(result?.items.map((p) => p.id)).toEqual([1013, 1023]);
  });

  it('sin slug: los de todas las ventas, sin repetir', async () => {
    const result = await listFlashSaleProducts();
    expect(result?.items.map((p) => p.id)).toEqual([951, 952, 1013, 1023]);
  });

  it('slug inexistente ⇒ null', async () => {
    expect(await listFlashSaleProducts({ slug: 'no-existe' })).toBeNull();
  });
});

describe('listProductFlashSales', () => {
  it('las ventas del producto, con sus productos', async () => {
    const sales = await listProductFlashSales(1013);
    expect(sales?.map((s) => s.id)).toEqual([1]);
    expect(sales?.[0].products.map((p) => p.id)).toEqual([1013, 1023]);
  });

  it('producto fuera de toda venta ⇒ []', async () => {
    expect(await listProductFlashSales(2)).toEqual([]);
  });

  it('producto inexistente ⇒ null', async () => {
    expect(await listProductFlashSales(999_999)).toBeNull();
  });
});

describe('inFlashSale en ProductRecord', () => {
  it('true exactamente en los 4 productos de las ventas del seed', async () => {
    const { items } = await listProducts({ limit: 2000 });
    expect(items.filter((p) => p.inFlashSale).map((p) => p.id)).toEqual([
      951, 952, 1013, 1023,
    ]);
  });

  it('el detalle por slug también lo trae', async () => {
    const [sale] = (await listProductFlashSales(951)) ?? [];
    const slug = sale.products.find((p) => p.id === 951)?.slug ?? '';
    expect((await findProductBySlug(slug))?.inFlashSale).toBe(true);
  });
});

describe('createFlashSale', () => {
  it('crea la venta y sus filas puente; reescribe sale_builder.product_ids', async () => {
    const created = await createFlashSale({
      ...baseInput('Nueva'),
      saleBuilder: { data_type: 'handpicked_products', product_ids: [1] },
      productIds: [952, 951, 952],
    });
    expect(created.slug).toBe(`${SENTINEL_PREFIX}nueva`);
    expect(created.saleStatus).toBe(1);
    expect(created.products.map((p) => p.id)).toEqual([951, 952]);
    expect(created.saleBuilder).toEqual({
      data_type: 'handpicked_products',
      product_ids: [952, 951],
    });
    expect(await bridgeIds(created.id)).toEqual([951, 952]);
  });

  it('producto inexistente ⇒ InvalidReferenceError sin dejar filas', async () => {
    const before = await prisma.flashSale.count();
    await expect(
      createFlashSale({ ...baseInput('Rota'), productIds: [951, 999_999] })
    ).rejects.toBeInstanceOf(InvalidReferenceError);
    expect(await prisma.flashSale.count()).toBe(before);
  });

  it('type fuera del CHECK ⇒ InvalidFieldValueError', async () => {
    await expect(
      createFlashSale({ ...baseInput('Tipo'), type: 'gratis' })
    ).rejects.toBeInstanceOf(InvalidFieldValueError);
  });

  it('end_date anterior a start_date ⇒ InvalidFieldValueError', async () => {
    await expect(
      createFlashSale({
        ...baseInput('Fechas'),
        endDate: new Date('2026-11-01T00:00:00.000Z'),
      })
    ).rejects.toBeInstanceOf(InvalidFieldValueError);
  });
});

describe('updateFlashSale', () => {
  it('cambia el título y reemplaza los productos; fija updatedAt desde clock.ts', async () => {
    const created = await createFlashSale({
      ...baseInput('Editable'),
      productIds: [951, 952],
    });
    const future = new Date('2030-01-01T00:00:00.000Z');
    try {
      _setNowProvider(() => future);
      const updated = await updateFlashSale(created.id, {
        title: `${SENTINEL_PREFIX}Renombrada`,
        productIds: [1013],
      });
      expect(updated.slug).toBe(created.slug);
      expect(updated.title).toBe(`${SENTINEL_PREFIX}Renombrada`);
      expect(updated.products.map((p) => p.id)).toEqual([1013]);
      expect(updated.saleBuilder).toEqual({
        data_type: 'handpicked_products',
        product_ids: [1013],
      });
      expect(updated.updatedAt.toJSON()).toBe(future.toJSON());
    } finally {
      _setNowProvider(() => new Date());
    }
    expect(await bridgeIds(created.id)).toEqual([1013]);
  });

  it('sin productIds no toca la tabla puente', async () => {
    const created = await createFlashSale({
      ...baseInput('Intacta'),
      productIds: [951],
    });
    await updateFlashSale(created.id, { rate: 5 });
    expect(await bridgeIds(created.id)).toEqual([951]);
  });

  it('producto inexistente ⇒ InvalidReferenceError y la venta queda igual', async () => {
    const created = await createFlashSale({
      ...baseInput('Atomica'),
      productIds: [951],
    });
    await expect(
      updateFlashSale(created.id, {
        title: `${SENTINEL_PREFIX}NoDebe`,
        productIds: [999_999],
      })
    ).rejects.toBeInstanceOf(InvalidReferenceError);
    const after = await findFlashSaleBySlug(created.slug);
    expect(after?.title).toBe(`${SENTINEL_PREFIX}Atomica`);
    expect(await bridgeIds(created.id)).toEqual([951]);
  });

  it('título que normaliza a vacío ⇒ EmptySlugError', async () => {
    const created = await createFlashSale(baseInput('Vacia'));
    await expect(
      updateFlashSale(created.id, { title: '!!!' })
    ).rejects.toBeInstanceOf(EmptySlugError);
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(updateFlashSale(999_999, { rate: 1 })).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
  });
});

describe('deleteFlashSale', () => {
  it('borra en cascada y devuelve la venta con sus productos', async () => {
    const created = await createFlashSale({
      ...baseInput('Borrable'),
      productIds: [951, 1013],
    });
    const deleted = await deleteFlashSale(created.id);
    expect(deleted.products.map((p) => p.id)).toEqual([951, 1013]);
    expect(await findFlashSaleBySlug(created.slug)).toBeNull();
    expect(await bridgeIds(created.id)).toEqual([]);
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(deleteFlashSale(999_999)).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
  });
});
