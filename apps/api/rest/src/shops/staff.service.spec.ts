/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * Tests unitarios del staff de tienda en `ShopsService`. Se mockea
 * solo el acceso a datos de `@safari/db`; las clases de error de dominio y
 * `toWriteHttpException` son reales.
 *
 * El contrato del envoltorio que fijaban los stubs anteriores
 * (`createStaff()` → `null`, `getStaffs` → `data: []`) se conserva aquí.
 */
import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  createShop,
  createShopStaff,
  DuplicateEmailError,
  findShopOwnerById,
  findUserWithRelations,
  InvalidReferenceError,
  listUsersWithRelations,
  removeShopStaff,
  updateShop,
  type UserWithRelations,
} from '@safari/db';
import type { CurrentUserPayload } from '#src/auth/decorators/current-user.decorator.js';
import { ShopsService } from './shops.service.js';
import { GetStaffsDto } from './dto/get-staffs.dto.js';

vi.mock('@safari/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@safari/db')>()),
  createShop: vi.fn(),
  updateShop: vi.fn(),
  createShopStaff: vi.fn(),
  removeShopStaff: vi.fn(),
  findShopOwnerById: vi.fn(),
  findUserWithRelations: vi.fn(),
  listUsersWithRelations: vi.fn(),
}));

const createShopMock = vi.mocked(createShop);
const updateShopMock = vi.mocked(updateShop);
const createShopStaffMock = vi.mocked(createShopStaff);
const removeShopStaffMock = vi.mocked(removeShopStaff);
const findShopOwnerByIdMock = vi.mocked(findShopOwnerById);
const findUserWithRelationsMock = vi.mocked(findUserWithRelations);
const listUsersWithRelationsMock = vi.mocked(listUsersWithRelations);

const NOW = new Date('2026-11-18T00:00:00Z');
const OWNER = 1;
const OTHER_OWNER = 42;

const admin: CurrentUserPayload = {
  sub: 3,
  email: 'admin@demo.com',
  permissions: ['customer', 'store_owner', 'super_admin'],
  iat: 0,
  exp: 0,
};
const owner = (sub = OWNER): CurrentUserPayload => ({
  sub,
  email: 'owner@demo.com',
  permissions: ['customer', 'store_owner'],
  iat: 0,
  exp: 0,
});

function makeUser(id: number): UserWithRelations {
  return {
    id,
    name: `Staff ${id}`,
    email: `staff${id}@demo.com`,
    emailVerifiedAt: null,
    isActive: true,
    shopId: null,
    createdAt: NOW,
    updatedAt: NOW,
    profile: null,
    permissions: [],
    shops: [],
  } as unknown as UserWithRelations;
}

const body = (overrides: Record<string, unknown> = {}) => ({
  name: 'Nuevo staff',
  email: 'nuevo@demo.com',
  password: 'demodemo',
  shop_id: 6,
  ...overrides,
});

let service: ShopsService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new ShopsService();
  findUserWithRelationsMock.mockImplementation(async (id) => makeUser(id));
});

describe('getStaffs — lectura real, mismo envoltorio', () => {
  it('key-set de `paginate()` (nunca `buildPaginator`) y `per_page` crudo, sin coerción', async () => {
    listUsersWithRelationsMock.mockResolvedValue({
      items: [makeUser(2), makeUser(3)],
      total: 2,
    });

    const result = await service.getStaffs(
      { limit: '15', page: '1', shop_id: '1' } as unknown as GetStaffsDto,
      admin,
    );

    expect(Object.keys(result)).toEqual([
      'data',
      'total',
      'current_page',
      'count',
      'last_page',
      'firstItem',
      'lastItem',
      'per_page',
      'first_page_url',
      'last_page_url',
      'next_page_url',
      'prev_page_url',
    ]);
    expect(result.data.map((u) => u.id)).toEqual([2, 3]);
    expect(result.total).toBe(2);
    expect(result.per_page).toBe('15');
    expect(result.first_page_url).toContain('/staffs?limit=15&page=1');
  });

  it('el super admin no acota por dueño; un dueño solo ve sus tiendas', async () => {
    listUsersWithRelationsMock.mockResolvedValue({ items: [], total: 0 });

    await service.getStaffs({ shop_id: '1' } as unknown as GetStaffsDto, admin);
    await service.getStaffs(
      { shop_id: '1' } as unknown as GetStaffsDto,
      owner(),
    );

    expect(listUsersWithRelationsMock.mock.calls[0][0]).toMatchObject({
      page: 1,
      limit: 10,
      staffOf: { shopId: 1, ownerId: undefined },
    });
    expect(listUsersWithRelationsMock.mock.calls[1][0]).toMatchObject({
      staffOf: { shopId: 1, ownerId: OWNER },
    });
  });

  it('shop_id inválido: lista vacía sin consultar la base', async () => {
    const result = await service.getStaffs(
      { shop_id: 'abc' } as unknown as GetStaffsDto,
      admin,
    );
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(listUsersWithRelationsMock).not.toHaveBeenCalled();
  });
});

