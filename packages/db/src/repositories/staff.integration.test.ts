/**
 * Test de integración contra el Postgres real (sembrado por `just db-up`).
 * Staff de tienda: `createShopStaff`, `removeShopStaff` y el filtro
 * `staffOf` de `listUsersWithRelations`.
 *
 * Datos del seed que se usan: `shop_staff` trae al usuario 2 en las tiendas
 * 1 y 2 y al usuario 3 en la 1; el usuario 1 es dueño de las 12 tiendas y el
 * 42 (store_owner) no es dueño de ninguna. Los usuarios que crea la suite
 * van en el dominio `@staff-integration.test` (RFC 2606); borrarlos se lleva
 * sus filas del pivote en cascada.
 */

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../client';
import { _setNowProvider } from '../clock';
import { InvalidReferenceError } from '../domain-errors';
import {
  createShopStaff,
  listStaffShops,
  removeShopStaff,
} from './staff.repository';
import {
  DuplicateEmailError,
  listUsersWithRelations,
} from './users.repository';

const DOMAIN = '@staff-integration.test';
const OWNER_OF_ALL = 1;
const OWNER_OF_NONE = 42;

const cleanup = () =>
  prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });

beforeAll(cleanup); // corrida abortada previa

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    await prisma.$disconnect();
  }
});

const input = (local: string, shopId = 6) => ({
  name: `Staff ${local}`,
  email: `${local}${DOMAIN}`,
  passwordHash: 'hash-de-prueba',
  shopId,
});

const pivot = async (userId: number) =>
  (
    await prisma.shopStaff.findMany({
      where: { userId },
      orderBy: { shopId: 'asc' },
    })
  ).map((r) => Number(r.shopId));

const permissionNames = async (userId: number) =>
  (
    await prisma.permissionUser.findMany({
      where: { userId },
      include: { permission: true },
    })
  )
    .map((p) => p.permission.name)
    .sort();

describe('createShopStaff', () => {
  it('crea el usuario con permiso customer y su fila; fija las fechas desde clock.ts', async () => {
    const future = new Date('2030-01-01T00:00:00.000Z');
    let result: Awaited<ReturnType<typeof createShopStaff>>;
    try {
      _setNowProvider(() => future);
      result = await createShopStaff(input('alta'));
    } finally {
      _setNowProvider(() => new Date());
    }
    expect(result.created).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      include: { permissions: { include: { permission: true } } },
    });
    expect(user.passwordHash).toBe('hash-de-prueba');
    // `staff` para poder entrar al admin.
    expect(user.permissions.map((p) => p.permission.name).sort()).toEqual([
      'customer',
      'staff',
    ]);
    expect(user.updatedAt.toJSON()).toBe(future.toJSON());
    expect(await pivot(result.userId)).toEqual([6]);
  });

  it('repetir la misma pareja es idempotente: no duplica ni cambia el usuario', async () => {
    const first = await createShopStaff(input('repetido'));
    const again = await createShopStaff({
      ...input('REPETIDO'), // mismo email en otras mayúsculas
      name: 'Otro nombre',
      passwordHash: 'otro-hash',
    });
    expect(again).toEqual({ userId: first.userId, created: false });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: first.userId },
    });
    expect(user.name).toBe('Staff repetido');
    expect(user.passwordHash).toBe('hash-de-prueba');
    expect(await pivot(first.userId)).toEqual([6]);
  });

  it('email de un usuario que no es staff de esa tienda ⇒ DuplicateEmailError, sin filas', async () => {
    const before = await prisma.shopStaff.count();
    await expect(
      createShopStaff({ ...input('x'), email: 'customer2@demo.com' })
    ).rejects.toBeInstanceOf(DuplicateEmailError);

    const staffElsewhere = await createShopStaff(input('otra-tienda', 6));
    await expect(
      createShopStaff(input('otra-tienda', 9))
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    expect(await pivot(staffElsewhere.userId)).toEqual([6]);
    expect(await prisma.shopStaff.count()).toBe(before + 1);
  });

  it('tienda inexistente ⇒ InvalidReferenceError y no crea el usuario', async () => {
    await expect(
      createShopStaff(input('sin-tienda', 999_999))
    ).rejects.toBeInstanceOf(InvalidReferenceError);
    expect(
      await prisma.user.count({ where: { email: `sin-tienda${DOMAIN}` } })
    ).toBe(0);
  });
});

