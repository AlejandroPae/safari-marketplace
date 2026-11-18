/**
 * flash-sale.repository.ts — ventas flash del catálogo (US-94, Épico 92).
 *
 * Padre `flash_sales` + tabla puente `flash_sale_products` hacia
 * `products`. La venta es global (el mock no trae `shop_id`). La tabla
 * puente es la fuente de verdad de los productos de una venta: el
 * `sale_builder.product_ids` que se guarda se reescribe con ella en cada
 * escritura, y las lecturas hidratan los productos con el mismo include y
 * el mismo mapper que `products.repository.ts` (precedente
 * `wishlists.repository.ts`).
 *
 * Las escrituras van en una transacción interactiva: o se escriben la venta
 * y todas sus filas puente, o nada. Los CHECK de la tabla y la existencia
 * de los productos se validan ANTES de abrirla, con errores de dominio
 * (400); la FK sigue cubriendo la carrera de un producto borrado entre la
 * validación y la escritura (P2003 → `InvalidReferenceError`).
 */

import type { Prisma } from '../../generated/prisma/client/client';
import { prisma } from '../client';
import { now } from '../clock';
import {
  InvalidFieldValueError,
  InvalidReferenceError,
  RecordNotFoundError,
  translateCatalogWriteError,
} from '../domain-errors';
import { _toFlashSaleRecord, type FlashSaleRecord } from '../records';
import { type ExistingSlugLookup, generateSlug, normalizeSlug } from '../slug';
import {
  _toProductRecord,
  PRODUCT_INCLUDE,
  type ProductRecord,
} from './products.repository';

const AGGREGATE = 'flash_sales';

/**
 * Include de una venta con sus productos hidratados, en orden de `product_id`.
 * Exportado para `flash-sale-requests.repository.ts` (US-97); no está en el
 * barrel.
 */
export const FLASH_SALE_INCLUDE = {
  products: {
    orderBy: { productId: 'asc' as const },
    include: { product: { include: PRODUCT_INCLUDE } },
  },
};

type FlashSalePayload = Prisma.FlashSaleGetPayload<{
  include: typeof FLASH_SALE_INCLUDE;
}>;

