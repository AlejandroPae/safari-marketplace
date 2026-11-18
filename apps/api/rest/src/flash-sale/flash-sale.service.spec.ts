/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * Tests unitarios de `FlashSaleService` (US-94). Mismo arnés que
 * `authors.service.spec.ts`: se mockea solo el acceso a datos de
 * `@safari/db` y se dejan REALES las clases de error de dominio y
 * `toWriteHttpException`.
 */
import 'reflect-metadata';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createFlashSale,
  deleteFlashSale,
  findFlashSaleBySlug,
  InvalidReferenceError,
  listFlashSaleProducts,
  listFlashSales,
  listProductFlashSales,
  RecordNotFoundError,
  updateFlashSale,
  type FlashSaleRecord,
  type ProductRecord,
} from '@safari/db';
import { FlashSaleService } from './flash-sale.service.js';
import { CreateFlashSaleDto } from './dto/create-flash-sale.dto.js';
import { GetFlashSaleDto } from './dto/get-flash-sales.dto.js';
import { UpdateFlashSaleDto } from './dto/update-flash-sale.dto.js';

vi.mock('@safari/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@safari/db')>()),
  listFlashSales: vi.fn(),
  findFlashSaleBySlug: vi.fn(),
  listFlashSaleProducts: vi.fn(),
  listProductFlashSales: vi.fn(),
  createFlashSale: vi.fn(),
  updateFlashSale: vi.fn(),
  deleteFlashSale: vi.fn(),
}));

const listFlashSalesMock = vi.mocked(listFlashSales);
const findFlashSaleBySlugMock = vi.mocked(findFlashSaleBySlug);
const listFlashSaleProductsMock = vi.mocked(listFlashSaleProducts);
const listProductFlashSalesMock = vi.mocked(listProductFlashSales);
const createFlashSaleMock = vi.mocked(createFlashSale);
const updateFlashSaleMock = vi.mocked(updateFlashSale);
const deleteFlashSaleMock = vi.mocked(deleteFlashSale);

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

/** Sin `transform` en el `ValidationPipe`, query y cuerpo llegan crudos. */
const query = (input: Record<string, unknown>) =>
  input as unknown as GetFlashSaleDto;
const body = (input: Record<string, unknown>) =>
  input as unknown as CreateFlashSaleDto & UpdateFlashSaleDto;

const MOCK_KEYS = [
  'id',
  'title',
  'slug',
  'description',
  'start_date',
  'end_date',
  'sale_status',
  'type',
  'rate',
  'sale_builder',
  'image',
  'cover_image',
  'language',
  'deleted_at',
  'created_at',
  'updated_at',
  'translated_languages',
  'products',
];

const VALID_BODY = {
  title: 'Nueva',
  start_date: '2026-12-01T00:00:00.000Z',
  end_date: '2026-12-31T00:00:00.000Z',
  type: 'percentage',
  rate: '20',
  sale_status: true,
  sale_builder: { data_type: 'handpicked_products', product_ids: [951, 952] },
  language: 'en',
};

