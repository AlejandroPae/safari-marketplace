/**
 * Test de integración contra el Postgres real (sembrado por `just db-up`).
 * Solicitudes de venta flash: las tablas nacen vacías, así
 * que cada test crea las suyas con el centinela `zz-fsr-` en el título.
 *
 * Datos del seed que se usan: la venta 1; los productos 1, 2 y 3 (tienda 6,
 * Grocery) y 950 (tienda 9, Gadget); el usuario 1 es dueño de las 12
 * tiendas y el usuario 2 es staff de las tiendas 1 y 2.
 */

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../client';
import { _setNowProvider } from '../clock';
import { InvalidReferenceError, RecordNotFoundError } from '../domain-errors';
import {
  createFlashSaleRequest,
  deleteFlashSaleRequest,
  FlashSaleRequestStateError,
  findFlashSaleRequestById,
  InvalidFlashSaleRequestError,
  listFlashSaleRequestProducts,
  listFlashSaleRequests,
  resolveFlashSaleRequestShop,
  updateFlashSaleRequest,
} from './flash-sale-requests.repository';

const SENTINEL_PREFIX = 'zz-fsr-';
const OWNER = 1;
const STAFF_OF_SHOPS_1_2 = 2;

const cleanup = () =>
  prisma.flashSaleRequest.deleteMany({
    where: { title: { startsWith: SENTINEL_PREFIX } },
  });

beforeAll(cleanup); // corrida abortada previa

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    await prisma.$disconnect();
  }
});

const input = (title: string, productIds = [2, 1]) => ({
  title: `${SENTINEL_PREFIX}${title}`,
  flashSaleId: 1,
  note: 'Queremos entrar en la campaña',
  productIds,
  createdBy: OWNER,
});

const bridgeIds = async (requestId: number) =>
  (
    await prisma.flashSaleRequestProduct.findMany({
      where: { requestId },
      orderBy: { productId: 'asc' },
    })
  ).map((r) => Number(r.productId));

const requestCount = () =>
  prisma.flashSaleRequest.count({
    where: { title: { startsWith: SENTINEL_PREFIX } },
  });

describe('resolveFlashSaleRequestShop', () => {
  it('deduplica y devuelve la tienda única', async () => {
    expect(await resolveFlashSaleRequestShop([2, 1, 2])).toEqual({
      shopId: 6,
      productIds: [2, 1],
    });
  });

  it('productos de 2 tiendas ⇒ InvalidFlashSaleRequestError', async () => {
    await expect(resolveFlashSaleRequestShop([1, 950])).rejects.toBeInstanceOf(
      InvalidFlashSaleRequestError
    );
  });

  it('sin productos ⇒ InvalidFlashSaleRequestError', async () => {
    await expect(resolveFlashSaleRequestShop([])).rejects.toBeInstanceOf(
      InvalidFlashSaleRequestError
    );
  });

  it('producto inexistente ⇒ InvalidReferenceError', async () => {
    await expect(
      resolveFlashSaleRequestShop([1, 999_999])
    ).rejects.toBeInstanceOf(InvalidReferenceError);
  });
});

describe('createFlashSaleRequest', () => {
  it('crea la solicitud pending con su tienda, sus productos y la venta', async () => {
    const created = await createFlashSaleRequest(input('Crea'));

    expect(created.status).toBe('pending');
    expect(created.shopId).toBe(6);
    expect(created.createdBy).toBe(OWNER);
    expect(created.language).toBe('es');
    expect(created.products.map((p) => p.id)).toEqual([1, 2]);
    expect(created.flashSale.id).toBe(1);
    expect(created.flashSale.products.map((p) => p.id)).toEqual([1013, 1023]);
    expect(await bridgeIds(created.id)).toEqual([1, 2]);
  });

  it('producto inexistente ⇒ InvalidReferenceError sin dejar filas', async () => {
    const before = await requestCount();
    await expect(
      createFlashSaleRequest(input('Rota', [1, 999_999]))
    ).rejects.toBeInstanceOf(InvalidReferenceError);
    expect(await requestCount()).toBe(before);
  });

  it('productos de 2 tiendas ⇒ InvalidFlashSaleRequestError sin dejar filas', async () => {
    const before = await requestCount();
    await expect(
      createFlashSaleRequest(input('Mezcla', [1, 950]))
    ).rejects.toBeInstanceOf(InvalidFlashSaleRequestError);
    expect(await requestCount()).toBe(before);
  });

  it('venta inexistente ⇒ InvalidReferenceError', async () => {
    await expect(
      createFlashSaleRequest({ ...input('SinVenta'), flashSaleId: 999_999 })
    ).rejects.toBeInstanceOf(InvalidReferenceError);
  });

  it('nota vacía ⇒ InvalidFlashSaleRequestError', async () => {
    await expect(
      createFlashSaleRequest({ ...input('SinNota'), note: '   ' })
    ).rejects.toBeInstanceOf(InvalidFlashSaleRequestError);
  });
});

