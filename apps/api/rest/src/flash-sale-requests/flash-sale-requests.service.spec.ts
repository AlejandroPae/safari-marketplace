/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * Tests unitarios de `FlashSaleRequestsService`. Mismo arnés que
 * `flash-sale.service.spec.ts`: se mockea solo el acceso a datos de
 * `@safari/db` y se dejan REALES las clases de error de dominio y
 * `toWriteHttpException`. Las fixtures de producto y venta son copia de
 * ese spec.
 */
import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  approveFlashSaleRequest,
  createFlashSaleRequest,
  deleteFlashSaleRequest,
  FlashSaleRequestStateError,
  findFlashSaleRequestById,
  findShopOwnerById,
  InvalidFlashSaleRequestError,
  InvalidReferenceError,
  isShopStaff,
  listFlashSaleRequestProducts,
  listFlashSaleRequests,
  RecordNotFoundError,
  rejectFlashSaleRequest,
  resolveFlashSaleRequestShop,
  updateFlashSaleRequest,
  type FlashSaleRecord,
  type FlashSaleRequestRecord,
  type ProductRecord,
} from '@safari/db';
import type { CurrentUserPayload } from '#src/auth/decorators/current-user.decorator.js';
import { FlashSaleRequestsService } from './flash-sale-requests.service.js';
import {
  FlashSaleRequestBodyDto,
  GetFlashSaleRequestsDto,
} from './dto/flash-sale-request.dto.js';

vi.mock('@safari/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@safari/db')>()),
  listFlashSaleRequests: vi.fn(),
  findFlashSaleRequestById: vi.fn(),
  listFlashSaleRequestProducts: vi.fn(),
  resolveFlashSaleRequestShop: vi.fn(),
  createFlashSaleRequest: vi.fn(),
  updateFlashSaleRequest: vi.fn(),
  deleteFlashSaleRequest: vi.fn(),
  findShopOwnerById: vi.fn(),
  isShopStaff: vi.fn(),
  approveFlashSaleRequest: vi.fn(),
  rejectFlashSaleRequest: vi.fn(),
}));

const listMock = vi.mocked(listFlashSaleRequests);
const findMock = vi.mocked(findFlashSaleRequestById);
const productsMock = vi.mocked(listFlashSaleRequestProducts);
const resolveMock = vi.mocked(resolveFlashSaleRequestShop);
const createMock = vi.mocked(createFlashSaleRequest);
const updateMock = vi.mocked(updateFlashSaleRequest);
const deleteMock = vi.mocked(deleteFlashSaleRequest);
const ownerMock = vi.mocked(findShopOwnerById);
const staffMock = vi.mocked(isShopStaff);
const approveMock = vi.mocked(approveFlashSaleRequest);
const rejectMock = vi.mocked(rejectFlashSaleRequest);

const NOW = new Date('2026-11-17T00:00:00Z');

function makeProductRecord(id: number): ProductRecord {
  return {
    id,
    name: `Producto ${id}`,
    slug: `producto-${id}`,
    description: 'desc',
    typeId: 1,
    shopId: 6,
    manufacturerId: null,
    productType: 'simple',
    price: 10,
    salePrice: 8,
    minPrice: 10,
    maxPrice: 10,
    quantity: 8,
    inStock: true,
    soldQuantity: 0,
    inFlashSale: false,
    sku: '123',
    unit: '1 Pcs',
    status: 'publish',
    visibility: 'visibility_public',
    image: { id: 1 },
    gallery: [],
    ratings: 0,
    totalReviews: 0,
    isTaxable: false,
    isDigital: false,
    isExternal: false,
    externalProductUrl: null,
    language: 'en',
    translatedLanguages: ['en'],
    sourceStore: null,
    sourceProductId: null,
    sourceUrl: null,
    scrapedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    type: {
      id: 1,
      name: 'Grocery',
      slug: 'grocery',
      icon: 'FruitsVegetable',
      settings: {},
      banners: [],
      language: 'en',
      createdAt: NOW,
      updatedAt: NOW,
    },
    shop: {
      id: 6,
      name: 'Shop 6',
      slug: 'shop-6',
      description: null,
      ownerId: 1,
      isActive: true,
      logo: null,
      coverImage: null,
      address: {},
      settings: {},
      createdAt: NOW,
      updatedAt: NOW,
    },
    manufacturer: null,
    categories: [],
    tags: [],
  };
}

