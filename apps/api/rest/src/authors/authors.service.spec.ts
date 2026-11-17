/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * Tests unitarios de `AuthorsService` (US-93). Mismo arnés que
 * `faqs.service.spec.ts`: se mockea solo el acceso a datos de `@safari/db` y
 * se dejan REALES las clases de error de dominio y `toWriteHttpException`.
 */
import 'reflect-metadata';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createAuthor,
  deleteAuthor,
  findAuthorBySlug,
  listAuthors,
  listTopAuthors,
  RecordNotFoundError,
  updateAuthor,
  type AuthorRecord,
} from '@safari/db';
import { AuthorsService } from './authors.service.js';
import { CreateAuthorDto } from './dto/create-author.dto.js';
import { GetAuthorDto } from './dto/get-author.dto.js';
import { GetTopAuthorsDto } from './dto/get-top-authors.dto.js';
import { UpdateAuthorDto } from './dto/update-author.dto.js';

vi.mock('@safari/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@safari/db')>()),
  listAuthors: vi.fn(),
  listTopAuthors: vi.fn(),
  findAuthorBySlug: vi.fn(),
  createAuthor: vi.fn(),
  updateAuthor: vi.fn(),
  deleteAuthor: vi.fn(),
}));

const listAuthorsMock = vi.mocked(listAuthors);
const listTopAuthorsMock = vi.mocked(listTopAuthors);
const findAuthorBySlugMock = vi.mocked(findAuthorBySlug);
const createAuthorMock = vi.mocked(createAuthor);
const updateAuthorMock = vi.mocked(updateAuthor);
const deleteAuthorMock = vi.mocked(deleteAuthor);

const NOW = new Date('2026-11-17T00:00:00Z');

