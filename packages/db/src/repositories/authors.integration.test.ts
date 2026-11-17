/**
 * Test de integración contra el Postgres real (sembrado por `just db-up`:
 * 11 autores, ids 12..2, todos aprobados). Lectura y escritura (US-93).
 *
 * Las escrituras usan el centinela `zz-authors-` en el nombre, que
 * `generateSlug` lleva al slug. Las lecturas van ANTES que las escrituras:
 * asertan conteos del seed y vitest corre los `describe` de un archivo en
 * orden.
 */

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../client';
import { _setNowProvider } from '../clock';
import { EmptySlugError, RecordNotFoundError } from '../domain-errors';
import {
  createAuthor,
  deleteAuthor,
  findAuthorBySlug,
  listAuthors,
  listTopAuthors,
  updateAuthor,
} from './authors.repository';

const SENTINEL_PREFIX = 'zz-authors-';

const cleanup = () =>
  prisma.author.deleteMany({
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

describe('listAuthors — seed', () => {
  it('lista los 11, id desc, 30 por página por defecto, JSON-safe', async () => {
    const { items, total } = await listAuthors();
    expect(total).toBe(11);
    expect(items.map((r) => r.id)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
    expect(() => JSON.stringify(items)).not.toThrow();
  });

  it('pagina: la página 2 de 5 son los ids 7..3', async () => {
    const { items, total } = await listAuthors({ page: 2, limit: 5 });
    expect(total).toBe(11);
    expect(items.map((r) => r.id)).toEqual([7, 6, 5, 4, 3]);
  });

  it('busca por nombre o slug, case-insensitive', async () => {
    expect(
      (await listAuthors({ name: 'KAITY' })).items.map((r) => r.id)
    ).toEqual([12]);
    expect(
      (await listAuthors({ name: 'p-price' })).items.map((r) => r.id)
    ).toEqual([10]);
  });

  it('filtra por aprobación: los 11 del seed están aprobados', async () => {
    expect((await listAuthors({ isApproved: true })).total).toBe(11);
    expect((await listAuthors({ isApproved: false })).total).toBe(0);
  });

  it('conserva json verbatim: socials [] e image {id, original, thumbnail}', async () => {
    const kaity = await findAuthorBySlug('kaity-lerry');
    expect(kaity?.socials).toEqual([]);
    expect(Object.keys(kaity?.image as object)).toEqual([
      'id',
      'original',
      'thumbnail',
    ]);
    expect(kaity?.born?.toJSON()).toBe('1965-06-21T18:00:00.000Z');
    expect(kaity?.death).toBeNull();
  });
});

describe('listTopAuthors', () => {
  it('ordena por products_count desc y, con empate, por id desc', async () => {
    const top = await listTopAuthors(4);
    expect(top.map((r) => [r.id, r.productsCount])).toEqual([
      [10, 9],
      [4, 8],
      [9, 7],
      [8, 7],
    ]);
  });

  it('10 por defecto', async () => {
    expect(await listTopAuthors()).toHaveLength(10);
  });
});

describe('findAuthorBySlug', () => {
  it('devuelve null si no existe', async () => {
    expect(await findAuthorBySlug('no-existe')).toBeNull();
  });
});

describe('createAuthor', () => {
  it('crea con slug derivado del nombre y los defaults', async () => {
    const created = await createAuthor({
      name: `${SENTINEL_PREFIX}Nuevo`,
      socials: [{ icon: 'FacebookIcon', url: 'https://example.com' }],
    });
    expect(created.slug).toBe(`${SENTINEL_PREFIX}nuevo`);
    expect(created.isApproved).toBe(true);
    expect(created.productsCount).toBe(0);
    expect(created.socials).toEqual([
      { icon: 'FacebookIcon', url: 'https://example.com' },
    ]);
  });

  it('nombre repetido ⇒ slug con sufijo, no colisión', async () => {
    const otro = await createAuthor({ name: `${SENTINEL_PREFIX}Nuevo` });
    expect(otro.slug).not.toBe(`${SENTINEL_PREFIX}nuevo`);
    expect(otro.slug.startsWith(`${SENTINEL_PREFIX}nuevo`)).toBe(true);
  });
});

describe('updateAuthor', () => {
  it('cambia aprobación y nombre, no el slug, y fija updatedAt desde clock.ts', async () => {
    const created = await createAuthor({ name: `${SENTINEL_PREFIX}Editable` });
    const future = new Date('2030-01-01T00:00:00.000Z');
    try {
      _setNowProvider(() => future);
      const updated = await updateAuthor(created.id, {
        name: `${SENTINEL_PREFIX}Renombrado`,
        isApproved: false,
      });
      expect(updated.slug).toBe(created.slug);
      expect(updated.name).toBe(`${SENTINEL_PREFIX}Renombrado`);
      expect(updated.isApproved).toBe(false);
      expect(updated.updatedAt.toJSON()).toBe(future.toJSON());
    } finally {
      _setNowProvider(() => new Date());
    }
  });

  it('nombre que normaliza a vacío ⇒ EmptySlugError', async () => {
    const created = await createAuthor({ name: `${SENTINEL_PREFIX}Vacio` });
    await expect(
      updateAuthor(created.id, { name: '!!!' })
    ).rejects.toBeInstanceOf(EmptySlugError);
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(
      updateAuthor(999_999, { isApproved: false })
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});

describe('deleteAuthor', () => {
  it('borra y devuelve la fila borrada', async () => {
    const created = await createAuthor({ name: `${SENTINEL_PREFIX}Borrable` });
    const deleted = await deleteAuthor(created.id);
    expect(deleted.id).toBe(created.id);
    expect(await findAuthorBySlug(created.slug)).toBeNull();
  });

  it('id inexistente ⇒ RecordNotFoundError', async () => {
    await expect(deleteAuthor(999_999)).rejects.toBeInstanceOf(
      RecordNotFoundError
    );
  });
});