function makeFlashSaleRecord(
  overrides: Partial<FlashSaleRecord> = {},
): FlashSaleRecord {
  return {
    id: 1,
    title: 'Limited time discounts.',
    slug: 'limited-time-discounts',
    description: 'desc',
    startDate: new Date('2023-10-16T06:40:17.000Z'),
    endDate: new Date('2024-11-29T18:00:00.000Z'),
    saleStatus: 1,
    type: 'fixed_rate',
    rate: 10,
    saleBuilder: { data_type: 'handpicked_products', product_ids: [1013] },
    image: null,
    coverImage: null,
    language: 'en',
    createdAt: NOW,
    updatedAt: NOW,
    products: [makeProductRecord(1013)],
    ...overrides,
  };
}

const ADMIN: CurrentUserPayload = {
  sub: 3,
  email: 'admin@demo.com',
  permissions: ['super_admin', 'customer', 'store_owner'],
  iat: 0,
  exp: 0,
};
const OWNER: CurrentUserPayload = {
  sub: 1,
  email: 'store_owner@demo.com',
  permissions: ['customer', 'store_owner'],
  iat: 0,
  exp: 0,
};

function makeRequestRecord(
  overrides: Partial<FlashSaleRequestRecord> = {},
): FlashSaleRequestRecord {
  return {
    id: 7,
    title: 'Limited time discounts.',
    flashSaleId: 1,
    shopId: 6,
    createdBy: 1,
    note: 'nota',
    status: 'pending',
    language: 'en',
    createdAt: NOW,
    updatedAt: NOW,
    products: [makeProductRecord(1), makeProductRecord(2)],
    flashSale: makeFlashSaleRecord(),
    ...overrides,
  };
}

const REQUEST_KEYS = [
  'id',
  'title',
  'flash_sale_id',
  'shop_id',
  'requested_product_ids',
  'request_status',
  'note',
  'language',
  'deleted_at',
  'created_at',
  'updated_at',
  'flash_sale',
];

const body = (input: Record<string, unknown>) =>
  input as unknown as FlashSaleRequestBodyDto;
const query = (input: Record<string, unknown>) =>
  input as unknown as GetFlashSaleRequestsDto;

const VALID_BODY = {
  language: 'en',
  title: 'Limited time discounts.',
  flash_sale_id: 1,
  note: 'Queremos entrar',
  requested_product_ids: [1, 2],
};