describe('createStaff', () => {
  it('el dueño da de alta en su tienda: password hasheado, devuelve el usuario', async () => {
    findShopOwnerByIdMock.mockResolvedValue(OWNER);
    createShopStaffMock.mockResolvedValue({ userId: 77, created: true });

    const result = await service.createStaff(body(), owner());

    expect(result.id).toBe(77);
    const input = createShopStaffMock.mock.calls[0][0];
    expect(input).toMatchObject({
      name: 'Nuevo staff',
      email: 'nuevo@demo.com',
      shopId: 6,
    });
    expect(input.passwordHash).not.toBe('demodemo');
    expect(input.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(createShopMock).not.toHaveBeenCalled();
  });

  it('repetido es idempotente: devuelve el mismo usuario', async () => {
    findShopOwnerByIdMock.mockResolvedValue(OWNER);
    createShopStaffMock.mockResolvedValue({ userId: 77, created: false });

    await expect(service.createStaff(body(), owner())).resolves.toMatchObject({
      id: 77,
    });
  });

  it('un dueño sobre una tienda ajena ⇒ 403, sin escribir', async () => {
    findShopOwnerByIdMock.mockResolvedValue(OWNER);
    await expect(
      service.createStaff(body(), owner(OTHER_OWNER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createShopStaffMock).not.toHaveBeenCalled();
  });

  it('un dueño sobre una tienda inexistente ⇒ 400', async () => {
    findShopOwnerByIdMock.mockResolvedValue(null);
    await expect(
      service.createStaff(body({ shop_id: 999 }), owner()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el super admin no consulta el dueño; tienda inexistente del repositorio ⇒ 400', async () => {
    createShopStaffMock.mockRejectedValue(
      new InvalidReferenceError('staff', 'shop_id', 999),
    );
    await expect(
      service.createStaff(body({ shop_id: 999 }), admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findShopOwnerByIdMock).not.toHaveBeenCalled();
  });

  it('email de otro usuario ⇒ 409', async () => {
    createShopStaffMock.mockRejectedValue(
      new DuplicateEmailError('customer2@demo.com'),
    );
    await expect(service.createStaff(body(), admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each([
    ['sin email', { email: undefined }],
    ['email vacío', { email: '  ' }],
    ['sin password', { password: undefined }],
    ['sin nombre', { name: '' }],
    ['shop_id ausente', { shop_id: undefined }],
    ['shop_id inválido', { shop_id: 'abc' }],
    ['shop_id fuera de rango', { shop_id: '99999999999999999999' }],
    ['email no string', { email: 42 }],
  ])('%s ⇒ 400 sin escribir', async (_label, overrides) => {
    await expect(
      service.createStaff(body(overrides), admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createShopStaffMock).not.toHaveBeenCalled();
  });
});

describe('updateStaff', () => {
  it('sigue sin escribir nada: devuelve null', () => {
    expect(service.updateStaff()).toBeNull();
    expect(updateShopMock).not.toHaveBeenCalled();
  });
});

describe('removeStaff', () => {
  it('el super admin retira de todas las tiendas y devuelve el usuario', async () => {
    removeShopStaffMock.mockResolvedValue(2);

    await expect(
      service.removeStaff('2', undefined, admin),
    ).resolves.toMatchObject({
      id: 2,
    });
    expect(removeShopStaffMock).toHaveBeenCalledWith({
      userId: 2,
      shopId: undefined,
      ownerId: undefined,
    });
  });

  it('un dueño solo retira de sus tiendas', async () => {
    removeShopStaffMock.mockResolvedValue(1);
    await service.removeStaff('2', undefined, owner());
    expect(removeShopStaffMock).toHaveBeenCalledWith({
      userId: 2,
      shopId: undefined,
      ownerId: OWNER,
    });
  });

  it('?shop_id acota; un dueño con una tienda ajena ⇒ 403 sin borrar', async () => {
    findShopOwnerByIdMock.mockResolvedValue(OWNER);
    removeShopStaffMock.mockResolvedValue(1);

    await service.removeStaff('2', '1', owner());
    expect(removeShopStaffMock).toHaveBeenCalledWith({
      userId: 2,
      shopId: 1,
      ownerId: OWNER,
    });

    removeShopStaffMock.mockClear();
    await expect(
      service.removeStaff('2', '1', owner(OTHER_OWNER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(removeShopStaffMock).not.toHaveBeenCalled();
  });

  it('nada que retirar ⇒ 404', async () => {
    removeShopStaffMock.mockResolvedValue(0);
    await expect(
      service.removeStaff('2', undefined, owner(OTHER_OWNER)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usuario inexistente ⇒ 404 sin borrar', async () => {
    findUserWithRelationsMock.mockResolvedValue(null);
    await expect(
      service.removeStaff('999', undefined, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(removeShopStaffMock).not.toHaveBeenCalled();
  });

  it.each([
    ['id no numérico', 'abc', undefined],
    ['id fuera de rango', '99999999999999999999', undefined],
    ['id cero', '0', undefined],
    ['shop_id inválido', '2', 'abc'],
  ])('%s ⇒ 404 sin tocar la base', async (_l, id, shopId) => {
    await expect(service.removeStaff(id, shopId, admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(removeShopStaffMock).not.toHaveBeenCalled();
    expect(findUserWithRelationsMock).not.toHaveBeenCalled();
  });
});