/** Un producto que se está borrando en cascada se descarta (como `listProducts`). */
export function _toHydratedFlashSale(row: FlashSalePayload): FlashSaleRecord {
  const products = row.products
    .map((link) => _toProductRecord(link.product))
    .filter((record): record is ProductRecord => record !== null);
  return _toFlashSaleRecord(row, products);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface ListFlashSalesInput {
  /** Búsqueda parcial por título, case-insensitive. */
  title?: string;
  /** 1-based. Default 1. */
  page?: number;
  /** Default 10, como el mock. */
  limit?: number;
}

/**
 * Listado paginado, `id DESC` como el mock (`flash-sale.json` va 3, 1). Sin
 * filtro por vigencia (R-3 del épico): las ventas sembradas ya terminaron.
 */
export async function listFlashSales(
  input: ListFlashSalesInput = {}
): Promise<{ items: FlashSaleRecord[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const limit = input.limit ?? 10;
  const where: Prisma.FlashSaleWhereInput = input.title
    ? { title: { contains: input.title, mode: 'insensitive' } }
    : {};

  const [rows, total] = await Promise.all([
    prisma.flashSale.findMany({
      where,
      orderBy: { id: 'desc' },
      include: FLASH_SALE_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.flashSale.count({ where }),
  ]);
  return { items: rows.map(_toHydratedFlashSale), total };
}

/** Una venta por slug, con sus productos. `null` si no existe. */
export async function findFlashSaleBySlug(
  slug: string
): Promise<FlashSaleRecord | null> {
  const row = await prisma.flashSale.findUnique({
    where: { slug },
    include: FLASH_SALE_INCLUDE,
  });
  return row ? _toHydratedFlashSale(row) : null;
}

/**
 * Ventas en las que está un producto, `id DESC` como el listado, con sus
 * productos (US-96, `product-flash-sale-info`). `[]` si no está en
 * ninguna; `null` si el producto no existe (el servicio responde 404).
 */
export async function listProductFlashSales(
  productId: number
): Promise<FlashSaleRecord[] | null> {
  const product = await prisma.product.findUnique({
    where: { id: BigInt(productId) },
    select: { id: true },
  });
  if (!product) return null;

  const rows = await prisma.flashSale.findMany({
    where: { products: { some: { productId: product.id } } },
    orderBy: { id: 'desc' },
    include: FLASH_SALE_INCLUDE,
  });
  return rows.map(_toHydratedFlashSale);
}

export interface ListFlashSaleProductsInput {
  /** Venta de la que listar productos. Ausente ⇒ los de todas, sin repetir. */
  slug?: string;
  /** 1-based. Default 1. */
  page?: number;
  /** Default 10, como el mock. */
  limit?: number;
}

/**
 * Productos de una venta, en orden de `product_id`. Devuelve `null` si el
 * `slug` no corresponde a ninguna venta (el servicio responde 404).
 */
export async function listFlashSaleProducts(
  input: ListFlashSaleProductsInput = {}
): Promise<{ items: ProductRecord[]; total: number } | null> {
  const page = Math.max(1, input.page ?? 1);
  const limit = input.limit ?? 10;

  let where: Prisma.ProductWhereInput = { flashSales: { some: {} } };
  if (input.slug) {
    const sale = await prisma.flashSale.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (!sale) return null;
    where = { flashSales: { some: { flashSaleId: sale.id } } };
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { id: 'asc' },
      include: PRODUCT_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);
  const items = rows
    .map(_toProductRecord)
    .filter((record): record is ProductRecord => record !== null);
  return { items, total };
}

// ---------------------------------------------------------------------------
// Escritura (admin)
// ---------------------------------------------------------------------------

export const FLASH_SALE_TYPES = ['percentage', 'fixed_rate'] as const;

export interface CreateFlashSaleInput {
  title: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  type: string;
  rate: number;
  /** Ausente ⇒ `DEFAULT 1`. */
  saleStatus?: number;
  /**
   * Se guarda tal cual, salvo `product_ids`, que se reescribe con
   * `productIds`. Ausente ⇒ `{ data_type: 'handpicked_products' }`.
   */
  saleBuilder?: Prisma.InputJsonObject;
  /** Productos de la venta (tabla puente). Se deduplican conservando el orden. */
  productIds?: number[];
  /** Columnas `json` nullable: `null` se trata como ausente. */
  image?: Prisma.InputJsonValue;
  coverImage?: Prisma.InputJsonValue;
  /** Ausente ⇒ `DEFAULT 'es'`. */
  language?: string;
}

/**
 * Todo opcional. `productIds` presente ⇒ REEMPLAZA el conjunto de productos;
 * ausente ⇒ no se tocan. El slug es inmutable (precedente `updateTag`).
 */
export type UpdateFlashSaleInput = Partial<CreateFlashSaleInput>;

const flashSaleSlugs: ExistingSlugLookup = async (prefix) =>
  (
    await prisma.flashSale.findMany({
      where: { slug: { startsWith: prefix } },
      select: { slug: true },
    })
  ).map((r) => r.slug);

/** CHECKs de `flash_sales` que Prisma no modela, antes de escribir. */
function _assertChecks(values: {
  type?: string;
  rate?: number;
  saleStatus?: number;
  startDate?: Date;
  endDate?: Date;
}): void {
  if (
    values.type !== undefined &&
    !(FLASH_SALE_TYPES as readonly string[]).includes(values.type)
  ) {
    throw new InvalidFieldValueError(
      AGGREGATE,
      'type',
      values.type,
      'flash_sales_type_check'
    );
  }
  if (
    values.rate !== undefined &&
    (!Number.isFinite(values.rate) || values.rate < 0)
  ) {
    throw new InvalidFieldValueError(
      AGGREGATE,
      'rate',
      values.rate,
      'flash_sales_rate_check'
    );
  }
  if (values.saleStatus !== undefined && ![0, 1].includes(values.saleStatus)) {
    throw new InvalidFieldValueError(
      AGGREGATE,
      'sale_status',
      values.saleStatus,
      'flash_sales_sale_status_check'
    );
  }
  if (
    values.startDate !== undefined &&
    values.endDate !== undefined &&
    values.endDate < values.startDate
  ) {
    throw new InvalidFieldValueError(
      AGGREGATE,
      'end_date',
      values.endDate.toISOString(),
      'flash_sales_dates_check'
    );
  }
}

/** Deduplica y comprueba que todos los productos existan (400 si falta uno). */
async function _resolveProductIds(ids: number[]): Promise<number[]> {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new InvalidReferenceError(AGGREGATE, 'product_ids', String(id));
    }
  }
  if (unique.length === 0) return unique;
  const found = await prisma.product.findMany({
    where: { id: { in: unique.map(BigInt) } },
    select: { id: true },
  });
  const existing = new Set(found.map((r) => Number(r.id)));
  const missing = unique.find((id) => !existing.has(id));
  if (missing !== undefined) {
    throw new InvalidReferenceError(AGGREGATE, 'product_ids', missing);
  }
  return unique;
}

/**
 * `sale_builder` con `product_ids` reescrito. Exportado para
 * `flash-sale-requests.repository.ts` (US-98); no está en el barrel.
 */
export function _saleBuilder(
  base: Prisma.JsonValue | Prisma.InputJsonObject | undefined,
  productIds: number[]
): Prisma.InputJsonObject {
  const object =
    base && typeof base === 'object' && !Array.isArray(base)
      ? (base as Prisma.InputJsonObject)
      : { data_type: 'handpicked_products' };
  return { ...object, product_ids: productIds };
}

/** Crea la venta y sus filas puente en una transacción. */
export async function createFlashSale(
  input: CreateFlashSaleInput
): Promise<FlashSaleRecord> {
  _assertChecks(input);
  const slug = await generateSlug(
    { name: input.title },
    flashSaleSlugs,
    AGGREGATE
  );
  const productIds = await _resolveProductIds(input.productIds ?? []);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.flashSale.create({
        data: {
          title: input.title,
          slug,
          startDate: input.startDate,
          endDate: input.endDate,
          type: input.type,
          rate: input.rate,
          saleBuilder: _saleBuilder(input.saleBuilder, productIds),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.saleStatus !== undefined && {
            saleStatus: input.saleStatus,
          }),
          ...(input.image != null && { image: input.image }),
          ...(input.coverImage != null && { coverImage: input.coverImage }),
          ...(input.language !== undefined && { language: input.language }),
        },
      });
      if (productIds.length > 0) {
        await tx.flashSaleProduct.createMany({
          data: productIds.map((productId) => ({
            flashSaleId: created.id,
            productId,
          })),
        });
      }
      return tx.flashSale.findUniqueOrThrow({
        where: { id: created.id },
        include: FLASH_SALE_INCLUDE,
      });
    });
    return _toHydratedFlashSale(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE });
  }
}

