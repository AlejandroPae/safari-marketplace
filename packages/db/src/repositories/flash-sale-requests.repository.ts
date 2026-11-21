/**
 * flash-sale-requests.repository.ts — solicitudes de vendedores para ventas
 * flash.
 *
 * Padre `flash_sale_requests` + tabla puente `flash_sale_request_products`
 * hacia `products`. La tienda de una solicitud se deduce de sus productos:
 * todos deben ser de la misma tienda, y esa tienda no cambia al editar. No
 * hay mock: las tablas nacen vacías.
 *
 * Visibilidad: con `viewerId`, las lecturas solo ven las solicitudes de las
 * tiendas de las que ese usuario es dueño o staff (`shop_staff`). Sin
 * `viewerId` (super admin) ven todas. La autorización de las escrituras
 * vive en el servicio de Nest (precedente `products.service.ts`).
 *
 * Las escrituras validan antes de escribir: al menos 1 producto, `note` no
 * vacía, venta y productos existentes, una sola tienda. La solicitud y sus
 * filas puente se escriben en una sola sentencia anidada de Prisma, que es
 * atómica.
 *
 * Aprobar y rechazar escriben en `flash_sale_products`, la fuente de
 * verdad de la venta, en una transacción que bloquea la solicitud y la
 * venta (`FOR UPDATE`): dos aprobaciones a la vez no pueden pisarse el
 * `sale_builder.product_ids`. `added_to_sale` marca lo que metió la
 * aprobación, y rechazar retira solo eso.
 */

import type { Prisma } from '../../generated/prisma/client/client';
import { prisma } from '../client';
import { now } from '../clock';
import {
  CATALOG_ERROR_CODES,
  CatalogWriteError,
  InvalidReferenceError,
  RecordNotFoundError,
  translateCatalogWriteError,
} from '../domain-errors';
import {
  _toFlashSaleRequestRecord,
  type FlashSaleRequestRecord,
  type FlashSaleRequestStatus,
} from '../records';
import {
  _saleBuilder,
  _toHydratedFlashSale,
  FLASH_SALE_INCLUDE,
} from './flash-sale.repository';
import {
  _toProductRecord,
  PRODUCT_INCLUDE,
  type ProductRecord,
} from './products.repository';

const AGGREGATE = 'flash_sale_requests';

export const FLASH_SALE_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const satisfies readonly FlashSaleRequestStatus[];

/** Cuerpo de solicitud inválido sin CHECK detrás. Reutiliza el código del 400. */
export class InvalidFlashSaleRequestError extends CatalogWriteError {
  readonly code = CATALOG_ERROR_CODES.InvalidReference;
  constructor(message: string) {
    super(message, AGGREGATE);
    this.name = 'InvalidFlashSaleRequestError';
  }
}

/** La solicitud no está en un estado que admita la operación. Reutiliza el código del 409. */
export class FlashSaleRequestStateError extends CatalogWriteError {
  readonly code = CATALOG_ERROR_CODES.SlugConflict;
  readonly status: FlashSaleRequestStatus;
  constructor(id: number, status: FlashSaleRequestStatus, action: string) {
    super(
      `La solicitud ${id} está \`${status}\`: no se puede ${action}.`,
      AGGREGATE
    );
    this.name = 'FlashSaleRequestStateError';
    this.status = status;
  }
}

const FLASH_SALE_REQUEST_INCLUDE = {
  products: {
    orderBy: { productId: 'asc' as const },
    include: { product: { include: PRODUCT_INCLUDE } },
  },
  flashSale: { include: FLASH_SALE_INCLUDE },
};

type FlashSaleRequestPayload = Prisma.FlashSaleRequestGetPayload<{
  include: typeof FLASH_SALE_REQUEST_INCLUDE;
}>;

/** Un producto que se está borrando en cascada se descarta (como `listProducts`). */
function _toRecord(row: FlashSaleRequestPayload): FlashSaleRequestRecord {
  const products = row.products
    .map((link) => _toProductRecord(link.product))
    .filter((record): record is ProductRecord => record !== null);
  return _toFlashSaleRequestRecord(
    row,
    products,
    _toHydratedFlashSale(row.flashSale)
  );
}