describe('FlashSaleRequestsService', () => {
  let service: FlashSaleRequestsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new FlashSaleRequestsService();
  });

  describe('proyección', () => {
    it('listado: las claves del tipo del admin, request_status booleano', async () => {
      listMock.mockResolvedValue({ items: [makeRequestRecord()], total: 1 });
      const result = await service.findAll(query({}), ADMIN);
      const dto = result.data[0];

      expect(Object.keys(dto)).toEqual(REQUEST_KEYS);
      expect(dto.request_status).toBe(false);
      expect(dto.deleted_at).toBeNull();
      expect(
        (dto.requested_product_ids as { id: number }[]).map((p) => p.id),
      ).toEqual([1, 2]);
      expect((dto.flash_sale as { slug: string }).slug).toBe(
        'limited-time-discounts',
      );
    });

    it('approved ⇒ request_status true; rejected ⇒ false', async () => {
      listMock.mockResolvedValue({
        items: [
          makeRequestRecord({ status: 'approved' }),
          makeRequestRecord({ status: 'rejected' }),
        ],
        total: 2,
      });
      const result = await service.findAll(query({}), ADMIN);
      expect(result.data.map((d) => d.request_status)).toEqual([true, false]);
    });

    it('detalle: añade products al final', async () => {
      findMock.mockResolvedValue(makeRequestRecord());
      const dto = await service.findOne('7', ADMIN);
      expect(Object.keys(dto)).toEqual([...REQUEST_KEYS, 'products']);
      expect(dto.products).toEqual(dto.requested_product_ids);
    });
  });

  describe('findAll — visibilidad', () => {
    it('super admin: sin viewer; parsea title y shop_id de search', async () => {
      listMock.mockResolvedValue({ items: [], total: 0 });
      await service.findAll(
        query({ search: 'title:limited;shop_id:6', page: '2', limit: '5' }),
        ADMIN,
      );
      expect(listMock).toHaveBeenCalledWith({
        title: 'limited',
        shopId: 6,
        viewerId: undefined,
        page: 2,
        limit: 5,
      });
      expect(ownerMock).not.toHaveBeenCalled();
    });

    it('dueño: viewer = su id', async () => {
      listMock.mockResolvedValue({ items: [], total: 0 });
      await service.findAll(query({}), OWNER);
      expect(listMock.mock.calls[0][0]).toMatchObject({ viewerId: 1 });
    });

    it('dueño con shop_id ajeno ⇒ 403 sin listar', async () => {
      ownerMock.mockResolvedValue(99);
      staffMock.mockResolvedValue(false);
      await expect(
        service.findAll(query({ shop_id: '20' }), OWNER),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(listMock).not.toHaveBeenCalled();
    });

    it('shop_id no numérico ⇒ 400', async () => {
      await expect(
        service.findAll(query({ shop_id: 'abc' }), ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('caída de conexión ⇒ 503', async () => {
      listMock.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), {
          code: 'P1001',
        }),
      );
      await expect(service.findAll(query({}), ADMIN)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('findOne', () => {
    it('pasa el viewer del dueño; no visible ⇒ 404', async () => {
      findMock.mockResolvedValue(null);
      await expect(service.findOne('7', OWNER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(findMock).toHaveBeenCalledWith(7, { viewerId: 1 });
    });

    it.each(['abc', '0', '1.5', '99999999999999999999'])(
      'id %j inválido ⇒ 404 sin tocar el driver',
      async (id) => {
        await expect(service.findOne(id, ADMIN)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(findMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('create', () => {
    it('deduce la tienda, autoriza y crea con createdBy', async () => {
      resolveMock.mockResolvedValue({ shopId: 6, productIds: [1, 2] });
      ownerMock.mockResolvedValue(1);
      createMock.mockResolvedValue(makeRequestRecord());

      const dto = await service.create(body(VALID_BODY), OWNER);

      expect(resolveMock).toHaveBeenCalledWith([1, 2]);
      expect(createMock).toHaveBeenCalledWith({
        title: 'Limited time discounts.',
        flashSaleId: 1,
        note: 'Queremos entrar',
        productIds: [1, 2],
        createdBy: 1,
        language: 'en',
      });
      expect(dto.id).toBe(7);
    });

    it('staff de la tienda: autorizado', async () => {
      resolveMock.mockResolvedValue({ shopId: 6, productIds: [1, 2] });
      ownerMock.mockResolvedValue(99);
      staffMock.mockResolvedValue(true);
      createMock.mockResolvedValue(makeRequestRecord());
      await expect(
        service.create(body(VALID_BODY), OWNER),
      ).resolves.toMatchObject({ id: 7 });
    });

    it('tienda ajena ⇒ 403 sin crear', async () => {
      resolveMock.mockResolvedValue({ shopId: 6, productIds: [1, 2] });
      ownerMock.mockResolvedValue(99);
      staffMock.mockResolvedValue(false);
      await expect(
        service.create(body(VALID_BODY), OWNER),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('super admin: no consulta la tienda', async () => {
      resolveMock.mockResolvedValue({ shopId: 6, productIds: [1, 2] });
      createMock.mockResolvedValue(makeRequestRecord());
      await service.create(body(VALID_BODY), ADMIN);
      expect(ownerMock).not.toHaveBeenCalled();
    });

    it('productos de 2 tiendas ⇒ 400 (error del repositorio)', async () => {
      resolveMock.mockRejectedValue(
        new InvalidFlashSaleRequestError('dos tiendas'),
      );
      await expect(
        service.create(body(VALID_BODY), OWNER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('producto inexistente ⇒ 400', async () => {
      resolveMock.mockRejectedValue(
        new InvalidReferenceError(
          'flash_sale_requests',
          'requested_product_ids',
        ),
      );
      await expect(
        service.create(body(VALID_BODY), OWNER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      ['sin title', { ...VALID_BODY, title: undefined }],
      ['sin flash_sale_id', { ...VALID_BODY, flash_sale_id: undefined }],
      ['flash_sale_id inválido', { ...VALID_BODY, flash_sale_id: 'x' }],
      ['ids que no son lista', { ...VALID_BODY, requested_product_ids: 3 }],
      [
        'id de producto inválido',
        { ...VALID_BODY, requested_product_ids: ['a'] },
      ],
    ])('%s ⇒ 400 sin tocar el driver', async (_name, input) => {
      await expect(service.create(body(input), OWNER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(resolveMock).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('solo campos presentes; productos como números', async () => {
      findMock.mockResolvedValue(makeRequestRecord());
      updateMock.mockResolvedValue(makeRequestRecord({ note: 'nueva' }));

      await service.update(
        '7',
        body({ id: 7, note: 'nueva', requested_product_ids: ['3'] }),
        OWNER,
      );
      expect(findMock).toHaveBeenCalledWith(7, { viewerId: 1 });
      expect(updateMock).toHaveBeenCalledWith(7, {
        note: 'nueva',
        productIds: [3],
      });
    });

    it('no visible ⇒ 404 sin actualizar', async () => {
      findMock.mockResolvedValue(null);
      await expect(
        service.update('7', body({ note: 'x' }), OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('no pending ⇒ 409', async () => {
      findMock.mockResolvedValue(makeRequestRecord({ status: 'approved' }));
      updateMock.mockRejectedValue(
        new FlashSaleRequestStateError(7, 'approved', 'editar'),
      );
      await expect(
        service.update('7', body({ note: 'x' }), ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('devuelve la solicitud borrada', async () => {
      findMock.mockResolvedValue(makeRequestRecord());
      deleteMock.mockResolvedValue(makeRequestRecord());
      await expect(service.remove('7', ADMIN)).resolves.toMatchObject({
        id: 7,
      });
    });

    it('approved ⇒ 409', async () => {
      findMock.mockResolvedValue(makeRequestRecord({ status: 'approved' }));
      deleteMock.mockRejectedValue(
        new FlashSaleRequestStateError(7, 'approved', 'borrar'),
      );
      await expect(service.remove('7', ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('id inválido ⇒ 404', async () => {
      await expect(service.remove('abc', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findRequestedProducts', () => {
    it('paginador de productos; parsea name de search', async () => {
      productsMock.mockResolvedValue({
        items: [makeProductRecord(1)],
        total: 1,
      });
      const result = await service.findRequestedProducts(
        query({ vendor_request_id: '7', search: 'name:spin' }),
        OWNER,
      );
      expect(productsMock).toHaveBeenCalledWith({
        requestId: 7,
        viewerId: 1,
        name: 'spin',
        page: 1,
        limit: 10,
      });
      expect(result.data.map((p) => p.id)).toEqual([1]);
      expect(result.total).toBe(1);
    });

    it('solicitud no visible ⇒ 404', async () => {
      productsMock.mockResolvedValue(null);
      await expect(
        service.findRequestedProducts(query({ vendor_request_id: '7' }), OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sin vendor_request_id ⇒ 404 sin tocar el driver', async () => {
      await expect(
        service.findRequestedProducts(query({}), OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(productsMock).not.toHaveBeenCalled();
    });
  });

  describe('approve y disapprove', () => {
    it('aprobar devuelve la solicitud con request_status true', async () => {
      approveMock.mockResolvedValue(makeRequestRecord({ status: 'approved' }));
      const dto = await service.approve(7);
      expect(approveMock).toHaveBeenCalledWith(7);
      expect(dto.request_status).toBe(true);
      expect(Object.keys(dto)).toEqual([...REQUEST_KEYS, 'products']);
    });

    it('rechazar devuelve la solicitud con request_status false; acepta id string', async () => {
      rejectMock.mockResolvedValue(makeRequestRecord({ status: 'rejected' }));
      const dto = await service.disapprove('7');
      expect(rejectMock).toHaveBeenCalledWith(7);
      expect(dto.request_status).toBe(false);
    });

    it('ya aprobada ⇒ 409; ya rechazada ⇒ 409', async () => {
      approveMock.mockRejectedValue(
        new FlashSaleRequestStateError(7, 'approved', 'aprobar'),
      );
      rejectMock.mockRejectedValue(
        new FlashSaleRequestStateError(7, 'rejected', 'rechazar'),
      );
      await expect(service.approve(7)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.disapprove(7)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('inexistente ⇒ 404', async () => {
      approveMock.mockRejectedValue(
        new RecordNotFoundError('flash_sale_requests', 7),
      );
      await expect(service.approve(7)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([undefined, 'abc', 0, -1, '1.5'])(
      'id %j inválido ⇒ 404 sin tocar el driver',
      async (id) => {
        await expect(service.approve(id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(service.disapprove(id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(approveMock).not.toHaveBeenCalled();
        expect(rejectMock).not.toHaveBeenCalled();
      },
    );
  });
});