/**
 * Actualiza la venta y, si llega `productIds`, reemplaza sus filas puente,
 * todo en una transacción. Las fechas se validan contra las guardadas
 * cuando solo llega una. `updatedAt: now()` explícito (US-32).
 */
export async function updateFlashSale(
  id: number,
  input: UpdateFlashSaleInput
): Promise<FlashSaleRecord> {
  const existing = await prisma.flashSale.findUnique({ where: { id } });
  if (!existing) {
    throw new RecordNotFoundError(AGGREGATE, id);
  }
  if (input.title !== undefined) {
    await normalizeSlug(input.title, AGGREGATE);
  }
  _assertChecks({
    ...input,
    startDate: input.startDate ?? existing.startDate,
    endDate: input.endDate ?? existing.endDate,
  });
  const productIds =
    input.productIds !== undefined
      ? await _resolveProductIds(input.productIds)
      : undefined;

  const touchesBuilder =
    productIds !== undefined || input.saleBuilder !== undefined;

  try {
    const row = await prisma.$transaction(async (tx) => {
      let ids = productIds;
      if (ids !== undefined) {
        await tx.flashSaleProduct.deleteMany({ where: { flashSaleId: id } });
        if (ids.length > 0) {
          await tx.flashSaleProduct.createMany({
            data: ids.map((productId) => ({ flashSaleId: id, productId })),
          });
        }
      } else if (touchesBuilder) {
        ids = (
          await tx.flashSaleProduct.findMany({
            where: { flashSaleId: id },
            orderBy: { productId: 'asc' },
            select: { productId: true },
          })
        ).map((r) => Number(r.productId));
      }

      await tx.flashSale.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.startDate !== undefined && { startDate: input.startDate }),
          ...(input.endDate !== undefined && { endDate: input.endDate }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.rate !== undefined && { rate: input.rate }),
          ...(input.saleStatus !== undefined && {
            saleStatus: input.saleStatus,
          }),
          ...(touchesBuilder && {
            saleBuilder: _saleBuilder(
              input.saleBuilder ?? existing.saleBuilder,
              ids ?? []
            ),
          }),
          ...(input.image != null && { image: input.image }),
          ...(input.coverImage != null && { coverImage: input.coverImage }),
          ...(input.language !== undefined && { language: input.language }),
          updatedAt: now(),
        },
      });
      return tx.flashSale.findUniqueOrThrow({
        where: { id },
        include: FLASH_SALE_INCLUDE,
      });
    });
    return _toHydratedFlashSale(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE, id });
  }
}

/**
 * Borra la venta (cascada a la tabla puente) y devuelve la fila borrada con
 * los productos que tenía (find-then-delete, como `deleteTag`).
 */
export async function deleteFlashSale(id: number): Promise<FlashSaleRecord> {
  const existing = await prisma.flashSale.findUnique({
    where: { id },
    include: FLASH_SALE_INCLUDE,
  });
  if (!existing) {
    throw new RecordNotFoundError(AGGREGATE, id);
  }

  try {
    await prisma.flashSale.delete({ where: { id } });
    return _toHydratedFlashSale(existing);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE, id });
  }
}