/** Tiendas de las que `viewerId` es dueño o staff. Ausente: sin filtro. */
function _visibleTo(viewerId?: number): Prisma.FlashSaleRequestWhereInput {
  if (viewerId === undefined) return {};
  const userId = BigInt(viewerId);
  return {
    shop: {
      OR: [{ ownerId: userId }, { staff: { some: { userId } } }],
    },
  };
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface ListFlashSaleRequestsInput {
  /** Búsqueda parcial por título, case-insensitive. */
  title?: string;
  shopId?: number;
  /** Solo las de las tiendas de este usuario (dueño o staff). */
  viewerId?: number;
  /** 1-based. Default 1. */
  page?: number;
  /** Default 10. */
  limit?: number;
}

/** Listado paginado en `id DESC`. */
export async function listFlashSaleRequests(
  input: ListFlashSaleRequestsInput = {}
): Promise<{ items: FlashSaleRequestRecord[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const limit = input.limit ?? 10;
  const where: Prisma.FlashSaleRequestWhereInput = {
    ..._visibleTo(input.viewerId),
    ...(input.title && {
      title: { contains: input.title, mode: 'insensitive' },
    }),
    ...(input.shopId !== undefined && { shopId: BigInt(input.shopId) }),
  };

  const [rows, total] = await Promise.all([
    prisma.flashSaleRequest.findMany({
      where,
      orderBy: { id: 'desc' },
      include: FLASH_SALE_REQUEST_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.flashSaleRequest.count({ where }),
  ]);
  return { items: rows.map(_toRecord), total };
}

/** Una solicitud por id. `null` si no existe o no es visible para `viewerId`. */
export async function findFlashSaleRequestById(
  id: number,
  options: { viewerId?: number } = {}
): Promise<FlashSaleRequestRecord | null> {
  const row = await prisma.flashSaleRequest.findFirst({
    where: { id: BigInt(id), ..._visibleTo(options.viewerId) },
    include: FLASH_SALE_REQUEST_INCLUDE,
  });
  return row ? _toRecord(row) : null;
}

export interface ListFlashSaleRequestProductsInput {
  requestId: number;
  viewerId?: number;
  /** Búsqueda parcial por nombre, case-insensitive. */
  name?: string;
  /** 1-based. Default 1. */
  page?: number;
  /** Default 10. */
  limit?: number;
}

/**
 * Productos de una solicitud en `id ASC`. `null` si la solicitud no existe
 * o no es visible para `viewerId` (el servicio responde 404).
 */
export async function listFlashSaleRequestProducts(
  input: ListFlashSaleRequestProductsInput
): Promise<{ items: ProductRecord[]; total: number } | null> {
  const page = Math.max(1, input.page ?? 1);
  const limit = input.limit ?? 10;
  const request = await prisma.flashSaleRequest.findFirst({
    where: { id: BigInt(input.requestId), ..._visibleTo(input.viewerId) },
    select: { id: true },
  });
  if (!request) return null;

  const where: Prisma.ProductWhereInput = {
    flashSaleRequests: { some: { requestId: request.id } },
    ...(input.name && {
      name: { contains: input.name, mode: 'insensitive' },
    }),
  };
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
// Escritura
// ---------------------------------------------------------------------------

/**
 * Tienda de una lista de productos: deduplica, comprueba que existan todos
 * (`InvalidReferenceError`) y que sean de una sola tienda
 * (`InvalidFlashSaleRequestError`). El servicio la usa para autorizar antes
 * de crear.
 */
export async function resolveFlashSaleRequestShop(
  productIds: number[]
): Promise<{ shopId: number; productIds: number[] }> {
  const unique = [...new Set(productIds)];
  if (unique.length === 0) {
    throw new InvalidFlashSaleRequestError(
      'Una solicitud de venta flash necesita al menos 1 producto.'
    );
  }
  for (const id of unique) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new InvalidReferenceError(AGGREGATE, 'requested_product_ids', id);
    }
  }
  const found = await prisma.product.findMany({
    where: { id: { in: unique.map(BigInt) } },
    select: { id: true, shopId: true },
  });
  const shopById = new Map(found.map((r) => [Number(r.id), Number(r.shopId)]));
  const missing = unique.find((id) => !shopById.has(id));
  if (missing !== undefined) {
    throw new InvalidReferenceError(
      AGGREGATE,
      'requested_product_ids',
      missing
    );
  }
  const shops = new Set(shopById.values());
  if (shops.size > 1) {
    throw new InvalidFlashSaleRequestError(
      `Los productos de una solicitud deben ser de una sola tienda; llegaron de ${shops.size} (${[...shops].join(', ')}).`
    );
  }
  return { shopId: [...shops][0], productIds: unique };
}

function _assertNote(note: string | undefined): void {
  if (note !== undefined && note.trim() === '') {
    throw new InvalidFlashSaleRequestError(
      'La nota de la solicitud no puede estar vacía.'
    );
  }
}

async function _assertFlashSale(flashSaleId: number): Promise<void> {
  const sale =
    Number.isSafeInteger(flashSaleId) && flashSaleId > 0
      ? await prisma.flashSale.findUnique({
          where: { id: BigInt(flashSaleId) },
          select: { id: true },
        })
      : null;
  if (!sale) {
    throw new InvalidReferenceError(AGGREGATE, 'flash_sale_id', flashSaleId);
  }
}

export interface CreateFlashSaleRequestInput {
  title: string;
  flashSaleId: number;
  note: string;
  productIds: number[];
  language?: string;
  createdBy?: number | null;
}

/** Crea la solicitud (`pending`) y sus filas puente. La tienda sale de los productos. */
export async function createFlashSaleRequest(
  input: CreateFlashSaleRequestInput
): Promise<FlashSaleRequestRecord> {
  _assertNote(input.note ?? '');
  await _assertFlashSale(input.flashSaleId);
  const { shopId, productIds } = await resolveFlashSaleRequestShop(
    input.productIds
  );

  try {
    const row = await prisma.flashSaleRequest.create({
      data: {
        title: input.title,
        flashSaleId: BigInt(input.flashSaleId),
        shopId: BigInt(shopId),
        note: input.note,
        ...(input.createdBy != null && { createdBy: BigInt(input.createdBy) }),
        ...(input.language !== undefined && { language: input.language }),
        products: {
          create: productIds.map((productId) => ({
            productId: BigInt(productId),
          })),
        },
      },
      include: FLASH_SALE_REQUEST_INCLUDE,
    });
    return _toRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE });
  }
}

export interface UpdateFlashSaleRequestInput {
  title?: string;
  flashSaleId?: number;
  note?: string;
  language?: string;
  /** Presente: reemplaza los productos. Deben ser de la tienda de la solicitud. */
  productIds?: number[];
}

/** Solo una solicitud `pending` se edita (409 si no). Fija `updatedAt: now()`. */
export async function updateFlashSaleRequest(
  id: number,
  input: UpdateFlashSaleRequestInput
): Promise<FlashSaleRequestRecord> {
  const existing = await prisma.flashSaleRequest.findUnique({
    where: { id: BigInt(id) },
    select: { status: true, shopId: true },
  });
  if (!existing) throw new RecordNotFoundError(AGGREGATE, id);
  if (existing.status !== 'pending') {
    throw new FlashSaleRequestStateError(
      id,
      existing.status as FlashSaleRequestStatus,
      'editar (solo las pendientes)'
    );
  }

  _assertNote(input.note);
  if (input.flashSaleId !== undefined) {
    await _assertFlashSale(input.flashSaleId);
  }
  let productIds: number[] | undefined;
  if (input.productIds !== undefined) {
    const resolved = await resolveFlashSaleRequestShop(input.productIds);
    if (resolved.shopId !== Number(existing.shopId)) {
      throw new InvalidFlashSaleRequestError(
        `Los productos deben ser de la tienda de la solicitud (${existing.shopId}); llegaron de la ${resolved.shopId}.`
      );
    }
    productIds = resolved.productIds;
  }

  try {
    const row = await prisma.flashSaleRequest.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.flashSaleId !== undefined && {
          flashSaleId: BigInt(input.flashSaleId),
        }),
        ...(input.note !== undefined && { note: input.note }),
        ...(input.language !== undefined && { language: input.language }),
        ...(productIds !== undefined && {
          products: {
            deleteMany: {},
            create: productIds.map((productId) => ({
              productId: BigInt(productId),
            })),
          },
        }),
        updatedAt: now(),
      },
      include: FLASH_SALE_REQUEST_INCLUDE,
    });
    return _toRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE, id });
  }
}

