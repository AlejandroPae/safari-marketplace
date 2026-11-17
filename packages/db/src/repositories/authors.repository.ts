/**
 * authors.repository.ts — autores del catálogo (US-93, Épico 92).
 *
 * Calco de `manufacturers.repository.ts` sin FK saliente: el autor es global
 * (el mock no trae `shop_id`) y nada lo referencia, porque `products` no
 * tiene `author_id` (DA-3 del Épico 92). Por eso `deleteAuthor` no cuenta
 * dependientes y su único error es `RecordNotFoundError`.
 *
 * `productsCount` se siembra y se conserva, pero ninguna escritura lo toca:
 * no hay productos con los que contarlo (DA-4).
 */

import type { Prisma } from '../../generated/prisma/client/client';
import { prisma } from '../client';
import { now } from '../clock';
import {
  RecordNotFoundError,
  translateCatalogWriteError,
} from '../domain-errors';
import { _toAuthorRecord, type AuthorRecord } from '../records';
import { type ExistingSlugLookup, generateSlug, normalizeSlug } from '../slug';

export interface ListAuthorsInput {
  /** Búsqueda parcial por nombre o slug, case-insensitive. */
  name?: string;
  isApproved?: boolean;
  /** 1-based. Default 1. */
  page?: number;
  /** Default 30, como el mock. */
  limit?: number;
}

/**
 * Listado paginado. `orderBy: { id: 'desc' }` preserva el orden del mock
 * (`authors.json` va 12..2). El mock buscaba con Fuse sobre `name` y `slug`;
 * aquí es ILIKE sobre los dos.
 */
export async function listAuthors(input: ListAuthorsInput = {}): Promise<{
  items: AuthorRecord[];
  total: number;
}> {
  const page = Math.max(1, input.page ?? 1);
  const limit = input.limit ?? 30;
  const where: Prisma.AuthorWhereInput = {
    ...(input.isApproved !== undefined && { isApproved: input.isApproved }),
    ...(input.name && {
      OR: [
        { name: { contains: input.name, mode: 'insensitive' as const } },
        { slug: { contains: input.name, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.author.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.author.count({ where }),
  ]);

  return { items: rows.map(_toAuthorRecord), total };
}

/**
 * Los `limit` autores con más productos (V-4 de US-93). Con empate, el más
 * reciente primero, para que el orden sea estable.
 */
export async function listTopAuthors(limit = 10): Promise<AuthorRecord[]> {
  const rows = await prisma.author.findMany({
    orderBy: [{ productsCount: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map(_toAuthorRecord);
}

/** Un autor por slug. `null` si no existe. */
export async function findAuthorBySlug(
  slug: string
): Promise<AuthorRecord | null> {
  const row = await prisma.author.findUnique({ where: { slug } });
  return row ? _toAuthorRecord(row) : null;
}

// ---------------------------------------------------------------------------
// Escritura (admin)
// ---------------------------------------------------------------------------

const authorSlugs: ExistingSlugLookup = async (prefix) =>
  (
    await prisma.author.findMany({
      where: { slug: { startsWith: prefix } },
      select: { slug: true },
    })
  ).map((r) => r.slug);

export interface CreateAuthorInput {
  name: string;
  /** Si llega no vacío, es la fuente del slug; si no, se deriva de `name`. */
  slug?: string | null;
  bio?: string | null;
  quote?: string | null;
  born?: Date | null;
  death?: Date | null;
  languages?: string | null;
  socials?: Prisma.InputJsonValue;
  /** Columnas `json` nullable: `null` se trata como ausente (DD-5). */
  image?: Prisma.InputJsonValue;
  coverImage?: Prisma.InputJsonValue;
  /** Ausente ⇒ `DEFAULT true`. */
  isApproved?: boolean;
  /** Ausente ⇒ `DEFAULT 'es'`. */
  language?: string;
}

/** Todo opcional salvo el `slug`, que es inmutable (precedente `updateTag`). */
export type UpdateAuthorInput = Partial<Omit<CreateAuthorInput, 'slug'>>;

/** Crea un autor. El slug lo calcula `generateSlug` (precedente `createType`). */
export async function createAuthor(
  input: CreateAuthorInput
): Promise<AuthorRecord> {
  const slug = await generateSlug(
    { name: input.name, slug: input.slug },
    authorSlugs,
    'authors'
  );

  try {
    const row = await prisma.author.create({
      data: {
        name: input.name,
        slug,
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.quote !== undefined && { quote: input.quote }),
        ...(input.born !== undefined && { born: input.born }),
        ...(input.death !== undefined && { death: input.death }),
        ...(input.languages !== undefined && { languages: input.languages }),
        ...(input.socials != null && { socials: input.socials }),
        ...(input.image != null && { image: input.image }),
        ...(input.coverImage != null && { coverImage: input.coverImage }),
        ...(input.isApproved !== undefined && { isApproved: input.isApproved }),
        ...(input.language !== undefined && { language: input.language }),
      },
    });
    return _toAuthorRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: 'authors' });
  }
}

/**
 * Actualiza un autor. Un `name` que normaliza a slug vacío da
 * `EmptySlugError`, igual que en `updateManufacturer`. Una clave ausente del
 * input no llega al `data` de Prisma. `updatedAt: now()` explícito: ninguna
 * tabla tiene trigger (US-32).
 */
export async function updateAuthor(
  id: number,
  input: UpdateAuthorInput
): Promise<AuthorRecord> {
  if (input.name !== undefined) {
    await normalizeSlug(input.name, 'authors');
  }

  try {
    const row = await prisma.author.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.quote !== undefined && { quote: input.quote }),
        ...(input.born !== undefined && { born: input.born }),
        ...(input.death !== undefined && { death: input.death }),
        ...(input.languages !== undefined && { languages: input.languages }),
        ...(input.socials != null && { socials: input.socials }),
        ...(input.image != null && { image: input.image }),
        ...(input.coverImage != null && { coverImage: input.coverImage }),
        ...(input.isApproved !== undefined && { isApproved: input.isApproved }),
        ...(input.language !== undefined && { language: input.language }),
        updatedAt: now(),
      },
    });
    return _toAuthorRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: 'authors', id });
  }
}

/** Borra un autor y devuelve la fila borrada (find-then-delete, como `deleteTag`). */
export async function deleteAuthor(id: number): Promise<AuthorRecord> {
  const existing = await prisma.author.findUnique({ where: { id } });
  if (!existing) {
    throw new RecordNotFoundError('authors', id);
  }

  try {
    await prisma.author.delete({ where: { id } });
    return _toAuthorRecord(existing);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: 'authors', id });
  }
}