describe('permiso staff', () => {
  it('el alta repetida garantiza el permiso a un staff que no lo tenía', async () => {
    const { userId } = await createShopStaff(input('sin-permiso'));
    await prisma.permissionUser.deleteMany({
      where: { userId, permission: { name: 'staff' } },
    });
    expect(await permissionNames(userId)).toEqual(['customer']);

    await createShopStaff(input('sin-permiso'));
    expect(await permissionNames(userId)).toEqual(['customer', 'staff']);
  });

  it('retirar una de dos tiendas conserva el permiso; retirar la última lo quita', async () => {
    const { userId } = await createShopStaff(input('dos-tiendas', 6));
    await prisma.shopStaff.create({ data: { userId, shopId: 9 } });

    expect(await removeShopStaff({ userId, shopId: 9 })).toBe(1);
    expect(await permissionNames(userId)).toEqual(['customer', 'staff']);

    expect(await removeShopStaff({ userId, shopId: 6 })).toBe(1);
    expect(await permissionNames(userId)).toEqual(['customer']);
  });

  it('retirar nada no toca el permiso', async () => {
    const { userId } = await createShopStaff(input('nada', 6));
    expect(await removeShopStaff({ userId, ownerId: OWNER_OF_NONE })).toBe(0);
    expect(await permissionNames(userId)).toEqual(['customer', 'staff']);
  });

  it('listStaffShops da las tiendas del pivote, shop_id asc', async () => {
    const { userId } = await createShopStaff(input('lista', 9));
    await prisma.shopStaff.create({ data: { userId, shopId: 6 } });
    expect((await listStaffShops(userId)).map((s) => s.id)).toEqual([6, 9]);
    expect(await listStaffShops(999_999)).toEqual([]);
  });
});

describe('removeShopStaff', () => {
  it('sin filtros borra todas las filas del usuario y deja el usuario', async () => {
    const { userId } = await createShopStaff(input('baja-total', 6));
    await prisma.shopStaff.create({ data: { userId, shopId: 9 } });

    expect(await removeShopStaff({ userId })).toBe(2);
    expect(await pivot(userId)).toEqual([]);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });

  it('shopId acota a una tienda', async () => {
    const { userId } = await createShopStaff(input('baja-una', 6));
    await prisma.shopStaff.create({ data: { userId, shopId: 9 } });

    expect(await removeShopStaff({ userId, shopId: 9 })).toBe(1);
    expect(await pivot(userId)).toEqual([6]);
  });

  it('ownerId solo borra en tiendas de ese dueño', async () => {
    const { userId } = await createShopStaff(input('baja-dueno', 6));
    expect(await removeShopStaff({ userId, ownerId: OWNER_OF_NONE })).toBe(0);
    expect(await pivot(userId)).toEqual([6]);
    expect(await removeShopStaff({ userId, ownerId: OWNER_OF_ALL })).toBe(1);
  });

  it('nada que retirar ⇒ 0', async () => {
    expect(await removeShopStaff({ userId: 999_999 })).toBe(0);
  });
});

describe('listUsersWithRelations({ staffOf })', () => {
  it('staffOf {} lista los usuarios con alguna fila en shop_staff', async () => {
    const { items } = await listUsersWithRelations({
      staffOf: {},
      limit: 1000,
    });
    const ids = items.map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
    expect(ids).not.toContain(1);
  });

  it('shopId acota a una tienda, y la paginación cuenta usuarios, no filas', async () => {
    const shop1 = await listUsersWithRelations({ staffOf: { shopId: 1 } });
    expect(shop1.items.map((u) => u.id)).toEqual([2, 3]);
    expect(shop1.total).toBe(2);

    const page2 = await listUsersWithRelations({
      staffOf: { shopId: 1 },
      page: 2,
      limit: 1,
    });
    expect(page2.items.map((u) => u.id)).toEqual([3]);
    expect(page2.total).toBe(2);

    // El usuario 2 es staff de dos tiendas y sale una sola vez.
    const all = await listUsersWithRelations({
      staffOf: { ownerId: OWNER_OF_ALL },
      limit: 1000,
    });
    expect(all.items.filter((u) => u.id === 2)).toHaveLength(1);
  });

  it('ownerId acota a las tiendas de ese dueño', async () => {
    const none = await listUsersWithRelations({
      staffOf: { ownerId: OWNER_OF_NONE },
    });
    expect(none).toEqual({ items: [], total: 0 });

    const mixed = await listUsersWithRelations({
      staffOf: { shopId: 1, ownerId: OWNER_OF_NONE },
    });
    expect(mixed.total).toBe(0);
  });
});