/**
 * Borra una solicitud que no esté `approved` (409: hay que rechazarla
 * antes). Cascada a la tabla puente. Devuelve la solicitud borrada.
 */
export async function deleteFlashSaleRequest(
  id: number
): Promise<FlashSaleRequestRecord> {
  const existing = await prisma.flashSaleRequest.findUnique({
    where: { id: BigInt(id) },
    include: FLASH_SALE_REQUEST_INCLUDE,
  });
  if (!existing) throw new RecordNotFoundError(AGGREGATE, id);
  if (existing.status === 'approved') {
    throw new FlashSaleRequestStateError(
      id,
      'approved',
      'borrar (recházala antes)'
    );
  }

  try {
    await prisma.flashSaleRequest.delete({ where: { id: BigInt(id) } });
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE, id });
  }
  return _toRecord(existing);
}

// ---------------------------------------------------------------------------
// Aprobar y rechazar
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/** Bloquea la solicitud y devuelve su estado y su venta; `null` si no existe. */
async function _lockRequest(
  tx: Tx,
  id: number
): Promise<{ status: FlashSaleRequestStatus; flashSaleId: bigint } | null> {
  const rows = await tx.$queryRaw<
    { status: FlashSaleRequestStatus; flash_sale_id: bigint }[]
  >`SELECT status, flash_sale_id FROM flash_sale_requests WHERE id = ${id} FOR UPDATE`;
  return rows[0]
    ? { status: rows[0].status, flashSaleId: rows[0].flash_sale_id }
    : null;
}