describe('FlashSaleService', () => {
  let service: FlashSaleService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new FlashSaleService();
  });

  describe('findAllFlashSale', () => {
    it('emite las claves del mock en su orden, fechas sin zona y productos con pivot', async () => {
      listFlashSalesMock.mockResolvedValue({
        items: [makeFlashSaleRecord()],
        total: 1,
      });

      const result = await service.findAllFlashSale(query({}));
      const sale = result.data[0] as unknown as Record<string, unknown>;

      expect(Object.keys(sale)).toEqual(MOCK_KEYS);
      expect(sale).toMatchObject({
        start_date: '2023-10-16 06:40:17',
        end_date: '2024-11-29 18:00:00',
        sale_status: 1,
        rate: 10,
        deleted_at: null,
        translated_languages: ['en'],
      });
      const [product] = sale.products as Record<string, unknown>[];
      expect(product).toMatchObject({
        id: 1013,
        in_flash_sale: 1,
        pivot: { flash_sale_id: 1, product_id: 1013 },
      });
      expect(Object.keys(product).at(-1)).toBe('pivot');
      expect(listFlashSalesMock).toHaveBeenCalledWith({
        title: undefined,
        page: 1,
        limit: 10,
      });
    });

    it('lee title de search; shop_id se ignora; per_page string con limit', async () => {
      listFlashSalesMock.mockResolvedValue({ items: [], total: 2 });

      const result = await service.findAllFlashSale(
        query({ search: 'title:limited;shop_id:1', limit: '1', page: '2' }),
      );

      expect(listFlashSalesMock).toHaveBeenCalledWith({
        title: 'limited',
        page: 2,
        limit: 1,
      });
      expect(result.per_page).toBe('1');
    });

    it('caída de conexión ⇒ 503', async () => {
      listFlashSalesMock.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), {
          code: 'P1001',
        }),
      );
      await expect(service.findAllFlashSale(query({}))).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getFlashSale', () => {
    it('inexistente ⇒ 404 (V-5)', async () => {
      findFlashSaleBySlugMock.mockResolvedValue(null);
      await expect(
        service.getFlashSale('no-existe', 'en'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getFlashSaleInfoByProductId (US-96)', () => {
    it('array de ventas con la proyección de /flash-sale/:slug', async () => {
      listProductFlashSalesMock.mockResolvedValue([makeFlashSaleRecord()]);
      const result = await service.getFlashSaleInfoByProductId('1013');

      expect(listProductFlashSalesMock).toHaveBeenCalledWith(1013);
      expect(result).toHaveLength(1);
      expect(Object.keys(result[0])).toEqual(MOCK_KEYS);
    });

    it('producto fuera de toda venta ⇒ []', async () => {
      listProductFlashSalesMock.mockResolvedValue([]);
      await expect(service.getFlashSaleInfoByProductId('2')).resolves.toEqual(
        [],
      );
    });

    it('producto inexistente ⇒ 404', async () => {
      listProductFlashSalesMock.mockResolvedValue(null);
      await expect(
        service.getFlashSaleInfoByProductId('999999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['abc', '0', '-1', '1.5', '', '99999999999999999999'])(
      'id %j inválido ⇒ 404 sin tocar el driver',
      async (id) => {
        await expect(
          service.getFlashSaleInfoByProductId(id),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(listProductFlashSalesMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('findAllProductsByFlashSale', () => {
    it('pasa el slug y emite in_flash_sale 1 sin pivot', async () => {
      listFlashSaleProductsMock.mockResolvedValue({
        items: [makeProductRecord(1013)],
        total: 1,
      });

      const result = await service.findAllProductsByFlashSale(
        query({ searchJoin: 'and', slug: 'limited-time-discounts' }),
      );

      expect(listFlashSaleProductsMock).toHaveBeenCalledWith({
        slug: 'limited-time-discounts',
        page: 1,
        limit: 10,
      });
      const product = result.data[0] as unknown as Record<string, unknown>;
      expect(product.in_flash_sale).toBe(1);
      expect(product).not.toHaveProperty('pivot');
    });

    it('slug inexistente ⇒ 404', async () => {
      listFlashSaleProductsMock.mockResolvedValue(null);
      await expect(
        service.findAllProductsByFlashSale(query({ slug: 'no-existe' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('convierte el formulario del admin: fechas, rate, sale_status y product_ids', async () => {
      createFlashSaleMock.mockResolvedValue(makeFlashSaleRecord({ id: 4 }));

      await service.create(body({ ...VALID_BODY, shop_id: '1' }));

      const input = createFlashSaleMock.mock.calls[0][0];
      expect(input).toMatchObject({
        title: 'Nueva',
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        type: 'percentage',
        rate: 20,
        saleStatus: 1,
        productIds: [951, 952],
        language: 'en',
      });
      expect(input).not.toHaveProperty('shopId');
    });

    it('fecha ilegible ⇒ 400 sin escribir', async () => {
      await expect(
        service.create(body({ ...VALID_BODY, start_date: 'no-es-fecha' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createFlashSaleMock).not.toHaveBeenCalled();
    });

    it('sin campos obligatorios ⇒ 400 sin escribir', async () => {
      await expect(
        service.create(body({ title: 'Solo título' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createFlashSaleMock).not.toHaveBeenCalled();
    });

    it('producto inexistente ⇒ 400', async () => {
      createFlashSaleMock.mockRejectedValue(
        new InvalidReferenceError('flash_sales', 'product_ids', 999999),
      );
      await expect(service.create(body(VALID_BODY))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('solo pasa lo que llega; sin sale_builder no toca los productos', async () => {
      updateFlashSaleMock.mockResolvedValue(makeFlashSaleRecord());

      await service.update(1, body({ title: 'Otro' }));

      expect(updateFlashSaleMock).toHaveBeenCalledWith(1, { title: 'Otro' });
    });

    it('id fuera de rango ⇒ 404 sin tocar la base (US-31)', async () => {
      await expect(service.update(1e21, body({}))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(updateFlashSaleMock).not.toHaveBeenCalled();
    });

    it('inexistente ⇒ 404', async () => {
      updateFlashSaleMock.mockRejectedValue(
        new RecordNotFoundError('flash_sales', 999),
      );
      await expect(
        service.update(999, body({ title: 'X' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('devuelve la venta borrada (V-6)', async () => {
      deleteFlashSaleMock.mockResolvedValue(makeFlashSaleRecord());
      expect((await service.remove(1)).id).toBe(1);
    });

    it('inexistente ⇒ 404', async () => {
      deleteFlashSaleMock.mockRejectedValue(
        new RecordNotFoundError('flash_sales', 999),
      );
      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
