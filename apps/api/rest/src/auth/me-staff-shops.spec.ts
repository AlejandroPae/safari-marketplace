/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * En `/me`, `shops` lleva las tiendas propias y después
 * las de staff, sin duplicados. Se mockea solo el acceso a datos.
 */
import 'reflect-metadata';
import type { JwtService } from '@nestjs/jwt';
import {
  findUserWithRelations,
  listStaffShops,
  type ShopRecord,
  type UserWithRelations,
} from '@safari/db';
import { AuthService } from './auth.service.js';

vi.mock('@safari/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@safari/db')>()),
  findUserWithRelations: vi.fn(),
  listStaffShops: vi.fn(),
}));

const findUserMock = vi.mocked(findUserWithRelations);
const staffShopsMock = vi.mocked(listStaffShops);
const NOW = new Date('2026-11-18T00:00:00Z');

const shop = (id: number): ShopRecord =>
  ({
    id,
    ownerId: 1,
    name: `Tienda ${id}`,
    slug: `tienda-${id}`,
    description: null,
    coverImage: null,
    logo: null,
    isActive: true,
    address: {},
    settings: {},
    createdAt: NOW,
    updatedAt: NOW,
  }) as unknown as ShopRecord;

const user = (shops: ShopRecord[]): UserWithRelations =>
  ({
    id: 2,
    name: 'Staff',
    email: 'customer@demo.com',
    emailVerifiedAt: null,
    isActive: true,
    shopId: null,
    createdAt: NOW,
    updatedAt: NOW,
    profile: null,
    permissions: [],
    shops,
  }) as unknown as UserWithRelations;

describe('AuthService.me — shops de dueño y de staff', () => {
  const service = new AuthService({} as JwtService);

  beforeEach(() => vi.clearAllMocks());

  it('un staff sin tiendas propias recibe en shops las de staff', async () => {
    findUserMock.mockResolvedValue(user([]));
    staffShopsMock.mockResolvedValue([shop(1), shop(2)]);

    const me = await service.me(2);

    expect(me.shops.map((s) => s.id)).toEqual([1, 2]);
    expect(staffShopsMock).toHaveBeenCalledWith(2);
    expect(me).not.toHaveProperty('managed_shop');
  });

  it('propias primero, después las de staff, sin duplicar', async () => {
    findUserMock.mockResolvedValue(user([shop(7), shop(3)]));
    staffShopsMock.mockResolvedValue([shop(1), shop(3)]);

    const me = await service.me(2);

    expect(me.shops.map((s) => s.id)).toEqual([7, 3, 1]);
  });

  it('sin staff, shops queda igual que antes', async () => {
    findUserMock.mockResolvedValue(user([shop(7)]));
    staffShopsMock.mockResolvedValue([]);

    expect((await service.me(1)).shops.map((s) => s.id)).toEqual([7]);
  });
});