describe('listFlashSaleRequests y findFlashSaleRequestById — visibilidad', () => {
  it('sin viewer ve todas, id desc; busca por título', async () => {
    const a = await createFlashSaleRequest(input('Lista-A'));
    const b = await createFlashSaleRequest(input('Lista-B', [950]));

    const all = await listFlashSaleRequests({
      title: `${SENTINEL_PREFIX}lista`,
    });
    expect(all.items.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(all.total).toBe(2);

    const shop9 = await listFlashSaleRequests({
      title: `${SENTINEL_PREFIX}lista`,
      shopId: 9,
    });
    expect(shop9.items.map((r) => r.id)).toEqual([b.id]);
  });

  it('el dueño ve las de sus tiendas; el staff solo las de las suyas', async () => {
    const grocery = await createFlashSaleRequest(input('Visible'));

    expect(
      (await findFlashSaleRequestById(grocery.id, { viewerId: OWNER }))?.id
    ).toBe(grocery.id);
    expect(
      await findFlashSaleRequestById(grocery.id, {
        viewerId: STAFF_OF_SHOPS_1_2,
      })
    ).toBeNull();

    const staffList = await listFlashSaleRequests({
      title: `${SENTINEL_PREFIX}visible`,
      viewerId: STAFF_OF_SHOPS_1_2,
    });
    expect(staffList.total).toBe(0);
  });

  it('el staff ve las de una tienda donde es staff', async () => {
    const shop1 = await createFlashSaleRequest(input('Staff', [412]));
    expect(
      (
        await findFlashSaleRequestById(shop1.id, {
          viewerId: STAFF_OF_SHOPS_1_2,
        })
      )?.shopId
    ).toBe(1);
  });

  it('id inexistente ⇒ null', async () => {
    expect(await findFlashSaleRequestById(999_999)).toBeNull();
  });
});

describe('listFlashSaleRequestProducts', () => {
  it('los productos de la solicitud, id asc, con búsqueda por nombre', async () => {
    const created = await createFlashSaleRequest(input('Productos', [3, 1]));

    const all = await listFlashSaleRequestProducts({ requestId: created.id });
    expect(all?.items.map((p) => p.id)).toEqual([1, 3]);
    expect(all?.total).toBe(2);

    const name = all?.items[1].name.slice(0, 4).toUpperCase() ?? '';
    const searched = await listFlashSaleRequestProducts({
      requestId: created.id,
      name,
    });
    expect(searched?.items.map((p) => p.id)).toContain(3);
  });

  it('solicitud no visible o inexistente ⇒ null', async () => {
    const created = await createFlashSaleRequest(input('Oculta'));
    expect(
      await listFlashSaleRequestProducts({
        requestId: created.id,
        viewerId: STAFF_OF_SHOPS_1_2,
      })
    ).toBeNull();
    expect(
      await listFlashSaleRequestProducts({ requestId: 999_999 })
    ).toBeNull();
  });
});

describe('updateFlashSaleRequest', () => {
  it('reemplaza los productos y la nota; fija updatedAt desde clock.ts', async () => {
    const created = await createFlashSaleRequest(input('Editable'));
    const future = new Date('2030-01-01T00:00:00.000Z');
    try {
      _setNowProvider(() => future);
      const updated = await updateFlashSaleRequest(created.id, {
        note: 'Nota nueva',
        productIds: [3],
      });
      expect(updated.note).toBe('Nota nueva');
      expect(updated.products.map((p) => p.id)).toEqual([3]);
      expect(updated.updatedAt.toJSON()).toBe(future.toJSON());
    } finally {
      _setNowProvider(() => new Date());
    }
    expect(await bridgeIds(created.id)).toEqual([3]);
  });

  it('productos de otra tienda ⇒ InvalidFlashSaleRequestError y la solicitud queda igual', async () => {
    const created = await createFlashSaleRequest(input('OtraTienda'));
    await expect(
      updateFlashSaleRequest(created.id, { productIds: [950] })
    ).rejects.toBeInstanceOf(InvalidFlashSaleRequestError);
    expect(await bridgeIds(created.id)).toEqual([1, 2]);
  });

  it('no pending ⇒ FlashSaleRequestStateError', async () => {
    const created = await createFlashSaleRequest(input('Aprobada'));
    await prisma.flashSaleRequest.update({
      where: { id: created.id },
      data: { status: 'approved' },
    });
    await expect(
      updateFlashSaleRequest(created.id, { note: 'x' })
    ).rejects.toBeInstanceOf(FlashSaleRequestStateError);
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(
      updateFlashSaleRequest(999_999, { note: 'x' })
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});

describe('deleteFlashSaleRequest', () => {
  it('borra en cascada y devuelve la solicitud con sus productos', async () => {
    const created = await createFlashSaleRequest(input('Borrable'));
    const deleted = await deleteFlashSaleRequest(created.id);

    expect(deleted.id).toBe(created.id);
    expect(deleted.products.map((p) => p.id)).toEqual([1, 2]);
    expect(await findFlashSaleRequestById(created.id)).toBeNull();
    expect(await bridgeIds(created.id)).toEqual([]);
  });

  it('rejected se puede borrar', async () => {
    const created = await createFlashSaleRequest(input('Rechazada'));
    await prisma.flashSaleRequest.update({
      where: { id: created.id },
      data: { status: 'rejected' },
    });
    await expect(deleteFlashSaleRequest(created.id)).resolves.toMatchObject({
      status: 'rejected',
    });
  });

  it('approved ⇒ FlashSaleRequestStateError y no se borra', async () => {
    const created = await createFlashSaleRequest(input('NoBorrable'));
    await prisma.flashSaleRequest.update({
      where: { id: created.id },
      data: { status: 'approved' },
    });
    await expect(deleteFlashSaleRequest(created.id)).rejects.toBeInstanceOf(
      FlashSaleRequestStateError
    );
    expect(await findFlashSaleRequestById(created.id)).not.toBeNull();
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(deleteFlashSaleRequest(999_999)).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
  });
});
