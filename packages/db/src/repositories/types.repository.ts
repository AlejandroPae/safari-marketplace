/**
 * types.repository.ts — las "verticales" del marketplace (grocery,
 * gadget, books...). Controlan el layout del home; son 10 filas, no se
 * paginan.
 *
 * Las escrituras (`createType`/`updateType`/`deleteType`) siguen el
 * precedente de `upsertScrapedProduct` (`products.repository.ts:328-397`):
 * validación de dominio ANTES de escribir, `slug` intocable en update, y
 * traducción de la violación de Postgres a un error de dominio en el
 * `catch`. En `deleteType`, el
 * `CASCADE` de `categories.type_id`/`products.type_id` (`db/schema.sql:269,
 * :331`) queda como red de integridad, nunca como comportamiento de la API
 * — por eso se cuentan los dependientes ANTES de borrar.
 */

import type { Prisma } from '../../generated/prisma/client/client';
import { prisma } from '../client';
import { now } from '../clock';
import {
  DependentRowsError,
  RecordNotFoundError,
  translateCatalogWriteError,
} from '../domain-errors';
import { _toTypeRecord, type TypeRecord } from '../records';
import { type ExistingSlugLookup, generateSlug, normalizeSlug } from '../slug';

/** Filtro de la caja de búsqueda del admin (`pages/groups/index.tsx`). */
export interface ListTypesInput {
  /** Búsqueda parcial por nombre, case-insensitive. */
  name?: string;
}

/** Todos los types, en el orden de inserción (id asc, como el mock). */
export async function listTypes(
  input: ListTypesInput = {}
): Promise<TypeRecord[]> {
  const where: Prisma.TypeWhereInput = {
    ...(input.name && {
      name: { contains: input.name, mode: 'insensitive' as const },
    }),
  };
  const rows = await prisma.type.findMany({ where, orderBy: { id: 'asc' } });
  return rows.map(_toTypeRecord);
}

/** Un type por slug (`/{locale}/{type.slug}`). `null` si no existe. */
export async function findTypeBySlug(slug: string): Promise<TypeRecord | null> {
  const row = await prisma.type.findUnique({ where: { slug } });
  return row ? _toTypeRecord(row) : null;
}

// ---------------------------------------------------------------------------
// Escritura (admin)
// ---------------------------------------------------------------------------

/**
 * Call site de `ExistingSlugLookup`: la tabla nunca
 * llega al SQL compartido, `generateSlug` solo recibe esta función.
 */
const typeSlugs: ExistingSlugLookup = async (prefix) =>
  (
    await prisma.type.findMany({
      where: { slug: { startsWith: prefix } },
      select: { slug: true },
    })
  ).map((r) => r.slug);

export interface CreateTypeInput {
  name: string;
  /** Si llega no vacío, es la fuente del slug; si no, se deriva de `name`. */
  slug?: string | null;
  icon?: string | null;
  /** Ausente ⇒ `DEFAULT '{}'::jsonb` — nunca `null` (jsonb NOT NULL). */
  settings?: Prisma.InputJsonValue;
  /** Ausente ⇒ `DEFAULT '[]'::jsonb` — nunca `null` (jsonb NOT NULL). */
  banners?: Prisma.InputJsonValue;
  /** Ausente ⇒ `DEFAULT 'es'`. */
  language?: string;
}

/** El `slug` es inmutable en update. */
export type UpdateTypeInput = Omit<CreateTypeInput, 'slug'>;

/** Crea una vertical. El slug lo calcula `generateSlug`. */
export async function createType(input: CreateTypeInput): Promise<TypeRecord> {
  const slug = await generateSlug(
    { name: input.name, slug: input.slug },
    typeSlugs,
    'types'
  );

  try {
    const row = await prisma.type.create({
      data: {
        name: input.name,
        slug,
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.settings !== undefined && { settings: input.settings }),
        ...(input.banners !== undefined && { banners: input.banners }),
        ...(input.language !== undefined && { language: input.language }),
      },
    });
    return _toTypeRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, {
      aggregate: 'types',
      uniqueField: 'slug',
    });
  }
}

/**
 * Actualiza una vertical. El `slug` NUNCA se toca (precedente
 * `products.repository.ts:382`). Cuando `input.name` llega, se valida con
 * `normalizeSlug` (vía `generateSlug`'s hermano, `normalizeSlug` directo) y
 * se descarta el resultado — solo por su efecto lateral `EmptySlugError`:
 * `types.name` es `text NOT NULL` donde
 * `''` es legal para Postgres, así que sin esta guarda la fila quedaría
 * silenciosamente corrupta.
 */
export async function updateType(
  id: number,
  input: UpdateTypeInput
): Promise<TypeRecord> {
  if (input.name !== undefined) {
    await normalizeSlug(input.name, 'types');
  }

  try {
    const row = await prisma.type.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.settings !== undefined && { settings: input.settings }),
        ...(input.banners !== undefined && { banners: input.banners }),
        ...(input.language !== undefined && { language: input.language }),
        updatedAt: now(),
      },
    });
    return _toTypeRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, {
      aggregate: 'types',
      id,
      uniqueField: 'slug',
    });
  }
}

/**
 * Borra una vertical. `categories.type_id`/`products.type_id`
 * son `ON DELETE CASCADE` (`db/schema.sql:269,331`), así que un borrado
 * ingenuo se llevaría por delante categorías Y productos de la vertical. Se
 * cuentan ambos dependientes ANTES de borrar; cualquiera > 0 ⇒
 * `DependentRowsError` (409) y NO se borra nada. Sin transacción — el TOCTOU
 * entre el conteo y el `DELETE` es un riesgo bajo, asumido y sin cerrar.
 */
export async function deleteType(id: number): Promise<TypeRecord> {
  const existing = await prisma.type.findUnique({ where: { id } });
  if (!existing) {
    throw new RecordNotFoundError('types', id);
  }

  const [categories, products] = await Promise.all([
    prisma.category.count({ where: { typeId: id } }),
    prisma.product.count({ where: { typeId: id } }),
  ]);
  if (categories > 0 || products > 0) {
    throw new DependentRowsError('types', { categories, products });
  }

  try {
    await prisma.type.delete({ where: { id } });
    return _toTypeRecord(existing);
  } catch (error) {
    throw translateCatalogWriteError(error, {
      aggregate: 'types',
      id,
      uniqueField: 'slug',
    });
  }
}