function makeAuthorRecord(overrides: Partial<AuthorRecord> = {}): AuthorRecord {
  return {
    id: 12,
    name: 'Kaity lerry',
    slug: 'kaity-lerry',
    bio: 'Bio',
    quote: 'Quote',
    born: new Date('1965-06-21T18:00:00.000Z'),
    death: null,
    languages: 'English',
    socials: [],
    image: { id: 1591, original: 'o.jpg', thumbnail: 't.jpg' },
    coverImage: { id: 1592, original: 'c.jpg', thumbnail: 'ct.jpg' },
    productsCount: 5,
    isApproved: true,
    language: 'en',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Sin `transform` en el `ValidationPipe`, query y cuerpo llegan crudos. */
const query = (input: Record<string, unknown>) =>
  input as unknown as GetAuthorDto;
const body = (input: Record<string, unknown>) =>
  input as unknown as CreateAuthorDto & UpdateAuthorDto;

const MOCK_KEYS = [
  'id',
  'name',
  'language',
  'is_approved',
  'translated_languages',
  'slug',
  'bio',
  'quote',
  'products_count',
  'born',
  'death',
  'languages',
  'socials',
  'image',
  'cover_image',
];

describe('AuthorsService', () => {
  let service: AuthorsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new AuthorsService();
  });

  describe('getAuthors', () => {
    it('emite las claves del mock en su orden, con is_approved 1/0 y born ISO', async () => {
      listAuthorsMock.mockResolvedValue({
        items: [makeAuthorRecord()],
        total: 1,
      });

      const result = await service.getAuthors(query({}));

      expect(Object.keys(result.data[0])).toEqual(MOCK_KEYS);
      expect(result.data[0]).toMatchObject({
        is_approved: 1,
        translated_languages: ['en'],
        born: '1965-06-21T18:00:00.000Z',
        death: null,
      });
      expect(listAuthorsMock).toHaveBeenCalledWith({
        name: undefined,
        isApproved: undefined,
        page: 1,
        limit: 30,
      });
    });

    it('lee name e is_approved de search; type se ignora', async () => {
      listAuthorsMock.mockResolvedValue({ items: [], total: 0 });

      await service.getAuthors(
        query({
          search: 'type:books;name:kaity;is_approved:0',
          limit: '5',
          page: '2',
        }),
      );

      expect(listAuthorsMock).toHaveBeenCalledWith({
        name: 'kaity',
        isApproved: false,
        page: 2,
        limit: 5,
      });
    });

    it('conserva per_page como string cuando llega limit (Decision A)', async () => {
      listAuthorsMock.mockResolvedValue({ items: [], total: 11 });

      const result = await service.getAuthors(query({ limit: '5', page: '2' }));

      expect(result.per_page).toBe('5');
      expect(result.first_page_url).toContain(
        '/authors?search=undefined&limit=5&page=1',
      );
    });

    it('caída de conexión ⇒ 503', async () => {
      listAuthorsMock.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), {
          code: 'P1001',
        }),
      );

      await expect(service.getAuthors(query({}))).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getAuthorBySlug', () => {
    it('devuelve el autor', async () => {
      findAuthorBySlugMock.mockResolvedValue(makeAuthorRecord());
      expect((await service.getAuthorBySlug('kaity-lerry')).slug).toBe(
        'kaity-lerry',
      );
    });

    it('inexistente ⇒ 404 (V-2)', async () => {
      findAuthorBySlugMock.mockResolvedValue(null);
      await expect(service.getAuthorBySlug('no-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getTopAuthors', () => {
    it('limit de la query como número; 10 por defecto', async () => {
      listTopAuthorsMock.mockResolvedValue([makeAuthorRecord()]);

      await service.getTopAuthors({
        limit: '5',
      } as unknown as GetTopAuthorsDto);
      await service.getTopAuthors({} as GetTopAuthorsDto);

      expect(listTopAuthorsMock).toHaveBeenNthCalledWith(1, 5);
      expect(listTopAuthorsMock).toHaveBeenNthCalledWith(2, 10);
    });
  });

  describe('create', () => {
    it('pasa el formulario del admin e ignora shop_id', async () => {
      createAuthorMock.mockResolvedValue(makeAuthorRecord({ id: 13 }));

      await service.create(
        body({
          name: 'Nuevo',
          shop_id: '1',
          born: '1990-01-01',
          death: '',
          socials: [{ icon: 'FacebookIcon', url: 'https://x' }],
          image: { id: 1, original: 'o', thumbnail: 't' },
          cover_image: { id: 1, original: 'o', thumbnail: 't' },
          language: 'en',
        }),
      );

      const input = createAuthorMock.mock.calls[0][0];
      expect(input).toMatchObject({
        name: 'Nuevo',
        slug: null,
        born: new Date('1990-01-01'),
        death: null,
        socials: [{ icon: 'FacebookIcon', url: 'https://x' }],
        language: 'en',
      });
      expect(input).not.toHaveProperty('shopId');
    });

    it('fecha ilegible ⇒ 400 sin escribir', async () => {
      await expect(
        service.create(body({ name: 'Nuevo', born: 'no-es-fecha' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createAuthorMock).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('aprobar desde la lista del admin: solo is_approved', async () => {
      updateAuthorMock.mockResolvedValue(
        makeAuthorRecord({ isApproved: false }),
      );

      const result = await service.update(
        12,
        body({ id: 12, is_approved: false }),
      );

      expect(updateAuthorMock).toHaveBeenCalledWith(12, { isApproved: false });
      expect(result.is_approved).toBe(0);
    });

    it('id fuera de rango ⇒ 404 sin tocar la base (US-31)', async () => {
      await expect(service.update(1e21, body({}))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(updateAuthorMock).not.toHaveBeenCalled();
    });

    it('inexistente ⇒ 404', async () => {
      updateAuthorMock.mockRejectedValue(
        new RecordNotFoundError('authors', 999),
      );
      await expect(
        service.update(999, body({ is_approved: true })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('devuelve el autor borrado (V-3)', async () => {
      deleteAuthorMock.mockResolvedValue(makeAuthorRecord());
      expect((await service.remove(12)).id).toBe(12);
    });

    it('inexistente ⇒ 404', async () => {
      deleteAuthorMock.mockRejectedValue(
        new RecordNotFoundError('authors', 999),
      );
      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