/**
 * Bloquea la venta y reescribe su `sale_builder.product_ids` con la tabla
 * puente (orden de `product_id`), fijando `updatedAt: now()`.
 */
async function _syncSaleBuilder(tx: Tx, flashSaleId: bigint): Promise<void> {
  await tx.$queryRaw`SELECT id FROM flash_sales WHERE id = ${flashSaleId} FOR UPDATE`;
  const sale = await tx.flashSale.findUniqueOrThrow({
    where: { id: flashSaleId },
    select: { saleBuilder: true },
  });
  const links = await tx.flashSaleProduct.findMany({
    where: { flashSaleId },
    orderBy: { productId: 'asc' },
    select: { productId: true },
  });
  await tx.flashSale.update({
    where: { id: flashSaleId },
    data: {
      saleBuilder: _saleBuilder(
        sale.saleBuilder,
        links.map((link) => Number(link.productId))
      ),
      updatedAt: now(),
    },
  });
}

/**
 * `pending` o `rejected` → `approved`. Mete en la venta los productos de la
 * solicitud que no estaban, marca esos con `added_to_sale` y deja sin
 * marca los que ya estaban. Ya aprobada: `FlashSaleRequestStateError` (409).
 * Inexistente: `RecordNotFoundError`.
 */
export async function approveFlashSaleRequest(
  id: number
): Promise<FlashSaleRequestRecord> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const request = await _lockRequest(tx, id);
      if (!request) throw new RecordNotFoundError(AGGREGATE, id);
      if (request.status === 'approved') {
        throw new FlashSaleRequestStateError(id, 'approved', 'aprobar');
      }

      const requested = await tx.flashSaleRequestProduct.findMany({
        where: { requestId: BigInt(id) },
        select: { productId: true },
      });
      const productIds = requested.map((r) => r.productId);
      const inSale = await tx.flashSaleProduct.findMany({
        where: {
          flashSaleId: request.flashSaleId,
          productId: { in: productIds },
        },
        select: { productId: true },
      });
      const already = new Set(inSale.map((r) => r.productId));
      const added = productIds.filter((productId) => !already.has(productId));

      if (added.length > 0) {
        await tx.flashSaleProduct.createMany({
          data: added.map((productId) => ({
            flashSaleId: request.flashSaleId,
            productId,
          })),
        });
      }
      await tx.flashSaleRequestProduct.updateMany({
        where: { requestId: BigInt(id) },
        data: { addedToSale: false },
      });
      if (added.length > 0) {
        await tx.flashSaleRequestProduct.updateMany({
          where: { requestId: BigInt(id), productId: { in: added } },
          data: { addedToSale: true },
        });
      }
      await _syncSaleBuilder(tx, request.flashSaleId);

      return tx.flashSaleRequest.update({
        where: { id: BigInt(id) },
        data: { status: 'approved', updatedAt: now() },
        include: FLASH_SALE_REQUEST_INCLUDE,
      });
    });
    return _toRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE, id });
  }
}

/**
 * `pending` o `approved` → `rejected`. Si estaba aprobada, retira de la venta
 * solo los productos marcados con `added_to_sale` y les quita la marca.
 * Ya rechazada: `FlashSaleRequestStateError` (409). Inexistente:
 * `RecordNotFoundError`.
 */
export async function rejectFlashSaleRequest(
  id: number
): Promise<FlashSaleRequestRecord> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const request = await _lockRequest(tx, id);
      if (!request) throw new RecordNotFoundError(AGGREGATE, id);
      if (request.status === 'rejected') {
        throw new FlashSaleRequestStateError(id, 'rejected', 'rechazar');
      }

      if (request.status === 'approved') {
        const marked = await tx.flashSaleRequestProduct.findMany({
          where: { requestId: BigInt(id), addedToSale: true },
          select: { productId: true },
        });
        if (marked.length > 0) {
          await tx.flashSaleProduct.deleteMany({
            where: {
              flashSaleId: request.flashSaleId,
              productId: { in: marked.map((r) => r.productId) },
            },
          });
          await tx.flashSaleRequestProduct.updateMany({
            where: { requestId: BigInt(id) },
            data: { addedToSale: false },
          });
        }
        await _syncSaleBuilder(tx, request.flashSaleId);
      }

      return tx.flashSaleRequest.update({
        where: { id: BigInt(id) },
        data: { status: 'rejected', updatedAt: now() },
        include: FLASH_SALE_REQUEST_INCLUDE,
      });
    });
    return _toRecord(row);
  } catch (error) {
    throw translateCatalogWriteError(error, { aggregate: AGGREGATE, id });
  }
}
